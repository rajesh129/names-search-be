import { PoolClient } from 'pg';
import { pool } from '../db/pool';

export function like(text: string) {
  return `%${text}%`;
}

/** COUNT for normalized path */
export async function countMatchesNormalized(languageId: number, searchText: string): Promise<number> {
  const sql = `
    SELECT COUNT(DISTINCT nv.name_id)::int AS cnt
    FROM name_variants nv
    WHERE nv.language_id = $1
      AND nv.variant_name ILIKE $2
  `;
  const r = await pool.query(sql, [languageId, like(searchText)]);
  return r.rows[0]?.cnt ?? 0;
}

/** Page of IDs (keyset) for normalized path */
export async function pageIdsNormalized(languageId: number, searchText: string, cursorId: number | null, limit: number): Promise<number[]> {
  const sql = `
    WITH matches AS (
      SELECT DISTINCT nv.name_id
      FROM name_variants nv
      WHERE nv.language_id = $1
        AND nv.variant_name ILIKE $2
        AND ($3::int IS NULL OR nv.name_id > $3)
    )
    SELECT name_id
    FROM matches
    ORDER BY name_id
    LIMIT $4
  `;
  const r = await pool.query(sql, [languageId, like(searchText), cursorId, limit]);
  return r.rows.map(x => x.name_id);
}

/** Aggregate rows for response (normalized path) */
export async function fetchAggregatedByIds(ids: number[], taId: number, enId: number, frId: number, reqLangId: number) {
  const sql = `
    SELECT
      n.id AS name_id,
      (ARRAY_AGG(nv_ta.variant_name ORDER BY nv_ta.variant_name))[1] AS tamil,
      ARRAY_AGG(DISTINCT nv_en.variant_name ORDER BY nv_en.variant_name) AS english,
      ARRAY_AGG(DISTINCT nv_fr.variant_name ORDER BY nv_fr.variant_name) AS french,
      COALESCE(nm_req.meaning, nm_en.meaning) AS description
    FROM names n
    LEFT JOIN name_variants nv_ta
      ON nv_ta.name_id = n.id AND nv_ta.language_id = $2
    LEFT JOIN name_variants nv_en
      ON nv_en.name_id = n.id AND nv_en.language_id = $3
    LEFT JOIN name_variants nv_fr
      ON nv_fr.name_id = n.id AND nv_fr.language_id = $4
    LEFT JOIN name_meanings nm_req
      ON nm_req.name_id = n.id AND nm_req.language_id = $5
    LEFT JOIN name_meanings nm_en
      ON nm_en.name_id = n.id AND nm_en.language_id = $3
    WHERE n.id = ANY($1::int[])
    GROUP BY n.id, nm_req.meaning, nm_en.meaning
    ORDER BY n.id
  `;
  const r = await pool.query(sql, [ids, taId, enId, frId, reqLangId]);
  return r.rows;
}

/** MV path: total count */
export async function countMatchesMV(searchTextLower: string): Promise<number> {
  const sql = `SELECT COUNT(*)::int AS cnt FROM name_search_mv WHERE search_blob ILIKE $1`;
  const r = await pool.query(sql, [like(searchTextLower)]);
  return r.rows[0]?.cnt ?? 0;
}

/** MV path: page data */
export async function pageDataMV(langCode: 'en'|'ta'|'fr', searchTextLower: string, cursorId: number | null, limit: number) {
  const sql = `
    SELECT
      name_id,
      tamil,
      english,
      french,
      COALESCE(meaning_by_lang ->> $1, meaning_by_lang ->> 'en') AS description
    FROM name_search_mv
    WHERE search_blob ILIKE $2
      AND ($3::int IS NULL OR name_id > $3)
    ORDER BY name_id
    LIMIT $4
  `;
  const r = await pool.query(sql, [langCode, like(searchTextLower), cursorId, limit]);
  return r.rows;
}

/** Helper: derive cursor from page/limit (cheap) */
export async function deriveCursorIdNormalized(languageId: number, searchText: string, offset: number): Promise<number | null> {
  const sql = `
    WITH matches AS (
      SELECT DISTINCT nv.name_id
      FROM name_variants nv
      WHERE nv.language_id = $1
        AND nv.variant_name ILIKE $2
    )
    SELECT name_id
    FROM matches
    ORDER BY name_id
    LIMIT 1 OFFSET $3
  `;
  const r = await pool.query(sql, [languageId, like(searchText), Math.max(0, offset - 1)]);
  return r.rows[0]?.name_id ?? null;
}

export async function deriveCursorIdMV(searchTextLower: string, offset: number): Promise<number | null> {
  const sql = `
    SELECT name_id
    FROM name_search_mv
    WHERE search_blob ILIKE $1
    ORDER BY name_id
    LIMIT 1 OFFSET $2
  `;
  const r = await pool.query(sql, [like(searchTextLower), Math.max(0, offset - 1)]);
  return r.rows[0]?.name_id ?? null;
}

/** Transaction helper */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export type VariantUpsertItem = { language_id: number; value: string };
export type MeaningUpsertItem = { language_id: number; value: string };

export type UpsertResult<T extends { language_id: number; value: string }> = {
  insertedCount: number;
  duplicateCount: number;
  duplicates: T[];
};

/** Create or fetch a name row by canonical_key. */
export async function ensureName(canonicalKey: string, client?: PoolClient): Promise<number> {
  const q = `
    INSERT INTO names (canonical_key)
    VALUES ($1)
    ON CONFLICT (canonical_key)
    DO UPDATE SET updated_at = now()
    RETURNING id
  `;
  const db = client ?? pool;
  const { rows } = await db.query<{ id: number }>(q, [canonicalKey]);
  return rows[0].id;
}

/** Batch upsert for name_variants */
export async function upsertVariants(
  nameId: number,
  items: VariantUpsertItem[],
  client?: PoolClient
): Promise<UpsertResult<VariantUpsertItem>> {
  if (!items.length) return { insertedCount: 0, duplicateCount: 0, duplicates: [] };

  const nameIds = new Array(items.length).fill(nameId);
  const langIds = items.map(i => i.language_id);
  const values  = items.map(i => i.value);

  const q = `
    WITH data AS (
      SELECT
        unnest($1::int[])  AS name_id,
        unnest($2::int[])  AS language_id,
        unnest($3::text[]) AS variant_name
    ),
    ins AS (
      INSERT INTO name_variants (name_id, language_id, variant_name)
      SELECT name_id, language_id, variant_name
      FROM data
      ON CONFLICT (name_id, language_id, variant_name) DO NOTHING
      RETURNING name_id, language_id, variant_name
    )
    SELECT (SELECT count(*)::int FROM ins) AS inserted_count
  `;
  const db = client ?? pool;
  const { rows } = await db.query<{ inserted_count: number }>(q, [nameIds, langIds, values]);

  const insertedCount = rows[0]?.inserted_count ?? 0;
  const duplicateCount = items.length - insertedCount;

  const existed = await db.query<{ language_id: number; value: string }>(
    `
      SELECT language_id, variant_name AS value
      FROM name_variants
      WHERE name_id = $1
        AND EXISTS (
          SELECT 1 FROM unnest($2::int[], $3::text[]) AS t(lang_id, val)
          WHERE t.lang_id = name_variants.language_id AND t.val = name_variants.variant_name
        )
    `,
    [nameId, langIds, values]
  );

  const existedSet = new Set(existed.rows.map(r => `${r.language_id}|${r.value}`));
  const duplicates = items.filter(i => existedSet.has(`${i.language_id}|${i.value}`));

  return { insertedCount, duplicateCount, duplicates };
}

/** Batch upsert for name_meanings (fixed to use 'meaning' column) */
export async function upsertMeanings(
  nameId: number,
  items: MeaningUpsertItem[],
  client?: PoolClient
): Promise<UpsertResult<MeaningUpsertItem>> {
  if (!items.length) return { insertedCount: 0, duplicateCount: 0, duplicates: [] };

  const nameIds = new Array(items.length).fill(nameId);
  const langIds = items.map(i => i.language_id);
  const values  = items.map(i => i.value);

  const q = `
    WITH data AS (
      SELECT
        unnest($1::int[])  AS name_id,
        unnest($2::int[])  AS language_id,
        unnest($3::text[]) AS meaning
    ),
    ins AS (
      INSERT INTO name_meanings (name_id, language_id, meaning)
      SELECT name_id, language_id, meaning
      FROM data
      ON CONFLICT (name_id, language_id, meaning) DO NOTHING
      RETURNING name_id, language_id, meaning
    )
    SELECT (SELECT count(*)::int FROM ins) AS inserted_count
  `;
  const db = client ?? pool;
  const { rows } = await db.query<{ inserted_count: number }>(q, [nameIds, langIds, values]);

  const insertedCount = rows[0]?.inserted_count ?? 0;
  const duplicateCount = items.length - insertedCount;

  const existed = await db.query<{ language_id: number; value: string }>(
    `
      SELECT language_id, meaning AS value
      FROM name_meanings
      WHERE name_id = $1
        AND EXISTS (
          SELECT 1 FROM unnest($2::int[], $3::text[]) AS t(lang_id, val)
          WHERE t.lang_id = name_meanings.language_id AND t.val = name_meanings.meaning
        )
    `,
    [nameId, langIds, values]
  );

  const existedSet = new Set(existed.rows.map(r => `${r.language_id}|${r.value}`));
  const duplicates = items.filter(i => existedSet.has(`${i.language_id}|${i.value}`));

  return { insertedCount, duplicateCount, duplicates };
}
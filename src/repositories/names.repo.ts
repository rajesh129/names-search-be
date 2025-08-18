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

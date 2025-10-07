import { SearchRequestDTO } from '../types/dtos';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import { getLangMap } from './language.service';
import {
  countMatchesNormalized, pageIdsNormalized, fetchAggregatedByIds,
  countMatchesMV, pageDataMV, deriveCursorIdNormalized, deriveCursorIdMV, withTransaction,
  ensureName,
  upsertVariants,
  upsertMeanings,
  type VariantUpsertItem,
  type MeaningUpsertItem,
} from '../repositories/names.repo';
import { Env } from '../config/env';
import type { NameRow } from "../types/dtos";
import { getLanguageIds } from "./language.service";

export async function searchNames(input: SearchRequestDTO) {
  const { searchText, lang, pagePerRecord, page, cursor } = input;
  const { en, ta, fr } = await getLangMap();

  // compute cursor
  let cursorId = decodeCursor(cursor);
  const limit = pagePerRecord;

  if (!cursorId && page > 1) {
    const offset = (page - 1) * limit;
    cursorId = Env.USE_MV
      ? await deriveCursorIdMV(searchText.toLowerCase(), offset)
      : await deriveCursorIdNormalized(({ en, ta, fr } as any)[lang], searchText, offset);
  }

  // MV fast path
  if (Env.USE_MV) {
    const totalCount = await countMatchesMV(searchText.toLowerCase());
    if (totalCount === 0) return { getNames: [], totalCount, nextCursor: null };

    const rows = await pageDataMV(lang, searchText.toLowerCase(), cursorId, limit);
    const getNames = rows.map(r => ({
      tamil: r.tamil || '',
      english: r.english || [],
      french: r.french || [],
      description: r.description || ''
    }));

    const nextCursor = rows.length ? encodeCursor(rows[rows.length - 1].name_id) : null;
    return { getNames, totalCount, nextCursor };
  }

  // Normalized path
  const langId = ({ en, ta, fr } as any)[lang] as number;
  const totalCount = await countMatchesNormalized(langId, searchText);
  if (totalCount === 0) return { getNames: [], totalCount, nextCursor: null };

  const ids = await pageIdsNormalized(langId, searchText, cursorId, limit);
  if (ids.length === 0) return { getNames: [], totalCount, nextCursor: null };

  const rows = await fetchAggregatedByIds(ids, ta, en, fr, langId);
  const getNames = rows.map((r: any) => ({
    tamil: r.tamil || '',
    english: (r.english || []).filter(Boolean),
    french: (r.french || []).filter(Boolean),
    description: r.description || ''
  }));

  const nextCursor = encodeCursor(ids[ids.length - 1]);
  return { getNames, totalCount, nextCursor };
}

/** Public result shape for /names/bulk */
export type BulkPublishResult = {
  totals: {
    rows: number;
    namesEnsured: number;
    variantsInserted: number;
    variantsDuplicates: number;
    meaningsInserted: number;
    meaningsDuplicates: number;
  };
  rows: Array<{
    index: number;                 // original row index (0-based) to correlate with FE selection
    canonicalKey: string;
    nameId: number;
    variants: {
      inserted: number;
      duplicates: Array<{ language: "en" | "ta" | "fr"; value: string }>;
    };
    meanings: {
      inserted: number;
      duplicates: Array<{ language: "en" | "ta" | "fr"; value: string }>;
    };
  }>;
  dryRun: boolean;
  source?: string;
};

/** Internal control-flow error to force rollback while returning a success body (for dryRun) */
class DryRunRollback extends Error {
  result: BulkPublishResult;
  constructor(result: BulkPublishResult) {
    super("Dry-run rollback");
    this.result = result;
  }
}

/** Create a canonical key if FE didn’t provide one. Keep ≤100 chars and easy to read. */
function makeCanonicalKey(row: NameRow): string {
  // Prefer an English variant if present; else first variant.
  const pick =
    row.variants.find((v) => v.lang === "en") ??
    row.variants[0];

  const base = pick.value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "_")   // non-alnum -> _
    .replace(/^_+|_+$/g, "")                       // trim _
    .replace(/_{2,}/g, "_")                        // collapse __
    .slice(0, 100);

  return base || `name_${Date.now()}`;
}

/**
 * Bulk publish orchestrator.
 * - Resolves languages once
 * - One DB transaction for the whole request
 * - Upserts names, then variants/meanings
 * - If dryRun=true: executes everything but rolls back at the end
 */
export async function bulkPublish(
  rows: NameRow[],
  opts: { dryRun?: boolean; source?: string } = {}
): Promise<BulkPublishResult> {
  const dryRun = Boolean(opts.dryRun);
  const source = opts.source;

  // 1) Resolve all language codes -> ids once
  const uniqueCodes = new Set<"en" | "ta" | "fr">();
  for (const r of rows) {
    r.variants.forEach((v) => uniqueCodes.add(v.lang as any));
    (r.meanings ?? []).forEach((m) => uniqueCodes.add(m.lang as any));
  }
  const langIdMap = await getLanguageIds(Array.from(uniqueCodes) as Array<"en" | "ta" | "fr">);
  // langIdMap['en'] -> number

  // prepare mutable totals/result container
  const aggregate: BulkPublishResult = {
    totals: {
      rows: rows.length,
      namesEnsured: 0,
      variantsInserted: 0,
      variantsDuplicates: 0,
      meaningsInserted: 0,
      meaningsDuplicates: 0,
    },
    rows: [],
    dryRun,
    source,
  };

  // 2) Run everything in ONE transaction
  try {
    await withTransaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const canonicalKey = (r.canonicalKey && r.canonicalKey.trim()) || makeCanonicalKey(r);

        // ensure name
        const nameId = await ensureName(canonicalKey, tx);
        aggregate.totals.namesEnsured += 1;

        // map payload -> repo items
        const variantItems: VariantUpsertItem[] = r.variants.map((v) => ({
          language_id: langIdMap[v.lang as "en" | "ta" | "fr"],
          value: v.value,
        }));

        const meaningItems: MeaningUpsertItem[] = (r.meanings ?? []).map((m) => ({
          language_id: langIdMap[m.lang as "en" | "ta" | "fr"],
          value: m.value,
        }));

        // upsert
        const vRes = await upsertVariants(nameId, variantItems, tx);
        const mRes = await upsertMeanings(nameId, meaningItems, tx);

        aggregate.totals.variantsInserted += vRes.insertedCount;
        aggregate.totals.variantsDuplicates += vRes.duplicateCount;
        aggregate.totals.meaningsInserted += mRes.insertedCount;
        aggregate.totals.meaningsDuplicates += mRes.duplicateCount;

        // per-row details (translate duplicate language_id back to code for readability)
        const dupVariants = vRes.duplicates.map((d) => ({
          language: (Object.keys(langIdMap) as Array<"en" | "ta" | "fr">)
            .find((code) => langIdMap[code] === d.language_id)!,
          value: d.value,
        }));

        const dupMeanings = mRes.duplicates.map((d) => ({
          language: (Object.keys(langIdMap) as Array<"en" | "ta" | "fr">)
            .find((code) => langIdMap[code] === d.language_id)!,
          value: d.value,
        }));

        aggregate.rows.push({
          index: i,
          canonicalKey,
          nameId,
          variants: { inserted: vRes.insertedCount, duplicates: dupVariants },
          meanings: { inserted: mRes.insertedCount, duplicates: dupMeanings },
        });
      }

      // If this is a dry-run, force a rollback after computing results.
      if (dryRun) {
        throw new DryRunRollback(aggregate);
      }
    });

    // Non-dry run: transaction committed
    return aggregate;
  } catch (err: any) {
    // Dry-run path: we purposely threw to rollback changes; return the computed result
    if (err instanceof DryRunRollback) {
      return err.result;
    }
    // Any other error -> bubbles up after rollback (withTransaction already rolled back)
    throw err;
  }
}

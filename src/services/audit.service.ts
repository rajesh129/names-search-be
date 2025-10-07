// src/services/audit.service.ts
import { insertAudit, PublishAuditRow } from "../repositories/audit.repo";
import type { BulkPublishResult } from "./names.service";

/**
 * Record one audit row for a completed (non-dry) bulk publish.
 * - userId: from req.user.sub
 * - result: from names.service.bulkPublish(...)
 */
export async function recordPublishAudit(userId: number, result: BulkPublishResult): Promise<PublishAuditRow> {
  // summarize inserted/duplicates the same way the controller does
  const inserted = result.totals.variantsInserted + result.totals.meaningsInserted;
  const duplicates = result.totals.variantsDuplicates + result.totals.meaningsDuplicates;

  // small sample: up to first 10 canonicalKeys for quick forensics
  const canonicalKeys = result.rows.slice(0, 10).map(r => r.canonicalKey);

  const sampleKeys = {
    canonicalKeys,
    source: result.source ?? null,
    totals: result.totals,
  };

  return insertAudit({
    userId,
    totalRows: result.totals.rows,
    inserted,
    duplicates,
    sampleKeys,
  });
}

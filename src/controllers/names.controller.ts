import { RequestHandler } from 'express';
import { BulkPublishSchema, SearchRequestSchema } from '../types/dtos';
import { verifyRecaptcha } from '../middleware/recaptcha';
import { validateBody } from '../utils/validate';
import { bulkPublish, searchNames } from '../services/names.service';
import { recordPublishAudit } from '../services/audit.service';

/** POST /api/names/search */
export const searchNamesHandlers: RequestHandler[] = [
  verifyRecaptcha,
  validateBody(SearchRequestSchema),
  async (req, res, next) => {
    try {
      const input = (req as any).input; // parsed DTO
      const result = await searchNames(input);
      res.json(result);
    } catch (e) { next(e); }
  }
];

/** Stubs for future expansion (update/delete/details) */
export const updateName: RequestHandler = async (_req, res) => {
  // TODO: implement service + repo
  res.status(501).json({ error: 'Not implemented' });
};

export const deleteName: RequestHandler = async (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
};

export const getNameDetails: RequestHandler = async (_req, res) => {
  res.status(501).json({ error: 'Not implemented' });
};

// Helper: coerce ?dryRun=true|false|1|0 (query has precedence over body)
function coerceDryRun(q: any, bodyDefault?: boolean): boolean {
  if (q === undefined || q === null) return Boolean(bodyDefault);
  const s = String(q).toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return Boolean(bodyDefault);
}

/**
 * POST /names/bulk?dryRun=true|false
 * Guards applied at route-level.
 * Body validated by BulkPublishSchema (rows[] required).
 */
export const bulkPublishHandlers: RequestHandler[] = [
  validateBody(BulkPublishSchema),
  async (req, res, next) => {
    try {
      const input = (req as any).input as import('../types/dtos').BulkPublishInput;

      // Query param takes precedence over body.dryRun
      const dryRun = coerceDryRun(req.query.dryRun, input.dryRun);
      const result = await bulkPublish(input.rows, { dryRun, source: input.source });

      // If this is a real publish and we have an authenticated user, write an audit row
      const userId = Number((req as any).user?.sub);
      if (!result.dryRun && Number.isFinite(userId)) {
        try {
          await recordPublishAudit(userId, result);
        } catch (auditErr) {
          // Don't fail the main request if audit writing has an issue; log and continue
          // You can swap this for your logger
          console.error('publish audit failed:', auditErr);
        }
      }

      // Shape into required summary
      const inserted = result.totals.variantsInserted + result.totals.meaningsInserted;
      const duplicates = result.totals.variantsDuplicates + result.totals.meaningsDuplicates;

      // Flatten duplicate details for UX clarity
      const duplicateDetails = result.rows.flatMap(r => ([
        ...r.variants.duplicates.map(d => ({
          index: r.index,
          canonicalKey: r.canonicalKey,
          nameId: r.nameId,
          kind: 'variant' as const,
          language: d.language,
          value: d.value
        })),
        ...r.meanings.duplicates.map(d => ({
          index: r.index,
          canonicalKey: r.canonicalKey,
          nameId: r.nameId,
          kind: 'meaning' as const,
          language: d.language,
          value: d.value
        })),
      ]));

      return res.json({ inserted, duplicates, duplicateDetails });
    } catch (err) {
      next(err);
    }
  }
];

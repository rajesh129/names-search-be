// src/types/dtos.ts
import { z } from 'zod';

/* =========================
   EXISTING SCHEMAS (UNCHANGED BEHAVIOR)
   ========================= */

export const SearchRequestSchema = z.object({
  searchText: z.string().trim().min(1, 'searchText cannot be empty').max(100, 'searchText too long'),
  lang: z.enum(['en', 'ta', 'fr']),
  pagePerRecord: z.number().int().min(1).max(100),
  page: z.number().int().min(1).default(1),
  cursor: z.string().optional(),
  recaptchaToken: z.string().optional()
});
export type SearchRequestDTO = z.infer<typeof SearchRequestSchema>;

export const NameResultSchema = z.object({
  tamil: z.string(),
  english: z.array(z.string()),
  french: z.array(z.string()),
  description: z.string()
});
export type NameResultDTO = z.infer<typeof NameResultSchema>;

export const SearchResponseSchema = z.object({
  getNames: z.array(NameResultSchema),
  totalCount: z.number(),
  nextCursor: z.string().nullable().optional()
});
export type SearchResponseDTO = z.infer<typeof SearchResponseSchema>;

export const CreateAdminSchema = z.object({
  email: z.string().email(),
  // allow TOTP-only if you want; else make required
  password: z.string().min(8).max(72).optional(),
});
export type CreateAdminDto = z.infer<typeof CreateAdminSchema>;

export const StartTotpEnrollSchema = z.object({
  userId: z.number().int().positive(),
});

export const VerifyTotpSchema = z.object({
  userId: z.number().int().positive(),
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'TOTP code must be 6 digits'), // TOTP code
});


/* =========================================
   NEW: BULK PUBLISH (ADMIN) REQUEST SCHEMAS
   ========================================= */

// Supported languages for variants/meanings.
// If you expand languages later, update this enum (or drive from DB).
export const LangEnum = z.enum(['en', 'ta', 'fr']);

// Common value constraint for name strings
const nameValue = z
  .string()
  .trim()
  .min(1, 'Value cannot be empty')
  .max(255, 'Value must be ≤ 255 characters');

export const VariantSchema = z.object({
  lang: LangEnum,
  value: nameValue,
});

export const MeaningSchema = z.object({
  lang: LangEnum,
  value: z
    .string()
    .trim()
    .min(1, 'Meaning cannot be empty')
    .max(1000, 'Meaning must be ≤ 1000 characters'),
});

/** One logical name record to publish. */
export const NameRowSchema = z
  .object({
    // Optional from FE; BE can compute if omitted (e.g., from primary variant)
    canonicalKey: z
      .string()
      .trim()
      .min(1, 'canonicalKey cannot be empty')
      .max(100, 'canonicalKey must be ≤ 100 characters')
      .regex(/^[a-z0-9_\-\.]+$/i, 'canonicalKey may contain letters, numbers, _ - . only')
      .optional(),

    variants: z
      .array(VariantSchema)
      .nonempty('At least one variant is required'),

    meanings: z
      .array(MeaningSchema)
      .optional()
      .default([]),
  })
  .superRefine((row, ctx) => {
    // Enforce uniqueness of variants by (lang, value) (case-insensitive on value)
    const seenVar = new Set<string>();
    row.variants.forEach((v, i) => {
      const key = `${v.lang}:${v.value.toLowerCase()}`;
      if (seenVar.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', i, 'value'],
          message: `Duplicate variant for ${v.lang}: "${v.value}"`,
        });
      } else {
        seenVar.add(key);
      }
    });

    // Enforce uniqueness of meanings similarly
    if (row.meanings) {
      const seenMean = new Set<string>();
      row.meanings.forEach((m, i) => {
        const key = `${m.lang}:${m.value.toLowerCase()}`;
        if (seenMean.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['meanings', i, 'value'],
            message: `Duplicate meaning for ${m.lang}: "${m.value}"`,
          });
        } else {
          seenMean.add(key);
        }
      });
    }
  });

/** Bulk payload for /names/bulk */
export const BulkPublishSchema = z.object({
  rows: z
    .array(NameRowSchema)
    .min(1, 'rows must contain at least 1 item')
    .max(2000, 'rows cannot exceed 2000 items'),
  dryRun: z.coerce.boolean().optional().default(false),
  source: z.string().trim().max(100).optional(),
});

// Inferred TS types for the new schemas
export type NameRow = z.infer<typeof NameRowSchema>;
export type BulkPublishInput = z.infer<typeof BulkPublishSchema>;

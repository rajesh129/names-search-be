import { z } from "zod";

/** ====== DTO Schemas ====== */
export const SearchRequestSchema = z.object({
  searchText: z.string().trim().min(1).max(100),
  lang: z.enum(["en", "ta", "fr"]),
  pagePerRecord: z.number().int().min(1).max(100),
  page: z.number().int().min(1).default(1),
  cursor: z.string().optional(),               // opaque base64 of last name_id
  recaptchaToken: z.string().optional()        // if you prefer token in body
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

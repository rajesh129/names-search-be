// src/repositories/audit.repo.ts
import { pool } from "../db/pool";

export type PublishAuditRow = {
  id: number;
  user_id: number;
  total_rows: number;
  inserted: number;
  duplicates: number;
  sample_keys: any;       // JSONB
  created_at: string;     // ISO
};

export type PublishAuditInsert = {
  userId: number;
  totalRows: number;
  inserted: number;
  duplicates: number;
  sampleKeys: any;        // e.g., { canonicalKeys: string[], source?: string, dryRun?: boolean }
};

export async function insertAudit(input: PublishAuditInsert): Promise<PublishAuditRow> {
  const q = `
    INSERT INTO publish_audits (user_id, total_rows, inserted, duplicates, sample_keys)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    RETURNING id, user_id, total_rows, inserted, duplicates, sample_keys, created_at
  `;
  const { rows } = await pool.query<PublishAuditRow>(q, [
    input.userId,
    input.totalRows,
    input.inserted,
    input.duplicates,
    JSON.stringify(input.sampleKeys),
  ]);
  return rows[0];
}

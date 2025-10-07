// src/repositories/users.repo.ts
import { Pool } from "pg";
import { UserRow } from "../types/auth";
import { pool } from "../db/pool"; // your existing pool

export class UsersRepo {
  constructor(private readonly db: Pool = pool) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const q = `
      SELECT id, email, password_hash, role, totp_secret_encrypted,
             is_totp_enabled, last_login_at, created_at, updated_at
      FROM users WHERE email = $1
      LIMIT 1`;
    const { rows } = await this.db.query<UserRow>(q, [email]);
    return rows[0] ?? null;
  }

  async create(email: string, password_hash: string, role: "user" | "admin" = "user"): Promise<UserRow> {
    const q = `
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id, email, password_hash, role, totp_secret_encrypted,
                is_totp_enabled, last_login_at, created_at, updated_at`;
    const { rows } = await this.db.query<UserRow>(q, [email, password_hash, role]);
    return rows[0];
  }

  async updateLastLogin(id: number): Promise<void> {
    await this.db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [id]);
  }

  async getTotpSecret(userId: number): Promise<string | null> {
    const { rows } = await this.db.query<{ totp_secret_encrypted: any }>(
      `SELECT totp_secret_encrypted FROM users WHERE id = $1`,
      [userId]
    );
    const v = rows[0]?.totp_secret_encrypted;
    if (v == null) return null;
    return Buffer.isBuffer(v) ? v.toString("utf8") : String(v);
  }

  async storeTotpSecret(userId: number, sealed: string, enabled: boolean): Promise<void> {
    await this.db.query(
      `UPDATE users
         SET totp_secret_encrypted = $2,
             is_totp_enabled = $3,
             updated_at = now()
       WHERE id = $1`,
      [userId, sealed, enabled]
    );
  }
}

// scripts/seedAdmin.ts
import "dotenv/config";
import { Pool } from "pg";
import argon2 from "argon2";

async function main() {
  const {
    PGHOST = "localhost",
    PGPORT = "5432",
    PGDATABASE = "names_search",
    PGUSER = "postgres",
    PGPASSWORD = "admin",
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_TEMP_PASSWORD,
  } = process.env;

  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_TEMP_PASSWORD) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_TEMP_PASSWORD must be set in .env for seeding.");
  }

  const pool = new Pool({
    host: PGHOST,
    port: Number(PGPORT),
    database: PGDATABASE,
    user: PGUSER,
    password: PGPASSWORD,
    max: 1,
  });

  try {
    const client = await pool.connect();

    // hash temp password with Argon2id (reasonable defaults; tune later from Env.ARGON2)
    const password_hash = await argon2.hash(SEED_ADMIN_TEMP_PASSWORD, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });

    // upsert admin
    const sql = `
      INSERT INTO users (email, password_hash, role, is_totp_enabled)
      VALUES ($1, $2, 'admin', false)
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = 'admin',
        updated_at = now()
      RETURNING id, email, role, is_totp_enabled, created_at, updated_at;
    `;

    const { rows } = await client.query(sql, [SEED_ADMIN_EMAIL, password_hash]);
    const admin = rows[0];

    console.log("✅ Admin user upserted:");
    console.table({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      is_totp_enabled: admin.is_totp_enabled,
      created_at: admin.created_at,
      updated_at: admin.updated_at,
    });

    // SECURITY NOTE:
    // We intentionally do NOT generate/store a TOTP secret here.
    // TOTP will be enrolled later via POST /auth/totp/enroll after password re-auth.
    // That endpoint will generate a secret, verify a first code, encrypt it, and set is_totp_enabled=true.

    // Optionally, you can set last_login_at NULL explicitly:
    // await client.query('UPDATE users SET last_login_at = NULL WHERE id = $1', [admin.id]);

    client.release();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});

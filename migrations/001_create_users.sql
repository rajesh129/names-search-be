-- migrations/001_create_users.sql
-- Safe, idempotent migration for Postgres 13+

-- Optional but recommended: case-insensitive emails
CREATE EXTENSION IF NOT EXISTS citext;

-- updated_at trigger helper (reusable)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  totp_secret_encrypted BYTEA,              -- encrypted bytes (AES-GCM), nullable until enrolled
  is_totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_codes TEXT[],                    -- store hashed one-time recovery codes (optional)
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_role CHECK (role IN ('user','admin'))
);

-- Secondary index for role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Keep updated_at fresh
DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- migrations/003_publish_audits.sql
CREATE TABLE IF NOT EXISTS publish_audits (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  total_rows    INT    NOT NULL,
  inserted      INT    NOT NULL,
  duplicates    INT    NOT NULL,
  sample_keys   JSONB  NOT NULL,         -- e.g., { "canonicalKeys": ["mari_001","..."], "source": "excel-upload" }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- helpful index for recent activity by user
CREATE INDEX IF NOT EXISTS idx_publish_audits_user_created
  ON publish_audits(user_id, created_at DESC);

import 'dotenv/config';

export const Env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),

  // DB
  PGHOST: process.env.PGHOST || 'localhost',
  PGPORT: Number(process.env.PGPORT || 5432),
  PGDATABASE: process.env.PGDATABASE || 'names_search',
  PGUSER: process.env.PGUSER || 'your_pg_user',
  PGPASSWORD: process.env.PGPASSWORD || 'your_pg_password',
  PG_POOL_MAX: Number(process.env.PG_POOL_MAX || 20),

  // Features
  USE_MV: String(process.env.USE_MV || 'false').toLowerCase() === 'true',

  // reCAPTCHA
  RECAPTCHA_ENABLED: String(process.env.RECAPTCHA_ENABLED || 'false').toLowerCase() === 'true',
  RECAPTCHA_SECRET: process.env.RECAPTCHA_SECRET || '',
  RECAPTCHA_MIN_SCORE: Number(process.env.RECAPTCHA_MIN_SCORE || 0.5),
  RECAPTCHA_EXPECT_ACTION: process.env.RECAPTCHA_EXPECT_ACTION || undefined,

  // CORS
  CORS_ORIGIN: (process.env.CORS_ORIGIN || '').split(',').filter(Boolean),
};

import { Pool } from 'pg';
import { Env } from '../config/env';

export const pool = new Pool({
  host: Env.PGHOST,
  port: Env.PGPORT,
  user: Env.PGUSER,
  password: Env.PGPASSWORD,
  database: Env.PGDATABASE,
  max: Env.PG_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

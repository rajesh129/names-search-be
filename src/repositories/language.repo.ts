// src/repositories/language.repo.ts
import { pool } from '../db/pool';
import type { PoolClient } from 'pg';

export type LangMap = { en: number; ta: number; fr: number };

/**
 * Load language id map for the core locales used by the app.
 * NOTE: If you later add more languages, extend this query / shape.
 */
export async function loadLanguageMap(): Promise<LangMap> {
  const { rows } = await pool.query<{ id: number; code: 'en'|'ta'|'fr' }>(
    `SELECT id, code FROM languages WHERE code IN ('en','ta','fr')`
  );
  const map: Partial<LangMap> = {};
  for (const r of rows) map[r.code] = r.id;
  if (!map.en || !map.ta || !map.fr) {
    throw new Error('languages table missing en/ta/fr');
  }
  return map as LangMap;
}



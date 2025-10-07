// src/services/language.service.ts
import { LangMap, loadLanguageMap } from '../repositories/language.repo';

let cache: LangMap | null = null;
let cacheExp = 0;
let TTL_MS = 5 * 60 * 1000; // default 5 minutes

/** Optionally configure TTL (useful for tests or env-based tuning) */
export function configureLanguageCache(opts: { ttlMs?: number } = {}): void {
  if (typeof opts.ttlMs === 'number' && opts.ttlMs > 0) {
    TTL_MS = opts.ttlMs;
  }
}

/** For tests or manual invalidation */
export function clearLanguageCache(): void {
  cache = null;
  cacheExp = 0;
}

/**
 * MAIN API (existing):
 * Returns { en, ta, fr } -> id mapping.
 * Now with TTL: refreshes once expired or if empty.
 */
export async function getLangMap(): Promise<LangMap> {
  const now = Date.now();
  if (cache && now < cacheExp) return cache;

  const fresh = await loadLanguageMap();
  cache = fresh;
  cacheExp = now + TTL_MS;
  return fresh;
}

/**
 * Optional periodic refresh (existing name kept):
 * Forces a reload and resets TTL window.
 */
export async function refreshLangMap(): Promise<void> {
  const fresh = await loadLanguageMap();
  cache = fresh;
  cacheExp = Date.now() + TTL_MS;
}

/** Helper for bulk publish: resolve a single code -> id. */
export async function getLanguageId(code: 'en' | 'ta' | 'fr'): Promise<number> {
  const map = await getLangMap();
  return map[code];
}

/** Helper for bulk publish: resolve a unique set of codes quickly. */
export async function getLanguageIds(codes: Array<'en'|'ta'|'fr'>): Promise<Record<string, number>> {
  const map = await getLangMap();
  const out: Record<string, number> = {};
  for (const c of new Set(codes.map(x => x.toLowerCase() as 'en'|'ta'|'fr'))) {
    if (map[c]) out[c] = map[c];
  }
  return out;
}

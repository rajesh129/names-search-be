import { LangMap, loadLanguageMap } from '../repositories/language.repo';

let cache: LangMap | null = null;

export async function getLangMap(): Promise<LangMap> {
  if (cache) return cache;
  cache = await loadLanguageMap();
  return cache;
}

// optional periodic refresh
export async function refreshLangMap(): Promise<void> {
  cache = await loadLanguageMap();
}

import { SearchRequestDTO } from '../types/dtos';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import { getLangMap } from './language.service';
import {
  countMatchesNormalized, pageIdsNormalized, fetchAggregatedByIds,
  countMatchesMV, pageDataMV, deriveCursorIdNormalized, deriveCursorIdMV
} from '../repositories/names.repo';
import { Env } from '../config/env';

export async function searchNames(input: SearchRequestDTO) {
  const { searchText, lang, pagePerRecord, page, cursor } = input;
  const { en, ta, fr } = await getLangMap();

  // compute cursor
  let cursorId = decodeCursor(cursor);
  const limit = pagePerRecord;

  if (!cursorId && page > 1) {
    const offset = (page - 1) * limit;
    cursorId = Env.USE_MV
      ? await deriveCursorIdMV(searchText.toLowerCase(), offset)
      : await deriveCursorIdNormalized(({ en, ta, fr } as any)[lang], searchText, offset);
  }

  // MV fast path
  if (Env.USE_MV) {
    const totalCount = await countMatchesMV(searchText.toLowerCase());
    if (totalCount === 0) return { getNames: [], totalCount, nextCursor: null };

    const rows = await pageDataMV(lang, searchText.toLowerCase(), cursorId, limit);
    const getNames = rows.map(r => ({
      tamil: r.tamil || '',
      english: r.english || [],
      french: r.french || [],
      description: r.description || ''
    }));

    const nextCursor = rows.length ? encodeCursor(rows[rows.length - 1].name_id) : null;
    return { getNames, totalCount, nextCursor };
  }

  // Normalized path
  const langId = ({ en, ta, fr } as any)[lang] as number;
  const totalCount = await countMatchesNormalized(langId, searchText);
  if (totalCount === 0) return { getNames: [], totalCount, nextCursor: null };

  const ids = await pageIdsNormalized(langId, searchText, cursorId, limit);
  if (ids.length === 0) return { getNames: [], totalCount, nextCursor: null };

  const rows = await fetchAggregatedByIds(ids, ta, en, fr, langId);
  const getNames = rows.map((r: any) => ({
    tamil: r.tamil || '',
    english: (r.english || []).filter(Boolean),
    french: (r.french || []).filter(Boolean),
    description: r.description || ''
  }));

  const nextCursor = encodeCursor(ids[ids.length - 1]);
  return { getNames, totalCount, nextCursor };
}

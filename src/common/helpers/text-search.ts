import { Prisma } from '@prisma/client';

const FROM = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const TO = 'aaaaaeeeeiiiiooooouuuucn';

/** Minúsculas e sem acentos — mesma regra que o translate() usado no SQL. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function searchWords(search: string): string[] {
  const words = foldText(search)
    .split(/[\s,;]+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2);
  return [...new Set(words)];
}

interface RawClient {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

/**
 * IDs dos registos cujo texto (`haystack`, expressão SQL já concatenada)
 * contém as palavras da pesquisa, sem distinguir maiúsculas nem acentos.
 * Tenta primeiro registos com TODAS as palavras (resultado preciso) e, se
 * não houver nenhum, recua para registos com QUALQUER palavra.
 * Devolve `null` se a pesquisa não puder ser feita (o chamador usa o fallback).
 */
export async function searchIds<T extends number | string>(
  client: RawClient,
  table: 'ContentAsset' | 'LibraryItem',
  haystack: string,
  search: string,
  extraWhere = 'TRUE',
): Promise<T[] | null> {
  const words = searchWords(search);
  if (words.length === 0) return null;
  const patterns = words.map(w => `%${w.replace(/[\\%_]/g, '\\$&')}%`);
  try {
    // Haystack/extraWhere/table são constantes do código (nunca input do utilizador).
    const hay = Prisma.sql`translate(lower(${Prisma.raw(haystack)}), ${FROM}, ${TO})`;
    const tbl = Prisma.raw(`"${table}"`);
    const where = Prisma.raw(extraWhere);
    const all = await client.$queryRaw<{ id: T }[]>(
      Prisma.sql`SELECT id FROM ${tbl} WHERE ${where} AND ${hay} LIKE ALL(${patterns}::text[]) LIMIT 5000`,
    );
    if (all.length > 0) return all.map(r => r.id);
    const any = await client.$queryRaw<{ id: T }[]>(
      Prisma.sql`SELECT id FROM ${tbl} WHERE ${where} AND ${hay} LIKE ANY(${patterns}::text[]) LIMIT 5000`,
    );
    return any.map(r => r.id);
  } catch {
    return null;
  }
}

// src/common/utils/csv-export.util.ts
// Helper partilhado para gerar CSV a partir de linhas tabulares — usado
// pelos módulos reports e evaluation (e por qualquer módulo futuro que
// precise de exportação CSV). Espelha buildXlsxBuffer em xlsx-export.util.ts.

export function buildCsvString<T extends Record<string, unknown>>(
  data: T[],
  headers: (keyof T & string)[],
): string {
  const rows = data.map(row =>
    headers
      .map(h => {
        const v = row[h];
        if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
        return v ?? '';
      })
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

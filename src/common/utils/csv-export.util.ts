// src/common/utils/csv-export.util.ts
// Helper partilhado para gerar CSV a partir de linhas tabulares — usado
// pelos módulos reports e evaluation (e por qualquer módulo futuro que
// precise de exportação CSV). Espelha buildXlsxBuffer em xlsx-export.util.ts.

import { csvCell } from './csv-safe.util';

export function buildCsvString<T extends Record<string, unknown>>(
  data: T[],
  headers: (keyof T & string)[],
): string {
  const rows = data.map(row =>
    headers
      .map(h => {
        return csvCell(row[h]);
      })
      .join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

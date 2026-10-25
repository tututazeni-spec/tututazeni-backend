// src/automation/automation-csv.util.ts
// CSV (UTF-8 com BOM, ';') partilhado pelas exportações do módulo.

import { buildCsv } from '../common/utils/csv-safe.util';

export function toCsv(header: string[], rows: unknown[][]): string {
  return buildCsv(header, rows, { delimiter: ';' });
}

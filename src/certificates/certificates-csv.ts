/**
 * CSV seguro para folhas de cálculo: escape RFC 4180 e neutralização de fórmulas
 * (uma célula que começa por = + - @ ou tab/CR seria executada pelo Excel).
 * A lógica vive em common/utils/csv-safe.util; aqui só se fixa o formato do módulo
 * (datas só com o dia, LF como fim de linha, ficheiro terminado em LF).
 */
import { buildCsv, csvCell } from '../common/utils/csv-safe.util';

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function safeCsvCell(value: unknown): string {
  return csvCell(value instanceof Date ? isoDay(value) : value);
}

export function buildSafeCsv(headers: string[], rows: unknown[][]): string {
  const normalized = rows.map(r => r.map(v => (v instanceof Date ? isoDay(v) : v)));
  return buildCsv(headers, normalized, { eol: '\n', trailingEol: true });
}

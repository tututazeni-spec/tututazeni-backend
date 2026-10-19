/**
 * CSV seguro para folhas de cálculo: escape RFC 4180 e neutralização de fórmulas
 * (uma célula que começa por = + - @ ou tab/CR seria executada pelo Excel).
 */
// Escrito por código (e não como carácter literal) para não ser normalizado nem confundido.
const BOM = String.fromCharCode(0xfeff);
const FORMULA_START = /^[=+\-@\t\r]/;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function safeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isoDay(value);
  // Números e booleanos não são texto livre: um -5 numérico continua a ser -5.
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildSafeCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map(r => r.map(safeCsvCell).join(','));
  // BOM UTF-8: o Excel só abre os acentos correctamente com ele.
  return BOM + lines.join('\n') + '\n';
}

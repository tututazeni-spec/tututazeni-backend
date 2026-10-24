// src/common/utils/csv-safe.util.ts
// Escape de células CSV com neutralização de injecção de fórmulas (CSV injection / OWASP):
// uma célula de TEXTO que começa por = + - @ ou tab/CR é executada como fórmula pelo
// Excel/LibreOffice/Sheets. Texto vindo de utilizadores (nomes, comentários, títulos) chega aqui.
// Números e booleanos nativos nunca são tocados (um -5 numérico continua a ser -5).

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;
const NEEDS_QUOTES = /[",;\n\r]/;

/** Prefixa com apóstrofo o texto que o Excel interpretaria como fórmula. */
export function neutralizeFormula(text: string): string {
  if (!FORMULA_START.test(text)) return text;
  // "-5" ou "+244923000000" são números, não fórmulas: ficam como estão.
  if (PLAIN_NUMBER.test(text)) return text;
  return `'${text}`;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

/**
 * Uma célula CSV pronta a concatenar (RFC 4180: aspas duplicadas, campo entre aspas se tiver
 * vírgula, ponto e vírgula, aspas ou quebra de linha — serve para qualquer delimitador).
 */
export function csvCell(value: unknown): string {
  const raw = toText(value);
  const text = typeof value === 'string' ? neutralizeFormula(raw) : raw;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// src/automation/automation-csv.util.ts
// CSV (UTF-8 com BOM, ';') partilhado pelas exportações do módulo.

const esc = (v: unknown): string => {
  const t = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Neutraliza injecção de fórmulas em Excel/Sheets.
  const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(header: string[], rows: unknown[][]): string {
  return '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
}

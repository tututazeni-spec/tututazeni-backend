import { buildSafeCsv, safeCsvCell } from './certificates-csv';

/** Leitor CSV mínimo (RFC 4180) só para provar que o ficheiro volta a dar os valores originais. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe('safeCsvCell', () => {
  it.each([['=HYPERLINK("http://x","clica")'], ['+1+1'], ['-2'], ['@SUM(A1)'], ['\t=cmd']])(
    'neutraliza a fórmula %p com apóstrofo à frente',
    raw => {
      expect(safeCsvCell(raw).replace(/^"|"$/g, '')).toMatch(/^'/);
    },
  );

  it('null e undefined ficam vazios', () => {
    expect(safeCsvCell(null)).toBe('');
    expect(safeCsvCell(undefined)).toBe('');
  });

  it('datas saem como AAAA-MM-DD', () => {
    expect(safeCsvCell(new Date('2026-10-20T15:30:00Z'))).toBe('2026-10-20');
  });

  it('números e booleanos ficam como texto simples', () => {
    expect(safeCsvCell(12)).toBe('12');
    expect(safeCsvCell(true)).toBe('true');
  });

  it('um número negativo é um número, não uma fórmula', () => {
    expect(safeCsvCell(-5)).toBe('-5');
  });
});

describe('buildSafeCsv', () => {
  it('começa com BOM UTF-8 para o Excel abrir os acentos', () => {
    expect(buildSafeCsv(['a'], [['x']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('vírgulas, aspas e quebras de linha mantêm a linha íntegra', () => {
    const tricky = 'Segurança, "Nível 2"\nTurma A';
    const csv = buildSafeCsv(['Formação', 'Estado'], [[tricky, 'Válido']]);
    const parsed = parseCsv(csv.slice(1));
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toEqual([tricky, 'Válido']);
  });

  it('uma fórmula no nome da formação não sobrevive como fórmula', () => {
    const csv = buildSafeCsv(['Formação'], [['=HYPERLINK("http://x")']]);
    const parsed = parseCsv(csv.slice(1));
    expect(parsed[1][0].startsWith("'")).toBe(true);
  });
});

import { buildCsvString } from './csv-export.util';
import { buildCsv, csvCell, neutralizeFormula } from './csv-safe.util';

describe('neutralizeFormula', () => {
  it.each(['=1+1', '+cmd|calc', '-2+3', '@SUM(A1)', '\t=1', '\r=1', '=HYPERLINK("http://x","y")'])(
    'prefixa %j',
    v => {
      expect(neutralizeFormula(v)).toBe(`'${v}`);
    },
  );
  it.each(['-5', '+244', '-0.5', 'texto', 'a=b', ' =1', ''])('deixa %j como está', v => {
    expect(neutralizeFormula(v)).toBe(v);
  });
});

describe('csvCell', () => {
  it('neutraliza texto de utilizador que parece fórmula', () => {
    expect(csvCell('=cmd|"/c calc"!A1')).toBe(`"'=cmd|""/c calc""!A1"`);
    expect(csvCell('@admin')).toBe("'@admin");
  });
  it('não toca em números e booleanos nativos', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(0)).toBe('0');
  });
  it('nulos, datas e objectos', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(new Date('2026-10-24T00:00:00Z'))).toBe('2026-10-24T00:00:00.000Z');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
  it('escapa aspas, delimitadores e quebras de linha (vírgula e ponto e vírgula)', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('diz "olá"')).toBe('"diz ""olá"""');
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"');
    expect(csvCell('simples')).toBe('simples');
  });
});

describe('buildCsvString (partilhado por reports, evaluation, events, competencies)', () => {
  it('escapa aspas e neutraliza fórmulas, mantendo cabeçalhos e números', () => {
    const csv = buildCsvString(
      [{ nome: '=1+1', nota: -3, texto: 'diz "x", ok' }],
      ['nome', 'nota', 'texto'],
    );
    expect(csv).toBe(`nome,nota,texto\n'=1+1,-3,"diz ""x"", ok"`);
  });
  it('valores em falta ficam vazios', () => {
    expect(buildCsvString([{ a: 1 } as Record<string, unknown>], ['a', 'b'])).toBe('a,b\n1,');
  });
});

describe('buildCsv', () => {
  it('por omissão: vírgula, CRLF, BOM e sem fim de linha final', () => {
    expect(buildCsv(['a', 'b'], [[1, 'x']])).toBe('\uFEFFa,b\r\n1,x');
  });
  it('respeita delimitador, eol, bom e trailingEol', () => {
    const csv = buildCsv(['a', 'b'], [['x;y', 2]], {
      delimiter: ';',
      eol: '\n',
      bom: false,
      trailingEol: true,
    });
    expect(csv).toBe('a;b\n"x;y";2\n');
  });
  it('neutraliza fórmulas em texto mas não em números', () => {
    expect(buildCsv(['h'], [['=1+1'], [-5]], { bom: false })).toBe("h\r\n'=1+1\r\n-5");
  });
});

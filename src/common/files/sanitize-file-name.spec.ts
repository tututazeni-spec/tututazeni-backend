import { validate } from 'class-validator';
import { fileNameProblem, IsSafeFileName, sanitizeFileName } from './sanitize-file-name';

class Dto {
  @IsSafeFileName()
  fileName!: string;
}

describe('fileNameProblem', () => {
  it.each([
    '../../etc/passwd',
    '..\\..\\boot.ini',
    'a/b.pdf',
    'a\\b.pdf',
    'x..pdf',
    'fatura.pdf.exe',
    'setup.EXE',
    'run.sh',
    'macro.docm',
    'pagina.html',
    'logo.svg',
    'nome\r\nSet-Cookie: x=1.pdf',
    'nul\u0000.pdf',
    'fatura\u202Efdp.exe',
    'CON.pdf',
    'lpt1',
    'aspas".pdf',
    'a:b.pdf',
    'fim.',
    ' inicio.pdf',
    `${'x'.repeat(256)}.pdf`,
    '',
    '   ',
  ])('rejeita %j', name => {
    expect(fileNameProblem(name)).not.toBeNull();
  });

  it.each([
    'relatório 2026.pdf',
    'Plano v1.2 final.docx',
    'empresa.com.pdf',
    'foto.JPG',
    'sem-extensao',
    `${'x'.repeat(251)}.pdf`,
  ])('aceita %j', name => {
    expect(fileNameProblem(name)).toBeNull();
  });

  it('rejeita não-strings', () => {
    expect(fileNameProblem(undefined)).not.toBeNull();
    expect(fileNameProblem(42)).not.toBeNull();
  });
});

describe('sanitizeFileName', () => {
  it('faz basename e remove traversal', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\x\\doc.pdf')).toBe('doc.pdf');
  });
  it('remove controlo, bidi e caracteres proibidos', () => {
    expect(sanitizeFileName('a\r\nb\u202E.pdf')).toBe('ab.pdf');
    expect(sanitizeFileName('a:b*c?.pdf')).toBe('a_b_c_.pdf');
  });
  it('colapsa pontos, apara finais e evita ocultos', () => {
    expect(sanitizeFileName('x...pdf')).toBe('x.pdf');
    expect(sanitizeFileName('.htaccess')).toBe('htaccess');
    expect(sanitizeFileName('doc.pdf. ')).toBe('doc.pdf');
  });
  it('prefixa nomes reservados e usa fallback quando fica vazio', () => {
    expect(sanitizeFileName('NUL.txt')).toBe('_NUL.txt');
    expect(sanitizeFileName('///')).toBe('ficheiro');
    expect(sanitizeFileName(null, 'x')).toBe('x');
  });
  it('trunca preservando a extensão', () => {
    const out = sanitizeFileName(`${'a'.repeat(400)}.pdf`);
    expect(out.length).toBe(255);
    expect(out.endsWith('.pdf')).toBe(true);
  });
});

describe('@IsSafeFileName', () => {
  it('valida via class-validator com mensagem do motivo', async () => {
    const errs = await validate(Object.assign(new Dto(), { fileName: 'x.pdf.exe' }));
    expect(JSON.stringify(errs)).toContain('.exe');
    expect(await validate(Object.assign(new Dto(), { fileName: 'x.pdf' }))).toHaveLength(0);
  });
});

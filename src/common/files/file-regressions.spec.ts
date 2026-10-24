import { mimeOfInlineFile } from './data-url';
import { detectFileType } from './detect-file-type';
import { pdfProblem } from './inspect-content';

const latin = (s: string) => Buffer.from(s, 'latin1');

describe('detectFileType — falsos positivos de executável', () => {
  it('texto que começa por "MZ" (ex.: CSV) não é tratado como executável', () => {
    const csv = Buffer.from('MZ,total\n1,2');
    expect(detectFileType(csv).dangerous).toBeUndefined();
    expect(detectFileType(csv).kind).toBe('text');
  });

  it('PE verdadeiro (cabeçalho PE apontado por e_lfanew) continua a ser executável', () => {
    const pe = Buffer.alloc(128);
    pe.write('MZ', 0, 'latin1');
    pe.writeUInt32LE(0x40, 0x3c);
    pe.write('PE', 0x40, 'latin1');
    expect(detectFileType(pe).dangerous).toContain('PE');
  });

  it('MZ + NUL nos primeiros bytes (stub DOS) continua a ser executável', () => {
    expect(detectFileType(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 1])).dangerous).toBeDefined();
  });
});

describe('pdfProblem — falsos positivos', () => {
  it('ignora "/JS" que aparece por acaso dentro de streams', () => {
    const b = Buffer.concat([
      latin('%PDF-1.5\n1 0 obj\n<< /Length 40 >>\nstream\n'),
      latin('xx/JS (aleatorio) /Launch /JavaScript yy'),
      latin('\nendstream\nendobj\ntrailer\n<< >>\n%%EOF\n'),
    ]);
    expect(pdfProblem(b)).toBeNull();
  });

  it('continua a apanhar acções fora dos streams, mesmo depois de um stream', () => {
    const b = Buffer.concat([
      latin('%PDF-1.5\n1 0 obj\n<< >>\nstream\nabc\nendstream\nendobj\n'),
      latin('2 0 obj\n<< /S /JavaScript /JS (x) >>\nendobj\n%%EOF\n'),
    ]);
    expect(pdfProblem(b)).toContain('JavaScript');
  });

  it('stream sem endstream não deixa esconder conteúdo activo antes dele', () => {
    const b = latin('%PDF-1.5\n<< /JavaScript (x) >>\nstream\nabc\n%%EOF\n');
    expect(pdfProblem(b)).toContain('JavaScript');
  });
});

describe('mimeOfInlineFile', () => {
  it('usa o MIME do data URL e não o enviado à parte; sem data URL usa o declarado', () => {
    expect(mimeOfInlineFile('data:application/pdf;base64,AAAA', 'image/png')).toBe(
      'application/pdf',
    );
    expect(mimeOfInlineFile('data:image/jpg;base64,AAAA', undefined)).toBe('image/jpeg');
    expect(mimeOfInlineFile('https://x.test/a.pdf', 'application/pdf')).toBe('application/pdf');
    expect(mimeOfInlineFile('https://x.test/a.pdf', null)).toBeUndefined();
  });
});

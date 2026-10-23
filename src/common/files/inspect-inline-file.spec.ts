import { detectFileType } from './detect-file-type';
import { FILE_POLICIES } from './file-policies';
import { dataUrl, docx, gif, jpeg, pdf, png, webp, zip } from './file-fixtures';
import { inspectBuffer, inspectInlineFile } from './inspect-inline-file';
import { ooxmlProblem, pdfProblem } from './inspect-content';
import { readZipDirectory } from './zip-directory';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('detectFileType', () => {
  it.each([
    ['png', png()],
    ['jpeg', jpeg()],
    ['gif', gif()],
    ['webp', webp()],
    ['pdf', pdf()],
    ['docx', docx()],
    ['zip', zip([{ name: 'a.txt' }])],
    ['text', Buffer.from('olá, isto é texto', 'utf8')],
  ])('reconhece %s', (kind, buf) => {
    expect(detectFileType(buf).kind).toBe(kind);
  });

  it.each([
    ['PE/MZ', Buffer.from('MZ\x90\x00\x03', 'latin1')],
    ['ELF', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1])],
    ['shebang', Buffer.from('#!/bin/sh\nrm -rf /')],
    ['HTML', Buffer.from('  <!DOCTYPE html><html><body>x</body></html>')],
    ['SVG', Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['script', Buffer.from('<script>alert(1)</script>')],
    ['PHP', Buffer.from('<?php system($_GET[0]); ?>')],
  ])('marca %s como perigoso', (_n, buf) => {
    expect(detectFileType(buf).dangerous).toBeDefined();
  });

  it('binário aleatório com NUL é desconhecido', () => {
    expect(detectFileType(Buffer.from([1, 0, 2, 0, 3, 0, 4])).kind).toBe('unknown');
  });

  it('ZIP com [Content_Types].xml mas sem word/xl/ppt é zip genérico', () => {
    expect(detectFileType(zip([{ name: '[Content_Types].xml' }])).kind).toBe('zip');
  });
});

describe('pdfProblem', () => {
  it('aceita PDF simples', () => expect(pdfProblem(pdf())).toBeNull());
  it('rejeita JavaScript, mesmo com escape #xx no nome', () => {
    expect(pdfProblem(pdf('/JavaScript (app.alert(1))'))).toContain('JavaScript');
    expect(pdfProblem(pdf('/J#61vaScript (x)'))).toContain('JavaScript');
    expect(pdfProblem(pdf('/Launch << >>'))).toContain('Launch');
    expect(pdfProblem(pdf('/EmbeddedFile'))).toContain('EmbeddedFile');
  });
  it('não confunde nomes parecidos', () => {
    expect(pdfProblem(pdf('/JSONData /Javascripts'))).toBeNull();
  });
  it('rejeita sem %%EOF ou sem cabeçalho', () => {
    expect(pdfProblem(Buffer.from('%PDF-1.4\nsem fim'))).toContain('truncado');
    expect(pdfProblem(Buffer.from('lixo %%EOF'))).toContain('não é um PDF');
  });
});

describe('ooxmlProblem / readZipDirectory', () => {
  it('aceita docx normal', () => expect(ooxmlProblem(docx())).toBeNull());
  it('rejeita macros VBA e executáveis embutidos', () => {
    expect(ooxmlProblem(docx([{ name: 'word/vbaProject.bin' }]))).toContain('macros');
    expect(ooxmlProblem(docx([{ name: 'word/embeddings/x.exe' }]))).toContain('executável');
  });
  it('rejeita zip bomb pelos tamanhos declarados (taxa e total)', () => {
    const ratio = docx([
      { name: 'word/big.xml', declaredUncompressed: 40 * 1024 * 1024, declaredCompressed: 100 },
    ]);
    expect(ooxmlProblem(ratio)).toContain('compressão suspeita');
    const total = zip([
      { name: '[Content_Types].xml' },
      ...[1, 2, 3, 4].map(i => ({
        name: `word/p${i}.xml`,
        declaredUncompressed: 45 * 1024 * 1024,
        declaredCompressed: 30 * 1024 * 1024,
      })),
    ]);
    expect(ooxmlProblem(total)).toContain('demasiado grande');
  });
  it('rejeita caminhos inseguros, cifrados e sem [Content_Types].xml', () => {
    expect(ooxmlProblem(docx([{ name: '../evil.xml' }]))).toContain('inseguros');
    expect(ooxmlProblem(docx([{ name: '/abs.xml' }]))).toContain('inseguros');
    expect(ooxmlProblem(docx([{ name: 'word\\x.xml' }]))).toContain('inseguros');
    expect(ooxmlProblem(docx([{ name: 'word/enc.xml', encrypted: true }]))).toContain(
      'palavra-passe',
    );
    expect(ooxmlProblem(zip([{ name: 'a.txt' }]))).toContain('Office');
  });
  it('rejeita ZIP truncado ou sem directório', () => {
    expect(readZipDirectory(Buffer.from('PK\x03\x04')).ok).toBe(false);
    const good = docx();
    expect(readZipDirectory(good.subarray(0, good.length - 10)).ok).toBe(false);
  });
});

describe('inspectInlineFile', () => {
  const AVATAR = FILE_POLICIES.AVATAR;

  it('aceita PNG/JPEG/WebP verdadeiros e devolve o MIME dos bytes', () => {
    for (const [mime, buf] of [
      ['image/png', png()],
      ['image/jpeg', jpeg()],
      ['image/webp', webp()],
    ] as const) {
      const r = inspectInlineFile(dataUrl(mime, buf), AVATAR);
      expect(r).toMatchObject({ ok: true, mime });
    }
  });

  it('rejeita EXE disfarçado de imagem', () => {
    const r = inspectInlineFile(
      dataUrl('image/png', Buffer.from('MZ\x90\x00payload', 'latin1')),
      AVATAR,
    );
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain('executável');
  });

  it('rejeita HTML/SVG disfarçados', () => {
    const html = inspectInlineFile(
      dataUrl('image/png', Buffer.from('<html><script>1</script>')),
      AVATAR,
    );
    expect(html.ok).toBe(false);
    const svg = inspectInlineFile(dataUrl('image/png', Buffer.from('<svg onload="x()"/>')), AVATAR);
    expect(svg.ok).toBe(false);
  });

  it('rejeita MIME declarado diferente do conteúdo', () => {
    const r = inspectInlineFile(dataUrl('image/jpeg', png()), AVATAR);
    expect((r as { error: string }).error).toContain('não corresponde');
  });

  it('rejeita MIME fora da política (gif no avatar, svg, doc legado)', () => {
    expect(inspectInlineFile(dataUrl('image/gif', gif()), AVATAR).ok).toBe(false);
    expect(inspectInlineFile(dataUrl('image/svg+xml', Buffer.from('<svg/>')), AVATAR).ok).toBe(
      false,
    );
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(inspectInlineFile(dataUrl('application/msword', ole), FILE_POLICIES.OFFICE).ok).toBe(
      false,
    );
  });

  it('aplica tamanho em bytes e dimensões', () => {
    const big = Buffer.concat([png(), Buffer.alloc(FILE_POLICIES.AVATAR.maxBytes)]);
    expect(
      (inspectInlineFile(dataUrl('image/png', big), AVATAR) as { error: string }).error,
    ).toContain('excede');
    expect(
      (inspectInlineFile(dataUrl('image/png', png(2001, 10)), AVATAR) as { error: string }).error,
    ).toContain('2000');
    expect(inspectInlineFile(dataUrl('image/png', png(2000, 2000)), AVATAR).ok).toBe(true);
    expect(
      (
        inspectInlineFile(dataUrl('image/png', png(10, 10).subarray(0, 40)), AVATAR) as {
          error: string;
        }
      ).error,
    ).toContain('truncado');
  });

  it('PDF: aceita normal, rejeita JS e conteúdo que não é PDF', () => {
    expect(inspectInlineFile(dataUrl('application/pdf', pdf()), FILE_POLICIES.PDF).ok).toBe(true);
    expect(
      inspectInlineFile(dataUrl('application/pdf', pdf('/JS (x)')), FILE_POLICIES.PDF).ok,
    ).toBe(false);
    expect(
      inspectInlineFile(dataUrl('application/pdf', Buffer.from('texto')), FILE_POLICIES.PDF).ok,
    ).toBe(false);
  });

  it('Office: aceita docx, rejeita docx com macros e zip qualquer declarado como docx', () => {
    expect(inspectInlineFile(dataUrl(DOCX, docx()), FILE_POLICIES.OFFICE).ok).toBe(true);
    expect(
      inspectInlineFile(
        dataUrl(DOCX, docx([{ name: 'word/vbaProject.bin' }])),
        FILE_POLICIES.OFFICE,
      ).ok,
    ).toBe(false);
    expect(
      inspectInlineFile(dataUrl(DOCX, zip([{ name: 'a.txt' }])), FILE_POLICIES.OFFICE).ok,
    ).toBe(false);
  });

  it('texto: aceita csv/txt, rejeita binário declarado como texto', () => {
    expect(
      inspectInlineFile(dataUrl('text/csv', Buffer.from('a,b\n1,2')), FILE_POLICIES.TEXT),
    ).toMatchObject({ ok: true, ext: 'csv' });
    expect(
      inspectInlineFile(dataUrl('text/plain', Buffer.from([1, 0, 2, 0])), FILE_POLICIES.TEXT).ok,
    ).toBe(false);
  });

  it('rejeita data URL mal formado, payload inválido e vazio', () => {
    expect(inspectInlineFile('http://x', AVATAR).ok).toBe(false);
    expect(inspectInlineFile('data:image/png;base64,@@@', AVATAR).ok).toBe(false);
    expect(inspectInlineFile('data:image/png;base64,', AVATAR).ok).toBe(false);
    expect(inspectInlineFile(undefined, AVATAR).ok).toBe(false);
  });

  it('payload enorme é recusado depressa, sem decodificar', () => {
    const huge = `data:image/png;base64,${'A'.repeat(64 * 1024 * 1024)}`;
    const t0 = Date.now();
    expect(inspectInlineFile(huge, AVATAR).ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('inspectBuffer funciona com bytes directos (uploads base64 em campo próprio)', () => {
    expect(inspectBuffer(pdf(), 'application/pdf', FILE_POLICIES.PDF).ok).toBe(true);
    expect(inspectBuffer(Buffer.alloc(0), 'application/pdf', FILE_POLICIES.PDF).ok).toBe(false);
  });
});

import { contentDisposition, safeContentType, safeDownloadHeaders } from './safe-download';

describe('contentDisposition', () => {
  it('nome normal: fallback ASCII + filename* UTF-8', () => {
    expect(contentDisposition('relatório 2026.pdf')).toBe(
      `attachment; filename="relat_rio 2026.pdf"; filename*=UTF-8''relat%C3%B3rio%202026.pdf`,
    );
  });

  it('nunca deixa passar CR/LF, aspas, ponto e vírgula, barras nem percentagem no valor ASCII', () => {
    const header = contentDisposition('a"b;c%d\r\nSet-Cookie: x=1.pdf');
    expect(header).not.toMatch(/[\r\n]/);
    const ascii = /filename="([^"]*)"/.exec(header)?.[1] ?? '';
    expect(ascii).not.toMatch(/["\\%;\r\n/]/);
    expect(header.split('\n')).toHaveLength(1);
  });

  it('remove traversal e usa fallback quando não sobra nada', () => {
    expect(contentDisposition('../../etc/passwd')).toContain('filename="passwd"');
    expect(contentDisposition('///')).toContain('filename="ficheiro"');
    expect(contentDisposition(undefined)).toContain('filename="ficheiro"');
  });

  it('escapa os caracteres que o encodeURIComponent deixa passar', () => {
    expect(contentDisposition("o'(x).pdf")).toContain("filename*=UTF-8''o%27%28x%29.pdf");
  });

  it('inline só se pedido', () => {
    expect(contentDisposition('a.pdf', 'inline').startsWith('inline;')).toBe(true);
  });
});

describe('safeContentType', () => {
  it.each([
    ['text/html', 'application/octet-stream'],
    ['image/svg+xml', 'application/octet-stream'],
    ['application/xml', 'application/octet-stream'],
    ['application/javascript', 'application/octet-stream'],
    ['application/x-msdownload', 'application/octet-stream'],
    ['text/html; charset=utf-8', 'application/octet-stream'],
    ['nonsense', 'application/octet-stream'],
    ['', 'application/octet-stream'],
    [undefined, 'application/octet-stream'],
    ['application/pdf', 'application/pdf'],
    ['IMAGE/PNG', 'image/png'],
    ['text/csv', 'text/csv; charset=utf-8'],
    ['application/json', 'application/json'],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  ])('%s -> %s', (input, expected) => {
    expect(safeContentType(input)).toBe(expected);
  });
});

describe('safeDownloadHeaders', () => {
  it('por omissão é attachment com nosniff e CSP sandbox', () => {
    const h = safeDownloadHeaders({ filename: 'a.pdf', mime: 'application/pdf' });
    expect(h['Content-Disposition'].startsWith('attachment;')).toBe(true);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Content-Security-Policy']).toContain('sandbox');
  });

  it('inline só para PDF e imagens raster', () => {
    const pdf = safeDownloadHeaders({
      filename: 'a.pdf',
      mime: 'application/pdf',
      allowInline: true,
    });
    expect(pdf['Content-Disposition'].startsWith('inline;')).toBe(true);
    const csv = safeDownloadHeaders({ filename: 'a.csv', mime: 'text/csv', allowInline: true });
    expect(csv['Content-Disposition'].startsWith('attachment;')).toBe(true);
  });

  it('HTML guardado sai como octet-stream + attachment, mesmo com allowInline', () => {
    const h = safeDownloadHeaders({ filename: 'x.html', mime: 'text/html', allowInline: true });
    expect(h['Content-Type']).toBe('application/octet-stream');
    expect(h['Content-Disposition'].startsWith('attachment;')).toBe(true);
  });

  it('extra acrescenta e pode sobrepor (ex.: Cache-Control)', () => {
    const h = safeDownloadHeaders({
      filename: 'a.pdf',
      mime: 'application/pdf',
      extra: { 'Cache-Control': 'no-store', 'X-Audit-Export-Code': 'EX-1' },
    });
    expect(h['Cache-Control']).toBe('no-store');
    expect(h['X-Audit-Export-Code']).toBe('EX-1');
  });
});

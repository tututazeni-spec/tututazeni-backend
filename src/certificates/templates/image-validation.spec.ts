import { inspectImage } from './image-validation';
import { makePng } from './test-images';

const JPEG_1X1 = Buffer.concat([
  Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  ),
  Buffer.from([0xff, 0xd9]),
]);

const url = (mime: string, buf: Buffer) => `data:${mime};base64,${buf.toString('base64')}`;

describe('inspectImage', () => {
  it('PNG válido devolve MIME, bytes e dimensões', () => {
    const r = inspectImage(url('image/png', makePng(120, 60)));
    expect(r).toMatchObject({ ok: true, mime: 'image/png', width: 120, height: 60 });
    if (r.ok) expect(r.bytes.subarray(1, 4).toString()).toBe('PNG');
  });

  it('JPEG válido devolve dimensões', () => {
    expect(inspectImage(url('image/jpeg', JPEG_1X1))).toMatchObject({
      ok: true,
      mime: 'image/jpeg',
      width: 1,
      height: 1,
    });
  });

  it.each([
    ['SVG', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['GIF', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='],
    ['WebP', 'data:image/webp;base64,UklGRhoAAABXRUJQ'],
    ['PDF', 'data:application/pdf;base64,JVBERi0xLjQ='],
    ['texto simples', 'não é um data url'],
    ['ligação', 'https://exemplo.com/logo.png'],
  ])('rejeita %s', (_n, value) => {
    expect(inspectImage(value)).toMatchObject({ ok: false });
  });

  it('rejeita um executável renomeado para PNG (MIME png, bytes MZ)', () => {
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
    const r = inspectImage(url('image/png', exe));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/png|conte[úu]do/i);
  });

  it('rejeita MIME png com bytes de JPEG e vice-versa', () => {
    expect(inspectImage(url('image/png', JPEG_1X1))).toMatchObject({ ok: false });
    expect(inspectImage(url('image/jpeg', makePng(10, 10)))).toMatchObject({ ok: false });
  });

  it('rejeita PNG truncado', () => {
    const png = makePng(50, 50);
    expect(inspectImage(url('image/png', png.subarray(0, png.length - 20)))).toMatchObject({
      ok: false,
    });
    expect(inspectImage(url('image/png', png.subarray(0, 20)))).toMatchObject({ ok: false });
  });

  it('rejeita JPEG truncado (sem fim de ficheiro)', () => {
    expect(
      inspectImage(url('image/jpeg', JPEG_1X1.subarray(0, JPEG_1X1.length - 2))),
    ).toMatchObject({
      ok: false,
    });
  });

  it('rejeita base64 inválido', () => {
    expect(inspectImage('data:image/png;base64,@@@@')).toMatchObject({ ok: false });
  });

  it('rejeita mais de 2 MB', () => {
    const big = Buffer.concat([makePng(10, 10), Buffer.alloc(3 * 1024 * 1024)]);
    const r = inspectImage(url('image/png', big));
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/2 MB/);
  });

  it('rejeita dimensões acima do limite e aceita dentro dele', () => {
    const wide = makePng(4001, 10);
    expect(inspectImage(url('image/png', wide), 4000)).toMatchObject({ ok: false });
    expect(inspectImage(url('image/png', wide), 6000)).toMatchObject({ ok: true });
  });

  it('rejeita dimensões zero', () => {
    expect(inspectImage(url('image/png', makePng(0, 10)))).toMatchObject({ ok: false });
  });
});

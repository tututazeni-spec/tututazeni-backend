import { validate } from 'class-validator';
import { IsFileSizeWithinLimit } from './is-file-size-within-limit.decorator';
import {
  base64Chars,
  FILE_POLICIES,
  maxDataUrlChars,
  maxExternalBytesFor,
  DEFAULT_EXTERNAL_MAX_BYTES,
} from './file-policies';
import { formatLimit, parseDataUrl } from './data-url';

describe('FILE_POLICIES (não alargam os limites que já estavam em vigor)', () => {
  it('avatar: ≤ ao antigo @MaxLength(200_000) (+ margem do prefixo) e 150 KB', () => {
    expect(FILE_POLICIES.AVATAR.maxBytes).toBe(150_000);
    expect(maxDataUrlChars(FILE_POLICIES.AVATAR)).toBeLessThanOrEqual(200_200);
  });
  it('imagem de cartão: ≤ ao antigo @MaxLength(700_000)', () => {
    expect(maxDataUrlChars(FILE_POLICIES.CARD_IMAGE)).toBeLessThanOrEqual(700_000);
  });
  it('PDF de lição: ≤ ao antigo @MaxLength(7_000_000), mas aceita 5 MB exactos', () => {
    expect(maxDataUrlChars(FILE_POLICIES.PDF)).toBeLessThanOrEqual(7_000_000);
    expect(maxDataUrlChars(FILE_POLICIES.PDF)).toBeGreaterThan(base64Chars(5 * 1024 * 1024));
  });
  it('anexos 4 MB, onboarding 3 MB, documento 5 MB', () => {
    expect(FILE_POLICIES.ATTACHMENT.maxBytes).toBe(4 * 1024 * 1024);
    expect(FILE_POLICIES.ONBOARDING_PDF.maxBytes).toBe(3 * 1024 * 1024);
    expect(FILE_POLICIES.DOCUMENT.maxBytes).toBe(5 * 1024 * 1024);
  });
  it('nenhuma política inclui tipos activos nem Office legado', () => {
    const all = Object.values(FILE_POLICIES).flatMap(p => [...p.mimes]);
    for (const bad of [
      'image/svg+xml',
      'text/html',
      'application/msword',
      'application/x-msdownload',
    ]) {
      expect(all).not.toContain(bad);
    }
  });
});

describe('formatLimit / parseDataUrl', () => {
  it('formata MB e KB', () => {
    expect(formatLimit(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatLimit(150_000)).toBe('150 KB');
  });
  it('mede em bytes descodificados: o limite exacto passa, +1 byte não', () => {
    const at = (n: number) => `data:image/png;base64,${Buffer.alloc(n, 1).toString('base64')}`;
    expect(parseDataUrl(at(150_000), 150_000).ok).toBe(true);
    const over = parseDataUrl(at(150_001), 150_000);
    expect(over.ok).toBe(false);
    expect((over as { error: string }).error).toContain('150 KB');
  });
});

describe('maxExternalBytesFor / @IsFileSizeWithinLimit', () => {
  it('limita por família de MIME', () => {
    expect(maxExternalBytesFor('video/mp4')).toBe(200 * 1024 * 1024);
    expect(maxExternalBytesFor('image/png')).toBe(25 * 1024 * 1024);
    expect(maxExternalBytesFor('text/csv')).toBe(25 * 1024 * 1024);
    expect(maxExternalBytesFor('application/pdf')).toBe(DEFAULT_EXTERNAL_MAX_BYTES);
    expect(maxExternalBytesFor(undefined)).toBe(DEFAULT_EXTERNAL_MAX_BYTES);
  });

  class Dto {
    mimeType?: string;
    @IsFileSizeWithinLimit()
    fileSize?: number;
  }
  const check = async (mimeType: string | undefined, fileSize: number) =>
    (await validate(Object.assign(new Dto(), { mimeType, fileSize }))).length === 0;

  it('aceita dentro do teto e recusa acima, conforme o MIME', async () => {
    expect(await check('video/mp4', 150 * 1024 * 1024)).toBe(true);
    expect(await check('image/png', 150 * 1024 * 1024)).toBe(false);
    expect(await check('application/pdf', 100 * 1024 * 1024)).toBe(true);
    expect(await check('application/pdf', 100 * 1024 * 1024 + 1)).toBe(false);
  });
  it('recusa 0, negativos e não-números', async () => {
    expect(await check('application/pdf', 0)).toBe(false);
    expect(await check('application/pdf', -5)).toBe(false);
    expect(await check('application/pdf', NaN)).toBe(false);
  });
  it('mensagem indica o teto do tipo', async () => {
    const errs = await validate(
      Object.assign(new Dto(), { mimeType: 'image/png', fileSize: 10 ** 9 }),
    );
    expect(JSON.stringify(errs)).toContain('25 MB');
  });
});

/* eslint-disable no-script-url -- os "javascript:" são entradas maliciosas propositadas */
import { validate } from 'class-validator';
import { IsSafeFileUrl, isInternalHostname, safeFileUrlProblem } from './safe-file-url';
import { IsAllowedFileUrl } from './is-allowed-file-url.validator';
import { IsUrlOrInlineFile } from './is-url-or-inline-file.decorator';

class SafeDto {
  @IsSafeFileUrl()
  url!: string;
}
class AllowedDto {
  @IsAllowedFileUrl()
  url!: string;
}
class InlineDto {
  @IsUrlOrInlineFile()
  url!: string;
}

const ok = async (Cls: new () => { url: string }, url: string) =>
  (await validate(Object.assign(new Cls(), { url }))).length === 0;

describe('safeFileUrlProblem', () => {
  it.each([
    'javascript:alert(1)',
    'vbscript:x',
    'file:///etc/passwd',
    'ftp://host/a.pdf',
    'http://storage.innova.ao/a.pdf',
    'https://user:pass@storage.innova.ao/a.pdf',
    'https://user@storage.innova.ao/a.pdf',
    'https://localhost/a.pdf',
    'https://app.localhost/a.pdf',
    'https://127.0.0.1/a.pdf',
    'https://127.1/a.pdf',
    'https://2130706433/a.pdf',
    'https://0x7f.0.0.1/a.pdf',
    'https://10.0.0.5/a.pdf',
    'https://172.16.3.4/a.pdf',
    'https://192.168.1.1/a.pdf',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/a.pdf',
    'https://[fd00::1]/a.pdf',
    'https://[::ffff:127.0.0.1]/a.pdf',
    'https://db.internal/a.pdf',
    'not a url',
    '',
  ])('rejeita %s', value => {
    expect(safeFileUrlProblem(value)).not.toBeNull();
  });

  it.each(['https://storage.innova.ao/a.pdf', 'https://youtu.be/abc', 'https://8.8.8.8/a.pdf'])(
    'aceita %s',
    value => {
      expect(safeFileUrlProblem(value)).toBeNull();
    },
  );

  it('aplica a lista de hosts quando definida', () => {
    expect(safeFileUrlProblem('https://a.com/x', { allowedHosts: ['b.com'] })).toContain(
      'não autorizado',
    );
    expect(safeFileUrlProblem('https://b.com/x', { allowedHosts: ['b.com'] })).toBeNull();
  });

  it('isInternalHostname não apanha domínios públicos parecidos', () => {
    expect(isInternalHostname('localhost.example.com')).toBe(false);
    expect(isInternalHostname('172.32.0.1')).toBe(false);
  });
});

describe('integração nos decorators', () => {
  const prev = process.env.ALLOWED_FILE_HOST;
  beforeEach(() => {
    process.env.ALLOWED_FILE_HOST = 'storage.innova.ao';
  });
  afterAll(() => {
    process.env.ALLOWED_FILE_HOST = prev;
  });

  it('IsSafeFileUrl rejeita javascript:', async () => {
    expect(await ok(SafeDto, 'javascript:alert(1)')).toBe(false);
    expect(await ok(SafeDto, 'https://storage.innova.ao/a.pdf')).toBe(true);
  });

  it('IsAllowedFileUrl rejeita credenciais e hosts fora da allowlist', async () => {
    expect(await ok(AllowedDto, 'https://storage.innova.ao/a.pdf')).toBe(true);
    expect(await ok(AllowedDto, 'https://u:p@storage.innova.ao/a.pdf')).toBe(false);
    expect(await ok(AllowedDto, 'https://other.com/a.pdf')).toBe(false);
  });

  it('IsAllowedFileUrl: mesmo com localhost na allowlist recusa host interno', async () => {
    process.env.ALLOWED_FILE_HOST = 'localhost';
    expect(await ok(AllowedDto, 'https://localhost/a.pdf')).toBe(false);
  });

  it('IsUrlOrInlineFile já não aceita qualquer string como ligação', async () => {
    expect(await ok(InlineDto, 'javascript:alert(1)')).toBe(false);
    expect(await ok(InlineDto, 'http://exemplo.com')).toBe(false);
    expect(await ok(InlineDto, 'texto livre')).toBe(false);
    expect(await ok(InlineDto, 'https://youtu.be/abc')).toBe(true);
  });
});

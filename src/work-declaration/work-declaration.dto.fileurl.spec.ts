import { validate } from 'class-validator';
import { SignDeclarationDto, UpsertTenantConfigDto, SignatureType } from './work-declaration.dto';

async function errorsFor(
  dto: SignDeclarationDto | UpsertTenantConfigDto,
  field: string,
  host = 'storage.innova.ao',
) {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const errs = await validate(dto);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === field);
}

describe('SignDeclarationDto.signatureUrl — IsAllowedFileUrl', () => {
  function makeDto(signatureUrl?: string) {
    return Object.assign(new SignDeclarationDto(), {
      type: SignatureType.IMAGE_UPLOAD,
      signerRole: 'RH',
      signatureUrl,
    });
  }

  it('aceita URL válida com host permitido', async () => {
    expect(
      await errorsFor(makeDto('https://storage.innova.ao/sign.png'), 'signatureUrl'),
    ).toHaveLength(0);
  });
  it('aceita ausência (campo opcional)', async () => {
    expect(await errorsFor(makeDto(undefined), 'signatureUrl')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect(
      (await errorsFor(makeDto('http://storage.innova.ao/sign.png'), 'signatureUrl')).length,
    ).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect(
      (await errorsFor(makeDto('https://evil.com/sign.png'), 'signatureUrl')).length,
    ).toBeGreaterThan(0);
  });
});

describe('UpsertTenantConfigDto.logoUrl — IsAllowedFileUrl', () => {
  function makeDto(logoUrl?: string) {
    return Object.assign(new UpsertTenantConfigDto(), { logoUrl });
  }

  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor(makeDto('https://storage.innova.ao/logo.png'), 'logoUrl')).toHaveLength(
      0,
    );
  });
  it('aceita ausência (campo opcional)', async () => {
    expect(await errorsFor(makeDto(undefined), 'logoUrl')).toHaveLength(0);
  });
  it('recusa http — antes deste fix, PATCH branding/settings contornava @IsAllowedFileUrl()', async () => {
    expect(
      (await errorsFor(makeDto('http://storage.innova.ao/logo.png'), 'logoUrl')).length,
    ).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect(
      (await errorsFor(makeDto('https://evil.com/logo.png'), 'logoUrl')).length,
    ).toBeGreaterThan(0);
  });
});

import { validate } from 'class-validator';
import { CreateTemplateDto } from './create-template.dto';

async function errorsFor(
  field: 'logoUrl' | 'signatureUrl',
  value: string | undefined,
  host = 'storage.innova.ao',
) {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new CreateTemplateDto(), {
    name: 'Certificado de Conclusão',
    html: '<h1>{{recipientName}}</h1>',
    [field]: value,
  });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === field);
}

describe('CreateTemplateDto.logoUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('logoUrl', 'https://storage.innova.ao/logo.png')).toHaveLength(0);
  });
  it('aceita ausência (campo opcional)', async () => {
    expect(await errorsFor('logoUrl', undefined)).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect(
      (await errorsFor('logoUrl', 'http://storage.innova.ao/logo.png')).length,
    ).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('logoUrl', 'https://evil.com/logo.png')).length).toBeGreaterThan(0);
  });
});

describe('CreateTemplateDto.signatureUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('signatureUrl', 'https://storage.innova.ao/sign.png')).toHaveLength(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('signatureUrl', 'https://evil.com/sign.png')).length).toBeGreaterThan(
      0,
    );
  });
});

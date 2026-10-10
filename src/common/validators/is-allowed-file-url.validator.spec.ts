import { validate } from 'class-validator';
import { IsAllowedFileUrl } from './is-allowed-file-url.validator';

class Dto {
  @IsAllowedFileUrl()
  fileUrl!: string;
}

async function errorsFor(value: string, allowedHost: string) {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = allowedHost;
  const d = new Dto();
  d.fileUrl = value;
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs;
}

describe('IsAllowedFileUrl', () => {
  it('aceita https com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/logo.png', 'storage.innova.ao')).toHaveLength(
      0,
    );
  });

  it('aceita vários hosts — segundo da lista', async () => {
    expect(
      await errorsFor('https://cdn.innova.ao/img.png', 'storage.innova.ao,cdn.innova.ao'),
    ).toHaveLength(0);
  });

  it('aceita qualquer https quando ALLOWED_FILE_HOST está vazio', async () => {
    expect(await errorsFor('https://qualquer.com/file.pdf', '')).toHaveLength(0);
  });

  it('recusa http', async () => {
    expect(
      (await errorsFor('http://storage.innova.ao/logo.png', 'storage.innova.ao')).length,
    ).toBeGreaterThan(0);
  });

  it('recusa javascript:', async () => {
    const url = 'javascript' + ':alert(1)';

    expect((await errorsFor(url, 'storage.innova.ao')).length).toBeGreaterThan(0);
  });

  it('recusa data:', async () => {
    expect(
      (await errorsFor('data:text/html,<h1>xss</h1>', 'storage.innova.ao')).length,
    ).toBeGreaterThan(0);
  });

  it('recusa host não autorizado', async () => {
    expect(
      (await errorsFor('https://evil.com/logo.png', 'storage.innova.ao')).length,
    ).toBeGreaterThan(0);
  });

  it('recusa string vazia', async () => {
    expect((await errorsFor('', 'storage.innova.ao')).length).toBeGreaterThan(0);
  });

  it('recusa URL inválida', async () => {
    expect((await errorsFor('not-a-url', 'storage.innova.ao')).length).toBeGreaterThan(0);
  });
});

describe('IsAllowedFileUrl — allowPdfDataUrl', () => {
  const MAX = 100;
  class PdfDto {
    @IsAllowedFileUrl(undefined, { allowPdfDataUrl: MAX })
    fileUrl!: string;
  }
  const errors = async (v: string) => {
    const d = new PdfDto();
    d.fileUrl = v;
    return validate(d);
  };

  it('aceita PDF em data URL dentro do limite', async () => {
    expect(await errors('data:application/pdf;base64,JVBERi0xLjQ=')).toHaveLength(0);
  });

  it('recusa PDF acima do limite', async () => {
    expect((await errors('data:application/pdf;base64,' + 'A'.repeat(MAX))).length).toBeGreaterThan(
      0,
    );
  });

  it('recusa data URL que não é PDF', async () => {
    expect((await errors('data:text/html;base64,PGgxPg==')).length).toBeGreaterThan(0);
  });

  it('recusa base64 inválido', async () => {
    expect((await errors('data:application/pdf;base64,<script>')).length).toBeGreaterThan(0);
  });

  it('continua a aceitar URL https', async () => {
    expect(await errors('https://exemplo.com/a.pdf')).toHaveLength(0);
  });

  it('sem a opção, data URL continua recusado', async () => {
    expect((await errorsFor('data:application/pdf;base64,JVBERi0=', '')).length).toBeGreaterThan(0);
  });
});

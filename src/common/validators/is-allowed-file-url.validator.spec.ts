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
    // eslint-disable-next-line no-script-url
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

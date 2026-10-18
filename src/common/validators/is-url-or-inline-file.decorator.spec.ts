import { validate } from 'class-validator';
import { IsUrlOrInlineFile } from './is-url-or-inline-file.decorator';

class Dto {
  @IsUrlOrInlineFile()
  url!: string;
}

const make = (url: string) => Object.assign(new Dto(), { url });
const b64 = (bytes: number) => Buffer.alloc(bytes, 1).toString('base64');

describe('IsUrlOrInlineFile', () => {
  it('aceita uma ligação normal', async () => {
    expect(await validate(make('https://youtu.be/abc'))).toHaveLength(0);
  });

  it('rejeita vazio', async () => {
    expect(await validate(make('  '))).toHaveLength(1);
  });

  it('aceita um ficheiro inline pequeno com MIME permitido', async () => {
    expect(await validate(make(`data:application/pdf;base64,${b64(1000)}`))).toHaveLength(0);
  });

  it('aceita exactamente 5 MB e rejeita acima', async () => {
    const five = 5 * 1024 * 1024;
    expect(await validate(make(`data:video/mp4;base64,${b64(five)}`))).toHaveLength(0);
    const errs = await validate(make(`data:video/mp4;base64,${b64(five + 1)}`));
    expect(errs).toHaveLength(1);
    expect(JSON.stringify(errs)).toContain('excede 5 MB');
  });

  it('rejeita MIME fora da allowlist e data URL mal formado', async () => {
    expect(await validate(make(`data:text/html;base64,${b64(10)}`))).toHaveLength(1);
    expect(await validate(make('data:application/pdf,olá'))).toHaveLength(1);
  });
});

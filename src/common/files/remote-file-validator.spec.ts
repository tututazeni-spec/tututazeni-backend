import { validate, validateSync } from 'class-validator';
import { IsAllowedFileUrl } from '../validators/is-allowed-file-url.validator';
import * as remote from './remote-file';

class DocDto {
  @IsAllowedFileUrl()
  fileUrl!: string;

  mimeType?: string;
}

const make = (fileUrl: string, mimeType?: string) =>
  Object.assign(new DocDto(), { fileUrl, mimeType });

describe('IsAllowedFileUrl + verificação do ficheiro remoto', () => {
  const saved = { ...process.env };
  let spy: jest.SpyInstance;

  beforeEach(() => {
    process.env.ALLOWED_FILE_HOST = 'files.test';
    spy = jest.spyOn(remote, 'verifyRemoteFile');
  });
  afterEach(() => {
    spy.mockRestore();
    process.env = { ...saved };
  });

  it('desligado (omissão): não toca na rede e o validador continua síncrono', () => {
    spy.mockResolvedValue('nunca devia ser chamado');
    expect(validateSync(make('https://files.test/a.pdf'))).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('desligado continua a recusar URLs inválidas, como antes', () => {
    expect(validateSync(make('http://files.test/a.pdf'))).toHaveLength(1);
    expect(validateSync(make('https://evil.test/a.pdf'))).toHaveLength(1);
    expect(spy).not.toHaveBeenCalled();
  });

  describe('REMOTE_FILE_VERIFY=true', () => {
    beforeEach(() => {
      process.env.REMOTE_FILE_VERIFY = 'true';
    });

    it('ficheiro aceite pelo verificador passa, e recebe o mimeType do DTO', async () => {
      spy.mockResolvedValue(null);
      expect(await validate(make('https://files.test/a.pdf', 'application/pdf'))).toHaveLength(0);
      expect(spy).toHaveBeenCalledWith(
        'https://files.test/a.pdf',
        { declaredMime: 'application/pdf' },
        expect.objectContaining({ enabled: true }),
      );
    });

    it('ficheiro recusado falha a validação com o motivo na mensagem', async () => {
      spy.mockResolvedValue('Ficheiro rejeitado: malware detectado (Win.Test.EICAR_HDB-1).');
      const errors = await validate(make('https://files.test/a.pdf'));
      expect(errors).toHaveLength(1);
      expect(JSON.stringify(errors)).toContain('malware detectado');
    });

    it('URL que já falha a allowlist nem chega ao verificador', async () => {
      expect(await validate(make('https://evil.test/a.pdf'))).toHaveLength(1);
      expect(await validate(make('http://files.test/a.pdf'))).toHaveLength(1);
      expect(spy).not.toHaveBeenCalled();
    });

    it('mimeType que não é string é ignorado', async () => {
      spy.mockResolvedValue(null);
      await validate(make('https://files.test/a.pdf', 42 as never));
      expect(spy.mock.calls[0][1]).toEqual({ declaredMime: undefined });
    });

    it('data URLs inline não passam pelo verificador remoto', async () => {
      class InlineDto {
        @IsAllowedFileUrl(undefined, {
          inline: { name: 'T', mimes: ['application/pdf'], maxBytes: 1000 },
        })
        fileUrl!: string;
      }
      const b64 = Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64');
      const dto = Object.assign(new InlineDto(), { fileUrl: `data:application/pdf;base64,${b64}` });
      expect(await validate(dto)).toHaveLength(0);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

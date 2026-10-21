import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsisSpeechService } from './isis-speech.service';

function build(env: Record<string, unknown>): IsisSpeechService {
  return new IsisSpeechService({ get: (k: string) => env[k] } as unknown as ConfigService);
}

describe('IsisSpeechService', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sem chave ou voz → 503', async () => {
    await expect(build({}).synthesizePcm16k('Olá')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pede pcm_16000 ao ElevenLabs e devolve os bytes', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const out = await build({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }).synthesizePcm16k(
      'Olá',
    );
    expect(out).toEqual(Buffer.from([1, 2, 3]));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/text-to-speech/v?output_format=pcm_16000');
    expect(init.headers['xi-api-key']).toBe('k');
  });

  it('erro do ElevenLabs → 503', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await expect(
      build({ ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID: 'v' }).synthesizePcm16k('x'),
    ).rejects.toThrow('Falha ao gerar a voz da Ísis');
  });
});

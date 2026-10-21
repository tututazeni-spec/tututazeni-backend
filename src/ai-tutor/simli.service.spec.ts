import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSimliSessionToken } from 'simli-client';
import { SimliService } from './simli.service';

jest.mock('simli-client', () => ({ generateSimliSessionToken: jest.fn() }));

const mockGenerate = generateSimliSessionToken as jest.Mock;

function build(env: Record<string, unknown>): SimliService {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new SimliService(config);
}

describe('SimliService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('isConfigured exige chave e face', () => {
    expect(build({ SIMLI_API_KEY: 'k' }).isConfigured()).toBe(false);
    expect(build({ SIMLI_API_KEY: 'k', SIMLI_FACE_ID: 'f' }).isConfigured()).toBe(true);
  });

  it('createSession devolve só o token e aplica os limites por omissão', async () => {
    mockGenerate.mockResolvedValue({ session_token: 'tok' });
    const res = await build({ SIMLI_API_KEY: 'k', SIMLI_FACE_ID: 'f' }).createSession();
    expect(res).toEqual({ sessionToken: 'tok', maxSessionLength: 600, maxIdleTime: 180 });
    expect(mockGenerate).toHaveBeenCalledWith({
      apiKey: 'k',
      config: expect.objectContaining({ faceId: 'f', maxSessionLength: 600, maxIdleTime: 180 }),
    });
  });

  it('createSession sem configuração → 503', async () => {
    await expect(build({}).createSession()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('falha do Simli → 503 sem expor o corpo do erro', async () => {
    mockGenerate.mockRejectedValue('{"detail":"invalid key k"}');
    const p = build({ SIMLI_API_KEY: 'k', SIMLI_FACE_ID: 'f' }).createSession();
    await expect(p).rejects.toThrow('Avatar da Ísis indisponível');
  });
});

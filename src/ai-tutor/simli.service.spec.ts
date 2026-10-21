import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SimliService } from './simli.service';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

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

  it('SIMLI_ALLOWED_ROLES limita o avatar aos perfis indicados', () => {
    const svc = build({ SIMLI_ALLOWED_ROLES: 'admin, RH' });
    expect(svc.isAllowedFor('ADMIN')).toBe(true);
    expect(svc.isAllowedFor('RH')).toBe(true);
    expect(svc.isAllowedFor('COLABORADOR')).toBe(false);
    expect(svc.isAllowedFor(null)).toBe(false);
    expect(() => svc.assertAllowedFor('COLABORADOR')).toThrow('perfil');
  });

  it('sem SIMLI_ALLOWED_ROLES todos os perfis têm acesso', () => {
    expect(build({}).isAllowedFor('COLABORADOR')).toBe(true);
  });

  it('createSession devolve só o token e aplica os limites por omissão', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ session_token: 'tok' }) });
    const res = await build({ SIMLI_API_KEY: 'k', SIMLI_FACE_ID: 'f' }).createSession();
    expect(res).toEqual({ sessionToken: 'tok', maxSessionLength: 600, maxIdleTime: 180 });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.simli.ai/compose/token');
    expect(init.headers['x-simli-api-key']).toBe('k');
    expect(JSON.parse(init.body)).toEqual(
      expect.objectContaining({ faceId: 'f', maxSessionLength: 600, maxIdleTime: 180 }),
    );
  });

  it('createSession sem configuração → 503', async () => {
    await expect(build({}).createSession()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('falha do Simli → 503 sem expor o corpo do erro', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"detail":"invalid key k"}',
    });
    const p = build({ SIMLI_API_KEY: 'k', SIMLI_FACE_ID: 'f' }).createSession();
    await expect(p).rejects.toThrow('Avatar da Ísis indisponível');
  });
});

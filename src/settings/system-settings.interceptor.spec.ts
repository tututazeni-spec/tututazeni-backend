import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SystemSettingsInterceptor } from './system-settings.interceptor';
import { DEFAULT_SYSTEM_SETTINGS, SystemSettings } from './system-settings';

const settings = (over: Partial<SystemSettings> = {}): SystemSettings => ({
  ...structuredClone(DEFAULT_SYSTEM_SETTINGS),
  ...over,
});

interface Req {
  url: string;
  method: string;
  query?: Record<string, unknown>;
  body?: unknown;
  user?: { role?: { name?: string } };
}

describe('SystemSettingsInterceptor', () => {
  let system: { load: jest.Mock };
  let next: CallHandler;
  let interceptor: SystemSettingsInterceptor;

  const ctx = (req: Req, type = 'http') =>
    ({
      getType: () => type,
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;

  const run = (req: Req, type?: string) => interceptor.intercept(ctx(req, type), next);

  beforeEach(() => {
    system = { load: jest.fn().mockResolvedValue(settings()) };
    next = { handle: jest.fn().mockReturnValue('OBS') } as unknown as CallHandler;
    interceptor = new SystemSettingsInterceptor(system as never);
  });

  it('contextos não-HTTP (filas, websockets) passam sem ler definições', async () => {
    await expect(run({ url: '/', method: 'GET' }, 'rpc')).resolves.toBe('OBS');
    expect(system.load).not.toHaveBeenCalled();
  });

  it('se as definições não puderem ser lidas, o pedido segue (nunca bloquear por isto)', async () => {
    system.load.mockRejectedValue(new Error('db down'));
    await expect(run({ url: '/courses', method: 'GET' })).resolves.toBe('OBS');
  });

  describe('modo de manutenção', () => {
    beforeEach(() =>
      system.load.mockResolvedValue(
        settings({ maintenance: { enabled: true, message: 'Voltamos às 18h' } }),
      ),
    );

    it('bloqueia utilizadores normais com 503 e a mensagem configurada', async () => {
      const err = await run({
        url: '/courses',
        method: 'GET',
        user: { role: { name: 'COLABORADOR' } },
      }).catch(e => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(err.message).toBe('Voltamos às 18h');
      expect(next.handle).not.toHaveBeenCalled();
    });

    it('bloqueia pedidos anónimos a rotas normais', async () => {
      await expect(run({ url: '/courses', method: 'GET' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('o ADMIN continua a trabalhar', async () => {
      await expect(
        run({ url: '/courses', method: 'POST', user: { role: { name: 'ADMIN' } } }),
      ).resolves.toBe('OBS');
    });

    it('RH não é tratado como admin', async () => {
      await expect(
        run({ url: '/courses', method: 'GET', user: { role: { name: 'RH' } } }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it.each(['/auth/login', '/health', '/metrics', '/settings/system'])(
      'rota isenta %s continua acessível (o admin precisa de entrar e desligar o modo)',
      async url => {
        await expect(run({ url, method: 'POST' })).resolves.toBe('OBS');
      },
    );

    it('desligado: ninguém é bloqueado', async () => {
      system.load.mockResolvedValue(settings());
      await expect(run({ url: '/courses', method: 'GET' })).resolves.toBe('OBS');
    });
  });

  describe('tecto de paginação', () => {
    it('reduz ?limit acima do tecto no próprio request', async () => {
      const req: Req = { url: '/users', method: 'GET', query: { limit: '5000', page: '2' } };
      await run(req);
      expect(req.query).toEqual({ limit: '200', page: '2' });
    });

    it('respeita o tecto configurado', async () => {
      system.load.mockResolvedValue(settings({ pagination: { maxPageSize: 20 } }));
      const req: Req = { url: '/users', method: 'GET', query: { limit: '50' } };
      await run(req);
      expect(req.query!.limit).toBe('20');
    });

    it('não toca em limites válidos nem em pedidos sem query', async () => {
      const ok: Req = { url: '/users', method: 'GET', query: { limit: '50' } };
      await run(ok);
      expect(ok.query!.limit).toBe('50');
      await expect(run({ url: '/users', method: 'GET' })).resolves.toBe('OBS');
    });
  });

  describe('metadados de upload', () => {
    const pdfOnly = () =>
      system.load.mockResolvedValue(
        settings({ uploads: { maxFileSizeMb: 1, allowedMimeTypes: ['application/pdf'] } }),
      );

    it('POST com tipo não permitido → 400 antes de chegar ao handler', async () => {
      pdfOnly();
      await expect(
        run({ url: '/documents', method: 'POST', body: { mimeType: 'text/html' } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(next.handle).not.toHaveBeenCalled();
    });

    it('PUT/PATCH/POST validam; GET e DELETE não', async () => {
      pdfOnly();
      const body = { mimeType: 'text/html' };
      for (const method of ['POST', 'PUT', 'PATCH']) {
        await expect(run({ url: '/d', method, body })).rejects.toBeInstanceOf(BadRequestException);
      }
      for (const method of ['GET', 'DELETE']) {
        await expect(run({ url: '/d', method, body })).resolves.toBe('OBS');
      }
    });

    it('ficheiro demasiado grande → 400 com o limite na mensagem', async () => {
      pdfOnly();
      const err = await run({
        url: '/d',
        method: 'POST',
        body: { mimeType: 'application/pdf', fileSize: 2 * 1024 * 1024 },
      }).catch(e => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toMatch(/1 MB/);
    });

    it('corpo válido ou sem metadados de ficheiro segue', async () => {
      pdfOnly();
      await expect(
        run({ url: '/d', method: 'POST', body: { mimeType: 'application/pdf', fileSize: 10 } }),
      ).resolves.toBe('OBS');
      await expect(run({ url: '/d', method: 'POST', body: { name: 'x' } })).resolves.toBe('OBS');
    });
  });
});

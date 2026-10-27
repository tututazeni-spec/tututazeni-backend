import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BillingEntitlementsGuard } from './billing-entitlements.guard';
import { BillingLimitsService } from './billing-limits.service';
import { moduleForPath } from './billing-route-modules';

const ctx = (req: object): ExecutionContext =>
  ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

const make = (over: Partial<Record<keyof BillingLimitsService, unknown>> = {}) => {
  const limits = {
    moduleBlockReason: jest.fn().mockResolvedValue(null),
    storageExceeded: jest.fn().mockResolvedValue(false),
    current: jest.fn().mockResolvedValue({ limits: { maxStorageGb: 50 } }),
    ...over,
  } as unknown as BillingLimitsService;
  return { guard: new BillingEntitlementsGuard(limits), limits };
};

const post = (url: string, body: unknown = {}, type = 'application/json') => ({
  method: 'POST',
  url,
  headers: { 'content-type': type },
  body,
});

describe('moduleForPath', () => {
  it('mapeia módulos inequívocos e deixa o núcleo livre', () => {
    expect(moduleForPath('/payroll/runs')).toBe('PAYROLL');
    expect(moduleForPath('/courses')).toBe('LMS');
    expect(moduleForPath('/library/items/3')).toBe('CONTENT_LIBRARY');
    expect(moduleForPath('/users')).toBeNull();
    expect(moduleForPath('/coursesx')).toBeNull();
  });
});

describe('BillingEntitlementsGuard', () => {
  it('bloqueia módulo fora do plano', async () => {
    const { guard } = make({
      moduleBlockReason: jest
        .fn()
        .mockResolvedValue('O módulo PAYROLL não está incluído no seu plano.'),
    });
    await expect(
      guard.canActivate(ctx({ method: 'GET', url: '/payroll/runs', headers: {} })),
    ).rejects.toThrow(/PAYROLL/);
  });

  it('rotas de núcleo e de faturação nunca são bloqueadas', async () => {
    const { guard, limits } = make({ moduleBlockReason: jest.fn().mockResolvedValue('bloqueado') });
    await expect(
      guard.canActivate(ctx({ method: 'GET', url: '/users', headers: {} })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(ctx({ method: 'POST', url: '/billing/x', headers: {} })),
    ).resolves.toBe(true);
    expect(limits.moduleBlockReason).not.toHaveBeenCalled();
  });

  it('quota esgotada recusa data-URL e multipart, mas deixa passar JSON sem ficheiros', async () => {
    const { guard } = make({ storageExceeded: jest.fn().mockResolvedValue(true) });
    const dataUrl = post('/documents', { fileUrl: 'data:application/pdf;base64,AAAA' });
    await expect(guard.canActivate(ctx(dataUrl))).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(ctx(post('/documents', undefined, 'multipart/form-data; boundary=x'))),
    ).rejects.toThrow(/Quota de armazenamento/);
    await expect(guard.canActivate(ctx(post('/documents', { title: 'olá' })))).resolves.toBe(true);
  });

  it('quota esgotada não afecta leituras', async () => {
    const { guard } = make({ storageExceeded: jest.fn().mockResolvedValue(true) });
    await expect(
      guard.canActivate(ctx({ method: 'GET', url: '/documents', headers: {} })),
    ).resolves.toBe(true);
  });

  it('com quota livre nem inspecciona o corpo', async () => {
    const { guard, limits } = make();
    await guard.canActivate(ctx(post('/documents', { fileUrl: 'data:x' })));
    expect(limits.current).not.toHaveBeenCalled();
  });

  it('falha aberta quando o estado não pode ser lido', async () => {
    const { guard } = make({
      moduleBlockReason: jest.fn().mockRejectedValue(new Error('tabela em falta')),
    });
    await expect(
      guard.canActivate(ctx({ method: 'GET', url: '/payroll', headers: {} })),
    ).resolves.toBe(true);
  });
});

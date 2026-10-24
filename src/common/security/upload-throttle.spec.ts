import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  AppThrottlerGuard,
  UPLOAD_LIMIT_DEFAULT,
  UPLOAD_LIMIT_TEST,
  UPLOAD_THROTTLE_KEY,
  uploadThrottleLimit,
} from './upload-throttle';

describe('uploadThrottleLimit', () => {
  it('20/min por omissão, alto em teste, e configurável', () => {
    expect(uploadThrottleLimit({ NODE_ENV: 'production' })).toBe(UPLOAD_LIMIT_DEFAULT);
    expect(uploadThrottleLimit({ NODE_ENV: 'test' })).toBe(UPLOAD_LIMIT_TEST);
    expect(uploadThrottleLimit({ NODE_ENV: 'production', UPLOAD_THROTTLE_LIMIT: '5' })).toBe(5);
    expect(uploadThrottleLimit({ NODE_ENV: 'production', UPLOAD_THROTTLE_LIMIT: 'x' })).toBe(
      UPLOAD_LIMIT_DEFAULT,
    );
    expect(uploadThrottleLimit({ NODE_ENV: 'production', UPLOAD_THROTTLE_LIMIT: '-1' })).toBe(
      UPLOAD_LIMIT_DEFAULT,
    );
  });
});

describe('AppThrottlerGuard', () => {
  const superCanActivate = jest
    .spyOn(ThrottlerGuard.prototype, 'canActivate')
    .mockResolvedValue(true);
  const superTracker = jest
    .spyOn(ThrottlerGuard.prototype as never, 'getTracker')
    .mockResolvedValue('ip:1.2.3.4' as never);

  const makeGuard = (marked: boolean) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(marked),
    } as unknown as Reflector;
    const guard = new AppThrottlerGuard({} as never, {} as never, reflector);
    return { guard, reflector };
  };
  const ctx = (req: Record<string, unknown>) =>
    ({
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('rota marcada: o tracker é o utilizador, não o IP (colegas no mesmo IP não se bloqueiam)', async () => {
    const { guard, reflector } = makeGuard(true);
    const reqA = { user: { id: 7 } };
    await guard.canActivate(ctx(reqA));
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(UPLOAD_THROTTLE_KEY, ['h', 'c']);
    expect(
      await (guard as never as { getTracker(r: unknown): Promise<string> }).getTracker(reqA),
    ).toBe('user:7');
    expect(superCanActivate).toHaveBeenCalled();
  });

  it('rota marcada sem utilizador autenticado: cai para o IP', async () => {
    const { guard } = makeGuard(true);
    const req = {};
    await guard.canActivate(ctx(req));
    expect(
      await (guard as never as { getTracker(r: unknown): Promise<string> }).getTracker(req),
    ).toBe('ip:1.2.3.4');
  });

  it('rota normal: mantém o comportamento global (IP)', async () => {
    const { guard } = makeGuard(false);
    const req = { user: { id: 7 } };
    await guard.canActivate(ctx(req));
    expect(
      await (guard as never as { getTracker(r: unknown): Promise<string> }).getTracker(req),
    ).toBe('ip:1.2.3.4');
    expect(superTracker).toHaveBeenCalled();
  });
});

import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

function mockContext(user: any, _handlerRoles?: string[], _classRoles?: string[]) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RolesGuard,
        {
          provide: Reflector,
          useValue: { getAllAndOverride: jest.fn() },
        },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);
  });

  // getAllAndOverride devolve conforme a chave pedida.
  function meta(values: Record<string, unknown>) {
    reflector.getAllAndOverride.mockImplementation(((key: string) => values[key]) as never);
  }
  const user = { id: 1, role: { name: 'COLABORADOR', permissions: [{ name: 'settings.write' }] } };

  describe('deny-by-default', () => {
    afterEach(() => delete process.env.AUTHZ_DENY_BY_DEFAULT);

    it('handler sem nenhuma política → 403', () => {
      meta({});
      expect(() => guard.canActivate(mockContext(user))).toThrow(ForbiddenException);
    });

    it('@AnyAuthenticated com utilizador autenticado → permite', () => {
      meta({ authenticatedOnly: true });
      expect(guard.canActivate(mockContext(user))).toBe(true);
    });

    it('@AnyAuthenticated sem utilizador → 403 (nunca abre a anónimos)', () => {
      meta({ authenticatedOnly: true });
      expect(() => guard.canActivate(mockContext(undefined))).toThrow(ForbiddenException);
    });

    it('@Public → permite sem utilizador', () => {
      meta({ isPublic: true });
      expect(guard.canActivate(mockContext(undefined))).toBe(true);
    });

    it('@RequirePermission: permite com a permissão, nega sem ela', () => {
      meta({ requiredPermission: ['settings.write'] });
      expect(guard.canActivate(mockContext(user))).toBe(true);
      meta({ requiredPermission: ['audit.export'] });
      expect(() => guard.canActivate(mockContext(user))).toThrow(ForbiddenException);
    });

    it('AUTHZ_DENY_BY_DEFAULT=false repõe o comportamento antigo (rollback)', () => {
      process.env.AUTHZ_DENY_BY_DEFAULT = 'false';
      meta({});
      expect(guard.canActivate(mockContext(user))).toBe(true);
    });
  });

  it('deve permitir acesso se o utilizador tem o role correcto', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'RH']);
    const ctx = mockContext({ id: 1, role: { name: 'ADMIN' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('deve permitir acesso com role RH', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN', 'RH']);
    const ctx = mockContext({ id: 2, role: { name: 'RH' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('deve lançar ForbiddenException se role insuficiente', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const ctx = mockContext({ id: 3, role: { name: 'COLABORADOR' } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('deve lançar ForbiddenException se user sem role', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const ctx = mockContext({ id: 4, role: null });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('deve lançar ForbiddenException se user undefined', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    const ctx = mockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

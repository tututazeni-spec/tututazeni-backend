import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function mockContext(user: any, handlerRoles?: string[], classRoles?: string[]) {
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

  it('deve permitir acesso se não há roles requeridos', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = mockContext({ id: 1, role: { name: 'COLABORADOR' } });
    expect(guard.canActivate(ctx)).toBe(true);
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

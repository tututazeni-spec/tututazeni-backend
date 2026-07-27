import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { runWithRequestContext, getRequestContext } from '../logging/request-context';

function mockContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  // canActivate delega em AuthGuard('jwt') via super — nesse mixin do passport,
  // sem substituir o protótipo os testes teriam de configurar a strategy 'jwt'
  // real (passport) só para verificar o desvio de rota pública.
  let superCanActivateSpy: jest.SpyInstance;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(reflector as unknown as Reflector);
    const superProto = Object.getPrototypeOf(JwtAuthGuard.prototype);
    superCanActivateSpy = jest.spyOn(superProto, 'canActivate').mockReturnValue(true);
  });

  afterEach(() => {
    superCanActivateSpy.mockRestore();
  });

  describe('canActivate', () => {
    it('rota marcada @Public() ignora o guard sem invocar a strategy JWT', () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const ctx = mockContext();

      expect(guard.canActivate(ctx)).toBe(true);
      expect(superCanActivateSpy).not.toHaveBeenCalled();
    });

    it('rota não pública delega na strategy JWT (super.canActivate)', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const ctx = mockContext();

      const result = guard.canActivate(ctx);

      expect(superCanActivateSpy).toHaveBeenCalledWith(ctx);
      expect(result).toBe(true);
    });

    it('sem metadata isPublic (undefined) também delega na strategy JWT', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const ctx = mockContext();

      guard.canActivate(ctx);

      expect(superCanActivateSpy).toHaveBeenCalledWith(ctx);
    });
  });

  describe('handleRequest', () => {
    it('devolve o utilizador e regista o userId no contexto do pedido', () => {
      const user = { id: 42, email: 'x@innova.com' };

      const result = runWithRequestContext({}, () => {
        const out = guard.handleRequest(null, user);
        expect(getRequestContext().userId).toBe(42);
        return out;
      });

      expect(result).toBe(user);
    });

    it('lança o erro original da strategy, se existir', () => {
      const strategyErr = new Error('jwt expired');
      expect(() => guard.handleRequest(strategyErr, null)).toThrow(strategyErr);
    });

    it('lança UnauthorizedException se não há erro mas também não há utilizador', () => {
      expect(() => guard.handleRequest(null, false)).toThrow(UnauthorizedException);
      expect(() => guard.handleRequest(undefined, undefined)).toThrow('Token inválido ou expirado');
    });
  });
});

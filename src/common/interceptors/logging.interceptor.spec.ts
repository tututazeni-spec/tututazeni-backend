import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logger: { info: jest.Mock };

  beforeEach(() => {
    logger = { info: jest.fn() };
    interceptor = new LoggingInterceptor(logger as any);
  });

  it('deve ser definido', () => {
    expect(interceptor).toBeDefined();
  });

  it('loga method e userId via Pino info', done => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/courses', user: { id: 42 } }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of({ data: 'ok' }) };

    interceptor.intercept(context, next).subscribe(() => {
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', userId: 42 }),
        'http',
      );
      done();
    });
  });

  it('loga userId como null para pedidos anónimos', done => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', url: '/auth/login', user: undefined }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of(null) };

    interceptor.intercept(context, next).subscribe(() => {
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ userId: null }), 'http');
      done();
    });
  });

  it('NÃO inclui url no objecto logado (previne exposição de query params)', done => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/search?q=nome+apelido+secreto',
          user: { id: 1 },
        }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of([]) };

    interceptor.intercept(context, next).subscribe(() => {
      const loggedObj = (logger.info.mock.calls[0] as any[])[0];
      expect(loggedObj).not.toHaveProperty('url');
      done();
    });
  });

  it('inclui ms (tempo de resposta) no log', done => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', url: '/courses', user: { id: 1 } }),
      }),
    } as unknown as ExecutionContext;

    const next: CallHandler = { handle: () => of('ok') };

    interceptor.intercept(context, next).subscribe(() => {
      const loggedObj = (logger.info.mock.calls[0] as any[])[0];
      expect(typeof loggedObj.ms).toBe('number');
      done();
    });
  });
});

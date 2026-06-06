import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
  });

  it('deve ser definido', () => {
    expect(interceptor).toBeDefined();
  });

  it('deve interceptar pedido e deixar passar', done => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/test',
          user: { id: 1 },
        }),
      }),
    } as unknown as ExecutionContext;

    const mockHandler: CallHandler = {
      handle: () => of({ data: 'ok' }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: val => {
        expect(val).toEqual({ data: 'ok' });
        done();
      },
    });
  });

  it('deve lidar com pedido sem utilizador autenticado', done => {
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/auth/login',
          user: undefined,
        }),
      }),
    } as unknown as ExecutionContext;

    const mockHandler: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: val => {
        expect(val).toBeNull();
        done();
      },
    });
  });
});

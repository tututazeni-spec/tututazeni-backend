import * as Sentry from '@sentry/node';
import { captureServerError, flushSentry, initSentry } from './sentry';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  flush: jest.fn().mockResolvedValue(true),
  withScope: jest.fn((cb: (scope: { setTag: jest.Mock }) => void) => cb({ setTag: jest.fn() })),
}));

describe('sentry', () => {
  beforeEach(() => jest.clearAllMocks());

  it('é no-op sem SENTRY_DSN', async () => {
    expect(initSentry({} as NodeJS.ProcessEnv)).toBe(false);
    captureServerError(new Error('x'), { requestId: 'r1' });
    expect(Sentry.init).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    await expect(flushSentry()).resolves.toBe(true);
  });

  it('inicializa com DSN, sem recolha de dados do pedido, e remove dados do pedido no beforeSend', () => {
    expect(
      initSentry({
        SENTRY_DSN: 'https://k@o.ingest.sentry.io/1',
        BUILD_SHA: 'abc',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    const opts = (Sentry.init as jest.Mock).mock.calls[0][0];
    expect(opts.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    });
    expect(opts.release).toBe('innova@abc');
    const out = opts.beforeSend({
      request: { cookies: { a: 1 }, data: 'x', headers: { h: 1 }, url: '/u' },
    });
    expect(out.request).toEqual({ url: '/u' });
  });

  it('captura erros depois de activo', () => {
    initSentry({ SENTRY_DSN: 'https://k@o.ingest.sentry.io/1' } as NodeJS.ProcessEnv);
    const err = new Error('boom');
    captureServerError(err, { requestId: 'r1' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });
});

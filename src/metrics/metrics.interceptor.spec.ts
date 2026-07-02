import { of } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';

function run(routePath: string | undefined, statusCode: number) {
  const end = jest.fn();
  const histogram = { startTimer: jest.fn(() => end) } as any;
  const req = { method: 'GET', route: routePath ? { path: routePath } : undefined };
  const res = { statusCode };
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as any;
  const next = { handle: () => of('ok') };
  const interceptor = new MetricsInterceptor(histogram);
  return new Promise<{ end: jest.Mock }>(resolve => {
    interceptor.intercept(context, next as any).subscribe({ complete: () => resolve({ end }) });
  });
}

describe('MetricsInterceptor', () => {
  it('observa com method/route/status_code', async () => {
    const { end } = await run('/courses/:id', 200);
    expect(end).toHaveBeenCalledWith({ method: 'GET', route: '/courses/:id', status_code: 200 });
  });

  it('route=unknown quando não há req.route', async () => {
    const { end } = await run(undefined, 404);
    expect(end).toHaveBeenCalledWith({ method: 'GET', route: 'unknown', status_code: 404 });
  });
});

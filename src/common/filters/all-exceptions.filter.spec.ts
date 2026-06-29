import { NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeRes() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
}
function makeHost(req: any, res: any): any {
  return { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) };
}

describe('AllExceptionsFilter', () => {
  const logger = { error: jest.fn(), warn: jest.fn(), setContext: jest.fn() } as any;
  beforeEach(() => jest.clearAllMocks());

  it('erro genérico (500): loga com stack e responde JSON com requestId, sem stack', () => {
    const res = makeRes();
    new AllExceptionsFilter(logger).catch(
      new Error('boom'),
      makeHost({ method: 'GET', url: '/x', id: 'req-1' }, res),
    );
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error.mock.calls[0][0].err.stack).toBeDefined();
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual(
      expect.objectContaining({ statusCode: 500, requestId: 'req-1', path: '/x' }),
    );
    expect(body.stack).toBeUndefined();
  });

  it('HttpException (404): usa warn e preserva statusCode/mensagem', () => {
    const res = makeRes();
    new AllExceptionsFilter(logger).catch(
      new NotFoundException('não existe'),
      makeHost({ method: 'GET', url: '/y', id: 'req-2' }, res),
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0]).toEqual(
      expect.objectContaining({ statusCode: 404, message: 'não existe', requestId: 'req-2' }),
    );
  });
});

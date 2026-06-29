import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeRes() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn(() => r);
  r.getHeader = jest.fn(() => undefined);
  r.setHeader = jest.fn(() => r);
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

  it('ValidationPipe (400): preserva o array de mensagens no campo message', () => {
    const res = makeRes();
    // Shape produzido pelo ValidationPipe: getResponse() devolve um objeto com
    // message como array. exception.message colapsaria isto para "Bad Request Exception".
    const exc = new BadRequestException({
      statusCode: 400,
      message: ['email deve ser um email', 'password não pode estar vazio'],
      error: 'Bad Request',
    });
    new AllExceptionsFilter(logger).catch(
      exc,
      makeHost({ method: 'POST', url: '/auth/login', id: 'req-3' }, res),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].message).toEqual([
      'email deve ser um email',
      'password não pode estar vazio',
    ]);
  });

  it('4xx: não inclui stack trace no log (só mensagem)', () => {
    const res = makeRes();
    new AllExceptionsFilter(logger).catch(
      new NotFoundException('x'),
      makeHost({ method: 'GET', url: '/z', id: 'req-4' }, res),
    );
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.warn.mock.calls[0][0].err.stack).toBeUndefined();
    expect(logger.warn.mock.calls[0][0].err.message).toBe('x');
  });

  it('exceção não-Error (500): responde genérico e loga err.value', () => {
    const res = makeRes();
    new AllExceptionsFilter(logger).catch(
      'string exception',
      makeHost({ method: 'GET', url: '/w', id: 'req-5' }, res),
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].message).toBe('Internal server error');
    expect(logger.error).toHaveBeenCalled();
    expect(logger.error.mock.calls[0][0].err).toEqual({ value: 'string exception' });
  });

  it('sem req.id: usa o header x-request-id recebido e define-o na resposta', () => {
    const res = makeRes();
    new AllExceptionsFilter(logger).catch(
      new Error('boom'),
      makeHost({ method: 'GET', url: '/x', headers: { 'x-request-id': 'hdr-123' } }, res),
    );
    expect(res.json.mock.calls[0][0].requestId).toBe('hdr-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'hdr-123');
  });

  it('sem req.id e sem header: gera um requestId não vazio', () => {
    const res = makeRes();
    new AllExceptionsFilter(logger).catch(
      new Error('boom'),
      makeHost({ method: 'GET', url: '/x', headers: {} }, res),
    );
    const requestId = res.json.mock.calls[0][0].requestId;
    expect(typeof requestId).toBe('string');
    expect(requestId.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', requestId);
  });
});

import { createSwaggerAuthMiddleware } from './swagger-auth.middleware';

describe('createSwaggerAuthMiddleware', () => {
  const TOKEN = 'test-swagger-token';
  const middleware = createSwaggerAuthMiddleware(TOKEN);

  let req: { headers: Record<string, string> };
  let res: { status: jest.Mock; json: jest.Mock };
  let next: jest.Mock;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  it('chama next() quando o token é correcto', () => {
    req.headers['authorization'] = `Bearer ${TOKEN}`;
    middleware(req as any, res as any, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('devolve 401 quando o header Authorization está em falta', () => {
    middleware(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('devolve 401 quando o token é incorrecto', () => {
    req.headers['authorization'] = 'Bearer wrong-token';
    middleware(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('devolve 401 quando SWAGGER_TOKEN não está definido (undefined)', () => {
    const m = createSwaggerAuthMiddleware(undefined);
    req.headers['authorization'] = `Bearer ${TOKEN}`;
    m(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('devolve 401 quando SWAGGER_TOKEN está vazio', () => {
    const m = createSwaggerAuthMiddleware('');
    req.headers['authorization'] = 'Bearer ';
    m(req as any, res as any, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

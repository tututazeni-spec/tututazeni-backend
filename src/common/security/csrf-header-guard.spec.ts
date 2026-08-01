// src/common/security/csrf-header-guard.spec.ts
import {
  requiresCsrfHeaderCheck,
  csrfHeaderMiddleware,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
} from './csrf-header-guard';

describe('requiresCsrfHeaderCheck', () => {
  it('exige verificação em POST com cookie de sessão presente', () => {
    expect(requiresCsrfHeaderCheck('POST', { token: 'x' }, 'token')).toBe(true);
  });

  it('exige verificação em PUT/PATCH/DELETE com cookie presente', () => {
    expect(requiresCsrfHeaderCheck('PUT', { token: 'x' }, 'token')).toBe(true);
    expect(requiresCsrfHeaderCheck('PATCH', { token: 'x' }, 'token')).toBe(true);
    expect(requiresCsrfHeaderCheck('DELETE', { token: 'x' }, 'token')).toBe(true);
  });

  it('não exige verificação em GET (método seguro)', () => {
    expect(requiresCsrfHeaderCheck('GET', { token: 'x' }, 'token')).toBe(false);
  });

  it('não exige verificação sem o cookie de sessão (ex.: só Bearer)', () => {
    expect(requiresCsrfHeaderCheck('POST', {}, 'token')).toBe(false);
    expect(requiresCsrfHeaderCheck('POST', undefined, 'token')).toBe(false);
  });

  it('é case-insensitive quanto ao método HTTP', () => {
    expect(requiresCsrfHeaderCheck('post', { token: 'x' }, 'token')).toBe(true);
  });
});

describe('csrfHeaderMiddleware', () => {
  function run(
    method: string,
    cookies: Record<string, unknown> | undefined,
    headers: Record<string, string>,
  ) {
    const req = { method, cookies, headers } as never;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const next = jest.fn();
    csrfHeaderMiddleware('token')(req, { status } as never, next);
    return { status, json, next };
  }

  it('deixa passar um GET sem cabeçalho anti-CSRF', () => {
    const { next, status } = run('GET', { token: 'x' }, {});
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('deixa passar um POST sem cookie de sessão (ex.: login, só Bearer)', () => {
    const { next, status } = run('POST', undefined, {});
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('rejeita com 403 um POST com cookie de sessão e sem o cabeçalho', () => {
    const { next, status, json } = run('POST', { token: 'x' }, {});
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejeita com 403 quando o cabeçalho tem o valor errado', () => {
    const { next, status } = run('DELETE', { token: 'x' }, { [CSRF_HEADER]: 'algo-errado' });
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('deixa passar um POST com cookie de sessão e o cabeçalho correcto', () => {
    const { next, status } = run('POST', { token: 'x' }, { [CSRF_HEADER]: CSRF_HEADER_VALUE });
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
});

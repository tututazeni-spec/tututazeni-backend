// src/common/security/csrf-header-guard.spec.ts
import {
  requiresCsrfHeaderCheck,
  csrfHeaderMiddleware,
  CSRF_HEADER,
  CSRF_HEADER_VALUE,
} from './csrf-header-guard';
import { CSRF_COOKIE, CSRF_TOKEN_HEADER, deriveCsrfToken } from './csrf-token';

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

describe('csrfHeaderMiddleware — token double-submit assinado', () => {
  const secret = 'segredo-de-teste';
  const session = 'jwt-da-sessao';
  const good = deriveCsrfToken(session, secret);
  const legacy = { [CSRF_HEADER]: CSRF_HEADER_VALUE };

  function run(
    method: string,
    cookies: Record<string, unknown>,
    headers: Record<string, string>,
    opts: { strict?: boolean; path?: string } = {},
  ) {
    const req = { method, cookies, headers, path: opts.path ?? '/courses' } as never;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const cookie = jest.fn();
    const next = jest.fn();
    csrfHeaderMiddleware('token', { secret, strict: opts.strict })(
      req,
      { status, cookie } as never,
      next,
    );
    return { status, cookie, next };
  }

  it('aceita escrita com cookie csrf e cabeçalho X-CSRF-Token correctos', () => {
    const r = run(
      'POST',
      { token: session, [CSRF_COOKIE]: good },
      { ...legacy, [CSRF_TOKEN_HEADER]: good },
    );
    expect(r.next).toHaveBeenCalled();
  });

  it('rejeita escrita com cookie csrf mas sem X-CSRF-Token', () => {
    const r = run('POST', { token: session, [CSRF_COOKIE]: good }, legacy);
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.next).not.toHaveBeenCalled();
  });

  it('rejeita token forjado (cookie e cabeçalho iguais mas não assinados)', () => {
    const fake = 'a'.repeat(64);
    const r = run(
      'POST',
      { token: session, [CSRF_COOKIE]: fake },
      { ...legacy, [CSRF_TOKEN_HEADER]: fake },
    );
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('rollout: sessão antiga sem cookie csrf continua a passar só com X-Requested-With', () => {
    const r = run('POST', { token: session }, legacy);
    expect(r.next).toHaveBeenCalled();
  });

  it('strict: sessão sem cookie csrf deixa de passar', () => {
    const r = run('POST', { token: session }, legacy, { strict: true });
    expect(r.status).toHaveBeenCalledWith(403);
  });

  it('o login nunca é bloqueado por um cookie csrf desactualizado', () => {
    const r = run('POST', { token: session, [CSRF_COOKIE]: 'velho' }, legacy, {
      strict: true,
      path: '/auth/login',
    });
    expect(r.next).toHaveBeenCalled();
  });

  it('GET com sessão sem cookie csrf emite-o (auto-recuperação)', () => {
    const r = run('GET', { token: session }, {});
    expect(r.cookie).toHaveBeenCalledWith(
      CSRF_COOKIE,
      good,
      expect.objectContaining({ httpOnly: false }),
    );
    expect(r.next).toHaveBeenCalled();
  });

  it('GET com cookie csrf já correcto não o volta a emitir', () => {
    const r = run('GET', { token: session, [CSRF_COOKIE]: good }, {});
    expect(r.cookie).not.toHaveBeenCalled();
  });

  it('GET sem sessão não emite cookie', () => {
    const r = run('GET', {}, {});
    expect(r.cookie).not.toHaveBeenCalled();
  });
});

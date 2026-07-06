// Cliente HTTP mínimo da suite de regressão (regra 8).
// Fala com uma app REAL a correr em SMOKE_BASE_URL — não arranca módulos Nest.
// Usa o fetch nativo do Node 20: zero dependências novas.

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000';

export interface SmokeResponse {
  status: number;
  body: any;
}

async function parse(res: Response): Promise<SmokeResponse> {
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text; // respostas não-JSON (ex.: html de erro) ficam como texto
  }
  return { status: res.status, body };
}

export async function get(path: string, token?: string): Promise<SmokeResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return parse(res);
}

export async function post(path: string, body: unknown, token?: string): Promise<SmokeResponse> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return parse(res);
}

/** Faz login e devolve o accessToken. Lança com contexto se o login falhar. */
export async function login(email: string, password: string): Promise<string> {
  const res = await post('/auth/login', { email, password });
  // POST sem @HttpCode no Nest devolve 201
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`login de ${email} falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

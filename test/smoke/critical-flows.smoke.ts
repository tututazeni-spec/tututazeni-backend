// Regra 8 — fluxos críticos contra uma app REAL a correr (SMOKE_BASE_URL).
// Modo CI: seed feito pelo setup.ts. Modo pós-deploy: SMOKE_SEED=false,
// SMOKE_ALLOW_WRITES=false e credenciais/ids via env.
import * as fs from 'fs';
import * as path from 'path';
import { get, post, login } from './smoke-client';

const EMPLOYEE_EMAIL = process.env.SMOKE_EMPLOYEE_EMAIL ?? 'smoke.employee@innova-test.com';
const EMPLOYEE_PASSWORD = process.env.SMOKE_EMPLOYEE_PASSWORD ?? 'Test@1234';
const RH_EMAIL = process.env.SMOKE_RH_EMAIL ?? 'smoke.rh@innova-test.com';
const RH_PASSWORD = process.env.SMOKE_RH_PASSWORD ?? 'Test@1234';

/**
 * Id do curso de teste: env em pós-deploy, .seed-state.json em CI/local e, em
 * último caso, o primeiro curso devolvido por GET /courses (ex.: smoke contra
 * uma BD de desenvolvimento sem seed). `null` = não há nenhum curso visível.
 */
export async function resolveCourseId(token: string): Promise<number | null> {
  if (process.env.SMOKE_COURSE_ID) return Number(process.env.SMOKE_COURSE_ID);
  const stateFile = path.join(__dirname, '.seed-state.json');
  if (fs.existsSync(stateFile)) {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8')).courseId as number;
  }
  const list = await get('/courses', token);
  const rows = Array.isArray(list.body) ? list.body : (list.body?.data ?? []);
  return rows[0]?.id ?? null;
}

describe('Fluxos críticos — Auth + Health', () => {
  it('POST /auth/login com credenciais válidas → 201 + accessToken', async () => {
    const res = await post('/auth/login', { email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('POST /auth/login com password errada → 401', async () => {
    const res = await post('/auth/login', { email: EMPLOYEE_EMAIL, password: 'password-errada' });
    expect(res.status).toBe(401);
  });

  it('GET /courses sem token → 401', async () => {
    const res = await get('/courses');
    expect(res.status).toBe(401);
  });

  it('GET /health/live → 200', async () => {
    const res = await get('/health/live');
    expect(res.status).toBe(200);
  });

  it('GET /health/ready → 200 com estado detalhado (db, redis, filas, disco, memória, event loop)', async () => {
    const res = await get('/health/ready');
    expect(res.status).toBe(200);
    for (const key of ['postgres', 'redis', 'queues', 'disk', 'memory', 'eventLoop']) {
      expect(res.body.details).toHaveProperty(key);
    }
    expect(res.body.details.postgres.status).toBe('up');
  });

  it('rastreabilidade: x-request-id recebido volta no header e no corpo do erro, sem stack', async () => {
    const res = await fetch(`${process.env.SMOKE_BASE_URL ?? 'http://localhost:4000'}/courses`, {
      headers: { 'x-request-id': 'smoke-req-123' },
    });
    const body = (await res.json()) as { requestId?: string };
    expect(res.headers.get('x-request-id')).toBe('smoke-req-123');
    expect(body.requestId).toBe('smoke-req-123');
    expect(JSON.stringify(body)).not.toMatch(/at .*\.(ts|js):\d+/);
  });
});

describe('Fluxos críticos — Academia (cursos + inscrições)', () => {
  let token: string;
  let courseId: number | null;

  beforeAll(async () => {
    token = await login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
    courseId = await resolveCourseId(token);
  });

  it('GET /courses → 200', async () => {
    const res = await get('/courses', token);
    expect(res.status).toBe(200);
  });

  it('GET /courses/:id → 200 com o curso do seed', async () => {
    if (courseId === null) {
      console.warn('GET /courses/:id ignorado: não existe nenhum curso visível nesta BD');
      return;
    }
    const res = await get(`/courses/${courseId}`, token);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', courseId);
  });

  it('GET /courses/my/enrollments → 200', async () => {
    const res = await get('/courses/my/enrollments', token);
    expect(res.status).toBe(200);
  });

  // Escritas: desligadas em produção com SMOKE_ALLOW_WRITES=false
  const writes = process.env.SMOKE_ALLOW_WRITES !== 'false' ? describe : describe.skip;

  writes('escritas (SMOKE_ALLOW_WRITES)', () => {
    it('POST /courses/:id/enroll → 201; repetida → 409', async () => {
      if (courseId === null) return;
      const first = await post(`/courses/${courseId}/enroll`, {}, token);
      expect(first.status).toBe(201);

      const dup = await post(`/courses/${courseId}/enroll`, {}, token);
      expect(dup.status).toBe(409);
    });
  });
});

describe('Fluxos críticos — RH / RBAC', () => {
  let rhToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    rhToken = await login(RH_EMAIL, RH_PASSWORD);
    employeeToken = await login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
  });

  it('contas de teste têm perfis diferentes (RH privilegiado, colaborador não)', async () => {
    expect(EMPLOYEE_EMAIL).not.toBe(RH_EMAIL);
    const rh = await get('/auth/me', rhToken);
    const emp = await get('/auth/me', employeeToken);
    expect(emp.body.roleCode).toBe('COLABORADOR');
    expect(emp.body.roleCode).not.toBe(rh.body.roleCode);
  });

  it('GET /users como RH → 200', async () => {
    const res = await get('/users', rhToken);
    expect(res.status).toBe(200);
  });

  it('GET /users como COLABORADOR → 403 (RBAC)', async () => {
    const res = await get('/users', employeeToken);
    expect(res.status).toBe(403);
  });

  it('GET /development-plans/my → 200', async () => {
    const res = await get('/development-plans/my', employeeToken);
    expect(res.status).toBe(200);
  });

  it('GET /attendance/my → 200', async () => {
    const res = await get('/attendance/my', employeeToken);
    expect(res.status).toBe(200);
  });

  // Rotas administrativas: privilegiado → 200, colaborador → 403.
  it.each([
    '/employees',
    '/departments',
    '/payslips',
    '/enrollments',
    '/development-plans',
    '/monitoring/health',
    '/courses/admin/dashboard',
    '/dashboard/executive',
    '/dashboard/organization',
    '/dashboard/manager',
    '/dashboard-rh',
    '/audit',
  ])('RBAC %s → 403 para COLABORADOR', async route => {
    const res = await get(route, employeeToken);
    expect(res.status).toBe(403);
  });

  it.each(['/employees', '/departments', '/dashboard/executive', '/monitoring/health'])(
    'RBAC %s → 200 para RH',
    async route => {
      const res = await get(route, rhToken);
      expect(res.status).toBe(200);
    },
  );

  it('rotas próprias do colaborador continuam acessíveis (/dashboard/my, /auth/me)', async () => {
    expect((await get('/dashboard/my', employeeToken)).status).toBe(200);
    expect((await get('/auth/me', employeeToken)).status).toBe(200);
  });
});

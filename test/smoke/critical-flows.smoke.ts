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

/** Id do curso de teste: env em pós-deploy, .seed-state.json em CI/local. */
export function readSeededCourseId(): number {
  if (process.env.SMOKE_COURSE_ID) return Number(process.env.SMOKE_COURSE_ID);
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.seed-state.json'), 'utf8'));
  return state.courseId as number;
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

  it('GET /health/ready → 200', async () => {
    const res = await get('/health/ready');
    expect(res.status).toBe(200);
  });
});

describe('Fluxos críticos — Academia (cursos + inscrições)', () => {
  let token: string;
  let courseId: number;

  beforeAll(async () => {
    token = await login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
    courseId = readSeededCourseId();
  });

  it('GET /courses → 200', async () => {
    const res = await get('/courses', token);
    expect(res.status).toBe(200);
  });

  it('GET /courses/:id → 200 com o curso do seed', async () => {
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
      const first = await post(`/courses/${courseId}/enroll`, {}, token);
      expect(first.status).toBe(201);

      const dup = await post(`/courses/${courseId}/enroll`, {}, token);
      expect(dup.status).toBe(409);
    });
  });
});

# Suite de Regressão de Fluxos Críticos (regra 8) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suite Jest que fala HTTP real com a app a correr e valida os fluxos críticos (auth+health, Academia, RH/RBAC), correndo como gate no CI por PR e reutilizável pós-deploy via `SMOKE_BASE_URL`.

**Architecture:** `test/smoke/` com um cliente HTTP mínimo (fetch nativo do Node 20), um globalSetup que semeia dados condicionais (`SMOKE_SEED`), e um ficheiro de fluxos. O CI arranca `node dist/main.js` contra os services Postgres+Redis já existentes, espera pelo `/health/ready` e corre a suite.

**Tech Stack:** Jest 30 + ts-jest (config própria), fetch nativo (sem dependências novas), Prisma 7 (adapter pg) no seed.

## Global Constraints

- **Rotas reais confirmadas nos controllers** (diferem da spec, que previa esta confirmação):
  - `POST /auth/login` → **201** + body com `accessToken` (camelCase); password errada → 401.
  - `GET /courses`, `GET /courses/:id`, `GET /courses/my/enrollments`, `POST /courses/:id/enroll` (duplicada → 409).
  - `GET /users` → `@Roles(ADMIN, RH, GESTOR)` — RH 200, COLABORADOR 403.
  - `GET /development-plans/my`, `GET /attendance/my` — qualquer autenticado.
  - `GET /health/live`, `GET /health/ready` — públicos.
- JWT aceite via `Authorization: Bearer <token>` (confirmado no `jwt.strategy.ts`).
- Modelo User: `fullName` (nunca `name`), `active` (nunca `isActive`), role via `roleId`. Course: único por `internalCode`. Department: único por `code`. Enrollment: compound key `[courseId, userId]`, modelo `enrollment`.
- BD de teste: `postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test` (mesma dos testes de integração). Redis local em `127.0.0.1:6379` (defaults da app).
- Env da suite: `SMOKE_BASE_URL` (default `http://localhost:4000`), `SMOKE_SEED` (`'false'` desliga o seed), `SMOKE_ALLOW_WRITES` (`'false'` desliga escritas), `SMOKE_EMPLOYEE_EMAIL/PASSWORD`, `SMOKE_RH_EMAIL/PASSWORD`, `SMOKE_COURSE_ID`.
- Jest: correr via o **Bash tool** (pipe no PowerShell parte o output), `--runInBand --forceExit`.
- Formatar com `npx prettier --write <ficheiros>` antes de commitar (CI falha em prettier).
- Pre-push hook corre `npm run build` (minutos) — esperar pelo push.
- Commits `--no-verify`, terminam com: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- CI (`quality.yml`) já tem services Postgres e Redis e já faz build + `prisma migrate deploy` antes dos testes.

---

### Task 1: Infra da suite + grupo Auth+Health

**Files:**
- Create: `test/jest-smoke.json`
- Create: `test/smoke/smoke-client.ts`
- Create: `test/smoke/setup.ts`
- Create: `test/smoke/critical-flows.smoke.ts` (só grupo auth+health nesta task)
- Modify: `package.json` (script `test:regression`)
- Modify: `.gitignore` (ignorar `test/smoke/.seed-state.json`)

**Interfaces:**
- Produces (usadas nas Tasks 2 e 3):
  - `smoke-client.ts`: `get(path: string, token?: string): Promise<{status: number; body: any}>`, `post(path: string, body: unknown, token?: string): Promise<{status: number; body: any}>`, `login(email: string, password: string): Promise<string>` (devolve `accessToken`; lança se login falhar).
  - `setup.ts` grava `test/smoke/.seed-state.json` com `{ "courseId": number }`.
  - Credenciais seed: `smoke.employee@innova-test.com` / `smoke.rh@innova-test.com`, password `Test@1234`.
  - Helper exportado pela suite: `readSeededCourseId(): number` (lê env `SMOKE_COURSE_ID` ou o `.seed-state.json`).

- [ ] **Step 1: Criar `test/jest-smoke.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": "test/smoke/.*\\.smoke\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "testTimeout": 30000,
  "verbose": true,
  "forceExit": true,
  "globalSetup": "<rootDir>/test/smoke/setup.ts"
}
```

- [ ] **Step 2: Criar `test/smoke/smoke-client.ts`**

```ts
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
```

- [ ] **Step 3: Criar `test/smoke/setup.ts`**

Segue o padrão de `test/integration/setup.ts` (upserts idempotentes, campos `fullName`/`active`, curso único por `internalCode`). Diferenças: corre só se `SMOKE_SEED !== 'false'`, semeia utilizadores/curso próprios da suite, limpa a matrícula do par employee×curso (para o `POST /enroll` dar 201 determinístico) e grava o `courseId` em `.seed-state.json`.

```ts
// Setup da suite de regressão (regra 8).
// SMOKE_SEED=false (modo pós-deploy) → não toca na BD.
// Caso contrário: migrate deploy tolerante + seed idempotente + limpa a
// matrícula usada pelo teste de escrita + grava o courseId para a suite.
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const TEST_DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test';

const SEED_STATE_FILE = path.join(__dirname, '.seed-state.json');

export default async function globalSetup() {
  if (process.env.SMOKE_SEED === 'false') {
    console.log('\n🔧 Smoke setup: SMOKE_SEED=false — sem seed (modo pós-deploy)');
    return;
  }

  console.log('\n🔧 Smoke setup — a preparar BD de teste...');
  process.env.DATABASE_URL = TEST_DB_URL;

  try {
    execSync('npx prisma migrate deploy', { env: { ...process.env }, stdio: 'pipe' });
  } catch {
    console.log('ℹ️  migrate deploy skipped (já aplicado ou BD indisponível)');
  }

  const pool = new Pool({ connectionString: TEST_DB_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);
  const password = await bcrypt.hash('Test@1234', 10);

  const roleEntries = [
    { code: 'RH', name: 'RH' },
    { code: 'COLABORADOR', name: 'COLABORADOR' },
  ];
  const roleRecords: Record<string, any> = {};
  for (const r of roleEntries) {
    roleRecords[r.code] = await prisma.role.upsert({
      where: { code: r.code },
      update: {},
      create: { code: r.code, name: r.name },
    });
  }

  const department = await prisma.department.upsert({
    where: { code: 'DEPT-SMOKE' },
    update: {},
    create: { code: 'DEPT-SMOKE', name: 'Dept Smoke Teste' },
  });

  const users = [
    { email: 'smoke.employee@innova-test.com', fullName: 'Employee Smoke', roleCode: 'COLABORADOR' },
    { email: 'smoke.rh@innova-test.com', fullName: 'RH Smoke', roleCode: 'RH' },
  ];
  const userRecords: Record<string, any> = {};
  for (const u of users) {
    userRecords[u.roleCode] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        password,
        roleId: roleRecords[u.roleCode].id,
        departmentId: department.id,
        active: true,
      },
    });
  }

  const course = await prisma.course.upsert({
    where: { internalCode: 'SMOKE-001' },
    update: {},
    create: {
      title: 'Curso Smoke Teste',
      internalCode: 'SMOKE-001',
      description: 'Curso para a suite de regressão de fluxos críticos',
      status: 'PUBLISHED',
    },
  });

  // O teste de escrita faz POST /courses/:id/enroll e espera 201 na primeira e
  // 409 na repetida — remover matrículas antigas torna-o determinístico.
  await prisma.enrollment.deleteMany({
    where: { userId: userRecords['COLABORADOR'].id, courseId: course.id },
  });

  fs.writeFileSync(SEED_STATE_FILE, JSON.stringify({ courseId: course.id }));

  await prisma.$disconnect();
  await pool.end();
  console.log('✅ BD de teste preparada para a regressão\n');
}
```

- [ ] **Step 4: Criar `test/smoke/critical-flows.smoke.ts` com o grupo Auth+Health**

```ts
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
```

- [ ] **Step 5: Adicionar o script ao `package.json`**

Run (Bash tool):
```bash
node -e "
const pkg = require('./package.json');
pkg.scripts['test:regression'] = 'cross-env NODE_ENV=test jest --config test/jest-smoke.json --runInBand --forceExit';
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('ok');
"
```

- [ ] **Step 6: Ignorar o estado do seed no git**

Acrescentar ao `.gitignore` (no fim do ficheiro):
```
# Estado do seed da suite de regressão (regra 8)
test/smoke/.seed-state.json
```

- [ ] **Step 7: Correr SEM a app a correr — deve falhar com erro de ligação**

Run (Bash tool): `npx jest --config test/jest-smoke.json --runInBand --forceExit -t "health"`
Expected: FAIL — `fetch failed`/`ECONNREFUSED` (prova que a suite deteta app em baixo).

- [ ] **Step 8: Arrancar a app localmente (background)**

Pré-requisito: Postgres local com a BD `innova_test` e Redis a correr (Memurai ou `docker-compose up -d redis`).

Run (Bash tool, `run_in_background`):
```bash
npm run build && cross-env NODE_ENV=test \
  DATABASE_URL="postgresql://postgres:Placido*7@127.0.0.1:5432/innova_test" \
  JWT_SECRET=test-secret-key-innova-2024 \
  JWT_REFRESH_SECRET=test-refresh-secret-innova-2024 \
  PORT=4000 node dist/main.js
```
Esperar pelo ready antes do próximo passo:
```bash
for i in $(seq 1 60); do curl -sf http://localhost:4000/health/ready >/dev/null && echo pronta && break; sleep 2; done
```
Expected: `pronta`.

- [ ] **Step 9: Correr a suite — deve passar**

Run (Bash tool): `npm run test:regression`
Expected: PASS (5 testes do grupo Auth+Health).

- [ ] **Step 10: Formatar + Commit**

Run (Bash tool): `npx prettier --write test/smoke/smoke-client.ts test/smoke/setup.ts test/smoke/critical-flows.smoke.ts`
```bash
git add test/jest-smoke.json test/smoke/ package.json .gitignore
git commit --no-verify -m "test(observability): infra da suite de regressao + fluxos auth e health (regra 8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Grupo Academia — cursos + inscrições

**Files:**
- Modify: `test/smoke/critical-flows.smoke.ts` (acrescentar describe)

**Interfaces:**
- Consumes (Task 1): `get`, `post`, `login` de `./smoke-client`; `readSeededCourseId()`; credenciais `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` (constantes no topo do ficheiro).
- Produces: nada novo para tasks seguintes.

- [ ] **Step 1: Acrescentar o describe da Academia ao `critical-flows.smoke.ts`**

Acrescentar no fim do ficheiro:

```ts
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
```

- [ ] **Step 2: Correr a suite (app da Task 1 ainda a correr) — deve passar**

Run (Bash tool): `npm run test:regression`
Expected: PASS (5 auth+health + 4 academia). Se a app já não estiver a correr, rearrancar como no Task 1 Step 8.

- [ ] **Step 3: Confirmar que a repetição é idempotente**

Run (Bash tool): `npm run test:regression`
Expected: PASS de novo — o setup limpa a matrícula employee×curso antes de cada corrida.

- [ ] **Step 4: Formatar + Commit**

Run (Bash tool): `npx prettier --write test/smoke/critical-flows.smoke.ts`
```bash
git add test/smoke/critical-flows.smoke.ts
git commit --no-verify -m "test(observability): fluxos criticos da Academia na suite de regressao (regra 8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Grupo RH/RBAC

**Files:**
- Modify: `test/smoke/critical-flows.smoke.ts` (acrescentar describe)

**Interfaces:**
- Consumes (Task 1): `get`, `login`; constantes `EMPLOYEE_*` e `RH_*` do topo do ficheiro.
- Produces: nada novo.

- [ ] **Step 1: Acrescentar o describe RH/RBAC ao `critical-flows.smoke.ts`**

Acrescentar no fim do ficheiro:

```ts
describe('Fluxos críticos — RH / RBAC', () => {
  let rhToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    rhToken = await login(RH_EMAIL, RH_PASSWORD);
    employeeToken = await login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);
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
});
```

- [ ] **Step 2: Correr a suite completa — deve passar**

Run (Bash tool): `npm run test:regression`
Expected: PASS (13 testes no total: 5 + 4 + 4).

- [ ] **Step 3: Prova de que a suite apanha regressões de RBAC**

Verificação manual (critério de sucesso 3 da spec): correr com credenciais RH erradas e ver a suite falhar.
Run (Bash tool): `cross-env SMOKE_RH_PASSWORD=errada npm run test:regression`
Expected: FAIL no `beforeAll` do grupo RH (login falha com contexto claro). Depois correr `npm run test:regression` normal → PASS.

- [ ] **Step 4: Formatar + Commit**

Run (Bash tool): `npx prettier --write test/smoke/critical-flows.smoke.ts`
```bash
git add test/smoke/critical-flows.smoke.ts
git commit --no-verify -m "test(observability): fluxos criticos RH/RBAC na suite de regressao (regra 8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Gate no CI (`quality.yml`)

**Files:**
- Modify: `.github/workflows/quality.yml` (3 passos novos depois de "Testes de integração", antes de "Análise SonarCloud")

**Interfaces:**
- Consumes: script `test:regression` (Task 1); build e migrations já existentes no workflow; services Postgres/Redis já configurados.
- Produces: gate por PR — job `quality` falha se um fluxo crítico partir.

- [ ] **Step 1: Acrescentar os passos ao `quality.yml`**

Inserir entre o passo "Testes de integração" e "Análise SonarCloud":

```yaml
      - name: Arrancar app para regressão
        run: node dist/main.js &
        env:
          NODE_ENV: test
          DATABASE_URL: 'postgresql://postgres:Placido*7@localhost:5432/innova_test'
          JWT_SECRET: 'test-secret-key-innova-2024'
          JWT_REFRESH_SECRET: 'test-refresh-secret-innova-2024'
          PORT: '4000'

      - name: Esperar pela app (health/ready)
        run: |
          for i in $(seq 1 60); do
            if curl -sf http://localhost:4000/health/ready > /dev/null; then
              echo "✅ app pronta"; exit 0
            fi
            sleep 1
          done
          echo "❌ app não ficou pronta em 60s"; exit 1

      - name: Regressão de fluxos críticos
        run: npm run test:regression
        env:
          DATABASE_URL: 'postgresql://postgres:Placido*7@localhost:5432/innova_test'
```

Notas:
- O `&` no primeiro passo lança a app em background dentro do runner; o passo termina logo e a app continua viva no job.
- O `DATABASE_URL` no passo de regressão é para o **seed** do globalSetup (a app tem o seu no passo de arranque).
- Os segredos JWT são os mesmos dos testes de integração — valores de teste, já visíveis no repo.

- [ ] **Step 2: Validar o YAML localmente**

Run (Bash tool): `node -e "const yaml=require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/quality.yml','utf8')); console.log('YAML ok')"`
Expected: `YAML ok` (js-yaml já é dependência transitiva; se faltar, `npx js-yaml .github/workflows/quality.yml > /dev/null && echo ok`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/quality.yml
git commit --no-verify -m "ci(observability): gate de regressao de fluxos criticos no quality (regra 8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Verificação final + push + PR

**Files:** nenhum (validação).

- [ ] **Step 1: Suite completa local uma última vez**

Com a app a correr (Task 1 Step 8 se necessário):
Run (Bash tool): `npm run test:regression`
Expected: 13 testes PASS.

- [ ] **Step 2: Typecheck**

Run (Bash tool): `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros. (Os ficheiros de `test/` não entram no build de produção, mas o typecheck global tem de continuar limpo.)

- [ ] **Step 3: Parar a app local de teste**

Matar o processo em background do Task 1 Step 8 (via o id da task em background do harness).

- [ ] **Step 4: Push (espera pelo pre-push `npm run build`)**

```bash
git push -u origin feat/observability-regression-suite
```

- [ ] **Step 5: Abrir PR para `main`**

Corpo num ficheiro temporário e `gh pr create --base main --body-file <ficheiro>` (evita quoting no PowerShell). Título:
`test(observability): suite de regressão de fluxos críticos (regra 8)`
Corpo: resumo da suite (3 grupos, 13 testes), os dois modos (CI gate / pós-deploy via `SMOKE_BASE_URL`+`SMOKE_SEED=false`+`SMOKE_ALLOW_WRITES=false`), o passo novo no CI, e nota de que o wiring pós-deploy real chega com a regra 10. Remover o ficheiro temporário. Terminar o corpo com o footer standard do Claude Code.

- [ ] **Step 6: Confirmar CI verde**

Run (Bash tool): `gh pr checks <n>` até `quality` passar (o job agora inclui o gate de regressão — é a prova em CI). Reportar o link do PR.

---

## Notas de execução

- **A suite NUNCA arranca a app** — testes falham com `fetch failed` se a app não estiver a correr. Localmente: Task 1 Step 8. No CI: passos da Task 4.
- **Ordem dos describes no mesmo ficheiro:** Jest corre-os por ordem; não há dependências entre grupos (cada um faz o seu login no `beforeAll`).
- **`describe.skip` dinâmico** (`SMOKE_ALLOW_WRITES`): padrão `const writes = cond ? describe : describe.skip` — avaliado no load do ficheiro, antes do runner.
- **`.seed-state.json`** é escrito pelo globalSetup e lido pelos testes no mesmo processo de corrida; está no `.gitignore`.
- **Pós-deploy (regra 10):** `SMOKE_BASE_URL=https://<host> SMOKE_SEED=false SMOKE_ALLOW_WRITES=false SMOKE_EMPLOYEE_EMAIL=... SMOKE_EMPLOYEE_PASSWORD=... SMOKE_RH_EMAIL=... SMOKE_RH_PASSWORD=... SMOKE_COURSE_ID=... npm run test:regression` — sem alterações de código.

## Self-review (cobertura da spec)

- Suite HTTP via `SMOKE_BASE_URL`, fetch nativo, sem deps novas → Task 1. ✓
- Grupo auth+health (login 201/401, sem token 401, live/ready) → Task 1. ✓
- Grupo Academia (courses, courses/:id, my/enrollments, enroll 201/409) → Task 2. ✓ (rotas corrigidas para as reais)
- Grupo RH/RBAC (users 200/403, development-plans/my, attendance/my) → Task 3. ✓ (rota PDI real: `/development-plans/my`)
- Grupo `/metrics` → **excluído por decisão do utilizador**. ✓
- Seed condicional `SMOKE_SEED`, `.seed-state.json`, limpeza da matrícula → Task 1 Step 3. ✓
- Escritas condicionais `SMOKE_ALLOW_WRITES` → Task 2. ✓
- Script `test:regression` → Task 1 Step 5. ✓
- CI: arranque da app + wait ready + suite → Task 4. ✓
- Critério 3 da spec (suite apanha regressão) → Task 1 Step 7 (app em baixo) + Task 3 Step 3 (credencial errada). ✓
- Critério 4 (correr contra URL remoto só com env) → design do cliente + notas de execução. ✓

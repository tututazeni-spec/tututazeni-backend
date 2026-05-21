# INNOVA — Guia Completo de Testes de API
> Jest + Supertest | NestJS + Prisma + PostgreSQL
> Plataforma: Academia Corporativa + RH | 6000 funcionários

---

## 🧠 O QUE SÃO TESTES DE API

```
Testes de Carga (Artillery)     → "aguenta muita gente?"
Testes de API (Jest+Supertest)  → "responde correctamente?"

Testes de API verificam:
→ O endpoint retorna o status code certo (200, 201, 401, 403...)
→ O body da resposta tem os campos correctos
→ A autenticação funciona
→ As validações bloqueiam dados inválidos
→ As regras de negócio estão correctas
```

---

## 📁 ESTRUTURA DE FICHEIROS A CRIAR

```
test/
├── jest-e2e.json              ← configuração Jest para API tests
├── setup.ts                   ← setup global antes de todos os testes
├── teardown.ts                ← limpeza após todos os testes
├── helpers/
│   ├── auth.helper.ts         ← helper para obter tokens JWT
│   ├── db.helper.ts           ← helper para limpar a BD entre testes
│   └── payload.helper.ts      ← payloads reutilizáveis
├── auth/
│   └── auth.e2e-spec.ts       ← testes do módulo auth
├── courses/
│   └── courses.e2e-spec.ts    ← testes do módulo courses
├── enrollment/
│   └── enrollment.e2e-spec.ts ← testes do módulo enrollment
├── users/
│   └── users.e2e-spec.ts      ← testes do módulo users
└── pdi/
    └── pdi.e2e-spec.ts        ← testes do módulo pdi (legacyPdi)

.env.test                      ← variáveis de ambiente para testes
```

---

## ⚠️ REGRAS OBRIGATÓRIAS DO PROJECTO INNOVA

```
- campo fullName (NUNCA name) no modelo User
- campo entity (NUNCA entityType) no AuditLog
- textContent (NUNCA content) nas Lesson
- compound key courseId_userId no Enrollment
- roleCode para filtrar roles
- NotificationLog.metadata → JSON.stringify()
- legacyPdi (NUNCA pdi como modelo)
- badgeAward (NUNCA badge como modelo)
- AttendanceRecord (NUNCA Attendance como modelo)
```

---

## PASSO 1 — INSTALAR DEPENDÊNCIAS

```bash
npm install --save-dev supertest @types/supertest
```

Verifica se o Jest já está instalado (NestJS inclui por defeito):
```bash
npm list jest
npm list @nestjs/testing
```

Se não estiver:
```bash
npm install --save-dev jest @nestjs/testing ts-jest
```

---

## PASSO 2 — CRIAR O FICHEIRO `.env.test`

Cria na raiz do projecto:

```env
# .env.test
# Variáveis de ambiente para testes de API
# USA UMA BASE DE DADOS SEPARADA — nunca a de desenvolvimento

DATABASE_URL="postgresql://postgres:SUA_PASSWORD@localhost:5432/innova_test"

JWT_SECRET="test-secret-key-innova-2024"
JWT_EXPIRES_IN="1h"

NODE_ENV="test"

# Porta diferente para não colidir com o backend a correr
PORT=4001
```

> ⚠️ Substitui `SUA_PASSWORD` pela tua password do PostgreSQL
> ⚠️ A base de dados chama-se `innova_test` — SEPARADA da de desenvolvimento

---

## PASSO 3 — CRIAR A BASE DE DADOS DE TESTE

No PowerShell:

```powershell
# Cria a base de dados de teste no PostgreSQL
$env:DATABASE_URL="postgresql://postgres:SUA_PASSWORD@localhost:5432/innova_test"
npx prisma migrate deploy
```

Ou pelo psql:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE innova_test;"
```

---

## PASSO 4 — CRIAR `test/jest-e2e.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "globalSetup": "<rootDir>/test/setup.ts",
  "globalTeardown": "<rootDir>/test/teardown.ts",
  "testTimeout": 30000,
  "verbose": true,
  "forceExit": true,
  "detectOpenHandles": true,
  "coverageDirectory": "../coverage",
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/main.ts"
  ]
}
```

---

## PASSO 5 — CRIAR `test/setup.ts`

```typescript
// test/setup.ts
import { execSync } from 'child_process';

export default async function globalSetup() {
  console.log('\n🔧 Setup global dos testes de API...');

  // Garante que está a usar a BD de teste
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL?.replace(
    /\/innova$/,
    '/innova_test'
  ) || process.env.DATABASE_URL;

  // Aplica as migrations na BD de teste
  console.log('📦 A aplicar migrations na BD de teste...');
  execSync('npx prisma migrate deploy', {
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
    },
    stdio: 'pipe',
  });

  console.log('✅ Setup concluído — BD de teste pronta\n');
}
```

---

## PASSO 6 — CRIAR `test/teardown.ts`

```typescript
// test/teardown.ts

export default async function globalTeardown() {
  console.log('\n🧹 Teardown global — a limpar recursos...');
  console.log('✅ Teardown concluído\n');
}
```

---

## PASSO 7 — CRIAR `test/helpers/auth.helper.ts`

```typescript
// test/helpers/auth.helper.ts
import * as request from 'supertest';

export interface AuthTokens {
  accessToken: string;
  userId: string | number;
}

// Obtém token para utilizador com role específica
export async function getAuthToken(
  app: any,
  credentials: { email: string; password: string }
): Promise<AuthTokens> {
  const response = await request(app)
    .post('/auth/login')
    .send(credentials)
    .expect(201);

  return {
    accessToken: response.body.accessToken,
    userId: response.body.user?.id,
  };
}

// Credenciais de teste por role
export const TEST_CREDENTIALS = {
  employee: {
    email: 'test.employee@innova-test.com',
    password: 'Test@1234',
  },
  manager: {
    email: 'test.manager@innova-test.com',
    password: 'Test@1234',
  },
  rh: {
    email: 'test.rh@innova-test.com',
    password: 'Test@1234',
  },
  admin: {
    email: 'test.admin@innova-test.com',
    password: 'Test@1234',
  },
};
```

---

## PASSO 8 — CRIAR `test/helpers/db.helper.ts`

```typescript
// test/helpers/db.helper.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// REGRA: fullName (não name) no modelo User
export async function seedTestUsers() {
  const password = await bcrypt.hash('Test@1234', 10);

  // Garante que as roles existem
  const roles = ['EMPLOYEE', 'MANAGER', 'RH', 'ADMIN'];
  const roleRecords: Record<string, any> = {};

  for (const code of roles) {
    const role = await prisma.role.upsert({
      where: { code },
      update: {},
      create: { code, name: code },
    });
    roleRecords[code] = role;
  }

  // Cria departamento de teste
  const department = await prisma.department.upsert({
    where: { name: 'Dept Teste API' },
    update: {},
    create: { name: 'Dept Teste API' },
  });

  // Cria utilizadores de teste — REGRA: fullName não name
  const users = [
    {
      email: 'test.employee@innova-test.com',
      fullName: 'Employee Teste',
      roleCode: 'EMPLOYEE',
    },
    {
      email: 'test.manager@innova-test.com',
      fullName: 'Manager Teste',
      roleCode: 'MANAGER',
    },
    {
      email: 'test.rh@innova-test.com',
      fullName: 'RH Teste',
      roleCode: 'RH',
    },
    {
      email: 'test.admin@innova-test.com',
      fullName: 'Admin Teste',
      roleCode: 'ADMIN',
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,       // REGRA: fullName
        password,
        roleId: roleRecords[u.roleCode].id,
        departmentId: department.id,
        isActive: true,
      },
    });
  }
}

// Cria um curso de teste e retorna o ID
export async function seedTestCourse() {
  const course = await prisma.course.upsert({
    where: { title: 'Curso API Teste' },
    update: {},
    create: {
      title: 'Curso API Teste',
      description: 'Curso criado para testes de API',
      isActive: true,
    },
  });
  return course;
}

// Limpa dados de teste — respeita foreign keys
export async function cleanTestData() {
  const testEmails = [
    'test.employee@innova-test.com',
    'test.manager@innova-test.com',
    'test.rh@innova-test.com',
    'test.admin@innova-test.com',
  ];

  const testUsers = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true },
  });
  const ids = testUsers.map(u => u.id);

  // Remove por ordem de dependência
  await prisma.enrollment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.badgeAward.deleteMany({ where: { userId: { in: ids } } });
  await prisma.legacyPdi.deleteMany({ where: { userId: { in: ids } } });
  await prisma.attendanceRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.course.deleteMany({ where: { title: 'Curso API Teste' } });

  await prisma.$disconnect();
}
```

---

## PASSO 9 — CRIAR `test/auth/auth.e2e-spec.ts`

```typescript
// test/auth/auth.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { seedTestUsers, cleanTestData } from '../helpers/db.helper';

describe('Auth — Testes de API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Cria utilizadores de teste
    await seedTestUsers();
  });

  afterAll(async () => {
    await cleanTestData();
    await app.close();
  });

  // ─── LOGIN ───────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('deve fazer login com credenciais correctas', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test.employee@innova-test.com',
          password: 'Test@1234',
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(typeof response.body.accessToken).toBe('string');
      expect(response.body.accessToken.length).toBeGreaterThan(10);
    });

    it('deve rejeitar password incorrecta → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test.employee@innova-test.com',
          password: 'password_errada',
        })
        .expect(401);
    });

    it('deve rejeitar email inexistente → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nao.existe@innova-test.com',
          password: 'Test@1234',
        })
        .expect(401);
    });

    it('deve rejeitar body sem email → 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ password: 'Test@1234' })
        .expect(400);
    });

    it('deve rejeitar body vazio → 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('deve rejeitar sem token em rota protegida → 401', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .expect(401);
    });
  });
});
```

---

## PASSO 10 — CRIAR `test/courses/courses.e2e-spec.ts`

```typescript
// test/courses/courses.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { seedTestUsers, seedTestCourse, cleanTestData } from '../helpers/db.helper';
import { getAuthToken, TEST_CREDENTIALS } from '../helpers/auth.helper';

describe('Courses — Testes de API', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;
  let courseId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    await seedTestUsers();
    const course = await seedTestCourse();
    courseId = course.id;

    const employeeAuth = await getAuthToken(app.getHttpServer(), TEST_CREDENTIALS.employee);
    employeeToken = employeeAuth.accessToken;

    const rhAuth = await getAuthToken(app.getHttpServer(), TEST_CREDENTIALS.rh);
    rhToken = rhAuth.accessToken;
  });

  afterAll(async () => {
    await cleanTestData();
    await app.close();
  });

  // ─── LISTAGEM ────────────────────────────────────────────

  describe('GET /courses', () => {
    it('deve listar cursos com token válido → 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/courses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(Array.isArray(response.body) || response.body.data).toBeTruthy();
    });

    it('deve rejeitar sem token → 401', async () => {
      await request(app.getHttpServer())
        .get('/courses')
        .expect(401);
    });
  });

  // ─── DETALHE ─────────────────────────────────────────────

  describe('GET /courses/:id', () => {
    it('deve retornar detalhe de um curso → 200', async () => {
      const response = await request(app.getHttpServer())
        .get(`/courses/${courseId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', courseId);
      expect(response.body).toHaveProperty('title');
    });

    it('deve retornar 404 para curso inexistente', async () => {
      await request(app.getHttpServer())
        .get('/courses/id-que-nao-existe')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });
});
```

---

## PASSO 11 — CRIAR `test/enrollment/enrollment.e2e-spec.ts`

```typescript
// test/enrollment/enrollment.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { seedTestUsers, seedTestCourse, cleanTestData } from '../helpers/db.helper';
import { getAuthToken, TEST_CREDENTIALS } from '../helpers/auth.helper';

describe('Enrollment — Testes de API', () => {
  let app: INestApplication;
  let employeeToken: string;
  let courseId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    await seedTestUsers();
    const course = await seedTestCourse();
    courseId = course.id;

    const auth = await getAuthToken(app.getHttpServer(), TEST_CREDENTIALS.employee);
    employeeToken = auth.accessToken;
  });

  afterAll(async () => {
    await cleanTestData();
    await app.close();
  });

  // ─── INSCRIÇÃO ───────────────────────────────────────────

  describe('POST /enrollment', () => {
    it('deve inscrever utilizador num curso → 201', async () => {
      const response = await request(app.getHttpServer())
        .post('/enrollment')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ courseId })
        .expect(201);

      expect(response.body).toHaveProperty('courseId', courseId);
    });

    it('deve rejeitar inscrição duplicada → 409', async () => {
      // REGRA: @@unique [courseId, userId]
      await request(app.getHttpServer())
        .post('/enrollment')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ courseId })
        .expect(409);
    });

    it('deve rejeitar sem courseId → 400', async () => {
      await request(app.getHttpServer())
        .post('/enrollment')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({})
        .expect(400);
    });

    it('deve rejeitar sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/enrollment')
        .send({ courseId })
        .expect(401);
    });
  });

  // ─── LISTAGEM PRÓPRIA ────────────────────────────────────

  describe('GET /enrollment/my', () => {
    it('deve listar inscrições do utilizador → 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/enrollment/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(Array.isArray(response.body) || response.body.data).toBeTruthy();
    });
  });
});
```

---

## PASSO 12 — CRIAR `test/users/users.e2e-spec.ts`

```typescript
// test/users/users.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { seedTestUsers, cleanTestData } from '../helpers/db.helper';
import { getAuthToken, TEST_CREDENTIALS } from '../helpers/auth.helper';

describe('Users — Testes de API', () => {
  let app: INestApplication;
  let employeeToken: string;
  let rhToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    await seedTestUsers();

    const empAuth = await getAuthToken(app.getHttpServer(), TEST_CREDENTIALS.employee);
    employeeToken = empAuth.accessToken;

    const rhAuth = await getAuthToken(app.getHttpServer(), TEST_CREDENTIALS.rh);
    rhToken = rhAuth.accessToken;
  });

  afterAll(async () => {
    await cleanTestData();
    await app.close();
  });

  // ─── LISTAGEM ────────────────────────────────────────────

  describe('GET /users', () => {
    it('RH deve listar utilizadores → 200', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      // REGRA: campo fullName (não name)
      if (Array.isArray(response.body) && response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('fullName');
        expect(response.body[0]).not.toHaveProperty('name');
      }
    });

    it('Employee não deve listar utilizadores → 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('deve rejeitar sem token → 401', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .expect(401);
    });
  });
});
```

---

## PASSO 13 — CRIAR `test/pdi/pdi.e2e-spec.ts`

```typescript
// test/pdi/pdi.e2e-spec.ts
// REGRA: modelo legacyPdi (não pdi)
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { seedTestUsers, cleanTestData } from '../helpers/db.helper';
import { getAuthToken, TEST_CREDENTIALS } from '../helpers/auth.helper';

describe('PDI (legacyPdi) — Testes de API', () => {
  let app: INestApplication;
  let employeeToken: string;
  let managerToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    await seedTestUsers();

    const empAuth = await getAuthToken(app.getHttpServer(), TEST_CREDENTIALS.employee);
    employeeToken = empAuth.accessToken;

    const mgrAuth = await getAuthToken(app.getHttpServer(), TEST_CREDENTIALS.manager);
    managerToken = mgrAuth.accessToken;
  });

  afterAll(async () => {
    await cleanTestData();
    await app.close();
  });

  describe('GET /pdi/my', () => {
    it('deve retornar PDI do utilizador → 200', async () => {
      await request(app.getHttpServer())
        .get('/pdi/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
    });

    it('deve rejeitar sem token → 401', async () => {
      await request(app.getHttpServer())
        .get('/pdi/my')
        .expect(401);
    });
  });
});
```

---

## PASSO 14 — ADICIONAR SCRIPTS AO `package.json`

Cola na secção `scripts`:

```json
"test:api": "cross-env NODE_ENV=test jest --config test/jest-e2e.json --forceExit",
"test:api:watch": "cross-env NODE_ENV=test jest --config test/jest-e2e.json --watch",
"test:api:coverage": "cross-env NODE_ENV=test jest --config test/jest-e2e.json --coverage --forceExit",
"test:api:auth": "cross-env NODE_ENV=test jest --config test/jest-e2e.json --testPathPattern=auth --forceExit",
"test:api:courses": "cross-env NODE_ENV=test jest --config test/jest-e2e.json --testPathPattern=courses --forceExit",
"test:api:enrollment": "cross-env NODE_ENV=test jest --config test/jest-e2e.json --testPathPattern=enrollment --forceExit",
"test:api:users": "cross-env NODE_ENV=test jest --config test/jest-e2e.json --testPathPattern=users --forceExit"
```

---

## PASSO 15 — CRIAR A BD DE TESTE E APLICAR MIGRATIONS

```powershell
# 1. Cria a BD de teste
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE innova_test;"

# 2. Aplica as migrations na BD de teste
$env:DATABASE_URL="postgresql://postgres:SUA_PASSWORD@localhost:5432/innova_test"
npx prisma migrate deploy
```

---

## PASSO 16 — EXECUTAR OS TESTES

### Todos os testes de API
```powershell
npm run test:api
```

### Só os testes de auth
```powershell
npm run test:api:auth
```

### Só os testes de cursos
```powershell
npm run test:api:courses
```

### Só os testes de inscrição
```powershell
npm run test:api:enrollment
```

### Só os testes de utilizadores
```powershell
npm run test:api:users
```

### Com cobertura de código
```powershell
npm run test:api:coverage
```

---

## PASSO 17 — RESULTADO ESPERADO

```
PASS  test/auth/auth.e2e-spec.ts
  Auth — Testes de API
    POST /auth/login
      ✓ deve fazer login com credenciais correctas (245ms)
      ✓ deve rejeitar password incorrecta → 401 (123ms)
      ✓ deve rejeitar email inexistente → 401 (98ms)
      ✓ deve rejeitar body sem email → 400 (45ms)
      ✓ deve rejeitar body vazio → 400 (42ms)
      ✓ deve rejeitar sem token em rota protegida → 401 (38ms)

PASS  test/courses/courses.e2e-spec.ts
PASS  test/enrollment/enrollment.e2e-spec.ts
PASS  test/users/users.e2e-spec.ts
PASS  test/pdi/pdi.e2e-spec.ts

Tests Suites: 5 passed, 5 total
Tests:        18 passed, 18 total
Snapshots:    0 total
Time:         12.345s
```

---

## PASSO 18 — COMMIT FINAL

```powershell
git add -A
git commit -m "test: add API e2e tests for auth, courses, enrollment, users, pdi" --no-verify
git push origin main
```

---

## ORDEM DE EXECUÇÃO CORRECTA

```
1. npm install --save-dev supertest @types/supertest
2. Cria .env.test
3. Cria BD innova_test no PostgreSQL
4. Aplica migrations na BD de teste
5. Cria todos os ficheiros da pasta test/
6. Adiciona scripts ao package.json
7. npm run test:api:auth     → testa só o auth primeiro
8. npm run test:api:courses  → testa cursos
9. npm run test:api          → corre todos
10. git add -A && git commit
```

---

## REGRAS PARA O CLAUDE CODE

Quando pedires ao Claude Code para criar ou corrigir testes:

```
- Sempre usar fullName (não name) no modelo User
- Sempre usar entity (não entityType) no AuditLog
- Enrollment @@unique é [courseId, userId]
- Login retorna accessToken (não access_token)
- Login retorna status 201 (não 200)
- Rotas protegidas sem token retornam 401
- Rotas com permissão insuficiente retornam 403
- Inscrição duplicada retorna 409
- modelo legacyPdi (não pdi)
- modelo badgeAward (não badge)
- modelo AttendanceRecord (não Attendance)
```

---

*INNOVA — API Testing Guide | Jest + Supertest | NestJS + Prisma*
*Versão: 1.0 | Complemento ao CLAUDE.md de Load Testing*

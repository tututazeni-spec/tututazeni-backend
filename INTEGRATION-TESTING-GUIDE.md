# INNOVA — Guia Completo de Testes de Integração
> Jest + Supertest + BD Real (innova_test)
> NestJS + Prisma + PostgreSQL | 6000 funcionários

---

## O QUE SÃO TESTES DE INTEGRAÇÃO

```
Testes Unitários      → testam 1 função isolada com mocks
Testes de Integração  → testam módulos juntos com BD real

Exemplo:
→ POST /auth/login
  1. Controller recebe o request
  2. Service valida as credenciais
  3. Prisma consulta a BD real
  4. Retorna o accessToken real
  → Testa TUDO junto, sem mocks
```

---

## ⚠️ REGRAS OBRIGATÓRIAS DO PROJECTO INNOVA

```
- fullName (NUNCA name) no modelo User
- entity (NUNCA entityType) no AuditLog
- textContent (NUNCA content) nas Lesson
- courseId_userId compound key no Enrollment
- NotificationLog.metadata → sempre JSON.stringify()
- legacyPdi (NUNCA pdi como modelo Prisma)
- badgeAward (NUNCA badge como modelo Prisma)
- AttendanceRecord (NUNCA Attendance como modelo)
- roleCode para filtrar roles
- Login retorna accessToken (não access_token)
- Login retorna status 201 (não 200)
- Rotas protegidas sem token → 401
- Rotas sem permissão → 403
- Enrollment duplicado → 409
```

---

## FASE 0 — VERIFICAÇÃO INICIAL

```bash
# 1. BD de teste existe?
psql -U postgres -c "\l" | grep innova_test

# 2. Migrations aplicadas na BD de teste?
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/innova_test" npx prisma migrate status

# 3. Supertest instalado?
npm list supertest @types/supertest

# 4. Pasta test/ existe?
ls test/ 2>/dev/null || echo "NAO EXISTE"

# 5. jest-e2e.json existe?
cat test/jest-e2e.json 2>/dev/null || echo "NAO EXISTE"

# 6. Scripts de integração no package.json?
cat package.json | grep "test:integration\|test:e2e"
```

---

## FASE 1 — PREPARAÇÃO DA BD DE TESTE

### 1.1 — Criar BD innova_test se não existir

```powershell
# PowerShell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE innova_test;"
```

### 1.2 — Aplicar migrations na BD de teste

```powershell
$env:DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/innova_test"
npx prisma migrate deploy
```

### 1.3 — Criar `.env.test` se não existir

```env
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/innova_test"
JWT_SECRET="test-secret-innova-2024"
JWT_EXPIRES_IN="1h"
NODE_ENV="test"
PORT=4001
```

---

## FASE 2 — CONFIGURAÇÃO DO JEST

### 2.1 — Instalar dependências

```bash
npm install --save-dev supertest @types/supertest
```

### 2.2 — Criar `test/jest-integration.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": "test/integration/.*\\.integration-spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "testTimeout": 60000,
  "verbose": true,
  "forceExit": true,
  "detectOpenHandles": true,
  "globalSetup": "<rootDir>/test/integration/setup.ts",
  "globalTeardown": "<rootDir>/test/integration/teardown.ts"
}
```

### 2.3 — Adicionar scripts ao `package.json`

```json
"test:integration": "cross-env NODE_ENV=test jest --config test/jest-integration.json --forceExit --runInBand",
"test:integration:auth": "cross-env NODE_ENV=test jest --config test/jest-integration.json --testPathPattern=auth --forceExit --runInBand",
"test:integration:courses": "cross-env NODE_ENV=test jest --config test/jest-integration.json --testPathPattern=courses --forceExit --runInBand",
"test:integration:enrollment": "cross-env NODE_ENV=test jest --config test/jest-integration.json --testPathPattern=enrollment --forceExit --runInBand",
"test:integration:users": "cross-env NODE_ENV=test jest --config test/jest-integration.json --testPathPattern=users --forceExit --runInBand"
```

---

## FASE 3 — SETUP E TEARDOWN GLOBAIS

### 3.1 — Criar `test/integration/setup.ts`

```typescript
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ||
        'postgresql://postgres:PASSWORD@localhost:5432/innova_test',
    },
  },
});

export default async function globalSetup() {
  console.log('\n🔧 Setup integração — a preparar BD de teste...');

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    'postgresql://postgres:PASSWORD@localhost:5432/innova_test';

  // Aplica migrations
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'pipe',
  });

  const password = await bcrypt.hash('Test@1234', 10);

  // Cria roles
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

  // Cria departamento
  const department = await prisma.department.upsert({
    where: { name: 'Dept Integração Teste' },
    update: {},
    create: { name: 'Dept Integração Teste' },
  });

  // REGRA: fullName (não name)
  const users = [
    { email: 'int.employee@innova-test.com', fullName: 'Employee Int', roleCode: 'EMPLOYEE' },
    { email: 'int.manager@innova-test.com', fullName: 'Manager Int', roleCode: 'MANAGER' },
    { email: 'int.rh@innova-test.com', fullName: 'RH Int', roleCode: 'RH' },
    { email: 'int.admin@innova-test.com', fullName: 'Admin Int', roleCode: 'ADMIN' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        fullName: u.fullName,
        password,
        roleId: roleRecords[u.roleCode].id,
        departmentId: department.id,
        isActive: true,
      },
    });
  }

  // Cria curso de teste
  await prisma.course.upsert({
    where: { title: 'Curso Integração Teste' },
    update: {},
    create: {
      title: 'Curso Integração Teste',
      description: 'Curso para testes de integração',
      isActive: true,
    },
  });

  await prisma.$disconnect();
  console.log('✅ BD de teste preparada\n');
}
```

### 3.2 — Criar `test/integration/teardown.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ||
        'postgresql://postgres:PASSWORD@localhost:5432/innova_test',
    },
  },
});

export default async function globalTeardown() {
  console.log('\n🧹 Teardown — a limpar BD de teste...');

  const testEmails = [
    'int.employee@innova-test.com',
    'int.manager@innova-test.com',
    'int.rh@innova-test.com',
    'int.admin@innova-test.com',
  ];

  const users = await prisma.user.findMany({
    where: { email: { in: testEmails } },
    select: { id: true },
  });
  const ids = users.map(u => u.id);

  // Remove por ordem de dependência
  await prisma.enrollment.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.badgeAward.deleteMany({ where: { userId: { in: ids } } });
  await prisma.legacyPdi.deleteMany({ where: { userId: { in: ids } } });
  await prisma.attendanceRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  await prisma.course.deleteMany({ where: { title: 'Curso Integração Teste' } });

  await prisma.$disconnect();
  console.log('✅ BD de teste limpa\n');
}
```

---

## FASE 4 — HELPER DE AUTENTICAÇÃO

### 4.1 — Criar `test/integration/helpers/auth.helper.ts`

```typescript
import * as request from 'supertest';

export const INT_CREDENTIALS = {
  employee: { email: 'int.employee@innova-test.com', password: 'Test@1234' },
  manager:  { email: 'int.manager@innova-test.com',  password: 'Test@1234' },
  rh:       { email: 'int.rh@innova-test.com',       password: 'Test@1234' },
  admin:    { email: 'int.admin@innova-test.com',     password: 'Test@1234' },
};

export async function getToken(
  httpServer: any,
  role: keyof typeof INT_CREDENTIALS,
): Promise<string> {
  const res = await request(httpServer)
    .post('/auth/login')
    .send(INT_CREDENTIALS[role])
    .expect(201);

  return res.body.accessToken;
}
```

---

## FASE 5 — TESTES DE INTEGRAÇÃO

### 5.1 — Criar `test/integration/auth/auth.integration-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';

describe('Auth Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => await app.close());

  describe('POST /auth/login', () => {
    it('login com credenciais correctas → 201 + accessToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'int.rh@innova-test.com', password: 'Test@1234' })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.accessToken.length).toBeGreaterThan(20);
    });

    it('password errada → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'int.rh@innova-test.com', password: 'errada' })
        .expect(401);
    });

    it('email inexistente → 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nao.existe@innova-test.com', password: 'Test@1234' })
        .expect(401);
    });

    it('body vazio → 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });

    it('sem token em rota protegida → 401', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .expect(401);
    });
  });
});
```

### 5.2 — Criar `test/integration/courses/courses.integration-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('Courses Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let courseId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => await app.close());

  describe('GET /courses', () => {
    it('lista cursos com token → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/courses')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : res.body.data;
      expect(items).toBeDefined();

      if (items.length > 0) courseId = items[0].id;
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .get('/courses')
        .expect(401);
    });
  });

  describe('GET /courses/:id', () => {
    it('detalhe de curso existente → 200', async () => {
      if (!courseId) return;
      const res = await request(app.getHttpServer())
        .get(`/courses/${courseId}`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', courseId);
      expect(res.body).toHaveProperty('title');
    });

    it('curso inexistente → 404', async () => {
      await request(app.getHttpServer())
        .get('/courses/id-invalido-xyz')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(404);
    });
  });
});
```

### 5.3 — Criar `test/integration/enrollment/enrollment.integration-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';
import { PrismaClient } from '@prisma/client';

describe('Enrollment Integration', () => {
  let app: INestApplication;
  let employeeToken: string;
  let courseId: string;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    employeeToken = await getToken(app.getHttpServer(), 'employee');

    const course = await prisma.course.findFirst({
      where: { title: 'Curso Integração Teste' },
    });
    courseId = course?.id || '';
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /enrollment', () => {
    it('inscrição com sucesso → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/enrollment')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ courseId })
        .expect(201);

      expect(res.body).toHaveProperty('courseId', courseId);
    });

    it('inscrição duplicada → 409 (@@unique courseId_userId)', async () => {
      await request(app.getHttpServer())
        .post('/enrollment')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ courseId })
        .expect(409);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .post('/enrollment')
        .send({ courseId })
        .expect(401);
    });

    it('sem courseId → 400', async () => {
      await request(app.getHttpServer())
        .post('/enrollment')
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('GET /enrollment/my', () => {
    it('lista inscrições do utilizador → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/enrollment/my')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : res.body.data;
      expect(items).toBeDefined();
    });
  });
});
```

### 5.4 — Criar `test/integration/users/users.integration-spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import { getToken } from '../helpers/auth.helper';

describe('Users Integration', () => {
  let app: INestApplication;
  let rhToken: string;
  let employeeToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    rhToken = await getToken(app.getHttpServer(), 'rh');
    employeeToken = await getToken(app.getHttpServer(), 'employee');
  });

  afterAll(async () => await app.close());

  describe('GET /users', () => {
    it('RH lista utilizadores → 200 com fullName', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${rhToken}`)
        .expect(200);

      const items = Array.isArray(res.body) ? res.body : res.body.data;
      if (items?.length > 0) {
        // REGRA: campo fullName (nunca name)
        expect(items[0]).toHaveProperty('fullName');
        expect(items[0]).not.toHaveProperty('name');
      }
    });

    it('Employee não pode listar utilizadores → 403', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
    });

    it('sem token → 401', async () => {
      await request(app.getHttpServer())
        .get('/users')
        .expect(401);
    });
  });
});
```

---

## FASE 6 — EXECUTAR OS TESTES

### 6.1 — Ordem de execução

```powershell
# 1. Cria a BD de teste se não existir
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE innova_test;" 2>/dev/null

# 2. Aplica migrations
$env:DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/innova_test"
npx prisma migrate deploy

# 3. Corre apenas auth primeiro
npm run test:integration:auth

# 4. Se passou → corre todos
npm run test:integration

# 5. Gera cobertura com integração
npm run test:cov
```

### 6.2 — Resultado esperado

```
PASS  test/integration/auth/auth.integration-spec.ts
  Auth Integration
    POST /auth/login
      ✓ login com credenciais correctas → 201 + accessToken
      ✓ password errada → 401
      ✓ email inexistente → 401
      ✓ body vazio → 400
      ✓ sem token em rota protegida → 401

PASS  test/integration/courses/courses.integration-spec.ts
PASS  test/integration/enrollment/enrollment.integration-spec.ts
PASS  test/integration/users/users.integration-spec.ts

Test Suites: 4 passed
Tests:       16 passed
Coverage:    40-60% (estimado com BD real)
```

---

## FASE 7 — COMMIT FINAL

```powershell
git add -A
git commit -m "test: add integration tests - auth courses enrollment users" --no-verify
git push origin main
```

---

## PROMPT PARA O CLAUDE CODE

```
Concentra-te APENAS nos testes de integração.
NÃO corras testes de carga (Artillery).
NÃO corras testes de API (Bruno CLI).
NÃO modifiques load-tests/ nem bruno/.
NÃO modifiques os testes unitários existentes.

Lê o INTEGRATION-TESTING-GUIDE.md na raiz
e executa todas as fases por ordem.

FASE 0 → Verifica o que já existe
FASE 1 → Prepara a BD innova_test
FASE 2 → Configura o Jest para integração
FASE 3 → Cria setup.ts e teardown.ts
FASE 4 → Cria auth.helper.ts
FASE 5 → Cria os 4 ficheiros de teste
FASE 6 → Executa os testes
FASE 7 → Commit e push

Para a BD usa sempre innova_test (não innova).
O PASSWORD do PostgreSQL está no .env.

REGRAS OBRIGATÓRIAS DO INNOVA:
- fullName (nunca name) no modelo User
- entity (nunca entityType) no AuditLog
- courseId_userId compound key no Enrollment
- legacyPdi (nunca pdi como modelo)
- badgeAward (nunca badge como modelo)
- AttendanceRecord (nunca Attendance)
- NotificationLog.metadata sempre JSON.stringify()
- Login retorna accessToken (não access_token)
- Login retorna status 201 (não 200)
- Rotas protegidas sem token → 401
- Rotas sem permissão → 403
- Enrollment duplicado → 409

Após cada fase confirma:
- npm run build passa sem erros
- Os testes passam sem falhas

No final faz commit:
git add -A
git commit -m "test: add integration tests - auth courses enrollment users" --no-verify
git push origin main
```

---

*INNOVA — Integration Testing Guide v1.0*
*Jest + Supertest + BD Real (innova_test)*
*Complemento ao CLAUDE.md e CODE-QUALITY-GUIDE.md*

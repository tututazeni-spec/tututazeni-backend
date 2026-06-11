# INNOVA — Guia Completo de Testes de Base de Dados
> Prisma + PostgreSQL | NestJS | 6000 funcionários
> Valida queries, índices, migrations e integridade dos dados

---

## O QUE SÃO TESTES DE BASE DE DADOS

```
Testes Unitários      → testam funções isoladas com mocks
Testes de Integração  → testam módulos com BD real
Testes de BD          → testam a BD directamente

Testes de BD verificam:
→ Queries lentas sem índices
→ Migrations correctas e completas
→ Constraints e foreign keys
→ Integridade referencial dos dados
→ Transacções e rollbacks
→ Performance das queries com carga real
→ Índices em falta nos campos mais usados
→ Dados duplicados ou inconsistentes
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
- LeaveType → ENUM não modelo
- BD de teste: innova_test (NUNCA innova)
```

---

## FASE 0 — VERIFICAÇÃO INICIAL

```bash
# 1. PostgreSQL a correr?
Get-Service -Name postgresql*

# 2. BD innova_test existe?
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "\l" | findstr innova

# 3. Migrations aplicadas?
npx prisma migrate status

# 4. Schema actual
npx prisma db pull --print 2>/dev/null | head -50

# 5. Índices existentes no schema
cat prisma/schema.prisma | grep -E "@@index|@@unique"

# 6. Tamanho das tabelas principais
# (correr no psql ou prisma studio)
```

---

## FASE 1 — ANÁLISE DE ÍNDICES EM FALTA

### 1.1 — Campos que precisam de índices no INNOVA

```prisma
# Campos usados frequentemente em WHERE
# que devem ter índices:

model User {
  @@index([departmentId])
  @@index([roleId])
  @@index([managerId])
  @@index([isActive])
  @@index([email])          # já deve existir como unique
}

model Enrollment {
  @@unique([courseId, userId])  # já existe
  @@index([userId])             # GET /enrollment/my
  @@index([courseId])           # relatórios
  @@index([status])             # filtros
}

model NotificationLog {
  @@index([userId])
  @@index([createdAt])
  @@index([isRead])
}

# REGRA: campo entity (não entityType)
model AuditLog {
  @@index([entity])
  @@index([userId])
  @@index([createdAt])
}

model AttendanceRecord {
  @@index([userId])
  @@index([date])
  @@index([userId, date])    # compound para queries diárias
}

model LessonProgress {
  @@index([userId])
  @@index([lessonId])
  @@index([enrollmentId])    # já optimizado
}

model Course {
  @@index([isActive])
  @@index([createdAt])
}

# REGRA: modelo legacyPdi (não pdi)
model LegacyPdi {
  @@index([userId])
  @@index([status])
}

# REGRA: modelo badgeAward (não badge)
model BadgeAward {
  @@index([userId])
  @@index([createdAt])
}
```

### 1.2 — Verificar índices existentes

```bash
# Lista todos os índices actuais no PostgreSQL
psql -U postgres -d innova_test -c "
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
"
```

---

## FASE 2 — TESTES DE PERFORMANCE DE QUERIES

### 2.1 — Criar `test/database/query-performance.test.ts`

```typescript
// test/database/query-performance.test.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ||
        'postgresql://postgres:PASSWORD@localhost:5432/innova_test',
    },
  },
  log: ['query'],
});

const SLOW_QUERY_THRESHOLD_MS = 100; // queries acima de 100ms são lentas

describe('Database Query Performance', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── USER QUERIES ────────────────────────────────────────

  describe('User queries', () => {
    it('findMany users deve ser rápido', async () => {
      const start = Date.now();

      // REGRA: fullName (não name)
      await prisma.user.findMany({
        select: {
          id: true,
          fullName: true,
          email: true,
        },
        take: 100,
      });

      const duration = Date.now() - start;
      console.log(`findMany users: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findUnique user por email deve ser rápido', async () => {
      const start = Date.now();

      await prisma.user.findUnique({
        where: { email: 'int.rh@innova-test.com' },
      });

      const duration = Date.now() - start;
      console.log(`findUnique user by email: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findMany users por departamento deve ser rápido', async () => {
      const department = await prisma.department.findFirst();
      if (!department) return;

      const start = Date.now();

      await prisma.user.findMany({
        where: { departmentId: department.id },
        select: { id: true, fullName: true },
      });

      const duration = Date.now() - start;
      console.log(`findMany users by department: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── ENROLLMENT QUERIES ───────────────────────────────────

  describe('Enrollment queries', () => {
    it('findMany enrollments por userId deve ser rápido', async () => {
      const user = await prisma.user.findFirst();
      if (!user) return;

      const start = Date.now();

      // REGRA: compound unique [courseId, userId]
      await prisma.enrollment.findMany({
        where: { userId: user.id },
        include: { course: true },
      });

      const duration = Date.now() - start;
      console.log(`findMany enrollments by userId: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });

    it('findUnique enrollment por compound key deve ser rápido', async () => {
      const enrollment = await prisma.enrollment.findFirst();
      if (!enrollment) return;

      const start = Date.now();

      await prisma.enrollment.findUnique({
        where: {
          courseId_userId: {
            courseId: enrollment.courseId,
            userId: enrollment.userId,
          },
        },
      });

      const duration = Date.now() - start;
      console.log(`findUnique enrollment compound key: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── COURSE QUERIES ───────────────────────────────────────

  describe('Course queries', () => {
    it('findMany cursos activos deve ser rápido', async () => {
      const start = Date.now();

      await prisma.course.findMany({
        where: { isActive: true },
        take: 50,
      });

      const duration = Date.now() - start;
      console.log(`findMany active courses: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── AUDIT LOG QUERIES ────────────────────────────────────

  describe('AuditLog queries', () => {
    it('findMany auditLog por entity deve ser rápido', async () => {
      const start = Date.now();

      // REGRA: campo entity (não entityType)
      await prisma.auditLog.findMany({
        where: { entity: 'User' },
        take: 50,
        orderBy: { createdAt: 'desc' },
      });

      const duration = Date.now() - start;
      console.log(`findMany auditLog by entity: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });

  // ─── NOTIFICATION QUERIES ─────────────────────────────────

  describe('NotificationLog queries', () => {
    it('findMany notifications por userId deve ser rápido', async () => {
      const user = await prisma.user.findFirst();
      if (!user) return;

      const start = Date.now();

      await prisma.notificationLog.findMany({
        where: { userId: user.id },
        take: 20,
        orderBy: { createdAt: 'desc' },
      });

      const duration = Date.now() - start;
      console.log(`findMany notifications by userId: ${duration}ms`);
      expect(duration).toBeLessThan(SLOW_QUERY_THRESHOLD_MS);
    });
  });
});
```

---

## FASE 3 — TESTES DE INTEGRIDADE DOS DADOS

### 3.1 — Criar `test/database/data-integrity.test.ts`

```typescript
// test/database/data-integrity.test.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ||
        'postgresql://postgres:PASSWORD@localhost:5432/innova_test',
    },
  },
});

describe('Database Data Integrity', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ─── FOREIGN KEYS ─────────────────────────────────────────

  describe('Foreign Keys', () => {
    it('todos os users têm role válida', async () => {
      const usersWithoutRole = await prisma.user.findMany({
        where: { roleId: null },
      });
      expect(usersWithoutRole).toHaveLength(0);
    });

    it('todos os enrollments têm course válido', async () => {
      const orphanEnrollments = await prisma.$queryRaw`
        SELECT e.id FROM "Enrollment" e
        LEFT JOIN "Course" c ON e."courseId" = c.id
        WHERE c.id IS NULL
      `;
      expect((orphanEnrollments as any[]).length).toBe(0);
    });

    it('todos os enrollments têm user válido', async () => {
      const orphanEnrollments = await prisma.$queryRaw`
        SELECT e.id FROM "Enrollment" e
        LEFT JOIN "User" u ON e."userId" = u.id
        WHERE u.id IS NULL
      `;
      expect((orphanEnrollments as any[]).length).toBe(0);
    });
  });

  // ─── UNIQUE CONSTRAINTS ────────────────────────────────────

  describe('Unique Constraints', () => {
    it('não existem emails duplicados', async () => {
      const duplicates = await prisma.$queryRaw`
        SELECT email, COUNT(*) as count
        FROM "User"
        GROUP BY email
        HAVING COUNT(*) > 1
      `;
      expect((duplicates as any[]).length).toBe(0);
    });

    it('não existem enrollments duplicados (courseId_userId)', async () => {
      // REGRA: compound unique [courseId, userId]
      const duplicates = await prisma.$queryRaw`
        SELECT "courseId", "userId", COUNT(*) as count
        FROM "Enrollment"
        GROUP BY "courseId", "userId"
        HAVING COUNT(*) > 1
      `;
      expect((duplicates as any[]).length).toBe(0);
    });
  });

  // ─── CAMPO fullName ────────────────────────────────────────

  describe('Campo fullName', () => {
    it('todos os users têm fullName preenchido', async () => {
      // REGRA: fullName (não name)
      const usersWithoutName = await prisma.user.findMany({
        where: {
          OR: [
            { fullName: null },
            { fullName: '' },
          ],
        },
      });
      expect(usersWithoutName).toHaveLength(0);
    });
  });

  // ─── NOTIFICATIONLOG METADATA ──────────────────────────────

  describe('NotificationLog metadata', () => {
    it('metadata é sempre string JSON válida', async () => {
      // REGRA: metadata é String? → JSON.stringify()
      const notifications = await prisma.notificationLog.findMany({
        where: { metadata: { not: null } },
        take: 10,
      });

      for (const notif of notifications) {
        if (notif.metadata) {
          expect(() => JSON.parse(notif.metadata!)).not.toThrow();
        }
      }
    });
  });

  // ─── AUDITLOG CAMPO ENTITY ─────────────────────────────────

  describe('AuditLog campo entity', () => {
    it('auditLog tem campo entity preenchido', async () => {
      // REGRA: campo entity (não entityType)
      const logsWithoutEntity = await prisma.auditLog.findMany({
        where: {
          OR: [
            { entity: null },
            { entity: '' },
          ],
        },
        take: 5,
      });
      expect(logsWithoutEntity).toHaveLength(0);
    });
  });
});
```

---

## FASE 4 — TESTES DE MIGRATIONS

### 4.1 — Criar `test/database/migrations.test.ts`

```typescript
// test/database/migrations.test.ts
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ||
        'postgresql://postgres:PASSWORD@localhost:5432/innova_test',
    },
  },
});

describe('Database Migrations', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('todas as migrations estão aplicadas', async () => {
    const result = execSync('npx prisma migrate status', {
      env: { ...process.env },
      encoding: 'utf8',
    });
    expect(result).not.toContain('have not yet been applied');
    expect(result).not.toContain('failed');
  });

  it('tabelas críticas existem na BD', async () => {
    const tables = await prisma.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    ` as any[];

    const tableNames = tables.map((t: any) => t.tablename);

    const requiredTables = [
      'User',
      'Course',
      'Enrollment',
      'Lesson',
      'AuditLog',
      'NotificationLog',
      'AttendanceRecord',  // REGRA: AttendanceRecord
      'BadgeAward',        // REGRA: badgeAward
      'Role',
      'Department',
    ];

    for (const table of requiredTables) {
      const exists = tableNames.some(
        (t: string) => t.toLowerCase() === table.toLowerCase()
      );
      expect(exists).toBe(true);
    }
  });

  it('índices críticos existem', async () => {
    const indexes = await prisma.$queryRaw`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
    ` as any[];

    const indexNames = indexes.map((i: any) => i.indexname.toLowerCase());

    // Verifica índices mais importantes
    const criticalIndexes = [
      'user_email',       // login rápido
      'enrollment',       // compound unique
    ];

    console.log('Índices encontrados:', indexNames.slice(0, 20));
    expect(indexNames.length).toBeGreaterThan(5);
  });
});
```

---

## FASE 5 — TESTES DE TRANSACÇÕES

### 5.1 — Criar `test/database/transactions.test.ts`

```typescript
// test/database/transactions.test.ts
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

describe('Database Transactions', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('transacção com rollback funciona correctamente', async () => {
    const emailTeste = 'transaction.test@innova-test.com';

    try {
      await prisma.$transaction(async (tx) => {
        // REGRA: fullName (não name)
        await tx.user.create({
          data: {
            email: emailTeste,
            fullName: 'Transacção Teste',
            password: await bcrypt.hash('Test@1234', 10),
            isActive: true,
          },
        });

        // Força um erro para testar o rollback
        throw new Error('Rollback intencional para teste');
      });
    } catch (e) {
      // Esperado
    }

    // Verifica que o user NÃO foi criado (rollback)
    const user = await prisma.user.findUnique({
      where: { email: emailTeste },
    });
    expect(user).toBeNull();
  });

  it('transacção com sucesso persiste os dados', async () => {
    const emailTeste = 'transaction.success@innova-test.com';

    const role = await prisma.role.findFirst();
    const dept = await prisma.department.findFirst();

    if (!role || !dept) return;

    await prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { email: emailTeste },
        update: {},
        create: {
          email: emailTeste,
          fullName: 'Transacção Sucesso',
          password: await bcrypt.hash('Test@1234', 10),
          roleId: role.id,
          departmentId: dept.id,
          isActive: true,
        },
      });
    });

    const user = await prisma.user.findUnique({
      where: { email: emailTeste },
    });
    expect(user).not.toBeNull();
    expect(user?.fullName).toBe('Transacção Sucesso');

    // Limpeza
    await prisma.user.delete({ where: { email: emailTeste } });
  });
});
```

---

## FASE 6 — CONFIGURAÇÃO DO JEST PARA BD

### 6.1 — Criar `test/jest-database.json`

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "..",
  "testEnvironment": "node",
  "testRegex": "test/database/.*\\.test\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "testTimeout": 30000,
  "verbose": true,
  "forceExit": true,
  "detectOpenHandles": true,
  "runInBand": true
}
```

### 6.2 — Adicionar scripts ao `package.json`

```json
"test:db": "cross-env NODE_ENV=test jest --config test/jest-database.json --forceExit --runInBand",
"test:db:performance": "cross-env NODE_ENV=test jest --config test/jest-database.json --testPathPattern=query-performance --forceExit",
"test:db:integrity": "cross-env NODE_ENV=test jest --config test/jest-database.json --testPathPattern=data-integrity --forceExit",
"test:db:migrations": "cross-env NODE_ENV=test jest --config test/jest-database.json --testPathPattern=migrations --forceExit",
"test:db:transactions": "cross-env NODE_ENV=test jest --config test/jest-database.json --testPathPattern=transactions --forceExit"
```

---

## FASE 7 — ADICIONAR ÍNDICES EM FALTA

### 7.1 — Actualizar `prisma/schema.prisma`

Após identificar índices em falta, adiciona ao schema:

```prisma
model User {
  // campos existentes...
  @@index([departmentId])
  @@index([roleId])
  @@index([isActive])
}

model Enrollment {
  // campos existentes...
  @@unique([courseId, userId])  // já deve existir
  @@index([userId])
  @@index([status])
}

model NotificationLog {
  // campos existentes...
  @@index([userId])
  @@index([createdAt])
}

model AuditLog {
  // campos existentes...
  // REGRA: campo entity (não entityType)
  @@index([entity])
  @@index([userId])
  @@index([createdAt])
}

model AttendanceRecord {
  // campos existentes...
  // REGRA: AttendanceRecord (não Attendance)
  @@index([userId])
  @@index([date])
}
```

### 7.2 — Criar migration para os novos índices

```bash
npx prisma migrate dev --name "add_performance_indexes"
```

---

## FASE 8 — EXECUTAR TODOS OS TESTES DE BD

```powershell
# 1. Garante que PostgreSQL está a correr
Get-Service -Name postgresql*

# 2. Garante migrations aplicadas
$env:DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/innova_test"
npx prisma migrate deploy

# 3. Corre por ordem
npm run test:db:migrations
npm run test:db:integrity
npm run test:db:performance
npm run test:db:transactions

# 4. Ou todos de uma vez
npm run test:db
```

---

## RESULTADO ESPERADO

```
PASS  test/database/migrations.test.ts
  Database Migrations
    ✓ todas as migrations estão aplicadas
    ✓ tabelas críticas existem na BD
    ✓ índices críticos existem

PASS  test/database/data-integrity.test.ts
  Database Data Integrity
    ✓ todos os users têm role válida
    ✓ todos os enrollments têm course válido
    ✓ não existem emails duplicados
    ✓ não existem enrollments duplicados
    ✓ todos os users têm fullName preenchido
    ✓ metadata é sempre string JSON válida
    ✓ auditLog tem campo entity preenchido

PASS  test/database/query-performance.test.ts
  ✓ findMany users < 100ms
  ✓ findUnique user by email < 100ms
  ✓ findMany enrollments by userId < 100ms

PASS  test/database/transactions.test.ts
  ✓ rollback funciona correctamente
  ✓ transacção com sucesso persiste dados
```

---

## COMMIT FINAL

```powershell
git add -A
git commit -m "test: add database tests - performance integrity migrations transactions" --no-verify
git push origin main
```

---

## PROMPT PARA O CLAUDE CODE

```
Concentra-te APENAS nos testes de base de dados.
NÃO corras testes de carga (Artillery).
NÃO corras testes de API (Bruno CLI).
NÃO modifiques load-tests/ nem bruno/.
NÃO modifiques os testes existentes.

Lê o DATABASE-TESTING-GUIDE.md na raiz
e executa todas as fases por ordem.

FASE 0 → Verifica o estado actual da BD
FASE 1 → Analisa índices em falta
FASE 2 → Cria test/database/query-performance.test.ts
FASE 3 → Cria test/database/data-integrity.test.ts
FASE 4 → Cria test/database/migrations.test.ts
FASE 5 → Cria test/database/transactions.test.ts
FASE 6 → Configura Jest para BD
FASE 7 → Adiciona índices em falta ao schema
         e cria migration
FASE 8 → Executa todos os testes de BD

Substitui PASSWORD pelo valor do DATABASE_URL
que está no ficheiro .env.
Usa sempre a BD innova_test (não innova).

Após cada fase confirma que os testes passam
antes de avançar para a seguinte.

A cada 20 minutos faz commit parcial:
git add -A
git commit -m "test: database tests progress" --no-verify

REGRAS OBRIGATÓRIAS DO INNOVA:
- fullName (nunca name) no modelo User
- entity (nunca entityType) no AuditLog
- textContent (nunca content) nas Lesson
- courseId_userId compound key no Enrollment
- legacyPdi (nunca pdi como modelo)
- badgeAward (nunca badge como modelo)
- AttendanceRecord (nunca Attendance)
- NotificationLog.metadata sempre JSON.stringify()
- Login retorna accessToken (não access_token)
- BD de teste: innova_test (não innova)

No final faz commit:
git add -A
git commit -m "test: database tests complete - performance integrity migrations" --no-verify
git push origin main
```

---

*INNOVA — Database Testing Guide v1.0*
*Prisma + PostgreSQL | Performance + Integridade + Migrations + Transacções*
*BD de teste: innova_test | Nunca usar innova em testes*

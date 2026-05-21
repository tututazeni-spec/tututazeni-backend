# CLAUDE.md — INNOVA Load Testing Guide
> Instruções completas para Claude Code executar os testes de carga e performance com Artillery
> Plataforma: Academia Corporativa + RH | Empresa: ~6000 funcionários

---

## 🧠 CONTEXTO DO PROJECTO

Este é um sistema corporativo NestJS + Prisma com duas áreas principais:
- **Academia Corporativa** → cursos, lições, inscrições, certificados, badges
- **RH** → PDI, presenças, notificações, audit logs, gestão de utilizadores

### Configuração confirmada e real do projecto
| Parâmetro | Valor confirmado |
|---|---|
| Porta | `4000` |
| Prefixo global de rotas | **Nenhum** — rotas começam em `/` |
| Base de dados | PostgreSQL |
| ORM | Prisma |
| Framework | NestJS |
| Ambiente de teste | Local (mesmo PC que corre o backend) |
| BD no início dos testes | **Vazia** — seed completo é obrigatório |
| Utilizadores reais | ~6000 funcionários |
| Auth controller path | `src/auth/auth.controller.ts` |
| Auth endpoint | `POST /auth/login` |
| Auth decorator de rota pública | `@Public` |
| Auth guard | `JwtAuthGuard` |
| Auth DTO | `LoginDto` — campos reais em `src/auth/dto/login.dto.ts` |
| JWT token field | `access_token` (confirmar na Fase 1 lendo o auth.service.ts) |

### Decisões profissionais aplicadas automaticamente
- **Throttling**: como não foi mencionado, assumir que não existe ou está desactivado — não aplicar rate limiting artificial nos testes
- **Redis/Cache**: não confirmado — seed deve garantir dados suficientes na BD para não depender de cache
- **JWT expiry**: ler de `src/auth/auth.service.ts` ou `.env` — se não encontrar, usar 3600s (1h) como padrão seguro para os testes
- **Thresholds locais**: ajustados para ambiente local (p95 < 3000ms, p99 < 8000ms) — mais tolerantes do que staging
- **Módulos não confirmados**: se um controller não existir no path esperado, procurar em `src/` recursivamente antes de excluir do plano
- **LoginDto fields**: ler `src/auth/dto/login.dto.ts` na Fase 1 para confirmar os campos exactos antes de criar os cenários Artillery

Todos os ficheiros criados ou corrigidos devem ser **consistentes entre si** — o seed alimenta o CSV, o CSV alimenta o Artillery, o Artillery bate nas rotas reais dos controllers.

---

## ⚠️ REGRAS OBRIGATÓRIAS DO PROJECTO INNOVA

Antes de tocar em qualquer ficheiro, internaliza estas regras. Violá-las causa erros em runtime:

### Modelo User
- Campo correcto: `fullName` — **NUNCA** usar `name` ou `user.name`
- Sem relação directa `employee` → usar `(user as any).employee` se necessário
- Para filtrar por role: usar `roleCode` — **NUNCA** `where: { role: 'RH' }`
- `role` é uma **relação** para o modelo `Role`, não uma string

### Mapeamento de Modelos Prisma
| Nome lógico usado no código | Modelo real no Prisma |
|---|---|
| `pdi` | `legacyPdi` |
| `courseEnrollment` | `enrollment` |
| `pdiAction` | `developmentPlanAction` |
| `employeeSkill` (por userId) | `legacyEmployeeSkill` |
| `badge` (por userId) | `badgeAward` |
| `docCategory` | `docCategoryModel` |
| `Attendance` | `AttendanceRecord` |
| `LeaveType` | **ENUM** — não é modelo. Usar `(this.prisma as any).leaveTypeConfig` para config |

### Campos Críticos
- `NotificationLog.metadata` é `String?` → sempre `JSON.stringify(obj)` ao escrever
- `AuditLog`: campo é `entity` — **NUNCA** `entityType`
- `Enrollment`: `@@unique` é `[courseId, userId]` → compound key: `courseId_userId`
- `Lesson`: campo é `textContent` — **NUNCA** `content`
- `CertificateType` enum: **não tem** valor `EVENT` → usar `'COURSE' as any`
- `Course`: **não tem** relação `skills`
- Audit module path: `src/common/modules/audit.module.ts`

---

## 📋 FASE 1 — ANÁLISE DO PROJECTO (executa primeiro)

### 1.1 — Leitura e mapeamento inicial

```bash
# Lê e analisa estes ficheiros nesta ordem exacta:
cat prisma/schema.prisma
cat src/main.ts
cat src/app.module.ts
```

**Durante a análise do schema.prisma, regista:**
- Porta da aplicação (main.ts)
- Prefixo global de rotas (ex: /api/v1)
- Se existe ThrottlerModule no app.module.ts e qual o limite
- Todos os modelos com `@@unique` compostos
- Todos os modelos sem índices em campos usados em `where`
- Se existe Redis/cache configurado

### 1.2 — Mapeamento de todas as rotas

```bash
# Lê todos os controllers dos módulos principais
# Auth — path confirmado
cat src/auth/auth.controller.ts
cat src/auth/auth.service.ts           # para confirmar campo do token e expiração JWT
cat src/auth/dto/login.dto.ts          # para confirmar campos exactos do body (email? username?)

# Restantes módulos — tentar paths alternativos se o primeiro falhar
cat src/modules/users/users.controller.ts       2>/dev/null || cat src/users/users.controller.ts 2>/dev/null
cat src/modules/courses/courses.controller.ts   2>/dev/null || cat src/courses/courses.controller.ts 2>/dev/null
cat src/modules/enrollment/enrollment.controller.ts 2>/dev/null || cat src/enrollment/enrollment.controller.ts 2>/dev/null
cat src/modules/lessons/lessons.controller.ts   2>/dev/null || cat src/lessons/lessons.controller.ts 2>/dev/null
cat src/modules/certificates/certificates.controller.ts 2>/dev/null || cat src/certificates/certificates.controller.ts 2>/dev/null
cat src/modules/badges/badges.controller.ts     2>/dev/null || cat src/badges/badges.controller.ts 2>/dev/null
cat src/modules/pdi/pdi.controller.ts           2>/dev/null || cat src/pdi/pdi.controller.ts 2>/dev/null
cat src/modules/attendance/attendance.controller.ts 2>/dev/null || cat src/attendance/attendance.controller.ts 2>/dev/null
cat src/modules/notifications/notifications.controller.ts 2>/dev/null || cat src/notifications/notifications.controller.ts 2>/dev/null
cat src/modules/audit/audit.controller.ts       2>/dev/null || cat src/audit/audit.controller.ts 2>/dev/null
cat src/modules/departments/departments.controller.ts 2>/dev/null || cat src/departments/departments.controller.ts 2>/dev/null
cat src/modules/roles/roles.controller.ts       2>/dev/null || cat src/roles/roles.controller.ts 2>/dev/null
```

> Se algum ficheiro não existir, ignora e continua. Não crias módulos que não existam.

### 1.3 — Leitura dos DTOs críticos

```bash
# Auth DTO — path confirmado
cat src/auth/dto/login.dto.ts

# Restantes DTOs — tentar paths alternativos
cat src/modules/enrollment/dto/create-enrollment.dto.ts   2>/dev/null || cat src/enrollment/dto/create-enrollment.dto.ts 2>/dev/null
cat src/modules/courses/dto/create-course.dto.ts          2>/dev/null || cat src/courses/dto/create-course.dto.ts 2>/dev/null
cat src/modules/notifications/dto/create-notification.dto.ts 2>/dev/null || cat src/notifications/dto/create-notification.dto.ts 2>/dev/null
cat src/modules/attendance/dto/create-attendance.dto.ts   2>/dev/null || cat src/attendance/dto/create-attendance.dto.ts 2>/dev/null
cat src/modules/pdi/dto/create-pdi.dto.ts                 2>/dev/null || cat src/pdi/dto/create-pdi.dto.ts 2>/dev/null
```

### 1.4 — Verificar configuração de ambiente

```bash
cat .env.example 2>/dev/null || cat src/config/configuration.ts 2>/dev/null || cat src/config/app.config.ts 2>/dev/null
```

### 1.5 — Verificar seed existente

```bash
cat prisma/seed.ts 2>/dev/null || ls prisma/seeders/ 2>/dev/null
```

---

## 📋 FASE 2 — CRIAÇÃO DA ESTRUTURA DE TESTES

Depois de analisar os ficheiros acima, cria a seguinte estrutura. **Usa os dados reais encontrados na Fase 1** (porta, prefixo de rotas, campos dos DTOs).

### 2.1 — Criar estrutura de pastas

```bash
mkdir -p load-tests/scenarios
mkdir -p load-tests/data
mkdir -p load-tests/phases
mkdir -p load-tests/hooks
mkdir -p load-tests/reports
```

### 2.2 — Instalar dependências Artillery

```bash
npm install --save-dev artillery
npm install --save-dev artillery-plugin-metrics-by-endpoint
npm install --save-dev artillery-plugin-expect
```

---

## 📋 FASE 3 — SEED DE DADOS DE TESTE

### 3.1 — Criar ficheiro de seed de teste

Cria o ficheiro `prisma/seed-load-test.ts` com este conteúdo, adaptando os campos ao schema real:

```typescript
// prisma/seed-load-test.ts
// Seed dedicado a dados de teste de carga — NÃO usar em produção

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TOTAL_TEST_USERS = 200; // utilizadores de teste (suficiente para simular 6000)
const TOTAL_COURSES = 50;
const PASSWORD_HASH = bcrypt.hashSync('LoadTest@2024', 10);

async function main() {
  console.log('🌱 A iniciar seed de dados de teste de carga...');

  // 1. Verificar/criar roles de teste (usando roleCode, não role string)
  const roles = ['EMPLOYEE', 'MANAGER', 'RH', 'ADMIN'];
  const roleRecords: Record<string, any> = {};

  for (const code of roles) {
    const role = await prisma.role.upsert({
      where: { code },   // ajusta o campo único conforme schema real
      update: {},
      create: { code, name: code },
    });
    roleRecords[code] = role;
  }
  console.log('✅ Roles criadas');

  // 2. Criar departamento de teste
  const department = await prisma.department.upsert({
    where: { name: 'Departamento de Testes' },
    update: {},
    create: { name: 'Departamento de Testes' },
  });
  console.log('✅ Departamento criado');

  // 3. Criar utilizadores de teste
  // REGRA: campo fullName (não name)
  const userIds: string[] = [];
  const csvLines: string[] = ['email,password,role,userId'];

  for (let i = 1; i <= TOTAL_TEST_USERS; i++) {
    const roleCode = i <= 10 ? 'RH'
      : i <= 30 ? 'MANAGER'
      : i <= 50 ? 'ADMIN'
      : 'EMPLOYEE';

    const email = `load.test.user${i}@innova-test.com`;

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        fullName: `Utilizador Teste ${i}`,    // REGRA: fullName, não name
        password: PASSWORD_HASH,
        roleId: roleRecords[roleCode].id,
        departmentId: department.id,
        isActive: true,
      },
    });

    userIds.push(user.id);
    csvLines.push(`${email},LoadTest@2024,${roleCode},${user.id}`);
  }

  // Guardar CSV de utilizadores
  fs.writeFileSync(
    path.join(__dirname, '../load-tests/data/users.csv'),
    csvLines.join('\n')
  );
  console.log(`✅ ${TOTAL_TEST_USERS} utilizadores criados e CSV gerado`);

  // 4. Criar cursos de teste
  const courseIds: string[] = [];
  const coursesCsvLines: string[] = ['courseId,title'];

  for (let i = 1; i <= TOTAL_COURSES; i++) {
    const course = await prisma.course.upsert({
      where: { title: `Curso de Teste ${i}` },  // ajusta campo único se necessário
      update: {},
      create: {
        title: `Curso de Teste ${i}`,
        description: `Descrição do curso de teste número ${i}`,
        isActive: true,
        // adiciona outros campos obrigatórios conforme schema
      },
    });
    courseIds.push(course.id);
    coursesCsvLines.push(`${course.id},Curso de Teste ${i}`);
  }

  // Guardar CSV de cursos
  fs.writeFileSync(
    path.join(__dirname, '../load-tests/data/courses.csv'),
    coursesCsvLines.join('\n')
  );
  console.log(`✅ ${TOTAL_COURSES} cursos criados e CSV gerado`);

  // 5. Criar lições para os cursos
  const lessonIds: string[] = [];
  const lessonsCsvLines: string[] = ['lessonId,courseId'];

  for (const courseId of courseIds.slice(0, 10)) {
    for (let l = 1; l <= 3; l++) {
      const lesson = await prisma.lesson.create({
        data: {
          courseId,
          title: `Lição ${l}`,
          textContent: `Conteúdo da lição ${l}`,  // REGRA: textContent, não content
          order: l,
        },
      });
      lessonIds.push(lesson.id);
      lessonsCsvLines.push(`${lesson.id},${courseId}`);
    }
  }

  fs.writeFileSync(
    path.join(__dirname, '../load-tests/data/lessons.csv'),
    lessonsCsvLines.join('\n')
  );
  console.log('✅ Lições criadas e CSV gerado');

  // 6. Criar inscrições pré-existentes (para testes de leitura)
  // REGRA: compound unique [courseId, userId] — não duplicar
  let enrollmentCount = 0;
  for (const userId of userIds.slice(0, 50)) {
    for (const courseId of courseIds.slice(0, 5)) {
      await prisma.enrollment.upsert({
        where: {
          courseId_userId: { courseId, userId },   // REGRA: compound key
        },
        update: {},
        create: {
          courseId,
          userId,
          enrolledAt: new Date(),
          status: 'ACTIVE',
        },
      });
      enrollmentCount++;
    }
  }
  console.log(`✅ ${enrollmentCount} inscrições criadas`);

  // 7. Criar CSV de pares userId+courseId para testes de inscrição
  // Usa utilizadores e cursos que NÃO estão já inscritos — evita colisão de @@unique
  const enrollmentTestLines: string[] = ['userId,courseId'];
  for (const userId of userIds.slice(50, 150)) {
    for (const courseId of courseIds.slice(10, 20)) {
      enrollmentTestLines.push(`${userId},${courseId}`);
    }
  }
  fs.writeFileSync(
    path.join(__dirname, '../load-tests/data/enrollment-pairs.csv'),
    enrollmentTestLines.join('\n')
  );
  console.log('✅ CSV de pares de inscrição criado');

  console.log('\n🎯 Seed de testes concluído com sucesso!');
  console.log('📁 Ficheiros CSV gerados em load-tests/data/');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### 3.2 — Adicionar script no package.json

```bash
# Adiciona ao package.json na secção scripts:
# "seed:loadtest": "ts-node prisma/seed-load-test.ts"
```

Usa este comando para editar o package.json:
```bash
node -e "
const pkg = require('./package.json');
pkg.scripts['seed:loadtest'] = 'ts-node prisma/seed-load-test.ts';
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Script adicionado ao package.json');
"
```

### 3.3 — Executar o seed

```bash
npx ts-node prisma/seed-load-test.ts
```

> Verifica que os CSVs foram criados em `load-tests/data/` antes de avançar para a Fase 4.

---

## 📋 FASE 4 — CRIAÇÃO DOS FICHEIROS ARTILLERY

> ⚠️ Usa a porta e o prefixo de rotas reais encontrados na Fase 1. Se o prefixo for `/api/v1`, todas as URLs abaixo devem ter esse prefixo.

### 4.1 — Ficheiro principal `load-tests/artillery.yml`

Cria o ficheiro com este conteúdo — porta 4000, sem prefixo global de rotas:

```yaml
# load-tests/artillery.yml
# Config principal — INNOVA Load Test
# Empresa: ~6000 funcionários

config:
  target: "http://localhost:4000"
  http:
    timeout: 30
    pool: 50
  processor: "./hooks/functions.js"

  phases:
    - name: "Smoke Test (sanidade)"
      duration: 30
      arrivalRate: 1
      maxVusers: 5

  payload:
    - path: "./data/users.csv"
      fields:
        - email
        - password
        - role
        - userId
      order: random

  plugins:
    metrics-by-endpoint:
      useOnlyRequestNames: true
    expect: {}

  ensure:
    p95: 3000      # 95% das respostas abaixo de 3s (ajustado para ambiente local)
    p99: 8000      # 99% das respostas abaixo de 8s (ajustado para ambiente local)
    maxErrorRate: 1 # máximo 1% de erros

  defaults:
    headers:
      Content-Type: "application/json"
      Accept: "application/json"

scenarios:
  - name: "Fluxo Academia — Utilizador Employee"
    weight: 50
    flow:
      - post:
          url: "/auth/login"
          name: "POST /auth/login"
          json:
            email: "{{ email }}"
            password: "LoadTest@2024"
          capture:
            - json: "$.access_token"
              as: "token"
          expect:
            - statusCode: 200
            - hasProperty: "access_token"

      - get:
          url: "/courses"
          name: "GET /courses"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: 200

      - get:
          url: "/courses/{{ $randomPick(courseIds) }}"
          name: "GET /courses/:id"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: [200, 404]

      - get:
          url: "/enrollment/my"
          name: "GET /enrollment/my"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: 200

      - get:
          url: "/certificates/my"
          name: "GET /certificates/my"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: 200

  - name: "Fluxo RH — Admin e Manager"
    weight: 30
    flow:
      - post:
          url: "/auth/login"
          name: "POST /auth/login (RH)"
          json:
            email: "{{ email }}"
            password: "LoadTest@2024"
          capture:
            - json: "$.access_token"
              as: "token"
          expect:
            - statusCode: 200

      - get:
          url: "/users"
          name: "GET /users"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: [200, 403]

      - get:
          url: "/pdi/my"
          name: "GET /pdi/my (legacyPdi)"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: [200, 403]

      - get:
          url: "/attendance/my"
          name: "GET /attendance/my"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: [200, 403]

      - get:
          url: "/audit-logs"
          name: "GET /audit-logs (campo entity)"
          headers:
            Authorization: "Bearer {{ token }}"
          expect:
            - statusCode: [200, 403]

  - name: "Fluxo Inscrição — Escrita Crítica"
    weight: 20
    flow:
      - post:
          url: "/auth/login"
          name: "POST /auth/login (enrollment)"
          json:
            email: "{{ email }}"
            password: "LoadTest@2024"
          capture:
            - json: "$.access_token"
              as: "token"
          expect:
            - statusCode: 200

      - post:
          url: "/enrollment"
          name: "POST /enrollment (compound unique)"
          headers:
            Authorization: "Bearer {{ token }}"
          json:
            courseId: "{{ $randomPick(courseIds) }}"
          expect:
            - statusCode: [201, 409]  # 409 = já inscrito (@@unique) — é esperado
```

### 4.2 — Fase Smoke `load-tests/phases/smoke.yml`

```yaml
# load-tests/phases/smoke.yml
# 5 utilizadores — valida que a API responde sem erros
config:
  phases:
    - name: "Smoke Test"
      duration: 60
      arrivalRate: 1
      maxVusers: 5
```

### 4.3 — Fase Carga Normal `load-tests/phases/load.yml`

```yaml
# load-tests/phases/load.yml
# Simula 10% dos 6000 funcionários online em simultâneo
config:
  phases:
    - name: "Aquecimento"
      duration: 60
      arrivalRate: 10
      maxVusers: 100

    - name: "Carga Normal (600 utilizadores)"
      duration: 180
      arrivalRate: 100
      maxVusers: 600

    - name: "Descida"
      duration: 60
      arrivalRate: 10
      maxVusers: 100
```

### 4.4 — Fase Stress `load-tests/phases/stress.yml`

```yaml
# load-tests/phases/stress.yml
# Simula 30% dos 6000 funcionários — hora de pico
config:
  phases:
    - name: "Aquecimento lento"
      duration: 60
      arrivalRate: 20
      maxVusers: 200

    - name: "Carga Elevada (1800 utilizadores)"
      duration: 180
      arrivalRate: 300
      maxVusers: 1800

    - name: "Pico máximo (3000 utilizadores)"
      duration: 60
      arrivalRate: 500
      maxVusers: 3000

    - name: "Descida gradual"
      duration: 60
      arrivalRate: 50
      maxVusers: 300
```

### 4.5 — Fase Spike `load-tests/phases/spike.yml`

```yaml
# load-tests/phases/spike.yml
# Simula um spike repentino — ex: todos entram às 9h00
config:
  phases:
    - name: "Estado normal"
      duration: 30
      arrivalRate: 10
      maxVusers: 50

    - name: "SPIKE — entrada massiva"
      duration: 30
      arrivalRate: 1000
      maxVusers: 2000

    - name: "Recuperação"
      duration: 60
      arrivalRate: 20
      maxVusers: 100
```

### 4.6 — Funções auxiliares `load-tests/hooks/functions.js`

```javascript
// load-tests/hooks/functions.js
// Funções auxiliares para o Artillery — leitura dos CSVs de IDs reais

const fs = require('fs');
const path = require('path');

// Carrega IDs de cursos reais do CSV gerado pelo seed
function loadCsvIds(filePath, field) {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    const lines = content.trim().split('\n');
    const header = lines[0].split(',');
    const fieldIndex = header.indexOf(field);
    return lines.slice(1).map(line => line.split(',')[fieldIndex]).filter(Boolean);
  } catch (err) {
    console.error(`Erro ao carregar ${filePath}:`, err.message);
    return [];
  }
}

const courseIds = loadCsvIds('data/courses.csv', 'courseId');
const lessonIds = loadCsvIds('data/lessons.csv', 'lessonId');
const userIds   = loadCsvIds('data/users.csv', 'userId');

// Função disponível nos cenários como $randomPick
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Hook chamado antes de cada cenário
function beforeScenario(context, events, done) {
  context.vars.courseIds = courseIds;
  context.vars.lessonIds = lessonIds;
  context.vars.userIds   = userIds;
  context.vars.$randomPick = randomPick;
  return done();
}

// Hook para logar erros de inscrição (409 é esperado — @@unique)
function afterResponse(requestParams, response, context, events, done) {
  if (response.statusCode >= 500) {
    console.error(`❌ Erro 5xx em ${requestParams.url}:`, response.body);
  }
  return done();
}

module.exports = {
  beforeScenario,
  afterResponse,
  randomPick,
};
```

---

## 📋 FASE 5 — SCRIPTS DE EXECUÇÃO

### 5.1 — Adicionar scripts ao package.json

```bash
node -e "
const pkg = require('./package.json');
Object.assign(pkg.scripts, {
  'test:smoke':    'artillery run --config load-tests/phases/smoke.yml load-tests/artillery.yml',
  'test:load':     'artillery run --config load-tests/phases/load.yml load-tests/artillery.yml --output load-tests/reports/load-report.json',
  'test:stress':   'artillery run --config load-tests/phases/stress.yml load-tests/artillery.yml --output load-tests/reports/stress-report.json',
  'test:spike':    'artillery run --config load-tests/phases/spike.yml load-tests/artillery.yml --output load-tests/reports/spike-report.json',
  'test:report':   'artillery report load-tests/reports/load-report.json --output load-tests/reports/load-report.html && open load-tests/reports/load-report.html',
  'seed:loadtest': 'ts-node prisma/seed-load-test.ts'
});
require('fs').writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
console.log('✅ Scripts adicionados ao package.json');
"
```

---

## 📋 FASE 6 — CHECKLIST PRÉ-EXECUÇÃO

Antes de correr qualquer teste, valida cada item:

```bash
# 1. Verifica que a aplicação está a correr
curl http://localhost:4000/health || curl http://localhost:4000/health
echo "✅ ou ❌ Aplicação a correr"

# 2. Verifica que o login funciona com um utilizador de teste
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"load.test.user1@innova-test.com","password":"LoadTest@2024"}'
echo "✅ ou ❌ Login a funcionar"

# 3. Verifica que os CSVs existem e têm dados
wc -l load-tests/data/users.csv
wc -l load-tests/data/courses.csv
wc -l load-tests/data/lessons.csv
wc -l load-tests/data/enrollment-pairs.csv
echo "✅ ou ❌ CSVs com dados"

# 4. Verifica instalação do Artillery
npx artillery version
echo "✅ ou ❌ Artillery instalado"
```

---

## 📋 FASE 7 — EXECUÇÃO DOS TESTES (por esta ordem)

```bash
# PASSO 1 — Seed dos dados de teste
npm run seed:loadtest

# PASSO 2 — Smoke test (valida que nada está partido)
npm run test:smoke
# Resultado esperado: 0 erros, p95 < 1000ms (local)

# PASSO 3 — Teste de carga normal (600 utilizadores)
npm run test:load
# Resultado esperado: p95 < 3000ms, errorRate < 1% (local)

# PASSO 4 — Teste de stress (3000 utilizadores)
npm run test:stress
# Resultado esperado: p95 < 8000ms, errorRate < 5% (local)

# PASSO 5 — Teste de spike (entrada massiva repentina)
npm run test:spike
# Observa: recovery time após o pico

# PASSO 6 — Gerar relatório HTML
npm run test:report
```

---

## 📋 FASE 8 — ANÁLISE DE RESULTADOS E CORRECÇÕES

Depois de cada teste, analisa estes ficheiros para identificar problemas:

### 8.1 — Slow Queries (Prisma)

```bash
# Activa query logging temporariamente
# No ficheiro prisma.service.ts ou onde o PrismaClient é instanciado:
# log: ['query', 'slow'] — queries acima de 1000ms são candidatas a índice
```

### 8.2 — Índices em falta no schema.prisma

Após identificar slow queries, adiciona índices:

```prisma
// Exemplos de índices que provavelmente faltam com 6000 utilizadores:

model User {
  // ...
  @@index([departmentId])
  @@index([roleId])
  @@index([managerId])
}

model Enrollment {
  // ...
  @@unique([courseId, userId])   // já deve existir
  @@index([userId])              // para GET /enrollment/my
  @@index([courseId])            // para relatórios
}

model AttendanceRecord {
  // ...
  @@index([userId])
  @@index([date])
}

model NotificationLog {
  // ...
  @@index([userId])
  @@index([createdAt])
}

// ATENÇÃO: AuditLog usa campo 'entity' (não entityType)
model AuditLog {
  // ...
  @@index([entity])
  @@index([userId])
  @@index([createdAt])
}
```

Depois de adicionar índices:
```bash
npx prisma migrate dev --name "add-load-test-indexes"
```

### 8.3 — Verificação de consistência pós-correcção

```bash
# Corre de novo o smoke test para confirmar que as correcções não partiram nada
npm run test:smoke
```

---

## 📋 FASE 9 — LIMPEZA PÓS-TESTE

```bash
# Remove utilizadores de teste da BD (NÃO correr em produção)
# Cria o script de limpeza
cat > prisma/cleanup-load-test.ts << 'EOF'
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
  console.log('🧹 A limpar dados de teste de carga...');

  // REGRA: field fullName (não name)
  const testUsers = await prisma.user.findMany({
    where: { email: { contains: 'innova-test.com' } },
    select: { id: true },
  });
  const testUserIds = testUsers.map(u => u.id);

  // Remove dados dependentes primeiro (respeita foreign keys)
  await prisma.enrollment.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.attendanceRecord.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.legacyPdi.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.badgeAward.deleteMany({ where: { userId: { in: testUserIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: 'innova-test.com' } } });
  await prisma.course.deleteMany({ where: { title: { contains: 'Curso de Teste' } } });

  console.log('✅ Dados de teste removidos com sucesso');
  await prisma.$disconnect();
}

cleanup().catch(console.error);
EOF

npx ts-node prisma/cleanup-load-test.ts
```

---

## 🚨 REGRAS FINAIS PARA O CLAUDE CODE

1. **Nunca assumir** que um modelo existe sem confirmar no `schema.prisma` primeiro
2. **Sempre usar** `fullName` e nunca `name` no modelo `User`
3. **Sempre usar** `roleCode` para filtrar roles, nunca strings directas
4. **O campo** `entity` no `AuditLog` — nunca `entityType`
5. **O campo** `textContent` nas `Lesson` — nunca `content`
6. **Enrollment** upsert usa sempre o compound key `courseId_userId`
7. **NotificationLog.metadata** é sempre `JSON.stringify()` antes de escrever
8. **LeaveType** é ENUM — se necessitar de dados de config, usar `(prisma as any).leaveTypeConfig`
9. **Todos os ficheiros criados** (seed, artillery.yml, CSVs, hooks) devem estar **consistentes entre si** — os IDs do seed alimentam os CSVs, os CSVs alimentam o Artillery
10. **Antes de cada migração** de índices, corre o smoke test para confirmar que a API está estável

---

*Gerado para o projecto INNOVA — Academia Corporativa + RH | 6000 funcionários*
*Versão: 2.0 | Configuração: Artillery + NestJS + Prisma + PostgreSQL*
*Ambiente: Local (porta 4000, sem prefixo global, BD vazia, auth em src/auth/)*

# Requisitos por Cargo + Qualificações do Colaborador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configurar requisitos estruturados por cargo (`Position`), registar no perfil do colaborador os dados correspondentes e fazer o Simulador de Carreira avaliar o colaborador contra eles.

**Architecture:** Novo modelo `PositionRequirement` (4 categorias: académica, experiência, idioma, certificação) + 3 modelos de perfil (`UserQualification`, `UserLanguage`, `UserExternalCertification`) + `User.priorExperienceYears`. A lógica de comparação vive num ficheiro puro (`position-requirements.evaluator.ts`) usado por `CareerService.simulateNextRole`. Competências técnicas/comportamentais continuam em `PositionCompetency` (endpoints `/competencies/map/position` já existentes). Frontend: painel "Requisitos" no `PositionDetailModal`, separador "Qualificações" no perfil do colaborador, painel de requisitos no Simulador.

**Tech Stack:** NestJS + Prisma (PostgreSQL), class-validator, Jest/supertest; Next.js + React Query (`useApiQuery`/`useApiMutation`), vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-position-requirements-design.md`

## Global Constraints

- Alvo é o modelo `Position` (não `CareerRole`, não `CareerPosition`).
- User: campo `fullName` (nunca `name`); `AuditLog.entity` (nunca `entityType`).
- Escala de idiomas: `A1 < A2 < B1 < B2 < C1 < C2`. Escala académica: `TECNICO < BACHARELATO < LICENCIATURA < POS_GRADUACAO < MESTRADO < DOUTORAMENTO`.
- ValidationPipe tem `whitelist + forbidNonWhitelisted`: todo o campo aceite tem de estar no DTO.
- Cada método que escreve sobre recurso de outro utilizador chama `assertCanAccess` (`src/common/authz/ownership.ts`) antes do `update`/`delete`.
- Campos de texto antigos do `Position` (`requirements`, `requiredTraining`, `requiredExperience`) não se tocam.
- Formato de resposta existente de `simulateNextRole` mantém-se; só se acrescentam campos.
- Migration manual (`prisma migrate dev` falha aqui sem TTY): pasta de migration à mão + `npx prisma migrate deploy`.
- Backend: `npx prettier --write` nos ficheiros alterados. Frontend: sem prettier no CI, imitar o estilo (prettier só no ficheiro tocado). Sem `any` novo.
- Commits locais, Conventional Commits, com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Sem push/PR/CI.
- O frontend é um repositório git separado (`frontend/`): commits do frontend fazem-se dentro de `frontend/`.

## Review Focus

- Colaborador sem qualquer registo numa categoria → `NO_DATA` (nunca `NOT_MET`) e não baixa a nota. Teste: Task 2.
- Certificação externa expirada ou certificado da plataforma revogado/expirado não conta como cumprido. Teste: Task 2.
- Nomes com acentos/maiúsculas ("Inglês" vs "ingles", "AWS Cloud" vs "aws  cloud") combinam. Teste: Task 2.
- Cargo sem nenhum requisito estruturado: `simulateNextRole` comporta-se exactamente como hoje (score 100 sem competências, sem queries extra). Teste: Task 5.
- Colaborador A não lê nem escreve qualificações do colaborador B (404); RH/ADMIN sim. Teste: Task 4 e Task 6.
- Apagar um cargo/utilizador não deixa requisitos órfãos (`onDelete: Cascade`). Teste: Task 6.

---

## File Structure

| Ficheiro | Responsabilidade |
|---|---|
| `prisma/schema.prisma` | enums + 4 modelos novos + `User.priorExperienceYears` |
| `prisma/migrations/20261113000000_position_requirements/migration.sql` | DDL |
| `src/career/position-requirements.evaluator.ts` | **puro**: escalas, normalização, avaliação, cálculo do score |
| `src/career/position-requirements.dto.ts` | DTOs do CRUD de requisitos |
| `src/career/position-requirements.service.ts` | CRUD de `PositionRequirement` |
| `src/career/position-requirements.controller.ts` | `/career/positions/:positionId/requirements` |
| `src/career/career.service.ts` (modificar) | `simulateNextRole` usa o evaluator |
| `src/users/user-qualifications.dto.ts` | DTOs do perfil |
| `src/users/user-qualifications.service.ts` | CRUD de habilitações/idiomas/certificações + experiência |
| `src/users/user-qualifications.controller.ts` | `/users/:userId/qualifications|languages|certifications|experience` |
| `test/integration/career/position-requirements.integration-spec.ts` | integração contra Postgres real |
| `frontend/components/career/types.ts` (modificar) | tipos de requisitos e do simulador |
| `frontend/components/departments/PositionRequirementsPanel.tsx` | UI de configuração por cargo |
| `frontend/components/users/QualificationsTab.tsx` | UI do perfil do colaborador |
| `frontend/components/career/RequirementChecksPanel.tsx` | painel de requisitos no Simulador |

---

### Task 1: Schema e migration

**Files:**
- Modify: `prisma/schema.prisma` (modelos `Position` ~linha 1448 e `User` ~linha 632; acrescentar enums/modelos novos no fim do bloco de carreira, junto a `PositionCompetency` ~linha 3315)
- Create: `prisma/migrations/20261113000000_position_requirements/migration.sql`

**Interfaces:**
- Produces (Prisma client): `prisma.positionRequirement`, `prisma.userQualification`, `prisma.userLanguage`, `prisma.userExternalCertification`; enums `RequirementCategory`, `AcademicDegree`, `CefrLevel`; `User.priorExperienceYears: number | null`.

- [ ] **Step 1: Acrescentar enums e modelos ao `schema.prisma`**

Junto a `model PositionCompetency`:

```prisma
enum RequirementCategory {
  ACADEMIC
  EXPERIENCE
  LANGUAGE
  CERTIFICATION
}

enum AcademicDegree {
  TECNICO
  BACHARELATO
  LICENCIATURA
  POS_GRADUACAO
  MESTRADO
  DOUTORAMENTO
}

enum CefrLevel {
  A1
  A2
  B1
  B2
  C1
  C2
}

model PositionRequirement {
  id         Int                 @id @default(autoincrement())
  positionId Int
  category   RequirementCategory
  title      String
  level      String? // AcademicDegree (ACADEMIC) ou CefrLevel (LANGUAGE); validado no serviço
  minYears   Float? // só EXPERIENCE
  mandatory  Boolean             @default(true)
  notes      String?             @db.Text
  createdAt  DateTime            @default(now())
  position   Position            @relation(fields: [positionId], references: [id], onDelete: Cascade)

  @@index([positionId, category])
}

model UserQualification {
  id          Int            @id @default(autoincrement())
  userId      Int
  degree      AcademicDegree
  course      String
  institution String?
  year        Int?
  createdAt   DateTime       @default(now())
  user        User           @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model UserLanguage {
  id       Int       @id @default(autoincrement())
  userId   Int
  language String
  level    CefrLevel
  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, language])
}

model UserExternalCertification {
  id        Int       @id @default(autoincrement())
  userId    Int
  name      String
  issuer    String?
  issuedAt  DateTime?
  expiresAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

No `model Position` acrescentar (junto a `competencies PositionCompetency[]`):

```prisma
  requirementItems    PositionRequirement[]
```

No `model User`, na secção `// ─── RH / Carreira`, depois de `nib`:

```prisma
  priorExperienceYears Float? @default(0) // experiência profissional anterior à empresa
```

e, junto às relações do `User` (depois de `subordinates`):

```prisma
  qualifications          UserQualification[]
  languages               UserLanguage[]
  externalCertifications  UserExternalCertification[]
```

- [ ] **Step 2: Escrever a migration à mão**

`prisma/migrations/20261113000000_position_requirements/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "RequirementCategory" AS ENUM ('ACADEMIC', 'EXPERIENCE', 'LANGUAGE', 'CERTIFICATION');
CREATE TYPE "AcademicDegree" AS ENUM ('TECNICO', 'BACHARELATO', 'LICENCIATURA', 'POS_GRADUACAO', 'MESTRADO', 'DOUTORAMENTO');
CREATE TYPE "CefrLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "priorExperienceYears" DOUBLE PRECISION DEFAULT 0;

-- CreateTable
CREATE TABLE "PositionRequirement" (
    "id" SERIAL NOT NULL,
    "positionId" INTEGER NOT NULL,
    "category" "RequirementCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT,
    "minYears" DOUBLE PRECISION,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PositionRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserQualification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "degree" "AcademicDegree" NOT NULL,
    "course" TEXT NOT NULL,
    "institution" TEXT,
    "year" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserQualification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserLanguage" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "level" "CefrLevel" NOT NULL,
    CONSTRAINT "UserLanguage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserExternalCertification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserExternalCertification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PositionRequirement_positionId_category_idx" ON "PositionRequirement"("positionId", "category");
CREATE INDEX "UserQualification_userId_idx" ON "UserQualification"("userId");
CREATE UNIQUE INDEX "UserLanguage_userId_language_key" ON "UserLanguage"("userId", "language");
CREATE INDEX "UserExternalCertification_userId_idx" ON "UserExternalCertification"("userId");

-- AddForeignKey
ALTER TABLE "PositionRequirement" ADD CONSTRAINT "PositionRequirement_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserQualification" ADD CONSTRAINT "UserQualification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserLanguage" ADD CONSTRAINT "UserLanguage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserExternalCertification" ADD CONSTRAINT "UserExternalCertification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Aplicar e confirmar que migration e schema coincidem**

Run (da raiz do repo; confirmar a ligação à BD de desenvolvimento no `.env`):
```bash
npx prisma validate
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
```
Expected: `validate` OK; `migrate deploy` aplica `20261113000000_position_requirements`; `migrate status` → "Database schema is up to date!". Se `migrate deploy` falhar por drift de BD partilhada (ver memória `project_innova_prisma_migration_drift`), diagnosticar por branch antes de apagar nada.

Depois confirmar que o DDL escrito à mão não diverge do schema: `npx prisma migrate diff --help` para ver a sintaxe da versão instalada e correr um diff da BD actual para `prisma/schema.prisma` com `--exit-code`. Expected: sem diferenças.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261113000000_position_requirements
git commit -m "feat(career): schema de requisitos por cargo e qualificações do colaborador

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Evaluator puro (TDD)

**Files:**
- Create: `src/career/position-requirements.evaluator.ts`
- Test: `src/career/position-requirements.evaluator.spec.ts`

**Interfaces:**
- Produces (exports exactos usados nas Tasks 3 e 5):
  - `ACADEMIC_ORDER: readonly string[]`, `CEFR_ORDER: readonly string[]`
  - `normalizeText(s: string): string` — minúsculas, sem acentos, espaços colapsados
  - `type RequirementCategoryName = 'ACADEMIC' | 'EXPERIENCE' | 'LANGUAGE' | 'CERTIFICATION'`
  - `type RequirementStatus = 'MET' | 'NOT_MET' | 'NO_DATA'`
  - `interface RequirementInput { id: number; category: RequirementCategoryName; title: string; level: string | null; minYears: number | null; mandatory: boolean }`
  - `interface CandidateProfile { qualifications: Array<{ degree: string; course: string }>; languages: Array<{ language: string; level: string }>; externalCertifications: Array<{ name: string; expiresAt: Date | null }>; platformCertificates: Array<{ title: string | null; expiresAt: Date | null; revoked: boolean }>; priorExperienceYears: number | null; hireDate: Date | null; now: Date }`
  - `interface RequirementCheck { requirementId: number; category: RequirementCategoryName; title: string; mandatory: boolean; status: RequirementStatus; required: string; actual: string | null }`
  - `evaluateRequirement(req: RequirementInput, profile: CandidateProfile): RequirementCheck`
  - `evaluateRequirements(reqs: RequirementInput[], profile: CandidateProfile): RequirementCheck[]`
  - `computeReadiness(competencyMet: number, competencyTotal: number, checks: RequirementCheck[]): { readinessScore: number; optionalMet: number; optionalTotal: number; noData: number }`

- [ ] **Step 1: Escrever os testes que falham**

`src/career/position-requirements.evaluator.spec.ts`:

```ts
import {
  computeReadiness,
  evaluateRequirement,
  evaluateRequirements,
  normalizeText,
  type CandidateProfile,
  type RequirementInput,
} from './position-requirements.evaluator';

const NOW = new Date('2026-10-12T00:00:00Z');

function profile(over: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    qualifications: [],
    languages: [],
    externalCertifications: [],
    platformCertificates: [],
    priorExperienceYears: 0,
    hireDate: null,
    now: NOW,
    ...over,
  };
}

function req(over: Partial<RequirementInput>): RequirementInput {
  return {
    id: 1,
    category: 'ACADEMIC',
    title: 'x',
    level: null,
    minYears: null,
    mandatory: true,
    ...over,
  };
}

describe('normalizeText', () => {
  it('remove acentos, maiúsculas e espaços a mais', () => {
    expect(normalizeText('  Inglês   Técnico ')).toBe('ingles tecnico');
  });
});

describe('ACADEMIC', () => {
  const r = req({ category: 'ACADEMIC', title: 'Licenciatura em Informática', level: 'LICENCIATURA' });

  it('NO_DATA sem habilitações', () => {
    expect(evaluateRequirement(r, profile()).status).toBe('NO_DATA');
  });
  it('MET quando o grau mais alto é igual ou superior', () => {
    const p = profile({ qualifications: [{ degree: 'MESTRADO', course: 'Eng.' }] });
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('NOT_MET quando o grau mais alto é inferior', () => {
    const p = profile({ qualifications: [{ degree: 'BACHARELATO', course: 'Eng.' }] });
    const c = evaluateRequirement(r, p);
    expect(c.status).toBe('NOT_MET');
    expect(c.actual).toBe('BACHARELATO');
    expect(c.required).toBe('LICENCIATURA');
  });
  it('sem level exigido: qualquer habilitação cumpre', () => {
    const p = profile({ qualifications: [{ degree: 'TECNICO', course: 'x' }] });
    expect(evaluateRequirement({ ...r, level: null }, p).status).toBe('MET');
  });
});

describe('EXPERIENCE', () => {
  const r = req({ category: 'EXPERIENCE', title: 'Experiência na área', minYears: 3 });

  it('NO_DATA sem hireDate e sem experiência anterior', () => {
    expect(evaluateRequirement(r, profile()).status).toBe('NO_DATA');
  });
  it('soma experiência anterior e antiguidade', () => {
    const p = profile({ priorExperienceYears: 1.5, hireDate: new Date('2025-04-12T00:00:00Z') });
    // 1.5 + ~1.5 = ~3.0 → MET
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('NOT_MET quando o total é inferior ao mínimo', () => {
    const p = profile({ priorExperienceYears: 1, hireDate: new Date('2026-04-12T00:00:00Z') });
    const c = evaluateRequirement(r, p);
    expect(c.status).toBe('NOT_MET');
    expect(c.required).toBe('3 anos');
  });
});

describe('LANGUAGE', () => {
  const r = req({ category: 'LANGUAGE', title: 'Inglês', level: 'B2' });

  it('NO_DATA sem idiomas registados', () => {
    expect(evaluateRequirement(r, profile()).status).toBe('NO_DATA');
  });
  it('MET com nível igual ou superior (match sem acentos/maiúsculas)', () => {
    const p = profile({ languages: [{ language: 'ingles', level: 'C1' }] });
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('NOT_MET com nível inferior', () => {
    const p = profile({ languages: [{ language: 'Inglês', level: 'B1' }] });
    expect(evaluateRequirement(r, p).status).toBe('NOT_MET');
  });
  it('NOT_MET quando tem outros idiomas mas não este', () => {
    const p = profile({ languages: [{ language: 'Francês', level: 'C2' }] });
    expect(evaluateRequirement(r, p).status).toBe('NOT_MET');
  });
});

describe('CERTIFICATION', () => {
  const r = req({ category: 'CERTIFICATION', title: 'AWS Cloud' });

  it('NO_DATA sem nenhuma certificação', () => {
    expect(evaluateRequirement(r, profile()).status).toBe('NO_DATA');
  });
  it('MET por certificação externa válida (match normalizado)', () => {
    const p = profile({ externalCertifications: [{ name: 'aws  CLOUD', expiresAt: null }] });
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('externa expirada não conta', () => {
    const p = profile({
      externalCertifications: [{ name: 'AWS Cloud', expiresAt: new Date('2026-01-01T00:00:00Z') }],
    });
    expect(evaluateRequirement(r, p).status).toBe('NOT_MET');
  });
  it('certificado da plataforma conta; revogado ou expirado não', () => {
    const ok = profile({ platformCertificates: [{ title: 'AWS Cloud', expiresAt: null, revoked: false }] });
    const revoked = profile({ platformCertificates: [{ title: 'AWS Cloud', expiresAt: null, revoked: true }] });
    const expired = profile({
      platformCertificates: [{ title: 'AWS Cloud', expiresAt: new Date('2026-01-01T00:00:00Z'), revoked: false }],
    });
    expect(evaluateRequirement(r, ok).status).toBe('MET');
    expect(evaluateRequirement(r, revoked).status).toBe('NOT_MET');
    expect(evaluateRequirement(r, expired).status).toBe('NOT_MET');
  });
});

describe('computeReadiness', () => {
  const check = (status: 'MET' | 'NOT_MET' | 'NO_DATA', mandatory: boolean) => ({
    requirementId: 1,
    category: 'LANGUAGE' as const,
    title: 't',
    mandatory,
    status,
    required: 'r',
    actual: null,
  });

  it('sem competências nem requisitos devolve 100 (comportamento actual)', () => {
    expect(computeReadiness(0, 0, []).readinessScore).toBe(100);
  });
  it('soma competências cumpridas e requisitos obrigatórios com dados', () => {
    const r = computeReadiness(2, 4, [check('MET', true), check('NOT_MET', true)]);
    // (2 + 1) / (4 + 2) = 50%
    expect(r.readinessScore).toBe(50);
  });
  it('NO_DATA e diferenciais não baixam a nota, mas são contados à parte', () => {
    const r = computeReadiness(1, 1, [
      check('NO_DATA', true),
      check('NOT_MET', false),
      check('MET', false),
    ]);
    expect(r.readinessScore).toBe(100);
    expect(r.noData).toBe(1);
    expect(r.optionalTotal).toBe(2);
    expect(r.optionalMet).toBe(1);
  });
});

describe('evaluateRequirements', () => {
  it('preserva a ordem e devolve um check por requisito', () => {
    const out = evaluateRequirements([req({ id: 5 }), req({ id: 6 })], profile());
    expect(out.map((c) => c.requirementId)).toEqual([5, 6]);
  });
});
```

- [ ] **Step 2: Correr e ver falhar**

Run: `npx jest src/career/position-requirements.evaluator.spec.ts`
Expected: FAIL — "Cannot find module './position-requirements.evaluator'".

- [ ] **Step 3: Implementar o evaluator**

`src/career/position-requirements.evaluator.ts`:

```ts
// Lógica pura de comparação colaborador ↔ requisitos do cargo. Sem Prisma, sem
// Nest — recebe dados já carregados e devolve um check por requisito.

export const ACADEMIC_ORDER = [
  'TECNICO',
  'BACHARELATO',
  'LICENCIATURA',
  'POS_GRADUACAO',
  'MESTRADO',
  'DOUTORAMENTO',
] as const;

export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type RequirementCategoryName = 'ACADEMIC' | 'EXPERIENCE' | 'LANGUAGE' | 'CERTIFICATION';
export type RequirementStatus = 'MET' | 'NOT_MET' | 'NO_DATA';

export interface RequirementInput {
  id: number;
  category: RequirementCategoryName;
  title: string;
  level: string | null;
  minYears: number | null;
  mandatory: boolean;
}

export interface CandidateProfile {
  qualifications: Array<{ degree: string; course: string }>;
  languages: Array<{ language: string; level: string }>;
  externalCertifications: Array<{ name: string; expiresAt: Date | null }>;
  platformCertificates: Array<{ title: string | null; expiresAt: Date | null; revoked: boolean }>;
  priorExperienceYears: number | null;
  hireDate: Date | null;
  now: Date;
}

export interface RequirementCheck {
  requirementId: number;
  category: RequirementCategoryName;
  title: string;
  mandatory: boolean;
  status: RequirementStatus;
  required: string;
  actual: string | null;
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function rank(order: readonly string[], value: string): number {
  return order.indexOf(value);
}

function isValid(expiresAt: Date | null, now: Date): boolean {
  return !expiresAt || expiresAt.getTime() > now.getTime();
}

function base(req: RequirementInput) {
  return {
    requirementId: req.id,
    category: req.category,
    title: req.title,
    mandatory: req.mandatory,
  };
}

function evalAcademic(req: RequirementInput, p: CandidateProfile): RequirementCheck {
  const required = req.level ?? 'Qualquer habilitação';
  if (p.qualifications.length === 0) {
    return { ...base(req), status: 'NO_DATA', required, actual: null };
  }
  const best = p.qualifications.reduce((a, b) =>
    rank(ACADEMIC_ORDER, b.degree) > rank(ACADEMIC_ORDER, a.degree) ? b : a,
  );
  const met = req.level === null || rank(ACADEMIC_ORDER, best.degree) >= rank(ACADEMIC_ORDER, req.level);
  return { ...base(req), status: met ? 'MET' : 'NOT_MET', required, actual: best.degree };
}

function evalExperience(req: RequirementInput, p: CandidateProfile): RequirementCheck {
  const min = req.minYears ?? 0;
  const required = `${min} anos`;
  const prior = p.priorExperienceYears ?? 0;
  if (!p.hireDate && prior === 0) {
    return { ...base(req), status: 'NO_DATA', required, actual: null };
  }
  const tenure = p.hireDate ? Math.max(0, (p.now.getTime() - p.hireDate.getTime()) / MS_PER_YEAR) : 0;
  const total = Math.round((prior + tenure) * 10) / 10;
  return {
    ...base(req),
    status: total >= min ? 'MET' : 'NOT_MET',
    required,
    actual: `${total} anos`,
  };
}

function evalLanguage(req: RequirementInput, p: CandidateProfile): RequirementCheck {
  const required = req.level ? `${req.title} ${req.level}` : req.title;
  if (p.languages.length === 0) {
    return { ...base(req), status: 'NO_DATA', required, actual: null };
  }
  const found = p.languages.find((l) => normalizeText(l.language) === normalizeText(req.title));
  if (!found) return { ...base(req), status: 'NOT_MET', required, actual: null };
  const met = req.level === null || rank(CEFR_ORDER, found.level) >= rank(CEFR_ORDER, req.level);
  return {
    ...base(req),
    status: met ? 'MET' : 'NOT_MET',
    required,
    actual: `${found.language} ${found.level}`,
  };
}

function evalCertification(req: RequirementInput, p: CandidateProfile): RequirementCheck {
  const required = req.title;
  if (p.externalCertifications.length === 0 && p.platformCertificates.length === 0) {
    return { ...base(req), status: 'NO_DATA', required, actual: null };
  }
  const wanted = normalizeText(req.title);
  const external = p.externalCertifications.find(
    (c) => normalizeText(c.name) === wanted && isValid(c.expiresAt, p.now),
  );
  if (external) return { ...base(req), status: 'MET', required, actual: external.name };
  const platform = p.platformCertificates.find(
    (c) => c.title !== null && normalizeText(c.title) === wanted && !c.revoked && isValid(c.expiresAt, p.now),
  );
  if (platform) return { ...base(req), status: 'MET', required, actual: platform.title };
  return { ...base(req), status: 'NOT_MET', required, actual: null };
}

export function evaluateRequirement(req: RequirementInput, profile: CandidateProfile): RequirementCheck {
  switch (req.category) {
    case 'ACADEMIC':
      return evalAcademic(req, profile);
    case 'EXPERIENCE':
      return evalExperience(req, profile);
    case 'LANGUAGE':
      return evalLanguage(req, profile);
    case 'CERTIFICATION':
      return evalCertification(req, profile);
  }
}

export function evaluateRequirements(reqs: RequirementInput[], profile: CandidateProfile): RequirementCheck[] {
  return reqs.map((r) => evaluateRequirement(r, profile));
}

// Score = (competências cumpridas + requisitos obrigatórios cumpridos) /
// (competências + requisitos obrigatórios com dados). Diferenciais e NO_DATA
// ficam fora da nota e são contados à parte.
export function computeReadiness(
  competencyMet: number,
  competencyTotal: number,
  checks: RequirementCheck[],
): { readinessScore: number; optionalMet: number; optionalTotal: number; noData: number } {
  const scored = checks.filter((c) => c.mandatory && c.status !== 'NO_DATA');
  const metMandatory = scored.filter((c) => c.status === 'MET').length;
  const denominator = competencyTotal + scored.length;
  const optional = checks.filter((c) => !c.mandatory && c.status !== 'NO_DATA');
  return {
    readinessScore: denominator > 0 ? Math.round(((competencyMet + metMandatory) / denominator) * 100) : 100,
    optionalMet: optional.filter((c) => c.status === 'MET').length,
    optionalTotal: optional.length,
    noData: checks.filter((c) => c.status === 'NO_DATA').length,
  };
}
```

Nota para o teste "NO_DATA e diferenciais não baixam a nota": o check `NOT_MET`/`MET` diferenciais contam em `optionalTotal` (2) e `optionalMet` (1) — `NO_DATA` obrigatório conta só em `noData`.

- [ ] **Step 4: Correr e ver passar**

Run: `npx jest src/career/position-requirements.evaluator.spec.ts`
Expected: PASS (todos os testes).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/career/position-requirements.evaluator.ts src/career/position-requirements.evaluator.spec.ts
git add src/career/position-requirements.evaluator.ts src/career/position-requirements.evaluator.spec.ts
git commit -m "feat(career): evaluator puro de requisitos de cargo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: CRUD de requisitos do cargo

**Files:**
- Create: `src/career/position-requirements.dto.ts`, `src/career/position-requirements.service.ts`, `src/career/position-requirements.controller.ts`
- Modify: `src/career/career.module.ts` (registar provider e controller)
- Test: `src/career/position-requirements.service.spec.ts`

**Interfaces:**
- Consumes: `ACADEMIC_ORDER`, `CEFR_ORDER` (Task 2); `prisma.positionRequirement` (Task 1).
- Produces: `PositionRequirementsService` com `list(positionId: number)`, `create(positionId: number, dto: CreatePositionRequirementDto)`, `update(positionId: number, reqId: number, dto: UpdatePositionRequirementDto)`, `remove(positionId: number, reqId: number)`; rotas `GET|POST /career/positions/:positionId/requirements`, `PUT|DELETE /career/positions/:positionId/requirements/:reqId` (escrita: ADMIN, RH, GESTOR; leitura: autenticados).

- [ ] **Step 1: DTOs**

`src/career/position-requirements.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { RequirementCategory } from '@prisma/client';

export class CreatePositionRequirementDto {
  @ApiProperty({ enum: RequirementCategory })
  @IsEnum(RequirementCategory)
  category!: RequirementCategory;

  @ApiProperty({ description: 'Curso, idioma ou certificação' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Grau académico (ACADEMIC) ou nível CEFR (LANGUAGE)' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ description: 'Anos mínimos (EXPERIENCE)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  minYears?: number;

  @ApiPropertyOptional({ description: 'Obrigatório (true) ou diferencial (false)', default: true })
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdatePositionRequirementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  minYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
```

- [ ] **Step 2: Teste do serviço (falha)**

`src/career/position-requirements.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PositionRequirementsService } from './position-requirements.service';

function makeService(over: Record<string, unknown> = {}) {
  const prisma: any = {
    position: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
    positionRequirement: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 9, positionId: 1, category: 'LANGUAGE' }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 9, ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 9, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    ...over,
  };
  Object.defineProperty(prisma, 'read', { get: () => prisma, configurable: true });
  return { service: new PositionRequirementsService(prisma), prisma };
}

describe('PositionRequirementsService', () => {
  it('create: rejeita nível académico inválido', async () => {
    const { service } = makeService();
    await expect(
      service.create(1, { category: 'ACADEMIC', title: 'Informática', level: 'ENSINO_MEDIO' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('create: rejeita nível CEFR inválido', async () => {
    const { service } = makeService();
    await expect(
      service.create(1, { category: 'LANGUAGE', title: 'Inglês', level: 'FLUENTE' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('create: EXPERIENCE exige minYears', async () => {
    const { service } = makeService();
    await expect(
      service.create(1, { category: 'EXPERIENCE', title: 'Experiência' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('create: persiste com mandatory=true por omissão', async () => {
    const { service, prisma } = makeService();
    await service.create(1, { category: 'LANGUAGE', title: 'Inglês', level: 'B2' } as any);
    expect(prisma.positionRequirement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ positionId: 1, category: 'LANGUAGE', level: 'B2', mandatory: true }),
    });
  });

  it('create: 404 se o cargo não existe', async () => {
    const { service } = makeService({ position: { findUnique: jest.fn().mockResolvedValue(null) } });
    await expect(service.create(99, { category: 'CERTIFICATION', title: 'AWS' } as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update: 404 se o requisito não pertence ao cargo', async () => {
    const { service, prisma } = makeService();
    prisma.positionRequirement.findFirst.mockResolvedValue(null);
    await expect(service.update(1, 9, { title: 'x2' })).rejects.toThrow(NotFoundException);
  });

  it('update: valida o nível contra a categoria existente', async () => {
    const { service } = makeService();
    await expect(service.update(1, 9, { level: 'MESTRADO' })).rejects.toThrow(BadRequestException);
  });

  it('remove: apaga o requisito do cargo', async () => {
    const { service, prisma } = makeService();
    await expect(service.remove(1, 9)).resolves.toEqual({ id: 9, deleted: true });
    expect(prisma.positionRequirement.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });
});
```

Run: `npx jest src/career/position-requirements.service.spec.ts` → Expected: FAIL (módulo não existe).

- [ ] **Step 3: Serviço**

`src/career/position-requirements.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACADEMIC_ORDER, CEFR_ORDER } from './position-requirements.evaluator';
import { CreatePositionRequirementDto, UpdatePositionRequirementDto } from './position-requirements.dto';

type Category = 'ACADEMIC' | 'EXPERIENCE' | 'LANGUAGE' | 'CERTIFICATION';

function assertLevel(category: Category, level: string | undefined | null): void {
  if (level === undefined || level === null) return;
  if (category === 'ACADEMIC' && !(ACADEMIC_ORDER as readonly string[]).includes(level)) {
    throw new BadRequestException(`Nível académico inválido: ${level}`);
  }
  if (category === 'LANGUAGE' && !(CEFR_ORDER as readonly string[]).includes(level)) {
    throw new BadRequestException(`Nível de idioma inválido: ${level} (use A1–C2)`);
  }
}

@Injectable()
export class PositionRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  list(positionId: number) {
    return this.prisma.read.positionRequirement.findMany({
      where: { positionId },
      orderBy: [{ category: 'asc' }, { id: 'asc' }],
    });
  }

  async create(positionId: number, dto: CreatePositionRequirementDto) {
    const position = await this.prisma.read.position.findUnique({ where: { id: positionId } });
    if (!position) throw new NotFoundException('Cargo não encontrado');
    assertLevel(dto.category, dto.level);
    if (dto.category === 'EXPERIENCE' && dto.minYears === undefined) {
      throw new BadRequestException('Experiência exige minYears');
    }
    return this.prisma.positionRequirement.create({
      data: {
        positionId,
        category: dto.category,
        title: dto.title,
        level: dto.level ?? null,
        minYears: dto.minYears ?? null,
        mandatory: dto.mandatory ?? true,
        notes: dto.notes ?? null,
      },
    });
  }

  private async findOwned(positionId: number, reqId: number) {
    const existing = await this.prisma.read.positionRequirement.findFirst({
      where: { id: reqId, positionId },
    });
    if (!existing) throw new NotFoundException('Requisito não encontrado');
    return existing;
  }

  async update(positionId: number, reqId: number, dto: UpdatePositionRequirementDto) {
    const existing = await this.findOwned(positionId, reqId);
    assertLevel(existing.category as Category, dto.level);
    return this.prisma.positionRequirement.update({ where: { id: reqId }, data: dto });
  }

  async remove(positionId: number, reqId: number) {
    await this.findOwned(positionId, reqId);
    await this.prisma.positionRequirement.delete({ where: { id: reqId } });
    return { id: reqId, deleted: true };
  }
}
```

- [ ] **Step 4: Controller e registo no módulo**

`src/career/position-requirements.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { PositionRequirementsService } from './position-requirements.service';
import { CreatePositionRequirementDto, UpdatePositionRequirementDto } from './position-requirements.dto';
```

Copiar para este controller exactamente os decorators de classe (`@ApiTags`, `@ApiBearerAuth`, `@UseGuards(...)`) que `CareerController` usa em `src/career/career.controller.ts:43` (`@Controller('career')`), mudando só o prefixo para `@Controller('career/positions/:positionId/requirements')`. Depois:

```ts
export class PositionRequirementsController {
  constructor(private readonly svc: PositionRequirementsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar requisitos estruturados do cargo' })
  list(@Param('positionId', ParseIntPipe) positionId: number) {
    return this.svc.list(positionId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar requisito ao cargo' })
  create(@Param('positionId', ParseIntPipe) positionId: number, @Body() dto: CreatePositionRequirementDto) {
    return this.svc.create(positionId, dto);
  }

  @Put(':reqId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar requisito do cargo' })
  update(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Param('reqId', ParseIntPipe) reqId: number,
    @Body() dto: UpdatePositionRequirementDto,
  ) {
    return this.svc.update(positionId, reqId, dto);
  }

  @Delete(':reqId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Apagar requisito do cargo' })
  remove(@Param('positionId', ParseIntPipe) positionId: number, @Param('reqId', ParseIntPipe) reqId: number) {
    return this.svc.remove(positionId, reqId);
  }
}
```

(com `@Controller(...)` e os decorators de classe antes de `export class`.)

Em `src/career/career.module.ts` acrescentar `PositionRequirementsService` a `providers` (e `exports`) e `PositionRequirementsController` a `controllers`, com os imports correspondentes.

- [ ] **Step 5: Correr testes e typecheck**

Run: `npx jest src/career/position-requirements && npx tsc --noEmit`
Expected: PASS, sem erros de tipos.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/career/position-requirements.*.ts src/career/career.module.ts
git add src/career
git commit -m "feat(career): CRUD de requisitos estruturados por cargo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Perfil — habilitações, idiomas, certificações e experiência

**Files:**
- Create: `src/users/user-qualifications.dto.ts`, `src/users/user-qualifications.service.ts`, `src/users/user-qualifications.controller.ts`
- Modify: `src/users/users.module.ts` (provider + controller)
- Test: `src/users/user-qualifications.service.spec.ts`

**Interfaces:**
- Consumes: `assertCanAccess`, `isPrivileged` (`src/common/authz/ownership.ts`), `Role` (`src/auth/enums/role.enum`), `CurrentUserData` (`src/common/types/current-user`).
- Produces: `UserQualificationsService` com
  - `getProfile(userId: number, user: CurrentUserData)` → `{ qualifications, languages, certifications, priorExperienceYears }`
  - `addQualification(userId, dto, user)`, `updateQualification(userId, id, dto, user)`, `removeQualification(userId, id, user)` — idem `Language` (upsert por `[userId, language]` no add) e `Certification`
  - `setExperience(userId, years: number, user)`
  - Rotas: `GET /users/:userId/qualifications` (devolve o perfil completo), `POST|PUT|DELETE /users/:userId/qualifications[/:id]`, idem `languages` e `certifications`, `PATCH /users/:userId/experience`.
  - Privilegiados: `Role.ADMIN`, `Role.RH`. Dono do recurso: o próprio utilizador.

- [ ] **Step 1: DTOs**

`src/users/user-qualifications.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AcademicDegree, CefrLevel } from '@prisma/client';

export class QualificationDto {
  @ApiProperty({ enum: AcademicDegree })
  @IsEnum(AcademicDegree)
  degree!: AcademicDegree;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  course!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  institution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1950)
  @Max(2100)
  year?: number;
}

export class LanguageDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  language!: string;

  @ApiProperty({ enum: CefrLevel })
  @IsEnum(CefrLevel)
  level!: CefrLevel;
}

export class ExternalCertificationDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ExperienceDto {
  @ApiProperty({ description: 'Anos de experiência profissional anterior à empresa' })
  @IsNumber()
  @Min(0)
  @Max(60)
  priorExperienceYears!: number;
}
```

- [ ] **Step 2: Testes do serviço (falham)**

`src/users/user-qualifications.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { UserQualificationsService } from './user-qualifications.service';

const owner = { id: 7, role: { name: 'COLABORADOR' } } as any;
const other = { id: 8, role: { name: 'COLABORADOR' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

function makeService() {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 7 }), update: jest.fn().mockResolvedValue({}) },
    userQualification: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 3, userId: 7 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 3, ...data })),
      update: jest.fn().mockResolvedValue({ id: 3 }),
      delete: jest.fn().mockResolvedValue({}),
    },
    userLanguage: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 4, ...create })),
      findUnique: jest.fn().mockResolvedValue({ id: 4, userId: 7 }),
      delete: jest.fn().mockResolvedValue({}),
    },
    userExternalCertification: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ id: 5, userId: 7 }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 5, ...data })),
      update: jest.fn().mockResolvedValue({ id: 5 }),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  Object.defineProperty(prisma, 'read', { get: () => prisma, configurable: true });
  return { service: new UserQualificationsService(prisma), prisma };
}

describe('UserQualificationsService — ownership', () => {
  it('o próprio utilizador adiciona habilitação', async () => {
    const { service, prisma } = makeService();
    await service.addQualification(7, { degree: 'LICENCIATURA', course: 'Informática' } as any, owner);
    expect(prisma.userQualification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 7, degree: 'LICENCIATURA' }),
    });
  });

  it('RH adiciona habilitação a outro utilizador', async () => {
    const { service } = makeService();
    await expect(
      service.addQualification(7, { degree: 'MESTRADO', course: 'Gestão' } as any, rh),
    ).resolves.toBeDefined();
  });

  it('outro colaborador não escreve no perfil alheio (404, sem create)', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.addQualification(7, { degree: 'MESTRADO', course: 'Gestão' } as any, other),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.userQualification.create).not.toHaveBeenCalled();
  });

  it('outro colaborador não lê o perfil alheio', async () => {
    const { service } = makeService();
    await expect(service.getProfile(7, other)).rejects.toThrow(NotFoundException);
  });

  it('removeQualification: um item de outro utilizador não é apagado através de /users/:userId alheio', async () => {
    const { service, prisma } = makeService();
    // item 3 pertence ao utilizador 7; pedido feito em nome do utilizador 8
    prisma.userQualification.findUnique.mockResolvedValue({ id: 3, userId: 7 });
    await expect(service.removeQualification(8, 3, other)).rejects.toThrow(NotFoundException);
    expect(prisma.userQualification.delete).not.toHaveBeenCalled();
  });

  it('removeQualification: o dono apaga o seu item', async () => {
    const { service, prisma } = makeService();
    await expect(service.removeQualification(7, 3, owner)).resolves.toEqual({ id: 3, deleted: true });
    expect(prisma.userQualification.delete).toHaveBeenCalledWith({ where: { id: 3 } });
  });

  it('addLanguage faz upsert por [userId, language]', async () => {
    const { service, prisma } = makeService();
    await service.addLanguage(7, { language: 'Inglês', level: 'B2' } as any, owner);
    expect(prisma.userLanguage.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_language: { userId: 7, language: 'Inglês' } } }),
    );
  });

  it('setExperience: só dono/RH', async () => {
    const { service, prisma } = makeService();
    await expect(service.setExperience(7, 4, other)).rejects.toThrow(NotFoundException);
    await service.setExperience(7, 4, owner);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { priorExperienceYears: 4 } });
  });
});
```

Run: `npx jest src/users/user-qualifications.service.spec.ts` → Expected: FAIL (módulo não existe).

- [ ] **Step 3: Serviço**

`src/users/user-qualifications.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { ExternalCertificationDto, LanguageDto, QualificationDto } from './user-qualifications.dto';

const PRIVILEGED = [Role.ADMIN, Role.RH];

@Injectable()
export class UserQualificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Pedido ao perfil de `userId`: só o próprio ou ADMIN/RH.
  private guardUser(userId: number, user: CurrentUserData): void {
    assertCanAccess(true, userId, user, PRIVILEGED);
  }

  // Item pertence a `userId` do URL *e* o chamador pode aceder a esse perfil —
  // impede apagar o item de B pedindo /users/A/qualifications/<id de B>.
  private guardItem<T extends { userId: number }>(item: T | null, userId: number, user: CurrentUserData): T {
    assertCanAccess(item, userId, user, PRIVILEGED);
    if (item.userId !== userId) throw new NotFoundException('Recurso não encontrado');
    return item;
  }

  async getProfile(userId: number, user: CurrentUserData) {
    this.guardUser(userId, user);
    const [qualifications, languages, certifications, owner] = await Promise.all([
      this.prisma.read.userQualification.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      this.prisma.read.userLanguage.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      this.prisma.read.userExternalCertification.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      this.prisma.read.user.findUnique({ where: { id: userId }, select: { priorExperienceYears: true } }),
    ]);
    return {
      qualifications,
      languages,
      certifications,
      priorExperienceYears: owner?.priorExperienceYears ?? 0,
    };
  }

  // ── Habilitações ──
  async addQualification(userId: number, dto: QualificationDto, user: CurrentUserData) {
    this.guardUser(userId, user);
    return this.prisma.userQualification.create({ data: { userId, ...dto } });
  }

  async updateQualification(userId: number, id: number, dto: QualificationDto, user: CurrentUserData) {
    this.guardItem(await this.prisma.read.userQualification.findUnique({ where: { id } }), userId, user);
    return this.prisma.userQualification.update({ where: { id }, data: dto });
  }

  async removeQualification(userId: number, id: number, user: CurrentUserData) {
    this.guardItem(await this.prisma.read.userQualification.findUnique({ where: { id } }), userId, user);
    await this.prisma.userQualification.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ── Idiomas ──
  async addLanguage(userId: number, dto: LanguageDto, user: CurrentUserData) {
    this.guardUser(userId, user);
    return this.prisma.userLanguage.upsert({
      where: { userId_language: { userId, language: dto.language } },
      update: { level: dto.level },
      create: { userId, language: dto.language, level: dto.level },
    });
  }

  async removeLanguage(userId: number, id: number, user: CurrentUserData) {
    this.guardItem(await this.prisma.read.userLanguage.findUnique({ where: { id } }), userId, user);
    await this.prisma.userLanguage.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ── Certificações externas ──
  private certData(dto: ExternalCertificationDto) {
    return {
      name: dto.name,
      issuer: dto.issuer ?? null,
      issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    };
  }

  async addCertification(userId: number, dto: ExternalCertificationDto, user: CurrentUserData) {
    this.guardUser(userId, user);
    return this.prisma.userExternalCertification.create({ data: { userId, ...this.certData(dto) } });
  }

  async updateCertification(userId: number, id: number, dto: ExternalCertificationDto, user: CurrentUserData) {
    this.guardItem(await this.prisma.read.userExternalCertification.findUnique({ where: { id } }), userId, user);
    return this.prisma.userExternalCertification.update({ where: { id }, data: this.certData(dto) });
  }

  async removeCertification(userId: number, id: number, user: CurrentUserData) {
    this.guardItem(await this.prisma.read.userExternalCertification.findUnique({ where: { id } }), userId, user);
    await this.prisma.userExternalCertification.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ── Experiência anterior ──
  async setExperience(userId: number, years: number, user: CurrentUserData) {
    this.guardUser(userId, user);
    await this.prisma.user.update({ where: { id: userId }, data: { priorExperienceYears: years } });
    return { userId, priorExperienceYears: years };
  }
}
```

- [ ] **Step 4: Controller e registo**

`src/users/user-qualifications.controller.ts` — `@Controller('users/:userId')`, mesmos decorators de classe que `UsersController` (`src/users/users.controller.ts:38`, copiar `@ApiTags/@ApiBearerAuth/@UseGuards`). Cada método recebe `@CurrentUser() user: CurrentUserData` (`import { CurrentUser, CurrentUserData } from '../common/decorators'`) e `@Param('userId', ParseIntPipe) userId: number`; **sem** `@Roles` (a autorização é por dono/ADMIN/RH no serviço):

```ts
@Get('qualifications')            getProfile(...)            -> svc.getProfile(userId, user)
@Post('qualifications')           addQualification(@Body() dto: QualificationDto, ...)
@Put('qualifications/:id')        updateQualification(@Param('id', ParseIntPipe) id, @Body() dto: QualificationDto, ...)
@Delete('qualifications/:id')     removeQualification(...)
@Post('languages')                addLanguage(@Body() dto: LanguageDto, ...)
@Delete('languages/:id')          removeLanguage(...)
@Post('certifications')           addCertification(@Body() dto: ExternalCertificationDto, ...)
@Put('certifications/:id')        updateCertification(...)
@Delete('certifications/:id')     removeCertification(...)
@Patch('experience')              setExperience(@Body() dto: ExperienceDto, ...) -> svc.setExperience(userId, dto.priorExperienceYears, user)
```

Em `src/users/users.module.ts` acrescentar `UserQualificationsService` a `providers` e `UserQualificationsController` a `controllers`.

Verificar colisão de rotas com `UsersController`: `grep -n "':id/\|':userId/" src/users/users.controller.ts` — se existir `@Get(':id/qualifications')` ou equivalente, renomear o novo path; caso contrário seguir.

- [ ] **Step 5: Testes e typecheck**

Run: `npx jest src/users/user-qualifications && npx tsc --noEmit`
Expected: PASS, sem erros.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/users/user-qualifications.*.ts src/users/users.module.ts
git add src/users
git commit -m "feat(users): habilitações, idiomas, certificações externas e experiência no perfil

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Simulador usa os requisitos

**Files:**
- Modify: `src/career/career.service.ts` (`simulateNextRole`, ~linhas 198–283)
- Test: `src/career/career.service.additional.spec.ts` (acrescentar `describe('simulateNextRole — requisitos')`; acrescentar `positionRequirement`, `userQualification`, `userLanguage`, `userExternalCertification`, `certificate` ao `mockPrisma` se faltarem)

**Interfaces:**
- Consumes: `evaluateRequirements`, `computeReadiness`, `RequirementInput`, `CandidateProfile` (Task 2); `Position.requirementItems` (Task 1).
- Produces: resposta de `simulateNextRole` com `requirementChecks: RequirementCheck[]` e `summary.optionalMet/optionalTotal/noData`; `readinessScore` calculado por `computeReadiness`.

- [ ] **Step 1: Teste (falha)**

Acrescentar a `src/career/career.service.additional.spec.ts`:

```ts
describe('simulateNextRole — requisitos estruturados', () => {
  const position = (items: unknown[]) => ({
    id: 5,
    name: 'Dev Senior',
    level: 'SENIOR',
    competencies: [],
    requirementItems: items,
  });

  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({
      positionId: 1,
      hireDate: new Date('2024-10-12T00:00:00Z'),
      priorExperienceYears: 1,
    });
    mockPrisma.position.findUnique.mockResolvedValue(position([]));
    mockPrisma.userCompetency.findMany.mockResolvedValue([]);
    mockPrisma.enrollment.findMany.mockResolvedValue([]);
    mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: null } });
    (mockPrisma as any).userQualification = { findMany: jest.fn().mockResolvedValue([]) };
    (mockPrisma as any).userLanguage = { findMany: jest.fn().mockResolvedValue([]) };
    (mockPrisma as any).userExternalCertification = { findMany: jest.fn().mockResolvedValue([]) };
    (mockPrisma as any).certificate = { findMany: jest.fn().mockResolvedValue([]) };
  });

  it('cargo sem requisitos: não consulta o perfil e mantém o comportamento actual', async () => {
    const r = await service.simulateNextRole(1, 5);
    expect(r.readinessScore).toBe(100);
    expect(r.requirementChecks).toEqual([]);
    expect((mockPrisma as any).userQualification.findMany).not.toHaveBeenCalled();
  });

  it('devolve checks e inclui requisitos obrigatórios no score', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(
      position([
        { id: 1, category: 'LANGUAGE', title: 'Inglês', level: 'B2', minYears: null, mandatory: true },
        { id: 2, category: 'EXPERIENCE', title: 'Exp', level: null, minYears: 2, mandatory: true },
      ]),
    );
    (mockPrisma as any).userLanguage.findMany.mockResolvedValue([{ language: 'Inglês', level: 'C1' }]);
    const r = await service.simulateNextRole(1, 5);
    expect(r.requirementChecks.map((c: any) => [c.category, c.status])).toEqual([
      ['LANGUAGE', 'MET'],
      ['EXPERIENCE', 'MET'], // 1 ano anterior + ~2 anos de casa >= 2
    ]);
    expect(r.readinessScore).toBe(100);
    expect(r.summary.noData).toBe(0);
  });

  it('requisito sem dados do colaborador fica NO_DATA e não baixa a nota', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(
      position([{ id: 3, category: 'ACADEMIC', title: 'Licenciatura', level: 'LICENCIATURA', minYears: null, mandatory: true }]),
    );
    const r = await service.simulateNextRole(1, 5);
    expect(r.requirementChecks[0].status).toBe('NO_DATA');
    expect(r.readinessScore).toBe(100);
    expect(r.summary.noData).toBe(1);
  });
});
```

Run: `npx jest src/career/career.service.additional.spec.ts -t "requisitos estruturados"` → Expected: FAIL (`requirementChecks` undefined).

- [ ] **Step 2: Implementar em `simulateNextRole`**

No topo de `career.service.ts` acrescentar:

```ts
import {
  computeReadiness,
  evaluateRequirements,
  type CandidateProfile,
  type RequirementInput,
} from './position-requirements.evaluator';
```

Em `simulateNextRole`: (a) mudar o `select` do user para `{ positionId: true, hireDate: true, priorExperienceYears: true }`; (b) mudar o `include` da posição para `{ competencies: { include: { competency: true } }, requirementItems: true }`; (c) depois de calculado `competencyGaps` e `metCount`, substituir o cálculo de `readinessScore`/`summary` por:

```ts
    const requirementItems: RequirementInput[] = (targetPosition.requirementItems ?? []).map(r => ({
      id: r.id,
      category: r.category,
      title: r.title,
      level: r.level,
      minYears: r.minYears,
      mandatory: r.mandatory,
    }));

    // Só consulta o perfil quando há requisitos estruturados a avaliar.
    let requirementChecks: ReturnType<typeof evaluateRequirements> = [];
    if (requirementItems.length > 0) {
      const [qualifications, languages, externalCertifications, platformCertificates] = await Promise.all([
        this.prisma.read.userQualification.findMany({ where: { userId } }),
        this.prisma.read.userLanguage.findMany({ where: { userId } }),
        this.prisma.read.userExternalCertification.findMany({ where: { userId } }),
        this.prisma.read.certificate.findMany({
          where: { userId, revoked: false },
          select: { title: true, expiresAt: true, revoked: true },
        }),
      ]);
      const profile: CandidateProfile = {
        qualifications,
        languages,
        externalCertifications,
        platformCertificates,
        priorExperienceYears: user.priorExperienceYears ?? 0,
        hireDate: user.hireDate,
        now: new Date(),
      };
      requirementChecks = evaluateRequirements(requirementItems, profile);
    }

    const totalReqs = competencyGaps.length;
    const { readinessScore, optionalMet, optionalTotal, noData } = computeReadiness(
      metCount,
      totalReqs,
      requirementChecks,
    );
```

e na resposta: manter `readinessScore`, `competencyGaps`, acrescentar `requirementChecks`, e em `summary` acrescentar `optionalMet, optionalTotal, noData`. Manter `totalRequirements: totalReqs`, `requirementsMet: metCount`, `requirementsGap`, `ready: readinessScore >= 80` e `estimatedTimeMonths` com a mesma fórmula. Remover as variáveis antigas `totalReqs`/`readinessScore` duplicadas (declaradas uma única vez).

- [ ] **Step 3: Testes**

Run: `npx jest src/career && npx tsc --noEmit`
Expected: todos passam (incluindo os testes existentes de `simulateNextRole`).

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/career/career.service.ts src/career/career.service.additional.spec.ts
git add src/career
git commit -m "feat(career): simulador avalia requisitos estruturados do cargo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Teste de integração (Postgres real)

**Files:**
- Create: `test/integration/career/position-requirements.integration-spec.ts`

**Interfaces:**
- Consumes: rotas das Tasks 3, 4 e 5; `getToken`, `INT_CREDENTIALS` (`test/integration/helpers/auth.helper`); estrutura de bootstrap igual a `test/integration/career-plans/career-plans.integration-spec.ts` (AppModule, ValidationPipe com `whitelist/forbidNonWhitelisted/transform/enableImplicitConversion`, `PrismaClient` com `PrismaPg` em `postgresql://postgres:postgres@127.0.0.1:5432/innova_test`).

- [ ] **Step 1: Escrever o spec**

Copiar o `beforeAll` de `test/integration/career-plans/career-plans.integration-spec.ts` (app + tokens `employee`, `rh`, `manager`) e criar, via `prisma` directo, um `Position` de teste (`name: 'INT Req Position'`) e um segundo utilizador colaborador (`int.reqs.other@innova-test.com`, como nesse spec). Casos:

```ts
describe('Position requirements Integration', () => {
  // ... bootstrap (ver career-plans.integration-spec.ts) ...

  it('RH cria requisitos das 4 categorias e lista', async () => {
    for (const body of [
      { category: 'ACADEMIC', title: 'Informática', level: 'LICENCIATURA' },
      { category: 'EXPERIENCE', title: 'Exp', minYears: 2 },
      { category: 'LANGUAGE', title: 'Inglês', level: 'B2' },
      { category: 'CERTIFICATION', title: 'AWS Cloud', mandatory: false },
    ]) {
      await request(app.getHttpServer())
        .post(`/career/positions/${positionId}/requirements`)
        .set('Authorization', `Bearer ${rhToken}`)
        .send(body)
        .expect(201);
    }
    const res = await request(app.getHttpServer())
      .get(`/career/positions/${positionId}/requirements`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    expect(res.body).toHaveLength(4);
  });

  it('colaborador não cria requisitos (403)', async () => {
    await request(app.getHttpServer())
      .post(`/career/positions/${positionId}/requirements`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ category: 'LANGUAGE', title: 'Francês', level: 'A2' })
      .expect(403);
  });

  it('nível de idioma inválido → 400', async () => {
    await request(app.getHttpServer())
      .post(`/career/positions/${positionId}/requirements`)
      .set('Authorization', `Bearer ${rhToken}`)
      .send({ category: 'LANGUAGE', title: 'Francês', level: 'FLUENTE' })
      .expect(400);
  });

  it('colaborador regista o seu perfil; outro colaborador recebe 404; RH lê', async () => {
    const base = `/users/${employeeId}`;
    await request(app.getHttpServer()).post(`${base}/languages`).set('Authorization', `Bearer ${employeeToken}`)
      .send({ language: 'Inglês', level: 'C1' }).expect(201);
    await request(app.getHttpServer()).post(`${base}/qualifications`).set('Authorization', `Bearer ${employeeToken}`)
      .send({ degree: 'LICENCIATURA', course: 'Informática' }).expect(201);
    await request(app.getHttpServer()).patch(`${base}/experience`).set('Authorization', `Bearer ${employeeToken}`)
      .send({ priorExperienceYears: 3 }).expect(200);

    await request(app.getHttpServer()).get(`${base}/qualifications`)
      .set('Authorization', `Bearer ${otherEmployeeToken}`).expect(404);
    const asRh = await request(app.getHttpServer()).get(`${base}/qualifications`)
      .set('Authorization', `Bearer ${rhToken}`).expect(200);
    expect(asRh.body.languages).toHaveLength(1);
  });

  it('outro colaborador não escreve no perfil alheio (404)', async () => {
    await request(app.getHttpServer()).post(`/users/${employeeId}/languages`)
      .set('Authorization', `Bearer ${otherEmployeeToken}`)
      .send({ language: 'Francês', level: 'A1' }).expect(404);
  });

  it('simulador devolve requirementChecks coerentes com o perfil', async () => {
    // colocar o employee num cargo qualquer para simulateNextRole e simular o cargo-alvo
    const res = await request(app.getHttpServer())
      .get(`/career/me/simulate/${positionId}`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const byCat = Object.fromEntries(res.body.requirementChecks.map((c: any) => [c.category, c.status]));
    expect(byCat.ACADEMIC).toBe('MET');
    expect(byCat.LANGUAGE).toBe('MET');
    expect(byCat.EXPERIENCE).toBe('MET'); // 3 anos anteriores >= 2
    expect(byCat.CERTIFICATION).toBe('NOT_MET'); // há dados (idioma/habilitação não contam) → ver nota
  });

  it('apagar o cargo apaga os requisitos (cascade)', async () => {
    await prisma.position.delete({ where: { id: positionId } });
    expect(await prisma.positionRequirement.count({ where: { positionId } })).toBe(0);
  });

  afterAll(async () => {
    // filhos antes de pais; cada passo com .catch(() => undefined) (convenção de teardown.ts)
    await prisma.userLanguage.deleteMany({ where: { userId: { in: [employeeId, otherEmployeeId] } } }).catch(() => undefined);
    await prisma.userQualification.deleteMany({ where: { userId: { in: [employeeId, otherEmployeeId] } } }).catch(() => undefined);
    await prisma.userExternalCertification.deleteMany({ where: { userId: { in: [employeeId, otherEmployeeId] } } }).catch(() => undefined);
    await prisma.user.update({ where: { id: employeeId }, data: { priorExperienceYears: 0 } }).catch(() => undefined);
    await prisma.positionRequirement.deleteMany({ where: { positionId } }).catch(() => undefined);
    await prisma.position.deleteMany({ where: { id: positionId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: OTHER_EMPLOYEE_EMAIL } }).catch(() => undefined);
    await app.close();
    await pool.end();
  });
});
```

Nota sobre o caso `CERTIFICATION`: com um colaborador sem nenhuma certificação (externa ou da plataforma) o resultado correcto é `NO_DATA`, não `NOT_MET`. Ajustar a asserção para `expect(byCat.CERTIFICATION).toBe('NO_DATA')` **a menos que** o colaborador de teste já tenha um `Certificate` da plataforma no seed — nesse caso `NOT_MET`. Decidir correndo o teste uma vez e confirmando contra `prisma.certificate.count({ where: { userId: employeeId } })`; a asserção tem de reflectir esse valor, nunca ficar à sorte.

- [ ] **Step 2: Correr a suite de integração completa**

Run: `npx jest --config test/jest-integration.json test/integration/career` (confirmar o nome do config em `package.json` → script `test:integration`; usar o mesmo comando do projecto) e depois a suite de integração completa.
Expected: PASS. Se aparecer "too many clients already", confirmar `DB_POOL_MAX=5` em `.env.test`.

- [ ] **Step 3: Commit**

```bash
npx prettier --write test/integration/career/position-requirements.integration-spec.ts
git add test/integration/career
git commit -m "test(career): integração de requisitos por cargo e perfil do colaborador

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend — painel de requisitos do cargo

**Files** (todos dentro de `frontend/`):
- Modify: `components/career/types.ts` (acrescentar tipos), `lib/queryKeys.ts` (chave `career.positionRequirements(id)`), `components/departments/PositionDetailModal.tsx` (montar o painel)
- Create: `components/departments/PositionRequirementsPanel.tsx`

**Interfaces:**
- Consumes: `GET|POST|DELETE /career/positions/:id/requirements[/:reqId]` (Task 3); `GET /competencies?category=<HARD_SKILL|SOFT_SKILL>&limit=100` (resposta `{ data: Array<{ id; name; category }>, total }`); `POST /competencies/map/position` (`{ positionId, competencyId, requiredLevel (1–5), priority: 'MANDATORY' | 'OPTIONAL' }`); `DELETE /competencies/map/position/:positionId/:competencyId`; `PositionDetail.competencies` (já devolvido por `GET /positions/:id`).
- Produces: `PositionRequirementsPanel({ positionId, competencies, canManage })` e tipos `RequirementCategory`, `PositionRequirement` em `components/career/types.ts`:

```ts
export type RequirementCategory = 'ACADEMIC' | 'EXPERIENCE' | 'LANGUAGE' | 'CERTIFICATION';
export interface PositionRequirement {
  id: number;
  positionId: number;
  category: RequirementCategory;
  title: string;
  level: string | null;
  minYears: number | null;
  mandatory: boolean;
  notes: string | null;
}
export const ACADEMIC_LEVEL_LABEL: Record<string, string> = {
  TECNICO: 'Curso técnico', BACHARELATO: 'Bacharelato', LICENCIATURA: 'Licenciatura',
  POS_GRADUACAO: 'Pós-graduação', MESTRADO: 'Mestrado', DOUTORAMENTO: 'Doutoramento',
};
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
```

- [ ] **Step 1: Tipos e query key**

Acrescentar os tipos acima a `components/career/types.ts` e, em `lib/queryKeys.ts` dentro de `career`, `positionRequirements: (id: number) => [...queryKeys.career.all, 'position-requirements', id] as const,`.

- [ ] **Step 2: Escrever o painel**

`components/departments/PositionRequirementsPanel.tsx` (`'use client'`). Estrutura (seguir o padrão de `PlansManagementView.tsx`: `useApiQuery`/`useApiMutation`, `useToast`, `useConfirm`, componentes de `components/ui/`):
- `useApiQuery<PositionRequirement[]>(queryKeys.career.positionRequirements(positionId), `/career/positions/${positionId}/requirements`, { staleTime: STALE_TIME.DYNAMIC })`.
- Seis secções fixas, por esta ordem: **Habilitações académicas**, **Experiência profissional**, **Competências técnicas**, **Competências comportamentais**, **Idiomas**, **Certificações e licenças**. As quatro de `PositionRequirement` filtram por `category`; as duas de competências usam a prop `competencies` filtrada por `competency.category` (`HARD_SKILL` → técnicas, `SOFT_SKILL` → comportamentais).
- Cada linha mostra `title`, `level` traduzido (`ACADEMIC_LEVEL_LABEL` / CEFR), `minYears` ("3 anos") e um `Badge` "Obrigatório"/"Diferencial".
- Se `canManage`: botão "Adicionar" por secção que abre um mini-formulário inline:
  - Académica: `Select` de grau (`ACADEMIC_LEVEL_LABEL`) + `Input` título.
  - Experiência: `Input` título + `Input type=number` anos mínimos.
  - Idioma: `Input` idioma + `Select` CEFR.
  - Certificação: `Input` nome.
  - Todas: checkbox "Obrigatório" (por omissão marcado). Submit → `POST` (mutation com `invalidateKeys: [queryKeys.career.positionRequirements(positionId), queryKeys.departments.positionDetail(positionId)]`, `onError` → toast `danger`).
  - Competências: `Select` com `GET /competencies?category=…&limit=100` + nível 1–5 + prioridade → `POST /competencies/map/position`.
- Apagar por linha (ícone `Trash2`) com `useConfirm({ destructive: true })` → `DELETE`.
- Estilo: cartões do Simulador IRT já usados no módulo Career (`rounded-[18px] border border-[#D6E4F5] bg-white shadow-[0_8px_30px_rgba(11,61,145,0.10)]`, cabeçalho de secção `bg-gradient-to-br from-[#0B3D91] to-[#06275F]` em maiúsculas).

- [ ] **Step 3: Montar no modal**

Em `PositionDetailModal.tsx`, depois do bloco de competências existente, renderizar `<PositionRequirementsPanel positionId={positionId} competencies={p.competencies} canManage={…} />`. `canManage`: `isRoleAllowed(['ADMIN','RH'] as Role[], me?.role?.name as Role | undefined)` com `useCurrentUser()` (padrão de `PathsView.tsx`; a escrita do mapeamento de competências é ADMIN/RH, a dos requisitos ADMIN/RH/GESTOR — mostrar os controlos só a ADMIN/RH evita um 403 num dos dois).

- [ ] **Step 4: Verificar**

Run (em `frontend/`): `npx tsc --noEmit`
Expected: sem erros.
Depois, com backend e frontend a correr, abrir Departamentos → Cargos → um cargo, e confirmar no browser: criar um requisito de cada categoria, ver o `Badge`, apagar um.

- [ ] **Step 5: Commit (no repo do frontend)**

```bash
cd frontend
npx prettier --write components/departments/PositionRequirementsPanel.tsx
git add components/career/types.ts lib/queryKeys.ts components/departments
git commit -m "feat(departments): painel de requisitos por cargo

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Frontend — separador "Qualificações" no perfil

**Files** (em `frontend/`):
- Create: `components/users/QualificationsTab.tsx`
- Modify: `components/users/UserProfileView.tsx` (acrescentar o id ao tipo `ProfileTab`, a entrada em `TABS` (~linha 72) e o render condicional (~linha 357); inserir depois de `competencies`), `lib/queryKeys.ts` (`users.qualifications(userId)`)

**Interfaces:**
- Consumes: `GET /users/:userId/qualifications` → `{ qualifications: Array<{ id; degree; course; institution; year }>, languages: Array<{ id; language; level }>, certifications: Array<{ id; name; issuer; issuedAt; expiresAt }>, priorExperienceYears: number }`; `POST /users/:userId/{qualifications,languages,certifications}`; `DELETE /users/:userId/{qualifications,languages,certifications}/:id`; `PATCH /users/:userId/experience` (Task 4). `ACADEMIC_LEVEL_LABEL`, `CEFR_LEVELS` (Task 7).
- Produces: `QualificationsTab({ userId }: { userId: number })`.

- [ ] **Step 1: Escrever o componente**

Quatro blocos (habilitações, idiomas, certificações e licenças, experiência anterior), mesmo padrão de `CompetenciesTab` em `ProfileTabs.tsx` para o carregamento (`useApiQuery`, `Skeleton`), `useApiMutation` com `invalidateKeys: [queryKeys.users.qualifications(userId)]`, toasts de erro. Formulários inline: habilitação (Select de grau, curso, instituição, ano), idioma (nome + Select CEFR), certificação (nome, entidade, emissão, validade com `Input type=date`), experiência (`Input type=number` + botão Guardar → `PATCH`). Apagar com `useConfirm`. Certificação com `expiresAt` no passado mostra `Badge intent="danger"` "Expirada". Estilo igual ao do painel da Task 7.

- [ ] **Step 2: Registar o separador**

Em `UserProfileView.tsx`: acrescentar `'qualifications'` ao tipo `ProfileTab`; em `TABS` inserir `{ id: 'qualifications', label: 'Qualificações' }` a seguir a `competencies`; no render `{tab === 'qualifications' && <QualificationsTab userId={userId} />}`. Importar o componente.

- [ ] **Step 3: Verificar**

Run (em `frontend/`): `npx tsc --noEmit`
Expected: sem erros. No browser: abrir o perfil de um colaborador, adicionar uma habilitação, um idioma, uma certificação com validade passada (aparece "Expirada") e guardar anos de experiência; recarregar a página e confirmar que persistiu. Entrar como outro colaborador e confirmar que o perfil alheio não carrega dados (404).

- [ ] **Step 4: Commit (no repo do frontend)**

```bash
cd frontend
npx prettier --write components/users/QualificationsTab.tsx
git add components/users/QualificationsTab.tsx components/users/UserProfileView.tsx lib/queryKeys.ts
git commit -m "feat(users): separador Qualificações no perfil do colaborador

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Frontend — requisitos no Simulador de Carreira

**Files** (em `frontend/`):
- Modify: `components/career/types.ts` (`SimulationResult`), `components/career/DashboardView.tsx` (zona do resultado da simulação, usa `simulation`/`simulateMutation` ~linhas 108–125)
- Create: `components/career/RequirementChecksPanel.tsx`

**Interfaces:**
- Consumes: resposta de `GET /career/me/simulate/:id` (Task 5).
- Produces: tipos e componente `RequirementChecksPanel({ checks }: { checks: RequirementCheck[] })`:

```ts
export type RequirementStatus = 'MET' | 'NOT_MET' | 'NO_DATA';
export interface RequirementCheck {
  requirementId: number;
  category: RequirementCategory;
  title: string;
  mandatory: boolean;
  status: RequirementStatus;
  required: string;
  actual: string | null;
}
// SimulationResult acrescenta (opcionais, para não partir consumidores/testes):
//   requirementChecks?: RequirementCheck[];
//   summary.optionalMet?: number; summary.optionalTotal?: number; summary.noData?: number;
```

- [ ] **Step 1: Tipos**

Acrescentar `RequirementStatus`, `RequirementCheck` e os campos opcionais a `SimulationResult` em `components/career/types.ts`.

- [ ] **Step 2: Componente**

`RequirementChecksPanel` agrupa por categoria (rótulos: Habilitações académicas / Experiência profissional / Idiomas / Certificações e licenças) e mostra por item: título, `required` vs `actual ?? '—'`, e um estado visual — `MET` (pílula `#075FE8` "Cumpre"), `NOT_MET` (pílula vermelha "Não cumpre"), `NO_DATA` (pílula neutra "Sem dados" com `title` "Preencha o separador Qualificações do seu perfil"). Itens `mandatory === false` levam o sufixo "(diferencial)". No fim, uma linha de resumo com `summary.noData` ("N requisitos sem dados"). Devolve `null` se `checks` estiver vazio. Estilo cartão do Simulador IRT.

- [ ] **Step 3: Montar no Dashboard**

Em `DashboardView.tsx`, logo a seguir ao bloco que mostra `competencyGaps` da simulação, renderizar `<RequirementChecksPanel checks={simulation?.requirementChecks ?? []} />` (e passar `summary` se o componente o precisar para a linha de resumo — receber `noData` como prop opcional `noData?: number`).

- [ ] **Step 4: Verificar**

Run (em `frontend/`): `npx tsc --noEmit`
Expected: sem erros. No browser (Carreira → A Minha Carreira → Simulador): escolher o cargo configurado na Task 7 e confirmar que cada requisito aparece com o estado correcto; apagar uma habilitação no perfil e confirmar que passa a "Sem dados"; cargo sem requisitos não mostra o painel.

- [ ] **Step 5: Commit (no repo do frontend)**

```bash
cd frontend
npx prettier --write components/career/RequirementChecksPanel.tsx
git add components/career
git commit -m "feat(career): painel de requisitos do cargo no Simulador de Carreira

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verificação final e smoke ao vivo

**Files:** nenhum novo.

- [ ] **Step 1: Garantir um único processo de backend na porta 4000**

Run: `Get-NetTCPConnection -LocalPort 4000 | Select OwningProcess` (PowerShell). Se houver dois processos Nest (`npm run start` com `dist` obsoleto + `start:dev`), terminar o obsoleto antes do smoke (ver memória `project_innova_backend_dual_process_stale_code`).

- [ ] **Step 2: Suites completas**

Run (backend): `npx tsc --noEmit && npx jest src/career src/users src/succession` e a suite de integração completa.
Run (frontend): `npx tsc --noEmit && npx vitest run`.
Expected: tudo verde. Reportar qualquer falha com o output, não a esconder.

- [ ] **Step 3: Smoke com curl**

Autenticar (`POST /auth/login`, token em `access_token`) como RH e executar: `POST /career/positions/<id>/requirements` (uma categoria de cada), `GET` do mesmo, `POST /users/<id>/languages`, `GET /users/<id>/qualifications`, `GET /career/me/simulate/<id>`. Confirmar os códigos HTTP e os campos `requirementChecks`. (URLs mal escritas só o curl apanha.)

- [ ] **Step 4: Confirmar estado do repositório**

Run: `git status --short` na raiz e em `frontend/`.
Expected: árvore limpa; commits locais nos dois repos; nada empurrado.

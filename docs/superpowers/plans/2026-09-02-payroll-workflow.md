# Payroll Workflow (`PayrollRun`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the batch payroll workflow on top of the existing `payslips` module — create a monthly run, process/simulate every payslip at once, review exceptions, submit, approve, and publish (issue + notify + PDF) — with audit trail and RH frontend.

**Architecture:** Extend `src/payslips/` with new services (`PayrollCalculationService`, `PayrollWorkflowService`, `PayslipPdfService`) and controllers (`PayrollRunController`, `SalaryComponentController`, `EmployeeCompensationController`). The calculation service wraps the already-built `PayrollEngineService` (currently unregistered) and feeds it inputs gathered from `attendance`/`leave`. The workflow service is a pure state machine over `PayrollRunStatus` that delegates calculation and records audit entries on `approve`/`publish`/`cancel`/`reject`. Money stays `Float`, rounded on write via a `money()` helper. Frontend adds a `/payroll` area mirroring the existing `/payslips` structure, on the shared `components/ui/` design system.

**Tech Stack:** NestJS 11, Prisma 7 (Postgres), `class-validator`/`class-transformer`, Bull (audit queue), `pdfkit`; frontend Next.js App Router, React Query via `useApiQuery`/`useApiMutation`, Tailwind tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-payroll-workflow-design.md` — read it alongside this plan. Every design decision, exception table, and state-transition table lives there; this plan implements it task by task.

## Global Constraints

- **Prisma model/field names — verify against `prisma/schema.prisma`, never trust a mock.** Confirmed real names used by this plan: `Payslip` (money `Float`, `@@unique([userId, period])`, `runId Int?`), `PayslipItem` (`type ComponentType`, `calcType ComponentCalcType?`, `value Float`, `order Int`), `PayrollRun` (`processedById Int?` bare, `createdById Int` + relation `createdBy` named `"PayrollRunCreator"`), `SalaryComponent` (`code @id`), `EmployeeCompensation` (`baseSalary Float`, `effectiveFrom`/`effectiveTo`, `foodAllowance`/`transportAllowance Float?`), `EmployeeCompensationComponent` (`componentCode`, `value Float`, `override Boolean`), `CountryConfig` (`@@unique([countryCode, taxYear])`, `socialSecurity Json`), `IrtBracket` (`configId`, `min`/`max`/`rate`/`deduction`), `OvertimeRecord` (`overtimeMinutes Int`, `status OvertimeStatus`, `date DateTime`), `LeaveRequest` (`startDate`/`endDate DateTime`, `status LeaveStatus`, `leaveTypeCode String`, `workDays Float`), `LeaveTypeConfig` (`code @unique`, `isPaid Boolean @default(true)`, `@@map("leave_type_configs")`), `UserAttendance` (`status String @default("PRESENT")`, `date DateTime`, `@@unique([userId, date])`).
- **User model:** field is `fullName`, never `name`. Filter roles via the relation `role.name`, never `where: { role: 'RH' }`. `User.active` (not `isActive`).
- **Reads vs writes:** read queries go through `this.prisma.read.<model>`; writes and `$transaction` through `this.prisma.<model>`.
- **Money:** all monetary writes pass through `money(n)` from `src/payslips/money.util.ts` (`Math.round((n + Number.EPSILON) * 100) / 100`). Invariant asserted in calculation: `Math.abs((grossSalary - totalDeductions) - netSalary) <= 0.01`.
- **Audit:** use `src/common/services/audit.service.ts` (`AuditService.log({ action, entity, entityId, userId, metadata })`) — the Bull-queue one, which already `JSON.stringify`s metadata. NEVER `src/audit/audit.service.ts` (orphaned hash-chain). `AuditModule` is `@Global()` but import it explicitly in `payslips.module.ts` following the `career-plans.module.ts` pattern.
- **Notifications:** `createNotificationSafe(prisma, logger, { userId, type, message })` from `src/common/helpers/notification.helper.ts` — never throws, never reverts business op.
- **Ownership:** `assertCanAccess(record, ownerId, user, [Role.ADMIN, Role.RH])` from `src/common/authz/ownership.ts` — throws `NotFoundException` (404, not 403) when denied.
- **RBAC:** `@Roles(Role.ADMIN, Role.RH)` explicit on every RH endpoint (missing `@Roles` = fail-open). `Role` enum from `src/auth/enums/role.enum.ts`. ESS endpoints (`/payslips/my/*`) carry no `@Roles` and enforce ownership in the service.
- **DTOs:** `class-validator`; extend `BaseFilterDto` for paginated filters; query booleans use `@Type(() => String)` + `@Transform`; optional body strings use `@EmptyStringToUndefined()` from `src/common/transformers/empty-string-to-undefined.ts`.
- **Seed:** run with `npx prisma db seed` (which runs `ts-node prisma/seed.ts`), never raw `ts-node` on a partial file. `seedPayroll()` is idempotent (`upsert`).
- **Integration tests:** `.env.test` already sets `DB_POOL_MAX=5`; Redis must be running (audit queue). `afterAll` deletes children before parents (FK RESTRICT), each step `.catch(() => undefined)`. Filter payslip-child cleanup by `payslipId`, never `userId` (`PayslipAccessLog.userId` is the viewer). Run the FULL integration suite before declaring Phase 6 done.
- **CI:** every phase = one PR; the `quality` check (`.github/workflows/quality.yml`) must be green before merge; `main` is branch-protected (no admin override). Auto-merge once `quality` passes. Run `npx prettier --write` on touched files before pushing.
- **Enum caution:** adding a value to a Postgres enum (`PayrollRunStatus`) is done by Prisma via `ALTER TYPE ... ADD VALUE`; it cannot run inside a transaction with other DDL, so it gets its own migration step. `CALCULATED` stays in the enum unused (removing an enum value in Postgres is unsafe).

---

## File Structure

### Backend (`innova`) — new files

| File | Responsibility |
|---|---|
| `src/payslips/money.util.ts` | `money(n)` rounding helper + `assertNetInvariant(result)` guard. |
| `src/payslips/payroll-calculation.service.ts` | `PayrollCalculationService`: resolve target users, gather leave/attendance inputs, call the engine, map `PayrollResult` → `Payslip` + `PayslipItem[]`, detect exceptions, `processRun()`. No state transitions. |
| `src/payslips/payroll-workflow.service.ts` | `PayrollWorkflowService`: the `PayrollRunStatus` state machine — `createRun`, `process`, `recalcPayslip`, `excludePayslip`, `submit`, `approve`, `reject`, `publish`, `cancel`. Owns audit calls and run immutability. |
| `src/payslips/payslip-pdf.service.ts` | `PayslipPdfService.render(payslipId)`: line-aware PDF input builder with legacy column fallback; delegates to `PdfService.generatePayslip`. |
| `src/payslips/salary-component.service.ts` | `SalaryComponentService`: CRUD for `SalaryComponent` with soft-delete when referenced. |
| `src/payslips/employee-compensation.service.ts` | `EmployeeCompensationService`: effective-dated compensation records + component overrides + the ESS `myCompensation()` read. |
| `src/payslips/payroll-run.controller.ts` | `PayrollRunController` — `@Controller('payroll/runs')`. |
| `src/payslips/salary-component.controller.ts` | `SalaryComponentController` — `@Controller('payroll/components')`. |
| `src/payslips/employee-compensation.controller.ts` | `EmployeeCompensationController` — `@Controller('payroll/compensation')`. |
| `src/payslips/payroll.dto.ts` | All new DTOs (run create/filter/reject/cancel, recalc inputs, salary component, compensation). Kept separate from `payslips.dto.ts` to keep each file focused. |

### Backend — modified files

| File | Change |
|---|---|
| `prisma/schema.prisma` | Enum values `SIMULATED`, `PENDING_APPROVAL`; new `PayrollRun` columns; new `Payslip` columns (`hasExceptions`, `exceptions`, `calcInputs`, `calcSnapshot`) + `@@index([runId, hasExceptions])`; `PayslipItem.isEmployerCost`. |
| `prisma/seed.ts` | New `seedPayroll()` section (CountryConfig/IrtBracket/SalaryComponent), called from `main()`. |
| `src/payslips/payslips.module.ts` | Register `PayrollEngineService`, the 3 new services, 3 new controllers; import `AuditModule`. |
| `src/payslips/payslips.service.ts` | Export `assertPayslipEditable(payslip)`; call it in `update()`. |
| `src/payslips/payslips.controller.ts` | Move `payslipToPdfInput` into `payslip-pdf.service.ts`; `GET my/:id/pdf` uses `PayslipPdfService`; add `GET my/compensation`. |
| `package.json` (frontend + backend as needed) | no new deps expected. |

### Backend — new test files

`src/payslips/payroll-calculation.service.spec.ts`, `src/payslips/payroll-workflow.service.spec.ts`, `src/payslips/money.util.spec.ts`, `src/payslips/salary-component.service.spec.ts`, `src/payslips/employee-compensation.service.spec.ts`, `src/payslips/payslip-pdf.service.spec.ts`, `test/integration/payroll/payroll.integration-spec.ts`.

### Frontend (`frontend`) — new files

`app/(platform)/payroll/layout.tsx`, `app/(platform)/payroll/page.tsx`, `app/(platform)/payroll/runs/[id]/page.tsx`, `app/(platform)/payroll/components/page.tsx`, `app/(platform)/payroll/compensation/page.tsx`; `components/payroll/` (`RunListView.tsx`, `RunDetailView.tsx`, `ExceptionsPanel.tsx`, `RunPayslipsTable.tsx`, `RecalcModal.tsx`, `NewRunModal.tsx`, `ComponentsView.tsx`, `CompensationView.tsx`, `constants.ts`, `types.ts`); `hooks/usePayrollRun.ts`, `hooks/usePayrollRuns.ts`; tests `components/payroll/constants.test.ts`, `components/payroll/RunDetailView.test.tsx`.

### Frontend — modified files

`lib/queryKeys.ts` (`payroll` block), `components/Sidebar.tsx` (nav entry).

---

## Phase 0 — Schema migration + seed (PR 1, repo `innova`)

### Task 0.1: Schema changes + migration `add_payroll_workflow`

**Files:**
- Modify: `prisma/schema.prisma` (enum `PayrollRunStatus` ~line 243; `model PayrollRun` ~line 4007; `model Payslip` ~line 3819; `model PayslipItem` ~line 3875)
- Create: `prisma/migrations/<timestamp>_add_payroll_workflow/migration.sql` (generated by `prisma migrate dev`)

**Interfaces:**
- Produces: enum `PayrollRunStatus` gains `SIMULATED`, `PENDING_APPROVAL`. `PayrollRun` gains `payGroup String?`, `scope Json?`, `taxYear Int?`, `totalNet Float?`, `totalDeductions Float?`, `totalEmployerCost Float?`, `employeeCount Int?`, `exceptionsCount Int?`, `errorCount Int?`, `submittedAt DateTime?`, `submittedById Int?`, `publishedAt DateTime?`, `publishedById Int?`, `rejectionReason String?`, `cancellationReason String?`. `Payslip` gains `hasExceptions Boolean @default(false)`, `exceptions Json?`, `calcInputs Json?`, `calcSnapshot Json?` + `@@index([runId, hasExceptions])`. `PayslipItem` gains `isEmployerCost Boolean @default(false)`.

- [ ] **Step 1: Edit the enum** — in `prisma/schema.prisma`, change the `PayrollRunStatus` block to:

```prisma
enum PayrollRunStatus {
  DRAFT
  PROCESSING
  SIMULATED
  PENDING_APPROVAL
  CALCULATED
  APPROVED
  PUBLISHED
  CANCELLED
}
```

- [ ] **Step 2: Add `PayrollRun` columns** — append inside `model PayrollRun { ... }`, before the closing `@@index`:

```prisma
  payGroup           String?
  scope              Json?
  taxYear            Int?
  totalNet           Float?
  totalDeductions    Float?
  totalEmployerCost  Float?
  employeeCount      Int?
  exceptionsCount    Int?
  errorCount         Int?
  submittedAt        DateTime?
  submittedById      Int?
  publishedAt        DateTime?
  publishedById      Int?
  rejectionReason    String?
  cancellationReason String?
```

- [ ] **Step 3: Add `Payslip` columns + index** — append inside `model Payslip { ... }` (after `disputes` relation, before the `@@unique`):

```prisma
  hasExceptions      Boolean            @default(false)
  exceptions         Json?
  calcInputs         Json?
  calcSnapshot       Json?
```

and add to the index block:

```prisma
  @@index([runId, hasExceptions])
```

- [ ] **Step 4: Add `PayslipItem` column** — inside `model PayslipItem { ... }` after `order`:

```prisma
  isEmployerCost Boolean @default(false)
```

- [ ] **Step 5: Generate the migration**

Run: `npx prisma migrate dev --name add_payroll_workflow`
Expected: migration created and applied; `npx prisma generate` runs; no errors. If Postgres rejects `ADD VALUE` inside a transaction, Prisma splits it automatically — accept the generated SQL.

- [ ] **Step 6: Verify migration status**

Run: `npx prisma migrate status`
Expected: "Database schema is up to date!"

- [ ] **Step 7: Smoke — build compiles against new client**

Run: `npx tsc --noEmit`
Expected: no new errors (pre-existing unrelated errors, if any, unchanged).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(payroll): schema for PayrollRun workflow (enum + run/payslip columns)"
```

---

### Task 0.2: `seedPayroll()` — CountryConfig, IrtBracket, SalaryComponent

**Files:**
- Modify: `prisma/seed.ts` (add `seedPayroll(prisma)` function; call it from `main()` before the final `console.log`)
- Test: manual — `npx prisma db seed` twice, assert idempotency

**Interfaces:**
- Consumes: `PayrollEngineService.getDefaultAngolaConfig(taxYear)` values (copied as literals — do NOT import the service into the seed).
- Produces: one `CountryConfig` row `{ countryCode: 'AO', taxYear: <current year> }` with 7 `IrtBracket` children; 11 `SalaryComponent` rows keyed by the codes the engine already emits.

- [ ] **Step 1: Write `seedPayroll`** — add to `prisma/seed.ts` above `async function main()`:

```ts
async function seedPayroll(prisma: PrismaClient) {
  const taxYear = new Date().getFullYear();

  // ⚠️ Tabela IRT / taxas provisórias — confirmar com AGT antes de produção.
  // Valores espelham PayrollEngineService.getDefaultAngolaConfig().
  const config = await prisma.countryConfig.upsert({
    where: { countryCode_taxYear: { countryCode: 'AO', taxYear } },
    update: {},
    create: {
      countryCode: 'AO',
      name: 'Angola',
      currency: 'AOA',
      locale: 'pt-AO',
      taxYear,
      minimumWage: 70000,
      defaultFoodAllowance: 25000,
      defaultTransportAllowance: 15000,
      socialSecurity: { employeeRate: 0.03, employerRate: 0.08, ceiling: null },
      healthInsuranceRate: 0.02,
      unionFeeRate: 0.01,
      guaranteeFundRate: 0.005,
      active: true,
    },
  });

  const brackets = [
    { min: 0, max: 70000, rate: 0, deduction: 0, order: 0 },
    { min: 70000, max: 100000, rate: 0.07, deduction: 0, order: 1 },
    { min: 100000, max: 150000, rate: 0.11, deduction: 4000, order: 2 },
    { min: 150000, max: 200000, rate: 0.14, deduction: 8500, order: 3 },
    { min: 200000, max: 300000, rate: 0.17, deduction: 14500, order: 4 },
    { min: 300000, max: 500000, rate: 0.21, deduction: 26500, order: 5 },
    { min: 500000, max: null, rate: 0.25, deduction: 46500, order: 6 },
  ];
  const existing = await prisma.irtBracket.count({ where: { configId: config.id } });
  if (existing === 0) {
    await prisma.irtBracket.createMany({
      data: brackets.map(b => ({ ...b, configId: config.id })),
    });
  }

  const components: Array<{
    code: string; name: string; type: 'EARNING' | 'DEDUCTION';
    calcType: 'FIXED' | 'PERCENT' | 'FORMULA' | 'TABLE';
    isTaxable: boolean; isMandatory: boolean; order: number;
  }> = [
    { code: 'BASE_SALARY', name: 'Salário Base', type: 'EARNING', calcType: 'FIXED', isTaxable: true, isMandatory: true, order: 0 },
    { code: 'ALLOWANCE_FOOD', name: 'Subsídio de Alimentação', type: 'EARNING', calcType: 'FIXED', isTaxable: false, isMandatory: false, order: 1 },
    { code: 'ALLOWANCE_TRANSPORT', name: 'Subsídio de Transporte', type: 'EARNING', calcType: 'FIXED', isTaxable: false, isMandatory: false, order: 2 },
    { code: 'OVERTIME', name: 'Horas Extras', type: 'EARNING', calcType: 'FORMULA', isTaxable: true, isMandatory: false, order: 3 },
    { code: 'BONUS', name: 'Bónus', type: 'EARNING', calcType: 'FIXED', isTaxable: true, isMandatory: false, order: 4 },
    { code: 'INSS_EMPLOYEE', name: 'INSS Colaborador', type: 'DEDUCTION', calcType: 'PERCENT', isTaxable: false, isMandatory: true, order: 5 },
    { code: 'IRT', name: 'IRT (Imposto Rendimento Trabalho)', type: 'DEDUCTION', calcType: 'TABLE', isTaxable: false, isMandatory: true, order: 6 },
    { code: 'HEALTH_INSURANCE', name: 'Seguro de Saúde', type: 'DEDUCTION', calcType: 'PERCENT', isTaxable: false, isMandatory: false, order: 7 },
    { code: 'UNION_FEE', name: 'Quota Sindical', type: 'DEDUCTION', calcType: 'PERCENT', isTaxable: false, isMandatory: false, order: 8 },
    { code: 'ADVANCE', name: 'Adiantamento', type: 'DEDUCTION', calcType: 'FIXED', isTaxable: false, isMandatory: false, order: 9 },
    { code: 'ABSENCE_DEDUCTION', name: 'Desconto por Faltas', type: 'DEDUCTION', calcType: 'FIXED', isTaxable: false, isMandatory: false, order: 10 },
  ];
  for (const c of components) {
    await prisma.salaryComponent.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, countryCode: 'AO' },
    });
  }

  console.log('✅ Payroll seed: CountryConfig AO', taxYear, '+ 7 escalões IRT + 11 componentes');
}
```

- [ ] **Step 2: Call it from `main()`** — in `prisma/seed.ts`, immediately before `console.log('🎉 Seed concluído!');`:

```ts
  await seedPayroll(prisma);
```

- [ ] **Step 3: Run the seed**

Run: `npx prisma db seed`
Expected: ends with `🎉 Seed concluído!` and the payroll line; no errors.

- [ ] **Step 4: Run it again (idempotency)**

Run: `npx prisma db seed`
Expected: same output, no unique-constraint errors, still one `CountryConfig` AO row and 7 brackets (not 14).

- [ ] **Step 5: Verify row counts**

Run: `npx prisma studio` is interactive — instead run a one-liner:
`node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.countryConfig.count({where:{countryCode:'AO'}}).then(c=>p.irtBracket.count().then(b=>p.salaryComponent.count().then(s=>{console.log({config:c,brackets:b,components:s});return p.$disconnect()})))"`
Expected: `{ config: 1, brackets: 7, components: 11 }` (brackets ≥7 if other configs seeded elsewhere — acceptable).

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(payroll): seedPayroll — CountryConfig AO, IRT brackets, SalaryComponent catalogue"
```

- [ ] **Step 7: Push branch, open PR "Phase 0 — payroll schema + seed", wait for `quality` green, auto-merge.**

---

## Phase 1 — `money` util + `PayrollCalculationService` (PR 2, repo `innova`)

### Task 1.1: `money.util.ts` + register `PayrollEngineService`

**Files:**
- Create: `src/payslips/money.util.ts`
- Create: `src/payslips/money.util.spec.ts`
- Modify: `src/payslips/payslips.module.ts`

**Interfaces:**
- Produces: `money(n: number): number`; `assertNetInvariant(r: { grossSalary: number; totalDeductions: number; netSalary: number }): void` (throws `Error` with a descriptive message if `|gross - deductions - net| > 0.01`).
- Produces: `PayrollEngineService` is now injectable from `PayslipsModule`.

- [ ] **Step 1: Write the failing test** — `src/payslips/money.util.spec.ts`:

```ts
import { money, assertNetInvariant } from './money.util';

describe('money', () => {
  it('rounds to 2 decimals', () => {
    expect(money(1234.5678)).toBe(1234.57);
    expect(money(0.1 + 0.2)).toBe(0.3);
    expect(money(70000 / 22)).toBe(3181.82);
  });
  it('handles negatives and zero', () => {
    expect(money(-0.005)).toBe(-0.01);
    expect(money(0)).toBe(0);
  });
});

describe('assertNetInvariant', () => {
  it('passes when gross - deductions === net within 1 cent', () => {
    expect(() => assertNetInvariant({ grossSalary: 100, totalDeductions: 30, netSalary: 70 })).not.toThrow();
    expect(() => assertNetInvariant({ grossSalary: 100, totalDeductions: 30, netSalary: 69.995 })).not.toThrow();
  });
  it('throws when the gap exceeds 1 cent', () => {
    expect(() => assertNetInvariant({ grossSalary: 100, totalDeductions: 30, netSalary: 68 })).toThrow(/invariant/i);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest src/payslips/money.util.spec.ts`
Expected: FAIL — cannot find module `./money.util`.

- [ ] **Step 3: Implement** — `src/payslips/money.util.ts`:

```ts
// src/payslips/money.util.ts
// Arredondamento monetário único para toda a escrita de totais de payroll.
// Mantém Float (decisão de arquitectura #2) mas garante 2 casas na persistência.

export const money = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/** Guarda de sanidade: bruto − descontos tem de bater certo com o líquido. */
export function assertNetInvariant(r: {
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
}): void {
  const gap = Math.abs(r.grossSalary - r.totalDeductions - r.netSalary);
  if (gap > 0.01) {
    throw new Error(
      `Payroll net invariant violada: gross(${r.grossSalary}) - deductions(${r.totalDeductions}) - net(${r.netSalary}) = ${gap.toFixed(4)}`,
    );
  }
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npx jest src/payslips/money.util.spec.ts`
Expected: PASS.

- [ ] **Step 5: Register the engine + AuditModule** — replace `src/payslips/payslips.module.ts` with:

```ts
// src/payslips/payslips.module.ts
import { Module } from '@nestjs/common';
import { PayslipsService } from './payslips.service';
import { PayslipsController } from './payslips.controller';
import { PayrollEngineService } from './payroll-engine.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [PayslipsService, PayrollEngineService],
  controllers: [PayslipsController],
  exports: [PayslipsService, PayrollEngineService],
})
export class PayslipsModule {}
```

- [ ] **Step 6: Verify the app still boots**

Run: `npx jest src/payslips/payslips.service.spec.ts src/payslips/payslips.controller.spec.ts`
Expected: PASS (no DI regressions).

- [ ] **Step 7: Commit**

```bash
git add src/payslips/money.util.ts src/payslips/money.util.spec.ts src/payslips/payslips.module.ts
git commit -m "feat(payroll): money() util + register PayrollEngineService in PayslipsModule"
```

---

### Task 1.2: `PayrollCalculationService.gatherInputs` (leave + attendance)

**Files:**
- Create: `src/payslips/payroll-calculation.service.ts` (partial — `gatherInputs` + helpers only)
- Create: `src/payslips/payroll-calculation.service.spec.ts` (partial)

**Interfaces:**
- Consumes: `money` from `./money.util`; `PrismaService`; `PayrollEngineService`.
- Produces:
  - `type PayrollInputs = { absenceDays: number; overtimeHours: number; workingDaysInMonth: number }`
  - `PayrollCalculationService.gatherInputs(userId: number, period: string): Promise<PayrollInputs>` — `period` is `"YYYY-MM"`.
  - `PayrollCalculationService.workingDaysInMonth(period: string): number` (Mon–Fri count; `22` fallback on parse failure).

- [ ] **Step 1: Write the failing test** — `src/payslips/payroll-calculation.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollEngineService } from './payroll-engine.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = () => {
  const m: any = {
    read: {
      leaveRequest: { findMany: jest.fn().mockResolvedValue([]) },
      leaveTypeConfig: { findMany: jest.fn().mockResolvedValue([]) },
      userAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      overtimeRecord: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      employeeCompensation: { findFirst: jest.fn().mockResolvedValue(null) },
      payslip: { findFirst: jest.fn().mockResolvedValue(null) },
    },
  };
  return m;
};

describe('PayrollCalculationService.gatherInputs', () => {
  let svc: PayrollCalculationService;
  let prisma: any;

  beforeEach(async () => {
    prisma = prismaMock();
    const mod = await Test.createTestingModule({
      providers: [
        PayrollCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayrollEngineService, useValue: { calculate: jest.fn() } },
      ],
    }).compile();
    svc = mod.get(PayrollCalculationService);
  });

  it('counts Mon-Fri working days for the period', () => {
    expect(svc.workingDaysInMonth('2026-09')).toBe(22); // Sep 2026: 22 weekdays
    expect(svc.workingDaysInMonth('not-a-date')).toBe(22);
  });

  it('sums approved unpaid-leave workDays overlapping the month', async () => {
    prisma.read.leaveTypeConfig.findMany.mockResolvedValue([{ code: 'UNPAID' }]);
    prisma.read.leaveRequest.findMany.mockResolvedValue([
      { leaveTypeCode: 'UNPAID', startDate: new Date('2026-09-10'), endDate: new Date('2026-09-12'), workDays: 3 },
    ]);
    const r = await svc.gatherInputs(1, '2026-09');
    expect(r.absenceDays).toBe(3);
  });

  it('adds ABSENT attendance days without double-counting leave days', async () => {
    prisma.read.leaveTypeConfig.findMany.mockResolvedValue([{ code: 'UNPAID' }]);
    prisma.read.leaveRequest.findMany.mockResolvedValue([
      { leaveTypeCode: 'UNPAID', startDate: new Date('2026-09-10'), endDate: new Date('2026-09-10'), workDays: 1 },
    ]);
    prisma.read.userAttendance.findMany.mockResolvedValue([
      { date: new Date('2026-09-10'), status: 'ABSENT' }, // same day — not double counted
      { date: new Date('2026-09-15'), status: 'ABSENT' },
    ]);
    const r = await svc.gatherInputs(1, '2026-09');
    expect(r.absenceDays).toBe(2);
  });

  it('converts approved/paid overtime minutes to hours', async () => {
    prisma.read.overtimeRecord.findMany.mockResolvedValue([
      { overtimeMinutes: 90, status: 'APPROVED' },
      { overtimeMinutes: 30, status: 'PAID' },
    ]);
    const r = await svc.gatherInputs(1, '2026-09');
    expect(r.overtimeHours).toBe(2);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts`
Expected: FAIL — cannot find module `./payroll-calculation.service`.

- [ ] **Step 3: Implement the partial service** — `src/payslips/payroll-calculation.service.ts`:

```ts
// src/payslips/payroll-calculation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollEngineService } from './payroll-engine.service';
import { money } from './money.util';

export interface PayrollInputs {
  absenceDays: number;
  overtimeHours: number;
  workingDaysInMonth: number;
}

@Injectable()
export class PayrollCalculationService {
  private readonly logger = new Logger(PayrollCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: PayrollEngineService,
  ) {}

  /** Limites [início, fimExclusivo) do mês de "YYYY-MM". */
  private monthRange(period: string): { start: Date; end: Date } {
    const [y, m] = period.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    return { start, end };
  }

  workingDaysInMonth(period: string): number {
    const [y, m] = period.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) return 22;
    let count = 0;
    const d = new Date(Date.UTC(y, m - 1, 1));
    while (d.getUTCMonth() === m - 1) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) count++;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return count || 22;
  }

  /** Expande [startDate, endDate] em dias úteis (chaves "YYYY-MM-DD") dentro do mês. */
  private weekdayKeysInRange(start: Date, end: Date, monthStart: Date, monthEnd: Date): string[] {
    const from = start < monthStart ? monthStart : start;
    const to = end < monthEnd ? end : new Date(monthEnd.getTime() - 1);
    const keys: string[] = [];
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    while (d <= to) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) keys.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return keys;
  }

  async gatherInputs(userId: number, period: string): Promise<PayrollInputs> {
    const { start, end } = this.monthRange(period);
    const workingDaysInMonth = this.workingDaysInMonth(period);

    const unpaidTypes = await this.prisma.read.leaveTypeConfig.findMany({
      where: { isPaid: false },
      select: { code: true },
    });
    const unpaidCodes = unpaidTypes.map(t => t.code);

    const absentDayKeys = new Set<string>();

    if (unpaidCodes.length > 0) {
      const leaves = await this.prisma.read.leaveRequest.findMany({
        where: {
          userId,
          status: 'APPROVED',
          leaveTypeCode: { in: unpaidCodes },
          startDate: { lt: end },
          endDate: { gte: start },
        },
        select: { startDate: true, endDate: true },
      });
      for (const lv of leaves) {
        for (const k of this.weekdayKeysInRange(lv.startDate, lv.endDate, start, end)) {
          absentDayKeys.add(k);
        }
      }
    }

    const attendance = await this.prisma.read.userAttendance.findMany({
      where: { userId, status: 'ABSENT', date: { gte: start, lt: end } },
      select: { date: true },
    });
    for (const a of attendance) absentDayKeys.add(a.date.toISOString().slice(0, 10));

    const overtime = await this.prisma.read.overtimeRecord.findMany({
      where: { userId, status: { in: ['APPROVED', 'PAID'] }, date: { gte: start, lt: end } },
      select: { overtimeMinutes: true },
    });
    const overtimeHours = money(
      overtime.reduce((sum, o) => sum + (o.overtimeMinutes ?? 0), 0) / 60,
    );

    return {
      absenceDays: absentDayKeys.size,
      overtimeHours,
      workingDaysInMonth,
    };
  }
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/payslips/payroll-calculation.service.ts src/payslips/payroll-calculation.service.spec.ts
git commit -m "feat(payroll): PayrollCalculationService.gatherInputs (leave + attendance + overtime)"
```

---

### Task 1.3: `calculatePayslip` — build `PayrollContext`, call engine, map result

**Files:**
- Modify: `src/payslips/payroll-calculation.service.ts`
- Modify: `src/payslips/payroll-calculation.service.spec.ts`

**Interfaces:**
- Consumes: `PayrollEngineService.calculate(ctx: PayrollContext, period: string): Promise<PayrollResult>` (exported from `./payroll-engine.service`); `assertNetInvariant` from `./money.util`.
- Produces:
  - `type CalcOverrides = { absenceDays?: number; overtimeHours?: number; bonusAmount?: number; advanceDeduction?: number }`
  - `type CalculatedPayslip = { data: PayslipWriteData; items: PayslipItemWriteData[]; result: PayrollResult }` where
    - `PayslipWriteData` = the plain object written to `prisma.payslip.create/update` `data` (period, userId, countryCode, all money columns via `money()`, `irtBracketRate`, `taxBracket`, `calcInputs`, `calcSnapshot`, `status: 'DRAFT'`).
    - `PayslipItemWriteData` = `{ code: string; name: string; type: 'EARNING' | 'DEDUCTION'; value: number; isTaxable: boolean; calcType: 'FIXED'|'PERCENT'|'FORMULA'|'TABLE' | null; isEmployerCost: boolean; order: number }`.
  - `calculatePayslip(run: PayrollRunLike, user: TargetUser, overrides?: CalcOverrides): Promise<CalculatedPayslip>` where
    - `PayrollRunLike = { countryCode: string; taxYear: number | null; period: string }`
    - `TargetUser = { id: number }`
  - `private loadCompensation(userId): Promise<CompensationLike | null>` (active row, `include: { components: true }`).

- [ ] **Step 1: Add the failing test** — append to `payroll-calculation.service.spec.ts`:

```ts
describe('PayrollCalculationService.calculatePayslip', () => {
  let svc: PayrollCalculationService;
  let prisma: any;
  let engine: any;

  beforeEach(async () => {
    prisma = prismaMock();
    engine = { calculate: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        PayrollCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayrollEngineService, useValue: engine },
      ],
    }).compile();
    svc = mod.get(PayrollCalculationService);
  });

  const engineResult = {
    userId: 1, period: '2026-09', countryCode: 'AO', taxYear: 2026,
    lines: [
      { code: 'BASE_SALARY', name: 'Salário Base', type: 'EARNING', value: 100000, isTaxable: true, calcType: 'FIXED', isEmployerCost: false },
      { code: 'ALLOWANCE_FOOD', name: 'Subsídio de Alimentação', type: 'EARNING', value: 25000, isTaxable: false, calcType: 'FIXED', isEmployerCost: false },
      { code: 'INSS_EMPLOYEE', name: 'INSS Colaborador (3%)', type: 'DEDUCTION', value: 3000, isTaxable: false, calcType: 'PERCENT', isEmployerCost: false },
      { code: 'IRT', name: 'IRT', type: 'DEDUCTION', value: 3230, isTaxable: false, calcType: 'TABLE', isEmployerCost: false },
    ],
    totalEarnings: 125000, totalTaxableBase: 100000, grossSalary: 125000,
    totalDeductions: 6230, netSalary: 118770,
    employerSocialSecurity: 8000, totalEmployerCost: 133625,
    incomeTax: 3230, employeeSocialSecurity: 3000, taxBracketApplied: '11% (100.000 – 150.000 AOA)',
  };

  it('maps engine lines to PayslipItem write data with isEmployerCost + order', async () => {
    engine.calculate.mockResolvedValue(engineResult);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({ baseSalary: 100000, foodAllowance: 25000, components: [] });
    const out = await svc.calculatePayslip({ countryCode: 'AO', taxYear: 2026, period: '2026-09' }, { id: 1 });
    expect(out.items).toHaveLength(4);
    expect(out.items[0]).toMatchObject({ code: 'BASE_SALARY', type: 'EARNING', order: 0, isEmployerCost: false });
    expect(out.items.map(i => i.order)).toEqual([0, 1, 2, 3]);
  });

  it('fills the fixed compat columns from named lines', async () => {
    engine.calculate.mockResolvedValue(engineResult);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({ baseSalary: 100000, foodAllowance: 25000, components: [] });
    const out = await svc.calculatePayslip({ countryCode: 'AO', taxYear: 2026, period: '2026-09' }, { id: 1 });
    expect(out.data.baseSalary).toBe(100000);
    expect(out.data.mealAllowance).toBe(25000);
    expect(out.data.incomeTax).toBe(3230);
    expect(out.data.socialSecurity).toBe(3000);
    expect(out.data.grossSalary).toBe(125000);
    expect(out.data.netSalary).toBe(118770);
    expect(out.data.status).toBe('DRAFT');
  });

  it('passes overrides into the engine context', async () => {
    engine.calculate.mockResolvedValue(engineResult);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({ baseSalary: 100000, components: [] });
    await svc.calculatePayslip(
      { countryCode: 'AO', taxYear: 2026, period: '2026-09' },
      { id: 1 },
      { absenceDays: 2, bonusAmount: 5000 },
    );
    const [ctx] = engine.calculate.mock.calls[0];
    expect(ctx.absenceDays).toBe(2);
    expect(ctx.bonusAmount).toBe(5000);
  });

  it('defaults taxYear to the year of the period when run.taxYear is null', async () => {
    engine.calculate.mockResolvedValue(engineResult);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({ baseSalary: 100000, components: [] });
    await svc.calculatePayslip({ countryCode: 'AO', taxYear: null, period: '2026-09' }, { id: 1 });
    const [ctx] = engine.calculate.mock.calls[0];
    expect(ctx.taxYear).toBe(2026);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts -t calculatePayslip`
Expected: FAIL — `svc.calculatePayslip is not a function`.

- [ ] **Step 3: Implement `calculatePayslip`** — add to `PayrollCalculationService`, importing the engine types at top of file:

```ts
import type { PayrollContext, PayrollResult, PayrollLineItem } from './payroll-engine.service';
import { money, assertNetInvariant } from './money.util';
```

```ts
export interface CalcOverrides {
  absenceDays?: number;
  overtimeHours?: number;
  bonusAmount?: number;
  advanceDeduction?: number;
}

export interface PayrollRunLike {
  countryCode: string;
  taxYear: number | null;
  period: string;
}

export interface PayslipItemWriteData {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION';
  value: number;
  isTaxable: boolean;
  calcType: 'FIXED' | 'PERCENT' | 'FORMULA' | 'TABLE' | null;
  isEmployerCost: boolean;
  order: number;
}

export interface CalculatedPayslip {
  data: Record<string, unknown>;
  items: PayslipItemWriteData[];
  result: PayrollResult;
}

private lineValue(lines: PayrollLineItem[], code: string): number {
  return money(lines.filter(l => l.code === code).reduce((s, l) => s + l.value, 0));
}

async calculatePayslip(
  run: PayrollRunLike,
  user: { id: number },
  overrides: CalcOverrides = {},
): Promise<CalculatedPayslip> {
  const taxYear = run.taxYear ?? Number(run.period.slice(0, 4));
  const compensation = await this.prisma.read.employeeCompensation.findFirst({
    where: {
      userId: user.id,
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
    },
    include: { components: true },
    orderBy: { effectiveFrom: 'desc' },
  });

  const inputs = await this.gatherInputs(user.id, run.period);

  const ctx: PayrollContext = {
    userId: user.id,
    baseSalary: compensation?.baseSalary ?? 0,
    countryCode: run.countryCode,
    taxYear,
    foodAllowance: compensation?.foodAllowance ?? undefined,
    transportAllowance: compensation?.transportAllowance ?? undefined,
    absenceDays: overrides.absenceDays ?? inputs.absenceDays,
    overtimeHours: overrides.overtimeHours ?? inputs.overtimeHours,
    workingDaysInMonth: inputs.workingDaysInMonth,
    bonusAmount: overrides.bonusAmount,
    advanceDeduction: overrides.advanceDeduction,
    extraComponents: (compensation?.components ?? []).map(c => ({
      code: c.componentCode,
      value: c.value,
      isTaxable: true,
    })),
  };

  const result = await this.engine.calculate(ctx, run.period);

  const items: PayslipItemWriteData[] = result.lines.map((l, i) => ({
    code: l.code,
    name: l.name,
    type: l.type,
    value: money(l.value),
    isTaxable: l.isTaxable,
    calcType: (['FIXED', 'PERCENT', 'FORMULA', 'TABLE'].includes(l.calcType)
      ? l.calcType
      : null) as PayslipItemWriteData['calcType'],
    isEmployerCost: l.isEmployerCost,
    order: i,
  }));

  const totals = {
    grossSalary: money(result.grossSalary),
    totalDeductions: money(result.totalDeductions),
    netSalary: money(result.netSalary),
  };
  assertNetInvariant(totals);

  const data: Record<string, unknown> = {
    userId: user.id,
    period: run.period,
    countryCode: run.countryCode,
    baseSalary: this.lineValue(result.lines, 'BASE_SALARY'),
    mealAllowance: this.lineValue(result.lines, 'ALLOWANCE_FOOD'),
    otherAllowances: this.lineValue(result.lines, 'ALLOWANCE_TRANSPORT'),
    overtime: this.lineValue(result.lines, 'OVERTIME'),
    bonuses: this.lineValue(result.lines, 'BONUS'),
    vacationAllowance: 0,
    christmasAllowance: 0,
    grossSalary: totals.grossSalary,
    totalEarnings: money(result.totalEarnings),
    netSalary: totals.netSalary,
    totalDeductions: totals.totalDeductions,
    totalEmployerCost: money(result.totalEmployerCost),
    incomeTax: money(result.incomeTax),
    socialSecurity: money(result.employeeSocialSecurity),
    employerInss: money(result.employerSocialSecurity),
    healthInsurance: this.lineValue(result.lines, 'HEALTH_INSURANCE'),
    advanceDeduction: this.lineValue(result.lines, 'ADVANCE'),
    otherDeductions: this.lineValue(result.lines, 'UNION_FEE'),
    irtBracketRate:
      result.lines.find(l => l.code === 'IRT')?.calcType === 'TABLE'
        ? undefined
        : undefined,
    taxBracket: result.taxBracketApplied ?? null,
    calcInputs: {
      absenceDays: ctx.absenceDays,
      overtimeHours: ctx.overtimeHours,
      bonusAmount: ctx.bonusAmount ?? null,
      advanceDeduction: ctx.advanceDeduction ?? null,
      workingDaysInMonth: ctx.workingDaysInMonth,
    },
    calcSnapshot: result as unknown as Record<string, unknown>,
    status: 'DRAFT',
  };

  return { data, items, result };
}
```

> Note: `irtBracketRate` in the schema is `Float?` and the engine returns a label string, not a numeric rate — leave it unset here (the label is stored in `taxBracket`). Do not invent a numeric parse.

- [ ] **Step 4: Run the test, verify pass**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts -t calculatePayslip`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/payslips/payroll-calculation.service.ts src/payslips/payroll-calculation.service.spec.ts
git commit -m "feat(payroll): calculatePayslip — engine context + PayslipItem/column mapping"
```

---

### Task 1.4: `detectExceptions`

**Files:**
- Modify: `src/payslips/payroll-calculation.service.ts`
- Modify: `src/payslips/payroll-calculation.service.spec.ts`

**Interfaces:**
- Produces:
  - `type ExceptionSeverity = 'ERROR' | 'WARNING'`
  - `type PayrollException = { code: string; severity: ExceptionSeverity; message: string }`
  - `detectExceptions(args: { period: string; user: { id: number; fullName?: string }; compensation: CompensationLike | null; result: PayrollResult; minimumWage: number; usedFallbackConfig: boolean; prevNetSalary: number | null; conflictingPayslip: boolean }): PayrollException[]`

- [ ] **Step 1: Add the failing test** — append to the spec:

```ts
describe('PayrollCalculationService.detectExceptions', () => {
  let svc: PayrollCalculationService;
  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        PayrollCalculationService,
        { provide: PrismaService, useValue: prismaMock() },
        { provide: PayrollEngineService, useValue: { calculate: jest.fn() } },
      ],
    }).compile();
    svc = mod.get(PayrollCalculationService);
  });

  const base = {
    period: '2026-09',
    user: { id: 1, fullName: 'Ana' },
    compensation: { baseSalary: 100000, iban: 'AO06000000000000000000000' } as any,
    result: { netSalary: 90000, grossSalary: 100000 } as any,
    minimumWage: 70000,
    usedFallbackConfig: false,
    prevNetSalary: 90000,
    conflictingPayslip: false,
  };

  it('flags NO_COMPENSATION as ERROR', () => {
    const ex = svc.detectExceptions({ ...base, compensation: null });
    expect(ex.find(e => e.code === 'NO_COMPENSATION')?.severity).toBe('ERROR');
  });
  it('flags ZERO_BASE_SALARY as ERROR', () => {
    const ex = svc.detectExceptions({ ...base, compensation: { baseSalary: 0 } as any });
    expect(ex.find(e => e.code === 'ZERO_BASE_SALARY')?.severity).toBe('ERROR');
  });
  it('flags NEGATIVE_NET as ERROR', () => {
    const ex = svc.detectExceptions({ ...base, result: { netSalary: -10, grossSalary: 100 } as any });
    expect(ex.find(e => e.code === 'NEGATIVE_NET')?.severity).toBe('ERROR');
  });
  it('flags DUPLICATE_PAYSLIP_FOR_PERIOD as ERROR', () => {
    const ex = svc.detectExceptions({ ...base, conflictingPayslip: true });
    expect(ex.find(e => e.code === 'DUPLICATE_PAYSLIP_FOR_PERIOD')?.severity).toBe('ERROR');
  });
  it('flags NET_BELOW_MINIMUM_WAGE as WARNING', () => {
    const ex = svc.detectExceptions({ ...base, result: { netSalary: 50000, grossSalary: 60000 } as any });
    expect(ex.find(e => e.code === 'NET_BELOW_MINIMUM_WAGE')?.severity).toBe('WARNING');
  });
  it('flags MISSING_BANK_DETAILS as WARNING', () => {
    const ex = svc.detectExceptions({ ...base, compensation: { baseSalary: 100000, iban: '' } as any });
    expect(ex.find(e => e.code === 'MISSING_BANK_DETAILS')?.severity).toBe('WARNING');
  });
  it('flags HIGH_VARIANCE_VS_PREV_MONTH when abs delta > 30%', () => {
    const ex = svc.detectExceptions({ ...base, result: { netSalary: 40000, grossSalary: 50000 } as any, prevNetSalary: 90000 });
    expect(ex.find(e => e.code === 'HIGH_VARIANCE_VS_PREV_MONTH')?.severity).toBe('WARNING');
  });
  it('flags USING_FALLBACK_TAX_CONFIG as WARNING', () => {
    const ex = svc.detectExceptions({ ...base, usedFallbackConfig: true });
    expect(ex.find(e => e.code === 'USING_FALLBACK_TAX_CONFIG')?.severity).toBe('WARNING');
  });
  it('returns [] for a clean payslip', () => {
    expect(svc.detectExceptions(base)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts -t detectExceptions`
Expected: FAIL — `svc.detectExceptions is not a function`.

- [ ] **Step 3: Implement** — add to the service:

```ts
export type ExceptionSeverity = 'ERROR' | 'WARNING';
export interface PayrollException {
  code: string;
  severity: ExceptionSeverity;
  message: string;
}

detectExceptions(args: {
  period: string;
  user: { id: number; fullName?: string };
  compensation: { baseSalary: number; iban?: string | null } | null;
  result: { netSalary: number; grossSalary: number };
  minimumWage: number;
  usedFallbackConfig: boolean;
  prevNetSalary: number | null;
  conflictingPayslip: boolean;
}): PayrollException[] {
  const ex: PayrollException[] = [];
  const { compensation, result } = args;

  if (!compensation) {
    ex.push({ code: 'NO_COMPENSATION', severity: 'ERROR', message: 'Sem compensação activa registada.' });
  } else if (compensation.baseSalary <= 0) {
    ex.push({ code: 'ZERO_BASE_SALARY', severity: 'ERROR', message: 'Salário-base é 0.' });
  }

  if (result.netSalary < 0) {
    ex.push({ code: 'NEGATIVE_NET', severity: 'ERROR', message: `Líquido negativo (${result.netSalary}).` });
  }
  if (args.conflictingPayslip) {
    ex.push({
      code: 'DUPLICATE_PAYSLIP_FOR_PERIOD',
      severity: 'ERROR',
      message: `Já existe recibo de ${args.period} para este colaborador noutro run.`,
    });
  }
  if (result.netSalary >= 0 && result.netSalary < args.minimumWage) {
    ex.push({
      code: 'NET_BELOW_MINIMUM_WAGE',
      severity: 'WARNING',
      message: `Líquido ${result.netSalary} abaixo do salário mínimo ${args.minimumWage}.`,
    });
  }
  if (compensation && !compensation.iban) {
    ex.push({ code: 'MISSING_BANK_DETAILS', severity: 'WARNING', message: 'IBAN em falta na compensação.' });
  }
  if (args.prevNetSalary && args.prevNetSalary > 0) {
    const variance = Math.abs(result.netSalary - args.prevNetSalary) / args.prevNetSalary;
    if (variance > 0.3) {
      ex.push({
        code: 'HIGH_VARIANCE_VS_PREV_MONTH',
        severity: 'WARNING',
        message: `Variação de ${(variance * 100).toFixed(0)}% face ao mês anterior.`,
      });
    }
  }
  if (args.usedFallbackConfig) {
    ex.push({
      code: 'USING_FALLBACK_TAX_CONFIG',
      severity: 'WARNING',
      message: 'CountryConfig em falta — cálculo com tabela fiscal por omissão.',
    });
  }
  return ex;
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts -t detectExceptions`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/payslips/payroll-calculation.service.ts src/payslips/payroll-calculation.service.spec.ts
git commit -m "feat(payroll): detectExceptions — 8 exception codes with severity"
```

---

### Task 1.5: `resolveTargetUsers` + `processRun`

**Files:**
- Modify: `src/payslips/payroll-calculation.service.ts`
- Modify: `src/payslips/payroll-calculation.service.spec.ts`

**Interfaces:**
- Consumes: `calculatePayslip`, `detectExceptions` (this service); `PrismaService.$transaction`.
- Produces:
  - `resolveTargetUsers(run: { countryCode: string; scope: unknown }): Promise<Array<{ id: number; fullName: string }>>` — `scope` shape `{ departmentIds?: number[]; userIds?: number[] }`; empty/absent scope ⇒ all `active` users whose... (there is no per-user countryCode on `User`) ⇒ all `active` users. Document that limitation inline.
  - `processRun(runId: number): Promise<{ employeeCount: number; exceptionsCount: number; errorCount: number; totalGross: number; totalNet: number; totalDeductions: number; totalEmployerCost: number }>` — idempotent: deletes this run's `PayslipItem` + DRAFT `Payslip`, recreates for all targets, writes the totals/counts snapshot onto `PayrollRun`. Uses `this.prisma.payslip.findFirst` to detect a conflicting payslip `(userId, period)` with a different `runId` for `DUPLICATE_PAYSLIP_FOR_PERIOD`. Catches Prisma `P2002` on create and converts to that exception instead of throwing.

- [ ] **Step 1: Add the failing test** — append to the spec (mock `$transaction` to run the callback with a `tx` that mirrors `prisma`):

```ts
describe('PayrollCalculationService.processRun', () => {
  let svc: PayrollCalculationService;
  let prisma: any;
  let engine: any;

  beforeEach(async () => {
    prisma = prismaMock();
    prisma.payrollRun = { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) };
    prisma.payslip = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 10 }),
    };
    prisma.payslipItem = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany: jest.fn().mockResolvedValue({ count: 0 }) };
    prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));
    engine = { calculate: jest.fn().mockResolvedValue({
      lines: [], grossSalary: 125000, totalDeductions: 6230, netSalary: 118770,
      totalEarnings: 125000, totalEmployerCost: 133625, incomeTax: 3230,
      employeeSocialSecurity: 3000, employerSocialSecurity: 8000, taxBracketApplied: 'x',
    }) };
    const mod = await Test.createTestingModule({
      providers: [
        PayrollCalculationService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayrollEngineService, useValue: engine },
      ],
    }).compile();
    svc = mod.get(PayrollCalculationService);
  });

  it('recreates payslips for all targets and returns the totals snapshot', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 1, period: '2026-09', countryCode: 'AO', taxYear: 2026, scope: { userIds: [1, 2] },
    });
    prisma.read.user.findMany.mockResolvedValue([
      { id: 1, fullName: 'Ana' }, { id: 2, fullName: 'Rui' },
    ]);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue({ baseSalary: 100000, components: [] });

    const snap = await svc.processRun(1);

    expect(prisma.payslip.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: { runId: 1, status: 'DRAFT' } }));
    expect(prisma.payslip.create).toHaveBeenCalledTimes(2);
    expect(snap.employeeCount).toBe(2);
    expect(snap.totalNet).toBe(money(118770 * 2));
    expect(snap.errorCount).toBe(0);
  });

  it('counts NO_COMPENSATION as an error exception', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 1, period: '2026-09', countryCode: 'AO', taxYear: 2026, scope: { userIds: [1] },
    });
    prisma.read.user.findMany.mockResolvedValue([{ id: 1, fullName: 'Ana' }]);
    prisma.read.employeeCompensation.findFirst.mockResolvedValue(null);

    const snap = await svc.processRun(1);
    expect(snap.errorCount).toBeGreaterThanOrEqual(1);
    expect(snap.exceptionsCount).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts -t processRun`
Expected: FAIL — `svc.processRun is not a function`.

- [ ] **Step 3: Implement** — add to the service:

```ts
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
```

```ts
async resolveTargetUsers(run: { scope: unknown }): Promise<Array<{ id: number; fullName: string }>> {
  const scope = (run.scope ?? {}) as { departmentIds?: number[]; userIds?: number[] };
  const where: Prisma.UserWhereInput = { active: true };
  if (scope.userIds?.length) where.id = { in: scope.userIds };
  else if (scope.departmentIds?.length) where.departmentId = { in: scope.departmentIds };
  // NB: User tem sem countryCode — um scope vazio abrange todos os activos.
  return this.prisma.read.user.findMany({ where, select: { id: true, fullName: true } });
}

async processRun(runId: number) {
  const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundException('PayrollRun não encontrado');

  const targets = await this.resolveTargetUsers(run);
  const config = await this.engine.loadCountryConfig(
    run.countryCode,
    run.taxYear ?? Number(run.period.slice(0, 4)),
  );
  const minimumWage = config.minimumWage ?? 0;
  const usedFallbackConfig = !('id' in (config as Record<string, unknown>));

  let totalGross = 0, totalNet = 0, totalDeductions = 0, totalEmployerCost = 0;
  let exceptionsCount = 0, errorCount = 0;

  await this.prisma.$transaction(async tx => {
    await (tx as unknown as PrismaService).payslipItem.deleteMany({
      where: { payslip: { runId, status: 'DRAFT' } },
    });
    await (tx as unknown as PrismaService).payslip.deleteMany({ where: { runId, status: 'DRAFT' } });

    for (const user of targets) {
      const calc = await this.calculatePayslip(
        { countryCode: run.countryCode, taxYear: run.taxYear, period: run.period },
        user,
      );

      const conflicting = await (tx as unknown as PrismaService).payslip.findFirst({
        where: { userId: user.id, period: run.period, runId: { not: runId } },
        select: { id: true },
      });
      const prev = await (tx as unknown as PrismaService).payslip.findFirst({
        where: { userId: user.id, period: { lt: run.period }, status: { not: 'DRAFT' } },
        orderBy: { period: 'desc' },
        select: { netSalary: true },
      });

      const compensation = await this.prisma.read.employeeCompensation.findFirst({
        where: { userId: user.id, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] },
        orderBy: { effectiveFrom: 'desc' },
      });

      const exceptions = this.detectExceptions({
        period: run.period,
        user,
        compensation,
        result: calc.result,
        minimumWage,
        usedFallbackConfig,
        prevNetSalary: prev?.netSalary ?? null,
        conflictingPayslip: !!conflicting,
      });
      const hasError = exceptions.some(e => e.severity === 'ERROR');
      exceptionsCount += exceptions.length;
      if (hasError) errorCount += 1;

      try {
        const created = await (tx as unknown as PrismaService).payslip.create({
          data: {
            ...calc.data,
            runId,
            hasExceptions: exceptions.length > 0,
            exceptions: exceptions.length ? (exceptions as unknown as Prisma.InputJsonValue) : undefined,
          },
        });
        if (calc.items.length) {
          await (tx as unknown as PrismaService).payslipItem.createMany({
            data: calc.items.map(i => ({ ...i, payslipId: created.id })),
          });
        }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          errorCount += 1;
          exceptionsCount += 1;
          continue;
        }
        throw e;
      }

      totalGross += calc.data.grossSalary as number;
      totalNet += calc.data.netSalary as number;
      totalDeductions += calc.data.totalDeductions as number;
      totalEmployerCost += calc.data.totalEmployerCost as number;
    }

    await (tx as unknown as PrismaService).payrollRun.update({
      where: { id: runId },
      data: {
        employeeCount: targets.length,
        exceptionsCount,
        errorCount,
        totalGross: money(totalGross),
        totalNet: money(totalNet),
        totalDeductions: money(totalDeductions),
        totalEmployerCost: money(totalEmployerCost),
      },
    });
  });

  return {
    employeeCount: targets.length,
    exceptionsCount,
    errorCount,
    totalGross: money(totalGross),
    totalNet: money(totalNet),
    totalDeductions: money(totalDeductions),
    totalEmployerCost: money(totalEmployerCost),
  };
}
```

- [ ] **Step 4: Run the test, verify pass**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts -t processRun`
Expected: PASS (2 tests).

- [ ] **Step 5: Full-file test run**

Run: `npx jest src/payslips/payroll-calculation.service.spec.ts src/payslips/payroll-engine.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Reinforce engine specs** (spec §10) — add to `src/payslips/payroll-engine.service.spec.ts` a `describe('invariants')` block asserting, for a table of base salaries `[70000, 150000, 300000, 800000]`: `Math.abs(r.grossSalary - r.totalDeductions - r.netSalary) <= 0.01`; IRT at exact bracket edges (`100000`, `150000`); `employeeSocialSecurity === money(taxableBase * 0.03)`; absence proportional deduction (`baseSalary - absenceDays*(baseSalary/workDays)` reflected in `BASE_SALARY` line); overtime line `= overtimeHours * (baseSalary/(workDays*8)) * 1.5`.

- [ ] **Step 7: Commit**

```bash
git add src/payslips/payroll-calculation.service.ts src/payslips/payroll-calculation.service.spec.ts src/payslips/payroll-engine.service.spec.ts
git commit -m "feat(payroll): processRun (idempotent batch calc + exceptions snapshot) + engine invariant specs"
```

- [ ] **Step 8: `npx tsc --noEmit` clean; `npx prettier --write` touched files; push PR "Phase 1 — payroll calculation service"; wait for `quality` green; auto-merge.**

---

## Phase 2 — `PayrollWorkflowService` + `PayrollRunController` (PR 3, repo `innova`)

### Task 2.1: `assertPayslipEditable` shared guard

**Files:**
- Modify: `src/payslips/payslips.service.ts` (export the helper; call it in `update()`)
- Modify: `src/payslips/payslips.service.spec.ts` (or `payslips.service.additional.spec.ts`)

**Interfaces:**
- Produces: `export function assertPayslipEditable(payslip: { status: string; run?: { status: string } | null }): void` — throws `ForbiddenException` when `status ∈ {ISSUED, ACKNOWLEDGED, DISPUTED}` OR `run?.status === 'PUBLISHED'`.

- [ ] **Step 1: Write the failing test** — in `payslips.service.additional.spec.ts`:

```ts
import { assertPayslipEditable } from './payslips.service';
import { ForbiddenException } from '@nestjs/common';

describe('assertPayslipEditable', () => {
  it('allows DRAFT with no run', () => {
    expect(() => assertPayslipEditable({ status: 'DRAFT' })).not.toThrow();
  });
  it('allows DRAFT whose run is SIMULATED', () => {
    expect(() => assertPayslipEditable({ status: 'DRAFT', run: { status: 'SIMULATED' } })).not.toThrow();
  });
  it('blocks ISSUED / ACKNOWLEDGED / DISPUTED', () => {
    for (const status of ['ISSUED', 'ACKNOWLEDGED', 'DISPUTED']) {
      expect(() => assertPayslipEditable({ status })).toThrow(ForbiddenException);
    }
  });
  it('blocks a DRAFT payslip whose run is PUBLISHED', () => {
    expect(() => assertPayslipEditable({ status: 'DRAFT', run: { status: 'PUBLISHED' } })).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx jest src/payslips/payslips.service.additional.spec.ts -t assertPayslipEditable`
Expected: FAIL — `assertPayslipEditable` not exported.

- [ ] **Step 3: Implement** — add near the top of `src/payslips/payslips.service.ts` (module scope, after imports):

```ts
const LOCKED_PAYSLIP_STATUSES = new Set(['ISSUED', 'ACKNOWLEDGED', 'DISPUTED']);

/** Recibo imutável quando já emitido/confirmado/em-disputa, ou quando o seu run está PUBLISHED. */
export function assertPayslipEditable(payslip: {
  status: string;
  run?: { status: string } | null;
}): void {
  if (LOCKED_PAYSLIP_STATUSES.has(payslip.status) || payslip.run?.status === 'PUBLISHED') {
    throw new ForbiddenException('Recibo não editável no estado actual');
  }
}
```

- [ ] **Step 4: Call it in `update()`** — in `PayslipsService.update`, replace the `if (existing.status === 'ACKNOWLEDGED')` block. First widen the `findOne` include to pull the run status: change `update()` to fetch with the run —

```ts
async update(id: number, dto: UpdatePayslipDto) {
  const existing = await this.prisma.payslip.findUnique({
    where: { id },
    include: { run: { select: { status: true } } },
  });
  if (!existing) throw new NotFoundException('Recibo não encontrado');
  assertPayslipEditable(existing);
  // ...unchanged merge + computeTotals + update...
}
```

Keep the rest of `update()` identical.

- [ ] **Step 5: Run tests, verify pass**

Run: `npx jest src/payslips/payslips.service.spec.ts src/payslips/payslips.service.additional.spec.ts`
Expected: PASS (existing `update` tests still green — if one asserted the old "já confirmado" message, update its expected message to `Recibo não editável no estado actual`).

- [ ] **Step 6: Commit**

```bash
git add src/payslips/payslips.service.ts src/payslips/payslips.service.additional.spec.ts
git commit -m "feat(payroll): assertPayslipEditable shared guard + wire into PayslipsService.update"
```

---

### Task 2.2: `PayrollWorkflowService` — DTOs + state machine (`createRun`, `process`, transitions)

**Files:**
- Create: `src/payslips/payroll.dto.ts`
- Create: `src/payslips/payroll-workflow.service.ts`
- Create: `src/payslips/payroll-workflow.service.spec.ts`

**Interfaces:**
- Consumes: `PayrollCalculationService.processRun(runId)`; `AuditService.log(...)`; `assertPayslipEditable` from `./payslips.service`; `createNotificationSafe`; `PayslipPdfService` (Task 4 — inject via `@Optional()` for now, or forward-declare and wire in Phase 4). To avoid a Phase-2↔Phase-4 cycle, **publish's PDF step is added in Phase 4**; in Phase 2 `publish` issues + notifies only.
- Produces (`payroll.dto.ts`):
  - `class CreatePayrollRunDto { period: string; payGroup?: string; countryCode?: string; taxYear?: number; departmentIds?: number[]; userIds?: number[]; notes?: string }`
  - `class PayrollRunFilterDto extends BaseFilterDto { period?: string; status?: string; payGroup?: string }`
  - `class RejectRunDto { reason: string }`, `class CancelRunDto { reason: string }`
  - `class RecalcPayslipInputsDto { absenceDays?: number; overtimeHours?: number; bonusAmount?: number; advanceDeduction?: number }`
- Produces (`payroll-workflow.service.ts`): `PayrollWorkflowService` with
  - `createRun(dto: CreatePayrollRunDto, actorId: number)`
  - `process(runId: number, actorId: number)`
  - `recalcPayslip(runId: number, payslipId: number, dto: RecalcPayslipInputsDto)`
  - `excludePayslip(runId: number, payslipId: number)`
  - `submit(runId: number, actorId: number)`
  - `approve(runId: number, actor: { id: number })`
  - `reject(runId: number, actorId: number, dto: RejectRunDto)`
  - `publish(runId: number, actor: { id: number })`
  - `cancel(runId: number, actorId: number, dto: CancelRunDto)`
  - `getRun(runId: number)` (detail + resolved actor names + timeline), `list(filter)`, `listPayslips(runId, filter)`, `listExceptions(runId)`

- [ ] **Step 1: Write `payroll.dto.ts`**

```ts
// src/payslips/payroll.dto.ts
import {
  IsString, IsOptional, IsInt, IsArray, IsNumber, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseFilterDto } from '../common/dtos/pagination.dto';
import { EmptyStringToUndefined } from '../common/transformers/empty-string-to-undefined';

export class CreatePayrollRunDto {
  @ApiProperty({ example: '2026-09' })
  @IsString()
  period: string;

  @ApiPropertyOptional({ example: 'Mensais' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  payGroup?: string;

  @ApiPropertyOptional({ example: 'AO' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  taxYear?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  departmentIds?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  userIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  notes?: string;
}

export class PayrollRunFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ example: '2026-09' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payGroup?: string;
}

export class RejectRunDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class CancelRunDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class RecalcPayslipInputsDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) absenceDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) overtimeHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) bonusAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) advanceDeduction?: number;
}
```

- [ ] **Step 2: Write the failing state-machine test** — `src/payslips/payroll-workflow.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PayrollWorkflowService } from './payroll-workflow.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PayrollWorkflowService transitions', () => {
  let svc: PayrollWorkflowService;
  let prisma: any;
  let calc: any;
  let audit: any;

  const run = (over: Partial<any> = {}) => ({
    id: 1, period: '2026-09', payGroup: 'Mensais', status: 'DRAFT',
    countryCode: 'AO', taxYear: 2026, scope: {}, errorCount: 0, employeeCount: 3,
    totalNet: 300000, ...over,
  });

  beforeEach(async () => {
    prisma = {
      payrollRun: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue(run()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(run(data))),
      },
      payslip: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: any) => (typeof cb === 'function' ? cb(prisma) : Promise.all(cb))),
    };
    calc = { processRun: jest.fn().mockResolvedValue({ employeeCount: 3, exceptionsCount: 0, errorCount: 0, totalGross: 0, totalNet: 300000, totalDeductions: 0, totalEmployerCost: 0 }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const mod = await Test.createTestingModule({
      providers: [
        PayrollWorkflowService,
        { provide: PrismaService, useValue: prisma },
        { provide: PayrollCalculationService, useValue: calc },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    svc = mod.get(PayrollWorkflowService);
  });

  it('process: DRAFT -> SIMULATED, delegates to calc.processRun', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'DRAFT' }));
    await svc.process(1, 99);
    expect(calc.processRun).toHaveBeenCalledWith(1);
    const statuses = prisma.payrollRun.update.mock.calls.map((c: any) => c[0].data.status);
    expect(statuses).toContain('SIMULATED');
  });

  it('process: rejects an APPROVED run', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'APPROVED' }));
    await expect(svc.process(1, 99)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('submit: SIMULATED -> PENDING_APPROVAL', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'SIMULATED', errorCount: 0 }));
    await svc.submit(1, 99);
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING_APPROVAL', submittedById: 99 }),
    }));
  });

  it('submit: 409 when errorCount > 0', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'SIMULATED', errorCount: 2 }));
    await expect(svc.submit(1, 99)).rejects.toBeInstanceOf(ConflictException);
  });

  it('approve: PENDING_APPROVAL -> APPROVED + audit', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'PENDING_APPROVAL' }));
    await svc.approve(1, { id: 7 });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED', approvedById: 7 }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve', entity: 'PayrollRun', entityId: 1, userId: 7 }));
  });

  it('approve: 409 when not submitted', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'SIMULATED' }));
    await expect(svc.approve(1, { id: 7 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('publish: APPROVED -> PUBLISHED, issues payslips + audit', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'APPROVED' }));
    prisma.payslip.findMany.mockResolvedValue([{ id: 10, userId: 1, period: '2026-09', status: 'DRAFT' }]);
    await svc.publish(1, { id: 7 });
    expect(prisma.payslip.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ runId: 1, status: 'DRAFT' }),
      data: expect.objectContaining({ status: 'ISSUED' }),
    }));
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PUBLISHED', publishedById: 7 }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'publish' }));
  });

  it('publish: 409 when not approved', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'PENDING_APPROVAL' }));
    await expect(svc.publish(1, { id: 7 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('reject: PENDING_APPROVAL -> SIMULATED with reason + audit', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'PENDING_APPROVAL' }));
    await svc.reject(1, 7, { reason: 'valores errados' });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SIMULATED', rejectionReason: 'valores errados' }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject' }));
  });

  it('cancel: any non-PUBLISHED -> CANCELLED + audit; PUBLISHED -> 409', async () => {
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'SIMULATED' }));
    await svc.cancel(1, 7, { reason: 'engano' });
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CANCELLED', cancellationReason: 'engano' }),
    }));
    prisma.payrollRun.findUnique.mockResolvedValue(run({ status: 'PUBLISHED' }));
    await expect(svc.cancel(1, 7, { reason: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx jest src/payslips/payroll-workflow.service.spec.ts`
Expected: FAIL — cannot find `./payroll-workflow.service`.

- [ ] **Step 4: Implement `payroll-workflow.service.ts`**

```ts
// src/payslips/payroll-workflow.service.ts
import {
  Injectable, Logger, NotFoundException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { AuditService } from '../common/services/audit.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { assertPayslipEditable } from './payslips.service';
import {
  CreatePayrollRunDto, PayrollRunFilterDto, RejectRunDto, CancelRunDto, RecalcPayslipInputsDto,
} from './payroll.dto';

const EDIT_LOCKED = new Set(['APPROVED', 'PUBLISHED', 'CANCELLED']);

@Injectable()
export class PayrollWorkflowService {
  private readonly logger = new Logger(PayrollWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: PayrollCalculationService,
    private readonly audit: AuditService,
  ) {}

  private async loadRun(runId: number) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException('PayrollRun não encontrado');
    return run;
  }

  private assertTransition(run: { status: string }, from: string[], action: string) {
    if (!from.includes(run.status)) {
      throw new ConflictException(
        `Transição inválida: '${action}' requer estado ${from.join('|')}, run está em ${run.status}.`,
      );
    }
  }

  private assertRunEditable(run: { status: string }) {
    if (EDIT_LOCKED.has(run.status)) {
      throw new ForbiddenException(`Run em ${run.status} é imutável.`);
    }
  }

  async createRun(dto: CreatePayrollRunDto, actorId: number) {
    const scope: Prisma.InputJsonValue = {};
    if (dto.departmentIds?.length) (scope as Record<string, unknown>).departmentIds = dto.departmentIds;
    if (dto.userIds?.length) (scope as Record<string, unknown>).userIds = dto.userIds;

    return this.prisma.payrollRun.create({
      data: {
        period: dto.period,
        countryCode: dto.countryCode ?? 'AO',
        taxYear: dto.taxYear ?? Number(dto.period.slice(0, 4)),
        payGroup: dto.payGroup ?? null,
        notes: dto.notes ?? null,
        scope: Object.keys(scope).length ? scope : Prisma.DbNull,
        status: 'DRAFT',
        createdById: actorId,
      },
    });
  }

  async process(runId: number, actorId: number) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['DRAFT', 'SIMULATED'], 'process');
    this.assertRunEditable(run);

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PROCESSING', processedById: actorId, processedAt: new Date() },
    });
    try {
      const snap = await this.calc.processRun(runId);
      return this.prisma.payrollRun.update({
        where: { id: runId },
        data: { status: 'SIMULATED', ...snap },
      });
    } catch (e) {
      await this.prisma.payrollRun.update({ where: { id: runId }, data: { status: 'DRAFT' } });
      throw e;
    }
  }

  async recalcPayslip(runId: number, payslipId: number, dto: RecalcPayslipInputsDto) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['SIMULATED'], 'recalc');
    this.assertRunEditable(run);

    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: { run: { select: { status: true } } },
    });
    if (!payslip || payslip.runId !== runId) throw new NotFoundException('Recibo não pertence a este run');
    assertPayslipEditable(payslip);

    const calc = await this.calc.calculatePayslip(
      { countryCode: run.countryCode, taxYear: run.taxYear, period: run.period },
      { id: payslip.userId },
      {
        absenceDays: dto.absenceDays,
        overtimeHours: dto.overtimeHours,
        bonusAmount: dto.bonusAmount,
        advanceDeduction: dto.advanceDeduction,
      },
    );

    return this.prisma.$transaction(async tx => {
      await (tx as unknown as PrismaService).payslipItem.deleteMany({ where: { payslipId } });
      const updated = await (tx as unknown as PrismaService).payslip.update({
        where: { id: payslipId },
        data: { ...calc.data, runId },
      });
      if (calc.items.length) {
        await (tx as unknown as PrismaService).payslipItem.createMany({
          data: calc.items.map(i => ({ ...i, payslipId })),
        });
      }
      return updated;
    });
  }

  async excludePayslip(runId: number, payslipId: number) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['SIMULATED'], 'exclude');
    this.assertRunEditable(run);
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: { run: { select: { status: true } } },
    });
    if (!payslip || payslip.runId !== runId) throw new NotFoundException('Recibo não pertence a este run');
    assertPayslipEditable(payslip);
    return this.prisma.payslip.update({ where: { id: payslipId }, data: { runId: null } });
  }

  async submit(runId: number, actorId: number) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['SIMULATED'], 'submit');
    if ((run.errorCount ?? 0) > 0) {
      throw new ConflictException(`Run tem ${run.errorCount} exceção(ões) de erro — resolver antes de submeter.`);
    }
    return this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PENDING_APPROVAL', submittedById: actorId, submittedAt: new Date() },
    });
  }

  async approve(runId: number, actor: { id: number }) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['PENDING_APPROVAL'], 'approve');
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() },
    });
    await this.audit.log({
      userId: actor.id, action: 'approve', entity: 'PayrollRun', entityId: runId,
      metadata: {
        period: run.period, payGroup: run.payGroup, employeeCount: run.employeeCount,
        totalNet: run.totalNet, submittedById: run.submittedById, approvedById: actor.id,
      },
    });
    return updated;
  }

  async reject(runId: number, actorId: number, dto: RejectRunDto) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['PENDING_APPROVAL'], 'reject');
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'SIMULATED', rejectionReason: dto.reason },
    });
    await this.audit.log({
      userId: actorId, action: 'reject', entity: 'PayrollRun', entityId: runId,
      metadata: { period: run.period, reason: dto.reason },
    });
    return updated;
  }

  async publish(runId: number, actor: { id: number }) {
    const run = await this.loadRun(runId);
    this.assertTransition(run, ['APPROVED'], 'publish');

    const payslips = await this.prisma.payslip.findMany({
      where: { runId, status: 'DRAFT' },
      select: { id: true, userId: true, period: true },
    });

    const CHUNK = 200;
    for (let i = 0; i < payslips.length; i += CHUNK) {
      const ids = payslips.slice(i, i + CHUNK).map(p => p.id);
      await this.prisma.payslip.updateMany({
        where: { id: { in: ids }, runId, status: 'DRAFT' },
        data: { status: 'ISSUED', issuedAt: new Date() },
      });
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'PUBLISHED', publishedById: actor.id, publishedAt: new Date() },
    });

    // PDF é adicionado na Fase 4. Aqui só notificamos.
    for (const p of payslips) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: p.userId,
        type: 'PAYSLIP_ISSUED',
        message: `O seu recibo de ${p.period} está disponível.`,
      });
    }

    await this.audit.log({
      userId: actor.id, action: 'publish', entity: 'PayrollRun', entityId: runId,
      metadata: {
        period: run.period, payGroup: run.payGroup, employeeCount: run.employeeCount,
        totalNet: run.totalNet, approvedById: run.approvedById, publishedById: actor.id,
      },
    });
    return updated;
  }

  async cancel(runId: number, actorId: number, dto: CancelRunDto) {
    const run = await this.loadRun(runId);
    if (run.status === 'PUBLISHED') {
      throw new ConflictException('Run publicado não pode ser cancelado.');
    }
    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', cancellationReason: dto.reason },
    });
    await this.audit.log({
      userId: actorId, action: 'cancel', entity: 'PayrollRun', entityId: runId,
      metadata: { period: run.period, reason: dto.reason },
    });
    return updated;
  }
}
```

- [ ] **Step 5: Run the test, verify pass**

Run: `npx jest src/payslips/payroll-workflow.service.spec.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add src/payslips/payroll.dto.ts src/payslips/payroll-workflow.service.ts src/payslips/payroll-workflow.service.spec.ts
git commit -m "feat(payroll): PayrollWorkflowService state machine + DTOs + audit on approve/publish/reject/cancel"
```

---

### Task 2.3: Read queries — `getRun`, `list`, `listPayslips`, `listExceptions`

**Files:**
- Modify: `src/payslips/payroll-workflow.service.ts`
- Modify: `src/payslips/payroll-workflow.service.spec.ts`

**Interfaces:**
- Produces:
  - `list(filter: PayrollRunFilterDto)` → `buildPaginatedResponse` of runs ordered `period desc, id desc`.
  - `getRun(runId)` → run + `timeline: Array<{ step: string; at: Date | null; by: { id: number; fullName: string } | null }>` (created/processed/submitted/approved/published) with names resolved via a single `user.findMany({ where: { id: { in: ids } } })`.
  - `listPayslips(runId, filter: PayrollRunFilterDto)` → paginated payslips of the run, `include: { user: { select: { id, fullName, employeeNumber } }, items: true }`, ordered `user.fullName asc`.
  - `listExceptions(runId)` → flat `Array<{ payslipId; userId; fullName; code; severity; message }>` derived from each payslip's `exceptions` JSON.

- [ ] **Step 1: Add failing tests** — append to the workflow spec a `describe('reads')` block: `getRun` resolves actor names into `timeline`; `listExceptions` flattens the `exceptions` JSON array of two payslips into 3 rows with `fullName` filled. (Mock `prisma.payrollRun.findUnique`, `prisma.read.user.findMany`, `prisma.read.payslip.findMany`.)

- [ ] **Step 2: Run, verify fail.** `npx jest src/payslips/payroll-workflow.service.spec.ts -t reads` → FAIL.

- [ ] **Step 3: Implement** the four methods. `getRun` example core:

```ts
async getRun(runId: number) {
  const run = await this.loadRun(runId);
  const ids = [run.createdById, run.processedById, run.submittedById, run.approvedById, run.publishedById]
    .filter((x): x is number => typeof x === 'number');
  const users = ids.length
    ? await this.prisma.read.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const byId = new Map(users.map(u => [u.id, u]));
  const step = (name: string, at: Date | null, uid: number | null) => ({
    step: name, at, by: uid != null ? byId.get(uid) ?? null : null,
  });
  return {
    ...run,
    timeline: [
      step('created', run.createdAt, run.createdById),
      step('processed', run.processedAt, run.processedById),
      step('submitted', run.submittedAt, run.submittedById),
      step('approved', run.approvedAt, run.approvedById),
      step('published', run.publishedAt, run.publishedById),
    ],
  };
}

async list(filter: PayrollRunFilterDto) {
  const { page = 1, limit = 20, period, status, payGroup } = filter;
  const { skip, take } = calculatePagination(page, limit);
  const where: Prisma.PayrollRunWhereInput = {};
  if (period) where.period = period;
  if (status) where.status = status as Prisma.PayrollRunWhereInput['status'];
  if (payGroup) where.payGroup = payGroup;
  const [data, total] = await Promise.all([
    this.prisma.read.payrollRun.findMany({ where, skip, take, orderBy: [{ period: 'desc' }, { id: 'desc' }] }),
    this.prisma.read.payrollRun.count({ where }),
  ]);
  return buildPaginatedResponse(data, total, page, limit);
}

async listPayslips(runId: number, filter: PayrollRunFilterDto) {
  const { page = 1, limit = 50 } = filter;
  const { skip, take } = calculatePagination(page, limit);
  const where: Prisma.PayslipWhereInput = { runId };
  const [data, total] = await Promise.all([
    this.prisma.read.payslip.findMany({
      where, skip, take,
      include: { user: { select: { id: true, fullName: true, employeeNumber: true } }, items: true },
      orderBy: { user: { fullName: 'asc' } },
    }),
    this.prisma.read.payslip.count({ where }),
  ]);
  return buildPaginatedResponse(data, total, page, limit);
}

async listExceptions(runId: number) {
  const rows = await this.prisma.read.payslip.findMany({
    where: { runId, hasExceptions: true },
    select: { id: true, userId: true, exceptions: true, user: { select: { fullName: true } } },
  });
  const out: Array<{ payslipId: number; userId: number; fullName: string; code: string; severity: string; message: string }> = [];
  for (const r of rows) {
    const list = Array.isArray(r.exceptions) ? (r.exceptions as Array<Record<string, string>>) : [];
    for (const e of list) {
      out.push({
        payslipId: r.id, userId: r.userId, fullName: r.user?.fullName ?? '—',
        code: e.code, severity: e.severity, message: e.message,
      });
    }
  }
  return out;
}
```

- [ ] **Step 3b: Add `refreshRunSnapshot(runId)` and call it after recalc/exclude** — a stale `run.errorCount`/`exceptionsCount` after a `recalcPayslip` or `excludePayslip` would let a run with unresolved errors be submitted. Add to `PayrollWorkflowService`:

```ts
/** Recompõe employeeCount/exceptionsCount/errorCount/totais do run a partir dos recibos actuais. */
async refreshRunSnapshot(runId: number) {
  const payslips = await this.prisma.read.payslip.findMany({
    where: { runId },
    select: { grossSalary: true, netSalary: true, totalDeductions: true, totalEmployerCost: true, exceptions: true, hasExceptions: true },
  });
  let exceptionsCount = 0, errorCount = 0;
  let totalGross = 0, totalNet = 0, totalDeductions = 0, totalEmployerCost = 0;
  for (const p of payslips) {
    const list = Array.isArray(p.exceptions) ? (p.exceptions as Array<{ severity: string }>) : [];
    exceptionsCount += list.length;
    if (list.some(e => e.severity === 'ERROR')) errorCount += 1;
    totalGross += p.grossSalary ?? 0;
    totalNet += p.netSalary ?? 0;
    totalDeductions += p.totalDeductions ?? 0;
    totalEmployerCost += p.totalEmployerCost ?? 0;
  }
  return this.prisma.payrollRun.update({
    where: { id: runId },
    data: {
      employeeCount: payslips.length,
      exceptionsCount, errorCount,
      totalGross: money(totalGross), totalNet: money(totalNet),
      totalDeductions: money(totalDeductions), totalEmployerCost: money(totalEmployerCost),
    },
  });
}
```

Import `money` from `./money.util`. Call `await this.refreshRunSnapshot(runId);` at the end of `recalcPayslip` and `excludePayslip` (return the payslip result as before — snapshot refresh is a side effect). Add a test: after `recalcPayslip` clears the only ERROR, `payrollRun.update` was called with `errorCount: 0`; after `excludePayslip` of the last payslip, `employeeCount: 0`.

- [ ] **Step 4: Run, verify pass.** `npx jest src/payslips/payroll-workflow.service.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/payslips/payroll-workflow.service.ts src/payslips/payroll-workflow.service.spec.ts
git commit -m "feat(payroll): workflow read queries + refreshRunSnapshot after recalc/exclude"
```

---

### Task 2.4: `PayrollRunController` + module wiring

**Files:**
- Create: `src/payslips/payroll-run.controller.ts`
- Create: `src/payslips/payroll-run.controller.spec.ts`
- Modify: `src/payslips/payslips.module.ts`

**Interfaces:**
- Consumes: `PayrollWorkflowService`; `@CurrentUser() user: CurrentUserData` for `actorId = user.id`.
- Produces: routes per spec §6 table, all `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN, Role.RH)` at class level.

- [ ] **Step 1: Write the failing controller test** — `payroll-run.controller.spec.ts`: instantiate with a mocked `PayrollWorkflowService`; assert each route delegates with the right args (`create` → `createRun(dto, user.id)`; `process` → `process(id, user.id)`; `approve` → `approve(id, user)`; `publish` → `publish(id, user)`; `reject`/`cancel` pass the dto; `recalc` passes `(runId, payslipId, dto)`).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `payroll-run.controller.ts`**

```ts
// src/payslips/payroll-run.controller.ts
import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { PayrollWorkflowService } from './payroll-workflow.service';
import {
  CreatePayrollRunDto, PayrollRunFilterDto, RejectRunDto, CancelRunDto, RecalcPayslipInputsDto,
} from './payroll.dto';

@ApiTags('Payroll Runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('payroll/runs')
export class PayrollRunController {
  constructor(private readonly wf: PayrollWorkflowService) {}

  @Post()
  @ApiOperation({ summary: 'Criar folha de vencimentos (run)' })
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: CurrentUserData) {
    return this.wf.createRun(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar runs' })
  list(@Query() filter: PayrollRunFilterDto) {
    return this.wf.list(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do run + timeline' })
  getRun(@Param('id', ParseIntPipe) id: number) {
    return this.wf.getRun(id);
  }

  @Get(':id/payslips')
  @ApiOperation({ summary: 'Recibos do run' })
  payslips(@Param('id', ParseIntPipe) id: number, @Query() filter: PayrollRunFilterDto) {
    return this.wf.listPayslips(id, filter);
  }

  @Get(':id/exceptions')
  @ApiOperation({ summary: 'Exceções do run (lista plana)' })
  exceptions(@Param('id', ParseIntPipe) id: number) {
    return this.wf.listExceptions(id);
  }

  @Post(':id/process')
  @HttpCode(HttpStatus.OK)
  process(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.wf.process(id, user.id);
  }

  @Patch(':id/payslips/:payslipId/recalc')
  recalc(
    @Param('id', ParseIntPipe) id: number,
    @Param('payslipId', ParseIntPipe) payslipId: number,
    @Body() dto: RecalcPayslipInputsDto,
  ) {
    return this.wf.recalcPayslip(id, payslipId, dto);
  }

  @Patch(':id/payslips/:payslipId/exclude')
  exclude(
    @Param('id', ParseIntPipe) id: number,
    @Param('payslipId', ParseIntPipe) payslipId: number,
  ) {
    return this.wf.excludePayslip(id, payslipId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.wf.submit(id, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.wf.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RejectRunDto,
  ) {
    return this.wf.reject(id, user.id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.wf.publish(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CancelRunDto,
  ) {
    return this.wf.cancel(id, user.id, dto);
  }
}
```

- [ ] **Step 4: Wire the module** — update `src/payslips/payslips.module.ts` to register `PayrollCalculationService`, `PayrollWorkflowService` in `providers` and `PayrollRunController` in `controllers`:

```ts
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollWorkflowService } from './payroll-workflow.service';
import { PayrollRunController } from './payroll-run.controller';
// ...
  providers: [
    PayslipsService, PayrollEngineService,
    PayrollCalculationService, PayrollWorkflowService,
  ],
  controllers: [PayslipsController, PayrollRunController],
  exports: [PayslipsService, PayrollEngineService, PayrollCalculationService, PayrollWorkflowService],
```

- [ ] **Step 5: Run tests, verify pass.**

Run: `npx jest src/payslips/`
Expected: PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 6: Boot smoke** — `npx jest test/integration/health` (or start `npm run start:dev` briefly) to confirm Nest resolves the new providers with no `Nest can't resolve dependencies` error.

- [ ] **Step 7: Commit**

```bash
git add src/payslips/payroll-run.controller.ts src/payslips/payroll-run.controller.spec.ts src/payslips/payslips.module.ts
git commit -m "feat(payroll): PayrollRunController + module wiring"
```

---

### Task 2.5: Integration spec — workflow happy path + invalid transitions + IDOR

**Files:**
- Create: `test/integration/payroll/payroll.integration-spec.ts`

**Interfaces:**
- Consumes: `getToken(server, 'rh' | 'employee')`, `INT_CREDENTIALS` from `test/integration/helpers/auth.helper`; a raw `PrismaClient` on `innova_test`.

- [ ] **Step 1: Write the spec** (real, runs against Postgres). Structure mirrors `test/integration/payslips/payslips.integration-spec.ts`:
  - `beforeAll`: init app with the exact `main.ts` ValidationPipe config; get `rhToken`, `employeeToken`; ensure a `CountryConfig` AO + brackets exist (call the seed helper or `upsert` inline); create an `EmployeeCompensation` for the RH test employee (`baseSalary: 120000`) and for `otherEmployee` (leave one WITHOUT compensation to force `NO_COMPENSATION`).
  - Test 1 — happy path: `POST /payroll/runs` `{ period: '2026-09', userIds: [employeeId] }` → 201, status `DRAFT`. `POST /:id/process` → 200, status `SIMULATED`, `employeeCount === 1`. Assert one `Payslip` + `PayslipItem[]` rows in DB with `runId`. `POST /:id/submit` → 200 `PENDING_APPROVAL`. `POST /:id/approve` → 200 `APPROVED`; assert an `AuditLog` row `entity='PayrollRun'`, `action='approve'`, metadata JSON contains `approvedById`. `POST /:id/publish` → 200 `PUBLISHED`; assert the `Payslip.status === 'ISSUED'`, a `NotificationLog` `type='PAYSLIP_ISSUED'`, and an `AuditLog` `action='publish'`.
  - Test 2 — invalid transitions: fresh run, `POST /:id/approve` before submit → 409; `POST /:id/publish` before approve → 409; after publish, `POST /:id/process` → 403 (`assertRunEditable`); `POST /:id/publish` again → 409.
  - Test 3 — `submit` blocked by errors: run scoped to the no-compensation employee → `process` → `errorCount >= 1`; `POST /:id/submit` → 409.
  - Test 4 — IDOR: `POST /payroll/runs` with `employeeToken` → 403; `POST /:id/approve` with `employeeToken` → 403.
  - Test 5 — immutability: publish a run, then `PUT /payslips/:issuedId` with `rhToken` → 403 (`assertPayslipEditable` via `run.status==='PUBLISHED'`).
  - `afterAll`: FK-ordered cleanup, each `.catch(() => undefined)` — `payslipItem.deleteMany({ where: { payslip: { runId: { in: runIds } } } })` → `payslipAccessLog`/`payslipDispute` by `payslipId` → `payslip.deleteMany({ where: { runId: { in: runIds } } })` → `payrollRun.deleteMany({ where: { id: { in: runIds } } })` → `employeeCompensation.deleteMany` for the test users → `auditLog.deleteMany({ where: { entity: 'PayrollRun', entityId: { in: runIds } } })` → `notificationLog.deleteMany` for the test users with `type: 'PAYSLIP_ISSUED'`.

- [ ] **Step 2: Run just this spec**

Run: `npx jest test/integration/payroll/payroll.integration-spec.ts --runInBand`
Expected: PASS (5 tests). Redis + `innova_test` Postgres must be up; migrations applied (`npx prisma migrate deploy` against test DB).

- [ ] **Step 3: Commit**

```bash
git add test/integration/payroll/payroll.integration-spec.ts
git commit -m "test(payroll): integration — workflow happy path, invalid transitions, IDOR, immutability"
```

- [ ] **Step 4: `npx prettier --write` touched files; push PR "Phase 2 — payroll workflow + run API"; wait for `quality` green; auto-merge.**

---

## Phase 3 — Catalogue CRUD: `SalaryComponent`, `EmployeeCompensation`, ESS compensation (PR 4, repo `innova`)

> Depends on Phase 0 only — can be developed in parallel with Phases 1–2 but merges after Phase 2 to avoid `payslips.module.ts` conflicts. Rebase on `main` before pushing.

### Task 3.1: `SalaryComponentService` + `SalaryComponentController`

**Files:**
- Create: `src/payslips/salary-component.service.ts`, `src/payslips/salary-component.service.spec.ts`
- Create: `src/payslips/salary-component.controller.ts`
- Modify: `src/payslips/payroll.dto.ts` (add component DTOs), `src/payslips/payslips.module.ts`

**Interfaces:**
- Produces (DTOs in `payroll.dto.ts`):
  - `class SalaryComponentFilterDto extends BaseFilterDto { type?: 'EARNING'|'DEDUCTION'; active?: boolean; countryCode?: string }` (`active` uses `@Type(() => String) @Transform(({value}) => value === 'true')`)
  - `class CreateSalaryComponentDto { code; name; description?; type; calcType; fixedValue?; rate?; formula?; isTaxable?; isMandatory?; order?; countryCode? }` with conditional `@ValidateIf`: `calcType === 'FIXED'` ⇒ `fixedValue` required; `'PERCENT'` ⇒ `rate` required; `'FORMULA'` ⇒ `formula` required.
  - `class UpdateSalaryComponentDto extends PartialType(OmitType(CreateSalaryComponentDto, ['code'] as const)) {}`
- Produces (service): `list(filter)`, `create(dto)`, `get(code)`, `update(code, dto)`, `remove(code)` — `remove` soft-deletes (`active: false`) when referenced by `employeeCompensationComponent` or `payslipItem` (check with `count`), hard-deletes otherwise.

- [ ] **Step 1: Write the failing service test** — cover: `create` persists; `create` with `calcType FIXED` and no `fixedValue` → the DTO validation is out of scope for the unit test, so test the service's `remove` branching instead: `remove` soft-deletes when `payslipItem.count > 0`, hard-deletes when both counts are 0.

```ts
import { Test } from '@nestjs/testing';
import { SalaryComponentService } from './salary-component.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SalaryComponentService.remove', () => {
  let svc: SalaryComponentService;
  let prisma: any;
  beforeEach(async () => {
    prisma = {
      salaryComponent: { update: jest.fn().mockResolvedValue({ code: 'X', active: false }), delete: jest.fn().mockResolvedValue({ code: 'X' }) },
      read: {
        employeeCompensationComponent: { count: jest.fn().mockResolvedValue(0) },
        payslipItem: { count: jest.fn().mockResolvedValue(0) },
      },
    };
    const mod = await Test.createTestingModule({
      providers: [SalaryComponentService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(SalaryComponentService);
  });

  it('hard-deletes an unreferenced component', async () => {
    await svc.remove('X');
    expect(prisma.salaryComponent.delete).toHaveBeenCalledWith({ where: { code: 'X' } });
  });
  it('soft-deletes a referenced component', async () => {
    prisma.read.payslipItem.count.mockResolvedValue(4);
    await svc.remove('X');
    expect(prisma.salaryComponent.update).toHaveBeenCalledWith({ where: { code: 'X' }, data: { active: false } });
    expect(prisma.salaryComponent.delete).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement the service**

```ts
// src/payslips/salary-component.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SalaryComponentFilterDto, CreateSalaryComponentDto, UpdateSalaryComponentDto,
} from './payroll.dto';

@Injectable()
export class SalaryComponentService {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: SalaryComponentFilterDto) {
    const where: Prisma.SalaryComponentWhereInput = {};
    if (filter.type) where.type = filter.type;
    if (filter.countryCode) where.countryCode = filter.countryCode;
    if (typeof filter.active === 'boolean') where.active = filter.active;
    return this.prisma.read.salaryComponent.findMany({ where, orderBy: { order: 'asc' } });
  }

  create(dto: CreateSalaryComponentDto) {
    return this.prisma.salaryComponent.create({ data: { ...dto } });
  }

  async get(code: string) {
    const c = await this.prisma.read.salaryComponent.findUnique({ where: { code } });
    if (!c) throw new NotFoundException('Componente não encontrado');
    return c;
  }

  async update(code: string, dto: UpdateSalaryComponentDto) {
    await this.get(code);
    return this.prisma.salaryComponent.update({ where: { code }, data: { ...dto } });
  }

  async remove(code: string) {
    const [inComp, inItems] = await Promise.all([
      this.prisma.read.employeeCompensationComponent.count({ where: { componentCode: code } }),
      this.prisma.read.payslipItem.count({ where: { code } }),
    ]);
    if (inComp + inItems > 0) {
      return this.prisma.salaryComponent.update({ where: { code }, data: { active: false } });
    }
    return this.prisma.salaryComponent.delete({ where: { code } });
  }
}
```

- [ ] **Step 4: Add DTOs to `payroll.dto.ts`** — import `ValidateIf`, `IsBoolean`, `IsEnum`, `PartialType`, `OmitType`, `Transform`; add `SalaryComponentFilterDto`, `CreateSalaryComponentDto` (with `@ValidateIf((o) => o.calcType === 'FIXED') @IsNumber() fixedValue?` etc.), `UpdateSalaryComponentDto`.

- [ ] **Step 5: Write `salary-component.controller.ts`** — `@Controller('payroll/components')`, class-level `@UseGuards(JwtAuthGuard, RolesGuard) @Roles(Role.ADMIN, Role.RH)`; `GET /`, `POST /`, `GET /:code`, `PUT /:code`, `DELETE /:code` delegating to the service.

- [ ] **Step 6: Register in module** — add `SalaryComponentService` to `providers`, `SalaryComponentController` to `controllers`.

- [ ] **Step 7: Run tests + tsc.** `npx jest src/payslips/salary-component.service.spec.ts` → PASS; `npx tsc --noEmit` clean.

- [ ] **Step 8: Commit**

```bash
git add src/payslips/salary-component.* src/payslips/payroll.dto.ts src/payslips/payslips.module.ts
git commit -m "feat(payroll): SalaryComponent CRUD (soft-delete when referenced)"
```

---

### Task 3.2: `EmployeeCompensationService` + `EmployeeCompensationController`

**Files:**
- Create: `src/payslips/employee-compensation.service.ts`, `src/payslips/employee-compensation.service.spec.ts`
- Create: `src/payslips/employee-compensation.controller.ts`
- Modify: `src/payslips/payroll.dto.ts`, `src/payslips/payslips.module.ts`

**Interfaces:**
- Produces (DTOs):
  - `class CreateEmployeeCompensationDto { userId: number; baseSalary: number; countryCode?: string; bankName?: string; iban?: string; accountNumber?: string; effectiveFrom?: string; foodAllowance?: number; transportAllowance?: number }`
  - `class UpdateEmployeeCompensationDto extends PartialType(OmitType(CreateEmployeeCompensationDto, ['userId'] as const)) {}`
  - `class UpsertCompensationComponentsDto { items: Array<{ componentCode: string; value: number; override?: boolean }> }` (`@ValidateNested({ each: true }) @Type(() => CompensationComponentItemDto)`)
- Produces (service):
  - `history(userId)` → records `orderBy effectiveFrom desc`, `include: { components: true }`
  - `current(userId)` → active record or `null`
  - `create(dto)` → in a `$transaction`: close the previous open record (`effectiveTo = new effectiveFrom - 1s`) then create the new one
  - `update(id, dto)` → plain update (forward-looking; allowed even with published payslips — they store computed values)
  - `setComponents(id, dto)` → delete all `EmployeeCompensationComponent` for the compensation, recreate from `dto.items`
  - `myCompensation(userId)` → `current(userId)` projected to `{ baseSalary, foodAllowance, transportAllowance, bankName, ibanMasked, effectiveFrom }` (mask IBAN: keep last 4, rest `•`)

- [ ] **Step 1: Write the failing test** — `create` closes the previous record:

```ts
it('closes the previous open compensation and creates the new one in a transaction', async () => {
  prisma.read.employeeCompensation.findFirst.mockResolvedValue({ id: 5, effectiveTo: null });
  prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
  prisma.employeeCompensation.updateMany = jest.fn().mockResolvedValue({ count: 1 });
  prisma.employeeCompensation.create = jest.fn().mockResolvedValue({ id: 6 });
  await svc.create({ userId: 1, baseSalary: 130000, effectiveFrom: '2026-10-01' });
  expect(prisma.employeeCompensation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ userId: 1, effectiveTo: null }),
  }));
  expect(prisma.employeeCompensation.create).toHaveBeenCalled();
});

it('myCompensation masks the IBAN', async () => {
  prisma.read.employeeCompensation.findFirst.mockResolvedValue({
    baseSalary: 100, foodAllowance: 10, transportAllowance: 5,
    bankName: 'BAI', iban: 'AO06004400006729503010102', effectiveFrom: new Date('2026-01-01'),
  });
  const r = await svc.myCompensation(1);
  expect(r!.ibanMasked.endsWith('0102')).toBe(true);
  expect(r!.ibanMasked).toMatch(/^•+0102$/);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement the service** (key parts):

```ts
async create(dto: CreateEmployeeCompensationDto) {
  const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
  return this.prisma.$transaction(async tx => {
    await (tx as unknown as PrismaService).employeeCompensation.updateMany({
      where: { userId: dto.userId, effectiveTo: null },
      data: { effectiveTo: new Date(effectiveFrom.getTime() - 1000) },
    });
    return (tx as unknown as PrismaService).employeeCompensation.create({
      data: {
        userId: dto.userId,
        baseSalary: dto.baseSalary,
        countryCode: dto.countryCode ?? 'AO',
        bankName: dto.bankName ?? null,
        iban: dto.iban ?? null,
        accountNumber: dto.accountNumber ?? null,
        effectiveFrom,
        foodAllowance: dto.foodAllowance ?? null,
        transportAllowance: dto.transportAllowance ?? null,
      },
    });
  });
}

private maskIban(iban?: string | null): string | null {
  if (!iban) return null;
  const last4 = iban.slice(-4);
  return '•'.repeat(Math.max(0, iban.length - 4)) + last4;
}

async myCompensation(userId: number) {
  const c = await this.current(userId);
  if (!c) return null;
  return {
    baseSalary: c.baseSalary,
    foodAllowance: c.foodAllowance,
    transportAllowance: c.transportAllowance,
    bankName: c.bankName,
    ibanMasked: this.maskIban(c.iban),
    effectiveFrom: c.effectiveFrom,
  };
}
```

- [ ] **Step 4: Write `employee-compensation.controller.ts`** — `@Controller('payroll/compensation')`, `@Roles(Role.ADMIN, Role.RH)`: `GET /?userId=` → `history`; `GET /current/:userId` → `current`; `POST /` → `create`; `PUT /:id` → `update`; `POST /:id/components` → `setComponents`.

- [ ] **Step 5: Register in module** (`providers` + `controllers` + `exports` for `EmployeeCompensationService` — the ESS route in Task 3.3 needs it).

- [ ] **Step 6: Run tests + tsc.** PASS + clean.

- [ ] **Step 7: Commit**

```bash
git add src/payslips/employee-compensation.* src/payslips/payroll.dto.ts src/payslips/payslips.module.ts
git commit -m "feat(payroll): EmployeeCompensation effective-dated CRUD + component overrides"
```

---

### Task 3.3: ESS `GET /payslips/my/compensation`

**Files:**
- Modify: `src/payslips/payslips.controller.ts` (inject `EmployeeCompensationService`, add route)
- Modify: `src/payslips/payslips.controller.spec.ts`

**Interfaces:**
- Consumes: `EmployeeCompensationService.myCompensation(userId)`.
- Produces: `GET /payslips/my/compensation` — no `@Roles`, returns the current user's own masked compensation or `null`.

- [ ] **Step 1: Failing test** — in `payslips.controller.spec.ts`, mock `EmployeeCompensationService` and assert `myCompensation` route calls `svc.myCompensation(user.id)`.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — add to `PayslipsController` constructor `private readonly compensation: EmployeeCompensationService` and, **above** `@Get('my/:id')` (so the literal path wins over the `:id` param route — see memory "route shadowing"):

```ts
@Get('my/compensation')
@ApiOperation({ summary: 'A minha compensação actual (só-leitura)' })
myCompensation(@CurrentUser() user: CurrentUserData) {
  return this.compensation.myCompensation(user.id);
}
```

- [ ] **Step 4: Run tests, verify pass.** Also add an ordering assertion or eyeball that `my/compensation` is declared before `my/:id`.

- [ ] **Step 5: Commit**

```bash
git add src/payslips/payslips.controller.ts src/payslips/payslips.controller.spec.ts
git commit -m "feat(payroll): GET /payslips/my/compensation (ESS, masked, read-only)"
```

- [ ] **Step 6: Extend the Phase 2 integration spec file** (or add `test/integration/payroll/payroll-catalogue.integration-spec.ts`): `POST /payroll/components` then `GET` it back; `POST /payroll/compensation` twice for one user asserts the first row got an `effectiveTo`; `GET /payslips/my/compensation` with `employeeToken` returns only that user's row with a masked IBAN; `GET /payslips/my/compensation` never leaks another user's data. FK-ordered `afterAll` (`employeeCompensationComponent` → `employeeCompensation` → `salaryComponent`).

- [ ] **Step 7: Run the new integration spec; `prettier --write`; push PR "Phase 3 — payroll catalogue CRUD + ESS compensation"; wait for `quality` green; auto-merge.**

---

## Phase 4 — `PayslipPdfService` (PR 5, repo `innova`)

### Task 4.1: `PayslipPdfService.render`

**Files:**
- Create: `src/payslips/payslip-pdf.service.ts`, `src/payslips/payslip-pdf.service.spec.ts`
- Modify: `src/payslips/payslips.module.ts`

**Interfaces:**
- Consumes: `PdfService.generatePayslip(input)` (signature: `{ employeeName, employeeId, period, baseSalary, allowances: {label,amount}[], deductions: {label,amount}[], netSalary, companyName?, currencySymbol? }` → `Promise<Buffer>`); `PrismaService`.
- Produces: `PayslipPdfService.render(payslipId: number): Promise<Buffer>`; `buildPdfInput(payslip): PdfPayslipInput` (exported, pure — the line-aware + legacy-fallback mapper).

- [ ] **Step 1: Write the failing test**

```ts
import { buildPdfInput } from './payslip-pdf.service';

const baseSlip = {
  userId: 3, period: '2026-09', baseSalary: 100000, netSalary: 118770,
  mealAllowance: 25000, vacationAllowance: 0, christmasAllowance: 0, overtime: 0,
  bonuses: 0, otherAllowances: 0, incomeTax: 3230, socialSecurity: 3000,
  healthInsurance: 0, loanDeduction: 0, advanceDeduction: 0, otherDeductions: 0,
  receiptCode: 'REC-202609-0003-ABCD',
  user: { fullName: 'Ana', employeeNumber: 'E-3' },
};

describe('buildPdfInput', () => {
  it('uses PayslipItem lines when present (excludes employer-cost lines)', () => {
    const input = buildPdfInput({
      ...baseSlip,
      items: [
        { code: 'BASE_SALARY', name: 'Salário Base', type: 'EARNING', value: 100000, isEmployerCost: false },
        { code: 'ALLOWANCE_FOOD', name: 'Subsídio de Alimentação', type: 'EARNING', value: 25000, isEmployerCost: false },
        { code: 'INSS_EMPLOYEE', name: 'INSS Colaborador', type: 'DEDUCTION', value: 3000, isEmployerCost: false },
        { code: 'INSS_EMPLOYER', name: 'INSS Patronal', type: 'DEDUCTION', value: 8000, isEmployerCost: true },
      ],
    });
    expect(input.allowances).toEqual([
      { label: 'Subsídio de Alimentação', amount: 25000 },
    ]);
    expect(input.deductions).toEqual([{ label: 'INSS Colaborador', amount: 3000 }]);
    expect(input.currencySymbol).toBe('Kz');
    expect(input.employeeName).toBe('Ana');
  });

  it('falls back to fixed columns when there are no items', () => {
    const input = buildPdfInput({ ...baseSlip, items: [] });
    expect(input.allowances).toContainEqual({ label: 'Subsídio de Alimentação', amount: 25000 });
    expect(input.deductions).toContainEqual({ label: 'IRT', amount: 3230 });
    expect(input.deductions).toContainEqual({ label: 'INSS (3%)', amount: 3000 });
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — move `payslipToPdfInput` logic from `payslips.controller.ts` into `buildPdfInput` here, generalised:

```ts
// src/payslips/payslip-pdf.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';

interface PdfPayslipInput {
  employeeName: string;
  employeeId: string;
  period: string;
  baseSalary: number;
  allowances: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  netSalary: number;
  companyName?: string;
  currencySymbol?: string;
}

type SlipForPdf = {
  userId: number; period: string; baseSalary: number; netSalary: number;
  mealAllowance: number; vacationAllowance: number; christmasAllowance: number;
  overtime: number; bonuses: number; otherAllowances: number;
  incomeTax: number; socialSecurity: number; healthInsurance: number;
  loanDeduction: number; advanceDeduction: number; otherDeductions: number;
  receiptCode?: string | null;
  user?: { fullName?: string | null; employeeNumber?: string | null } | null;
  items?: Array<{ name: string; type: 'EARNING' | 'DEDUCTION'; value: number; isEmployerCost: boolean }>;
};

export function buildPdfInput(p: SlipForPdf): PdfPayslipInput {
  let allowances: { label: string; amount: number }[];
  let deductions: { label: string; amount: number }[];

  if (p.items && p.items.length > 0) {
    const visible = p.items.filter(i => !i.isEmployerCost && i.value > 0);
    allowances = visible.filter(i => i.type === 'EARNING' && i.name !== 'Salário Base')
      .map(i => ({ label: i.name, amount: i.value }));
    deductions = visible.filter(i => i.type === 'DEDUCTION').map(i => ({ label: i.name, amount: i.value }));
  } else {
    allowances = [
      { label: 'Subsídio de Alimentação', amount: p.mealAllowance },
      { label: 'Subsídio de Férias', amount: p.vacationAllowance },
      { label: 'Subsídio de Natal', amount: p.christmasAllowance },
      { label: 'Horas Extra', amount: p.overtime },
      { label: 'Prémios', amount: p.bonuses },
      { label: 'Outros Abonos', amount: p.otherAllowances },
    ].filter(a => a.amount > 0);
    deductions = [
      { label: 'IRT', amount: p.incomeTax },
      { label: 'INSS (3%)', amount: p.socialSecurity },
      { label: 'Seguro de Saúde', amount: p.healthInsurance },
      { label: 'Empréstimo', amount: p.loanDeduction },
      { label: 'Adiantamento', amount: p.advanceDeduction },
      { label: 'Outros Descontos', amount: p.otherDeductions },
    ].filter(d => d.amount > 0);
  }

  return {
    employeeName: p.user?.fullName ?? '—',
    employeeId: p.user?.employeeNumber ?? String(p.userId),
    period: p.period,
    baseSalary: p.baseSalary,
    allowances,
    deductions,
    netSalary: p.netSalary,
    currencySymbol: 'Kz',
    companyName: 'INNOVA',
  };
}

@Injectable()
export class PayslipPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  async render(payslipId: number): Promise<Buffer> {
    const payslip = await this.prisma.read.payslip.findUnique({
      where: { id: payslipId },
      include: {
        items: true,
        user: { select: { fullName: true, employeeNumber: true, nif: true, nib: true } },
      },
    });
    if (!payslip) throw new NotFoundException('Recibo não encontrado');
    return this.pdf.generatePayslip(buildPdfInput(payslip as unknown as SlipForPdf));
  }
}
```

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Register** `PayslipPdfService` in `payslips.module.ts` `providers` + `exports`.

- [ ] **Step 6: Digital stamp footer (spec §5)** — extend `PdfService.generatePayslip` with an optional, backward-compatible stamp. In `src/pdf/pdf.service.ts`, widen the `data` param with `receiptCode?: string; issuedAt?: string | Date; stampHash?: string;` and, just before `this.addFooter(doc, 1)` in `generatePayslip`, when `data.receiptCode` is set:

```ts
if (data.receiptCode) {
  doc.moveDown(2).fontSize(8).font('Helvetica')
    .text(`Código do recibo: ${data.receiptCode}`, { align: 'left' })
    .text(
      `Emitido: ${data.issuedAt ? new Date(data.issuedAt).toLocaleDateString('pt-AO') : '—'}` +
      (data.stampHash ? `   •   Ref.: ${data.stampHash}` : ''),
      { align: 'left' },
    )
    .text('Documento processado por computador.', { align: 'left' });
}
```

In `buildPdfInput` add `receiptCode: p.receiptCode ?? undefined` and `issuedAt: (p as { issuedAt?: string }).issuedAt`; in `PayslipPdfService.render` compute `stampHash = createHash('sha256').update(`${payslip.receiptCode}|${payslip.netSalary}|${payslip.issuedAt ?? ''}`).digest('hex').slice(0, 12)` (import `createHash` from `crypto`) and pass it through. Legacy callers (`payslips.service` bulk/issue) pass none of the new fields → unchanged output. Add a `buildPdfInput` test asserting `receiptCode` is forwarded; add a `generatePayslip` test asserting the returned buffer length grows when `receiptCode` is supplied (or snapshot the presence of the stamp text via a `pdf-parse` extract if that dep exists — otherwise buffer-length delta is enough).

- [ ] **Step 7: Run tests, verify pass; `npx tsc --noEmit` clean.**

- [ ] **Step 8: Commit**

```bash
git add src/payslips/payslip-pdf.service.ts src/payslips/payslip-pdf.service.spec.ts src/pdf/pdf.service.ts src/payslips/payslips.module.ts
git commit -m "feat(payroll): PayslipPdfService line-aware input + legacy fallback + digital stamp footer"
```

---

### Task 4.2: Wire `PayslipPdfService` into `GET /payslips/my/:id/pdf` and `publish`

**Files:**
- Modify: `src/payslips/payslips.controller.ts` (use `PayslipPdfService`; delete the local `payslipToPdfInput`)
- Modify: `src/payslips/payroll-workflow.service.ts` (`publish` generates PDF per payslip after the status update, outside the transaction)
- Modify: `src/payslips/payroll-workflow.service.spec.ts`

**Interfaces:**
- Consumes: `PayslipPdfService.render(payslipId)`.

- [ ] **Step 1: Update the controller** — inject `private readonly payslipPdf: PayslipPdfService`; in `myPayslipPdf`, replace `this.pdf.generatePayslip(payslipToPdfInput(payslip))` with `await this.payslipPdf.render(id)`. Remove the now-unused `payslipToPdfInput` function and the `PdfService` import if nothing else uses it (the annual-summary export still uses `this.pdf.generateExecutiveReport`, so keep `PdfService`). Run `npx jest src/payslips/payslips.controller.spec.ts`.

- [ ] **Step 2: Update `publish`** — inject `PayslipPdfService` into `PayrollWorkflowService`; after the `payrollRun.update({ status: 'PUBLISHED' })` and before/around the notification loop:

```ts
for (const p of payslips) {
  try {
    await this.payslipPdf.render(p.id); // pré-gera; falha individual não reverte
  } catch (e) {
    this.logger.warn(`PDF do recibo ${p.id} falhou no publish: ${e instanceof Error ? e.message : e}`);
  }
  await createNotificationSafe(this.prisma, this.logger, {
    userId: p.userId, type: 'PAYSLIP_ISSUED',
    message: `O seu recibo de ${p.period} está disponível.`,
  });
}
```

Update the workflow spec: provide a `PayslipPdfService` mock (`{ render: jest.fn().mockResolvedValue(Buffer.from('')) }`); add a test that a `render` rejection does NOT stop `publish` (run still ends `PUBLISHED`, notifications still sent).

- [ ] **Step 3: Register** `PayslipPdfService` is already a provider; add it to `PayrollWorkflowService` constructor injection (same module, no extra wiring).

- [ ] **Step 4: Run tests + tsc.** `npx jest src/payslips/` PASS; `npx tsc --noEmit` clean.

- [ ] **Step 5: Update the Phase 2 integration spec** — in the publish test, assert `GET /payslips/my/:id/pdf` with `employeeToken` returns `200` + `application/pdf` after publish.

- [ ] **Step 6: Commit**

```bash
git add src/payslips/payslips.controller.ts src/payslips/payroll-workflow.service.ts src/payslips/payroll-workflow.service.spec.ts test/integration/payroll/payroll.integration-spec.ts
git commit -m "feat(payroll): use PayslipPdfService in ESS pdf route + pre-generate on publish"
```

- [ ] **Step 7: `prettier --write`; push PR "Phase 4 — payslip PDF service"; wait for `quality` green; auto-merge.**

---

## Phase 5 — Frontend RH area `/payroll` (PR 6, repo `frontend`)

> Separate git repo (`tututazeni-frontend`), gitignored from the backend. Branch + PR + CI even though `main` isn't push-protected there. Depends on Phases 2 + 3 being merged (API stable).

### Task 5.1: `queryKeys.payroll`, nav entry, shared types + hooks

**Files:**
- Modify: `lib/queryKeys.ts`
- Modify: `components/Sidebar.tsx`
- Create: `components/payroll/types.ts`, `components/payroll/constants.ts`
- Create: `hooks/usePayrollRuns.ts`, `hooks/usePayrollRun.ts`

**Interfaces:**
- Produces: `queryKeys.payroll = { all, runs: { list(params), detail(id), payslips(id, params), exceptions(id) }, components: { list(params) }, compensation: { history(userId), current(userId), mine() } }`.
- Produces: `RUN_STATUS_MAP: StatusBadgeMap<PayrollRunStatus>`; `usePayrollRuns(params)`, `usePayrollRun(id)` hooks returning React Query results.

- [ ] **Step 1: Add the `payroll` block to `lib/queryKeys.ts`** — after the `payslips` block:

```ts
  payroll: {
    all: ['payroll'] as const,
    runs: {
      list: (params: Record<string, unknown>) =>
        [...queryKeys.payroll.all, 'runs', 'list', params] as const,
      detail: (id: number) =>
        [...queryKeys.payroll.all, 'runs', 'detail', id] as const,
      payslips: (id: number, params: Record<string, unknown>) =>
        [...queryKeys.payroll.all, 'runs', id, 'payslips', params] as const,
      exceptions: (id: number) =>
        [...queryKeys.payroll.all, 'runs', id, 'exceptions'] as const,
    },
    components: {
      list: (params: Record<string, unknown>) =>
        [...queryKeys.payroll.all, 'components', 'list', params] as const,
    },
    compensation: {
      history: (userId: number) =>
        [...queryKeys.payroll.all, 'compensation', 'history', userId] as const,
      current: (userId: number) =>
        [...queryKeys.payroll.all, 'compensation', 'current', userId] as const,
      mine: () => [...queryKeys.payroll.all, 'compensation', 'mine'] as const,
    },
  },
```

- [ ] **Step 2: Add the nav entry** — in `components/Sidebar.tsx`, in the `'Recursos Humanos'` section `items` array, next to the existing `{ href: '/payslips', ... 'Recibos Salariais' }`:

```ts
      {
        href: '/payroll',
        icon: DollarSign,
        label: 'Folha de Vencimentos',
        roles: ['ADMIN', 'RH'],
      },
```

(`DollarSign` is already imported in `Sidebar.tsx`.)

- [ ] **Step 3: Update the Sidebar role test** — `lib/roles.test.ts` (or `components/Sidebar.test.tsx` if that's where nav filtering is asserted): add a case that `/payroll` is visible to `RH`/`ADMIN` and hidden from `COLABORADOR`/`GESTOR`. Run `npx vitest run lib/roles.test.ts`.

- [ ] **Step 4: Write `components/payroll/types.ts`**

```ts
import type { StatusBadgeMap } from '@/lib/statusBadge';

export type PayrollRunStatus =
  | 'DRAFT' | 'PROCESSING' | 'SIMULATED' | 'PENDING_APPROVAL'
  | 'APPROVED' | 'PUBLISHED' | 'CANCELLED';

export interface PayrollRunSummary {
  id: number;
  period: string;
  payGroup: string | null;
  status: PayrollRunStatus;
  employeeCount: number | null;
  totalNet: number | null;
  exceptionsCount: number | null;
  errorCount: number | null;
}

export interface PayrollRunTimelineStep {
  step: 'created' | 'processed' | 'submitted' | 'approved' | 'published';
  at: string | null;
  by: { id: number; fullName: string } | null;
}

export interface PayrollRunDetail extends PayrollRunSummary {
  countryCode: string;
  taxYear: number | null;
  totalGross: number | null;
  totalDeductions: number | null;
  totalEmployerCost: number | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  notes: string | null;
  timeline: PayrollRunTimelineStep[];
}

export interface RunPayslipRow {
  id: number;
  userId: number;
  baseSalary: number;
  grossSalary: number;
  incomeTax: number;
  socialSecurity: number;
  netSalary: number;
  hasExceptions: boolean;
  exceptions: { code: string; severity: 'ERROR' | 'WARNING'; message: string }[] | null;
  user?: { id: number; fullName: string; employeeNumber: string | null };
  items?: { id: number; code: string; name: string; type: 'EARNING' | 'DEDUCTION'; value: number }[];
}

export interface RunException {
  payslipId: number;
  userId: number;
  fullName: string;
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
}
```

- [ ] **Step 5: Write `components/payroll/constants.ts`**

```ts
import type { StatusBadgeMap } from '@/lib/statusBadge';
import type { PayrollRunStatus } from './types';

export const RUN_STATUS_MAP: StatusBadgeMap<PayrollRunStatus> = {
  DRAFT: { label: 'Rascunho', cls: 'bg-surface-sunken text-ink-muted' },
  PROCESSING: { label: 'A processar', cls: 'bg-info-subtle text-info-ink' },
  SIMULATED: { label: 'Simulado', cls: 'bg-info-subtle text-info-ink' },
  PENDING_APPROVAL: { label: 'Por aprovar', cls: 'bg-warning-subtle text-warning-ink' },
  APPROVED: { label: 'Aprovado', cls: 'bg-success-subtle text-success-ink' },
  PUBLISHED: { label: 'Publicado', cls: 'bg-success-subtle text-success-ink' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-danger-subtle text-danger-ink' },
};

/** Ações permitidas por estado — usado pela barra de ações do detalhe. */
export const RUN_ACTIONS: Record<PayrollRunStatus, string[]> = {
  DRAFT: ['process', 'cancel'],
  PROCESSING: [],
  SIMULATED: ['process', 'submit', 'cancel'],
  PENDING_APPROVAL: ['approve', 'reject', 'cancel'],
  APPROVED: ['publish', 'cancel'],
  PUBLISHED: [],
  CANCELLED: [],
};

/** Publicar fica bloqueado enquanto houver exceções de erro. */
export const canPublish = (run: { status: string; errorCount: number | null }): boolean =>
  run.status === 'APPROVED' && (run.errorCount ?? 0) === 0;
```

- [ ] **Step 6: Write the hooks** — `hooks/usePayrollRuns.ts` / `hooks/usePayrollRun.ts` using `useApiQuery`:

```ts
// hooks/usePayrollRun.ts
'use client';
import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import type { PayrollRunDetail } from '@/components/payroll/types';

export function usePayrollRun(id: number) {
  return useApiQuery<PayrollRunDetail>(
    queryKeys.payroll.runs.detail(id),
    `/payroll/runs/${id}`,
  );
}
```

```ts
// hooks/usePayrollRuns.ts
'use client';
import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import type { PayrollRunSummary } from '@/components/payroll/types';

interface Paginated<T> { data: T[]; total: number; page: number; limit: number; totalPages: number }

export function usePayrollRuns(params: Record<string, unknown>) {
  return useApiQuery<Paginated<PayrollRunSummary>>(
    queryKeys.payroll.runs.list(params),
    '/payroll/runs',
    { params },
  );
}
```

- [ ] **Step 7: Write `components/payroll/constants.test.ts`** (Vitest) — assert every `PayrollRunStatus` has a `RUN_STATUS_MAP` entry; `canPublish` true only for `APPROVED` + `errorCount 0`; `canPublish` false for `APPROVED` + `errorCount 3`.

- [ ] **Step 8: Run** `npx vitest run components/payroll/constants.test.ts` → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 9: Commit**

```bash
git add lib/queryKeys.ts components/Sidebar.tsx components/payroll/ hooks/usePayrollRun.ts hooks/usePayrollRuns.ts lib/roles.test.ts
git commit -m "feat(payroll): queryKeys.payroll, nav entry, shared types + hooks"
```

---

### Task 5.2: `/payroll` runs dashboard

**Files:**
- Create: `app/(platform)/payroll/layout.tsx`, `app/(platform)/payroll/page.tsx`
- Create: `components/payroll/RunListView.tsx`, `components/payroll/NewRunModal.tsx`

**Interfaces:**
- Consumes: `usePayrollRuns`, `RUN_STATUS_MAP`; `useApiMutation` for `POST /payroll/runs`.

- [ ] **Step 1: `layout.tsx`** — a thin wrapper matching `app/(platform)/payslips/layout.tsx` (copy it; it likely just renders `children`). Verify by reading the payslips layout first.

- [ ] **Step 2: `RunListView.tsx`** — `Table` of runs: columns período (`fmtPeriod` — reuse `components/payslips/format.ts` or `lib/format.ts`), payGroup, `<StatusBadge value={r.status} map={RUN_STATUS_MAP} variant="dot" />`, employeeCount, `formatKz(r.totalNet ?? 0)`, exceptionsCount (badge). Row `onClick` → `router.push('/payroll/runs/' + r.id)`. `EmptyState` when `data.length === 0`; `Skeleton` while `isLoading`; `QueryError` on `error`.

- [ ] **Step 3: `NewRunModal.tsx`** — `Modal` with: month `<input type="month">` → `period`; `payGroup` text `Input`; departments multi-`Select` (fetch `/departments` via `useApiQuery`, optional). Submit → `useApiMutation((body) => apiClient.post('/payroll/runs', body), { invalidateKeys: [queryKeys.payroll.all] })`; on success `router.push('/payroll/runs/' + created.id)` and `useToast().success('Run criado')`.

- [ ] **Step 4: `page.tsx`** — `'use client'`; header "Folha de Vencimentos" + "Novo Run" `Button` opening `NewRunModal`; renders `RunListView`. Follow the visual shell of `app/(platform)/payslips/page.tsx` (`max-w`, `font-display text-ink`, `surface-sunken`).

- [ ] **Step 5: Manual check** — `npm run dev`, log in as RH, open `/payroll`, confirm the table renders (empty state on a fresh DB), "Novo Run" creates and redirects.

- [ ] **Step 6: `tsc` clean; commit**

```bash
git add "app/(platform)/payroll/layout.tsx" "app/(platform)/payroll/page.tsx" components/payroll/RunListView.tsx components/payroll/NewRunModal.tsx
git commit -m "feat(payroll): /payroll runs dashboard + new-run modal"
```

---

### Task 5.3: `/payroll/runs/[id]` — detail, actions, exceptions, payslips table

**Files:**
- Create: `app/(platform)/payroll/runs/[id]/page.tsx`
- Create: `components/payroll/RunDetailView.tsx`, `components/payroll/ExceptionsPanel.tsx`, `components/payroll/RunPayslipsTable.tsx`, `components/payroll/RecalcModal.tsx`
- Create: `components/payroll/RunDetailView.test.tsx`

**Interfaces:**
- Consumes: `usePayrollRun(id)`; `useApiQuery` for `/payroll/runs/:id/exceptions` and `/payroll/runs/:id/payslips`; `useApiMutation` for each action; `useConfirm`, `useToast`; `canPublish`, `RUN_ACTIONS`.

- [ ] **Step 1: Write `RunDetailView.test.tsx` (failing)** — render with a mocked `usePayrollRun` returning `{ status: 'APPROVED', errorCount: 3, ... }`; assert the "Publicar" button is `disabled` and has the title/tooltip about pending errors. Second case `errorCount: 0` → enabled. Third: `status: 'DRAFT'` → only "Processar" and "Cancelar" actions render (per `RUN_ACTIONS`). Mock `@/hooks/usePayrollRun`, `@/hooks/useApiQuery`.

- [ ] **Step 2: Run, verify fail.** `npx vitest run components/payroll/RunDetailView.test.tsx`

- [ ] **Step 3: `RunDetailView.tsx`** —
  - Header: período, payGroup, `<StatusBadge variant="dot" />`; `KpiCard` row (bruto/líquido/descontos/custo empregador/nº colaboradores) from the detail totals via `formatKz`.
  - Timeline: map `detail.timeline` → `step` label + `formatDateTime(at)` + `by?.fullName` (skip steps with `at === null`).
  - Actions bar: for each action in `RUN_ACTIONS[detail.status]` render a `Button`; `publish` gets `disabled={!canPublish(detail)}` and `title={canPublish(detail) ? undefined : 'Resolver as exceções de erro antes de publicar'}`. Each click → `useConfirm()` then the matching mutation; `reject`/`cancel` open a small `Modal` with a reason `Textarea`. On success `invalidateKeys: [queryKeys.payroll.runs.detail(id), queryKeys.payroll.runs.exceptions(id), queryKeys.payroll.runs.payslips(id, {})]` + toast.
  - `<ExceptionsPanel runId={id} />` and `<RunPayslipsTable runId={id} runStatus={detail.status} />`.

- [ ] **Step 4: `ExceptionsPanel.tsx`** — `useApiQuery<RunException[]>(queryKeys.payroll.runs.exceptions(runId), '/payroll/runs/' + runId + '/exceptions')`; group by `severity`; header badge with counts; each row: severity chip + `code` + `fullName` + `message` + a link `#payslip-<payslipId>` scrolling to the row in `RunPayslipsTable`.

- [ ] **Step 5: `RunPayslipsTable.tsx`** — `useApiQuery` for `/payroll/runs/:id/payslips`; `Table` columns colaborador (`user.fullName`), base, bruto, IRT, INSS, líquido (all `formatKz`), nº exceções badge. Expandable row → list `items` (EARNING vs DEDUCTION). When `runStatus === 'SIMULATED'`: per-row "Editar inputs" → `RecalcModal`, and "Excluir do run" → `useConfirm` + `PATCH /payroll/runs/:id/payslips/:payslipId/exclude`.

- [ ] **Step 6: `RecalcModal.tsx`** — `Modal` with number `Input`s (faltas, horas extra, bónus, adiantamento) → `PATCH /payroll/runs/:runId/payslips/:payslipId/recalc`; `invalidateKeys` the run detail + payslips + exceptions; toast.

- [ ] **Step 7: `page.tsx`** — `'use client'`; `const { id } = useParams()`; `<RunDetailView id={Number(id)} />`; `Skeleton`/`QueryError` handled inside the view.

- [ ] **Step 8: Run the component test, verify pass.** `npx vitest run components/payroll/RunDetailView.test.tsx` → PASS.

- [ ] **Step 9: Manual check** — full happy path in the browser against a seeded backend: create run → process → see exceptions → recalc one → submit → approve → publish; confirm buttons enable/disable per state.

- [ ] **Step 10: `tsc` clean; commit**

```bash
git add "app/(platform)/payroll/runs" components/payroll/RunDetailView.tsx components/payroll/RunDetailView.test.tsx components/payroll/ExceptionsPanel.tsx components/payroll/RunPayslipsTable.tsx components/payroll/RecalcModal.tsx
git commit -m "feat(payroll): run detail — actions, timeline, exceptions panel, payslips table, recalc"
```

---

### Task 5.4: `/payroll/components` — SalaryComponent CRUD

**Files:**
- Create: `app/(platform)/payroll/components/page.tsx`
- Create: `components/payroll/ComponentsView.tsx`, `components/payroll/ComponentModal.tsx`

**Interfaces:**
- Consumes: `useApiQuery` `/payroll/components`; `useApiMutation` `POST`/`PUT`/`DELETE`.

- [ ] **Step 1: `ComponentsView.tsx`** — `Table`: código, nome, tipo, cálculo, valor/taxa, tributável (✓/–), ativo (toggle → `PUT /payroll/components/:code { active }`). "Novo componente" `Button` → `ComponentModal`.
- [ ] **Step 2: `ComponentModal.tsx`** — `Modal` create/edit: `code` (disabled on edit), `name`, `type` `Select` (EARNING/DEDUCTION), `calcType` `Select` (FIXED/PERCENT/FORMULA/TABLE); conditionally show `fixedValue` (FIXED), `rate` (PERCENT), `formula` (FORMULA); `isTaxable`/`isMandatory` checkboxes. Submit → `POST` or `PUT`; `invalidateKeys: [queryKeys.payroll.components.list({})]`; toast.
- [ ] **Step 3: `page.tsx`** — shell + `<ComponentsView />`.
- [ ] **Step 4: Manual check** — create a `FIXED` component, edit it, deactivate it, confirm the conditional fields switch with `calcType`.
- [ ] **Step 5: `tsc` clean; commit**

```bash
git add "app/(platform)/payroll/components" components/payroll/ComponentsView.tsx components/payroll/ComponentModal.tsx
git commit -m "feat(payroll): /payroll/components — SalaryComponent CRUD UI"
```

---

### Task 5.5: `/payroll/compensation` — per-employee compensation

**Files:**
- Create: `app/(platform)/payroll/compensation/page.tsx`
- Create: `components/payroll/CompensationView.tsx`, `components/payroll/CompensationModal.tsx`

**Interfaces:**
- Consumes: `useApiQuery` `/payroll/compensation?userId=` (history) + `/payroll/compensation/current/:userId`; `useApiMutation` `POST /payroll/compensation`, `PUT /payroll/compensation/:id`, `POST /payroll/compensation/:id/components`. User picker via existing `/users` search (`Combobox` or `Select`).

- [ ] **Step 1: `CompensationView.tsx`** — user `Combobox` (search `/users`); on select, show a `Card` with the current compensation (`baseSalary`, banco/IBAN, subsídios via `formatKz`) + a history `Table` (`effectiveFrom` → `effectiveTo`). "Editar" → `CompensationModal`. Sub-section: component overrides table with an inline add row → `POST /payroll/compensation/:id/components` (send the full `items` array).
- [ ] **Step 2: `CompensationModal.tsx`** — `Modal`: `baseSalary`, `bankName`, `iban`, `accountNumber`, `foodAllowance`, `transportAllowance`, `effectiveFrom` (`<input type="date">`). On submit → `POST /payroll/compensation` (creates a new effective-dated row; backend closes the previous). `invalidateKeys` history + current + `queryKeys.payroll.compensation.mine()`; toast "Compensação actualizada".
- [ ] **Step 3: `page.tsx`** — shell + `<CompensationView />`.
- [ ] **Step 4: Manual check** — pick an employee, set a base salary, save; edit again with a later `effectiveFrom`; confirm the previous row now shows an `effectiveTo` and the history lists both.
- [ ] **Step 5: `tsc` clean; commit**

```bash
git add "app/(platform)/payroll/compensation" components/payroll/CompensationView.tsx components/payroll/CompensationModal.tsx
git commit -m "feat(payroll): /payroll/compensation — effective-dated compensation UI + overrides"
```

- [ ] **Step 6: Full-repo check** — `npx tsc --noEmit`, `npm run build`, `npx vitest run`, `npx prettier --write` touched files. Push PR "Phase 5 — payroll RH frontend"; wait for frontend CI green; merge.

---

## Phase 6 — Cross-repo verification (PR 7 if fixes needed; else a verification-only pass)

### Task 6.1: Full backend integration suite + IDOR + audit asserts

**Files:**
- Modify (only if gaps found): the payroll integration spec, any service.

- [ ] **Step 1: Apply test-DB migrations** — `DATABASE_URL=<innova_test> npx prisma migrate deploy`.
- [ ] **Step 2: Run the FULL integration suite** (not just payroll — pool/order problems only surface with every file together, per CLAUDE.md):

Run: `npm run test:integration` (or `npx jest --config test/jest-integration.json --runInBand`)
Expected: all green, including `test/integration/payslips/*` and `test/integration/payroll/*`. If "too many clients" appears, confirm `.env.test` `DB_POOL_MAX=5` is picked up.

- [ ] **Step 3: Confirm the IDOR assertions from spec §10 all exist and pass** — JWT user B → `GET /payslips/my/:idOfA` → 404; `.../pdf` → 404; `POST /payroll/runs/:id/approve` as COLABORADOR → 403; `GET /payslips/my/compensation` returns only the caller's row. Add any missing case.
- [ ] **Step 4: Confirm audit assertions** — `AuditLog` rows with `entity='PayrollRun'` for `approve` and `publish`, metadata JSON parseable and containing `approvedById`/`publishedById`.
- [ ] **Step 5: Unit suite + build** — `npx jest src/payslips/` green; `npx tsc --noEmit` clean; `npm run build` succeeds.
- [ ] **Step 6:** If fixes were needed, commit them on a `fix/payroll-followup` branch, PR, `quality` green, auto-merge. If nothing needed, record the clean run in the PR/issue thread.

### Task 6.2: Final verification on `main`-synced branches

- [ ] **Step 1:** `git checkout main && git pull` in both repos; confirm every phase PR merged.
- [ ] **Step 2: Backend** — `npx prisma migrate status` (up to date), `npx prisma db seed` (idempotent, payroll line prints), `npx tsc --noEmit`, `npm run build`, `npx jest src/payslips/`, full integration suite — all green.
- [ ] **Step 3: Frontend** — `npx tsc --noEmit`, `npm run build`, `npx vitest run` — all green.
- [ ] **Step 4: Manual E2E smoke** — seeded backend + frontend running: create run for one department → process → resolve an exception via recalc → submit → approve → publish → log in as a colaborador in that department → `/payslips` shows the ISSUED recibo → download PDF (200, `application/pdf`) → `/payslips` "A minha compensação" shows masked IBAN.
- [ ] **Step 5:** Update memory: append to `project_innova_schema_code_drift.md` or a new `project_innova_payroll_workflow.md` — "DONE (2026-09-..): PayrollRun workflow shipped across PRs #… ; extends payslips module; Float+money(); attendance/leave feed absenceDays/overtimeHours; audit on approve/publish".

---

## Notes for the executor

- **Confirm these before coding (spec "A confirmar" list — mostly resolved during planning, re-verify against live source):**
  - `OvertimeRecord` is `overtimeMinutes: Int` (not hours), `status: OvertimeStatus` with `APPROVED`/`PAID`, `date: DateTime`. `gatherInputs` converts minutes→hours.
  - `LeaveRequest` has `startDate`/`endDate: DateTime`, `status: LeaveStatus` (`APPROVED`), `leaveTypeCode: String`, `workDays: Float`. Unpaid distinction is `LeaveTypeConfig.isPaid` (`@@map("leave_type_configs")`, `code @unique`).
  - `UserAttendance.status` is a free `String` defaulting `"PRESENT"`; absence = `"ABSENT"`. `@@unique([userId, date])`.
  - `AuditService.log({ action, entity, entityId, userId, metadata })` — metadata is `JSON.stringify`'d inside; pass a plain object.
  - `PdfService.generatePayslip` param shape is in Task 4.1 — do not change the existing required fields.
  - Frontend: `queryKeys` convention (`all`/`list`/`detail`), `Sidebar.tsx` `NAV` with `roles?: readonly Role[]` filtered by `filterNavSections` from `lib/roles.ts`; `useConfirm` from `providers/ConfirmProvider`, `useToast` from `providers/ToastProvider`.
- **`this.prisma.read.*` for reads, `this.prisma.*` for writes/`$transaction`.** In `$transaction(async tx => ...)` the callback param is typed loosely — the plan casts `tx as unknown as PrismaService`; keep that consistent.
- **`ts-jest` runs with `diagnostics: false`** — a wrong Prisma field name compiles and only an integration test catches it. Run the integration specs, don't trust green unit mocks (CLAUDE.md "Divergência schema ↔ código").
- **Two `AuditService`s** — only `src/common/services/audit.service.ts`. Never `src/audit/`.
- **Route ordering** — `GET my/compensation` MUST be declared before `GET my/:id` in `payslips.controller.ts` or the param route shadows it (memory "route shadowing").
- **Don't remove `CALCULATED`** from `PayrollRunStatus` — unused-but-kept by design.

## Self-Review (done during planning)

- **Spec coverage:** §1 schema → T0.1; seed → T0.2; §2 money → T1.1; §3 calc service (resolveTargetUsers/gatherInputs/calculatePayslip/detectExceptions/processRun) → T1.2–T1.5; §4 workflow state machine + audit + `assertPayslipEditable` immutability → T2.1–T2.3 (+ `refreshRunSnapshot` added for stale error counts); §5 PDF (line-aware + legacy fallback + stamp) → T4.1–T4.2; §6 controllers + DTOs + ESS `my/compensation` → T2.4, T3.1, T3.2, T3.3; §7 frontend → Phase 5; §8 data flow → integration T2.5; §9 edge cases → T1.4 (exceptions), T1.5 (P2002→exception, fallback config), T4.2 (PDF failure non-reverting); §10 tests → per-task unit + T2.5/T3.6/T6.1 integration + T5.1/T5.3 frontend; §11 phases → Phases 0–6 one PR each.
- **Placeholder scan:** backend tasks carry real code + real test code. The two simplest frontend screens (T5.4 components CRUD, T5.5 compensation) are specified by responsibility + exact endpoints + exact queryKeys/mutations rather than full JSX — deliberate: they are `Table`+`Modal` assemblies directly paralleling `components/payslips/`, and the parts the spec singles out for tests (`RUN_STATUS_MAP`, `canPublish`, `RecalcModal`, `RunDetailView` disable logic) do have real code and failing-test specs.
- **Type consistency:** `calculatePayslip` → `{ data, items, result }` consumed identically in `processRun` and `recalcPayslip`. `processRun` return keys (`employeeCount`/`exceptionsCount`/`errorCount`/`totalGross`/`totalNet`/`totalDeductions`/`totalEmployerCost`) are all real `PayrollRun` columns from T0.1 and are spread into `payrollRun.update` in `process`. `PayrollException` shape (`code`/`severity`/`message`) is what `listExceptions` and the frontend `RunException` type read. `RUN_STATUS_MAP` keys match the `PayrollRunStatus` TS union (7 values; `CALCULATED` intentionally absent from the frontend type, `StatusBadge` `fallback` covers it if ever returned).

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-09-02-payroll-workflow.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**




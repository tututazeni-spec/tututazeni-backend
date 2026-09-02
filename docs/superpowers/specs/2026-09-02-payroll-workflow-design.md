# Payroll / Recibos — camada de workflow `PayrollRun`

**Data:** 2026-09-02
**Âmbito:** backend `innova` (módulo `payslips`) + frontend `frontend` (área RH `payroll`)
**Tipo:** subsistema novo (workflow de processamento em lote) sobre módulos existentes

---

## Problema

O projeto já tem um módulo `payslips` funcional — ESS do colaborador (ver/descarregar
recibos, resumo anual, comparar meses, simular, abrir disputa) e CRUD de recibos
individuais para RH. Já tem um **motor de cálculo paramétrico** (`PayrollEngineService`)
com IRT por escalões da BD, INSS colaborador/patronal, subsídios, faltas e horas extra.
Já tem geração de PDF de recibos (`pdfkit`, `PdfService.generatePayslip`).

O que **falta** é a camada que transforma isto num processo de folha de vencimentos
real: criar um lote mensal, processar/simular todos os recibos de uma vez, rever
exceções, aprovar, e publicar (emitir + notificar). Concretamente:

1. O modelo `PayrollRun` existe no schema mas **nenhum serviço lhe toca** — é código morto.
2. O `PayrollEngineService` **não está registado em nenhum módulo NestJS** — não é injetável.
3. `PayslipItem` (linhas detalhadas do recibo) existe mas **nada o escreve** — o PDF
   reconstrói abonos/descontos a partir de colunas fixas do `Payslip`.
4. `SalaryComponent` e `EmployeeCompensation` existem no schema mas **sem CRUD, sem seed** —
   o salário-base por colaborador só se popula por SQL/seed manual.
5. Não há **UI de RH** para payroll — só a página do colaborador.
6. O fluxo de payslips **não regista auditoria** (só `PayslipAccessLog`) — não há rasto de
   quem aprovou/publicou.
7. O motor aceita `absenceDays`/`overtimeHours` como input mas **ninguém os popula** a
   partir do módulo attendance/leave.

## Decisões de arquitetura (validadas com o dono do produto)

| # | Decisão | Alternativas rejeitadas |
|---|---|---|
| 1 | **Estender o módulo `payslips` existente** — novos services e controllers dentro de `src/payslips/`. Reutiliza `PdfService`, `assertCanAccess`, ciclo `ISSUED/ACKNOWLEDGED` do recibo. | Módulo `payroll` novo e separado (duplicaria cálculo/PDF/ownership); refatorização de nomes (invasivo, sem ganho funcional). |
| 2 | **Valores monetários em `Float`, arredondados a 2 casas na escrita** via helper `money()`. Consistente com todo o schema e com o motor (já faz `+x.toFixed(2)`). | Migrar `Payslip` para `Decimal` (migration de ~25 colunas + serialização Decimal→string em ~10 endpoints + frontend). |
| 3 | **Adicionar `SIMULATED` + `PENDING_APPROVAL` ao enum `PayrollRunStatus`.** Mantém `PROCESSING` (passo assíncrono); `CALCULATED` fica no enum sem uso (remover um valor de enum em Postgres é arriscado sem ganho). | Mapear `SIMULATED≡CALCULATED` e saltar `PENDING_APPROVAL` (perde distinção submetido/em-revisão). |
| 4 | **`payGroup` = `String?` livre** (rótulo) + o run pode ser limitado a departamentos/colaboradores via `scope Json?`. Sem modelo `PayGroup` dedicado. | Modelo `PayGroup` com calendário/regras próprias (YAGNI para um país). |
| 5 | **Integrar attendance/leave já nesta entrega** — o processamento lê faltas e horas extra aprovadas do período. Valores ficam editáveis por recibo antes de aprovar. | Só inputs manuais nesta fase. |
| 6 | **Frontend segue o design system de tokens existente** (`components/ui/`, `text-ink`, `StatusBadge`, ...), como a página de recibos do colaborador já faz. | Paleta navy/gold do brief (inconsistente com o resto da app). |
| 7 | **Segregação de funções não bloqueante** — quem aprova pode ser quem submeteu; ambos são registados e auditados. | Exigir aprovador ≠ submetedor (fricção para equipas pequenas). |
| 8 | **Incluir `GET /payslips/my/compensation`** — colaborador vê o próprio salário-base, só-leitura. | Deixar de fora. |

---

## Estado atual (levantamento)

### Backend (`innova`)

**Schema (`prisma/schema.prisma`) — tudo migrado em `20260421193009_nova_innova` + `20260803180000_rh_payroll_attendance_enums`:**

- `Payslip` (`:3819`) — recibo individual. Monetários em `Float`. `@@unique([userId, period])`.
  Campo `runId Int?` → FK para `PayrollRun`. `status PayslipStatus @default(DRAFT)`.
  Colunas fixas de abonos (`baseSalary`, `mealAllowance`, `vacationAllowance`,
  `christmasAllowance`, `overtime`, `bonuses`, `otherAllowances`) e descontos
  (`incomeTax`, `socialSecurity`, `employerInss`, `healthInsurance`, `loanDeduction`,
  `advanceDeduction`, `otherDeductions`), totais (`grossSalary`, `netSalary`,
  `totalEarnings`, `totalDeductions`, `totalEmployerCost`), detalhe IRT
  (`irtBracketRate`, `irtFormula`, `irtOverride`, `inssOverride`, `taxBracket`),
  `receiptCode String?`, `issuedAt`, `acknowledgedAt`, `createdById Int?`.
  Relações: `items PayslipItem[]`, `accessLogs`, `disputes`, `run PayrollRun?`.
- `PayslipItem` (`:3875`) — comentário no schema: **"não é escrito por nenhum serviço
  actualmente (feature planeada mas não ligada)"**. Campos: `payslipId`, `code`, `name`,
  `type ComponentType`, `value Float`, `isTaxable`, `calcType ComponentCalcType?`, `order`.
- `PayrollRun` (`:4007`) — `period`, `countryCode @default("AO")`,
  `status PayrollRunStatus @default(DRAFT)`, `notes String?`, `totalGross Float?`,
  `processedAt`, `processedById Int?` (bare Int, sem relação), `approvedAt`,
  `approvedById Int?` (bare Int), `createdById Int` + relação `createdBy`
  (`"PayrollRunCreator"`), `payslips Payslip[]`. `@@index([period, status])`.
  **Nenhum código o referencia** (confirmado por `grep -rn PayrollRun src`).
- `SalaryComponent` (`:3960`) — `code @id`, `name`, `description?`, `type ComponentType`,
  `calcType ComponentCalcType`, `fixedValue Float?`, `rate Float?`, `formula String?`,
  `isTaxable @default(true)`, `isMandatory @default(false)`, `order`, `active @default(true)`,
  `countryCode String?`. **Sem serviço/controller/seed.**
- `EmployeeCompensation` (`:3978`) — `userId`, `baseSalary Float`, `countryCode?`,
  `bankName?`, `iban?`, `accountNumber?`, `effectiveFrom @default(now())`, `effectiveTo?`,
  `foodAllowance Float?`, `transportAllowance Float?`, `components EmployeeCompensationComponent[]`.
  `@@index([userId, effectiveFrom])`. **Sem CRUD.** Lido por `payroll-engine.service.ts`
  e por `payslips.service.ts#bulkCreate`.
- `EmployeeCompensationComponent` (`:3998`) — `compensationId`, `componentCode`, `value Float`,
  `override Boolean @default(false)`.
- `CountryConfig` (`:3924`) + `IrtBracket` (`:3947`) — tabelas fiscais paramétricas por
  país/ano. `@@unique([countryCode, taxYear])`. **Sem seed** (o motor tem fallback
  hardcoded `getDefaultAngolaConfig`).
- `PayslipAccessLog` (`:3896`) — `VIEW`/`ADMIN_VIEW`/`DOWNLOAD` + IP. `userId` = **quem viu**
  (pode ser RH), não o dono.
- `PayslipDispute` (`:3911`) — disputas com resolução.
- Enums: `PayslipStatus { DRAFT ISSUED ACKNOWLEDGED DISPUTED }` (`:236`) — ciclo do recibo
  **por colaborador**, não do lote. `PayrollRunStatus { DRAFT PROCESSING CALCULATED
  APPROVED PUBLISHED CANCELLED }` (`:243`). `ComponentType { EARNING DEDUCTION }` (`:252`).
  `ComponentCalcType { FIXED PERCENT FORMULA TABLE }` (`:257`).

**Serviços:**

- `src/payslips/payslips.service.ts` — CRUD, `bulkCreate`, `issue` (→ ISSUED + notifica),
  `acknowledge`, `createDispute`, `getMyPayslips`, `annualSummary`, `buildAnnualExport`,
  `compare`, `simulate`, `hrDashboard`, `logAccess`, `getAccessLogs`. Cálculo próprio
  simplificado em `computeTotals()` (tabela IRT **hardcoded** `IRT_TABLE_2026`,
  INSS 3%/8% constantes). Ownership: `findOne(id, user)` chama
  `assertCanAccess(p, p?.userId, user, [Role.ADMIN, Role.RH])`.
- `src/payslips/payroll-engine.service.ts` — `PayrollEngineService`. `calculate(ctx, period)`
  → `PayrollResult { lines: PayrollLineItem[], totalEarnings, grossSalary, totalDeductions,
  netSalary, incomeTax, employeeSocialSecurity, employerSocialSecurity, totalEmployerCost,
  taxBracketApplied }`. `calculateIRT(base, brackets)` paramétrico. `loadCountryConfig`
  (com fallback), `loadEmployeeCompensation`. **NÃO está em `payslips.module.ts`.**
- `src/payslips/payslips.module.ts` — `imports: [PrismaModule]`, `providers: [PayslipsService]`,
  `controllers: [PayslipsController]`, `exports: [PayslipsService]`. `PdfService` vem do
  `PdfModule` que é `@Global`.

**Controller `src/payslips/payslips.controller.ts` (`@Controller('payslips')`, `@UseGuards(JwtAuthGuard, RolesGuard)`):**

- Colaborador (qualquer autenticado, ownership no serviço): `GET my`, `GET my/annual-summary`,
  `GET my/annual-summary/export`, `GET my/compare`, `GET my/:id`, `GET my/:id/pdf`,
  `PATCH my/:id/acknowledge`, `POST my/:id/dispute`.
- Aberto: `POST simulate`.
- `@Roles(Role.ADMIN, Role.RH)`: `GET /` (listar), `GET dashboard`, `GET :id`,
  `GET :id/access-logs`, `POST /`, `POST bulk-create`, `PATCH :id/issue`, `PUT :id`.

**PDF `src/pdf/pdf.service.ts`** — `pdfkit`. `generatePayslip(data)` já existe (`:185`):
header da empresa, dados do colaborador, tabela de `allowances`, tabela de `deductions`,
líquido, `currencySymbol`. `PdfModule` é `@Global`. Também `generateDeclaration`
(com marca de água "CÓPIA"), `generateCertificate`, `generateExecutiveReport`.

**Auth / RBAC:**

- `JwtAuthGuard` + `RolesGuard` + `ThrottlerGuard` como `APP_GUARD` globais (`app.module.ts:226-228`).
- `@Public()` via `IS_PUBLIC_KEY` lido pelo `JwtAuthGuard`.
- `Role` enum (`src/auth/enums/role.enum.ts`): `ADMIN, RH, GESTOR, COLABORADOR, INSTRUCTOR,
  DIRECTOR, LIDER, AUDITOR`. `RolesGuard` compara com `user.role.name`. Sem `@Roles` = fail-open.
- Ownership: `src/common/authz/ownership.ts` → `assertCanAccess(record, ownerId, user, privilegedRoles[])`.
- Auditoria real: `src/common/services/audit.service.ts` (fila Bull, `metadata` já
  `JSON.stringify`'d desde PR #168). **NÃO** o `src/audit/audit.service.ts` (hash-chain, órfão).

**Attendance / Leave:**

- `src/attendance/` — `clock-in`/`clock-out`, `UserAttendance` (`status @default("PRESENT")`),
  relatórios de absentismo, horas extra (`POST overtime`, `PATCH overtime/:id/review`),
  justificações. Rota base `/attendance`.
- `src/leave-management/` — `LeaveRequest`/`LeaveBalance`/`LeaveBalanceHistory`,
  `leaveTypeConfig` (8 tipos semeados em PRs #225/#375), aprovação (`PATCH :id/approve`,
  `@Roles(ADMIN, RH, GESTOR)`), saldos. Rota base `/leave`.
- **A confirmar na Fase 1** (leitura dos schemas/serviços reais): nome do modelo de horas
  extra e seus campos (`hours`, `status`, `date`), campos de `LeaveRequest`
  (`startDate`/`endDate`/`status`/`leaveTypeCode`/`workingDays`), e como o
  `leaveTypeConfig` marca um tipo como não-pago/sem-vencimento.

### Frontend (`frontend`, repo separado `tututazeni-frontend`)

- `app/(platform)/payslips/page.tsx` — ESS do colaborador. Tabs: **Lista**, **Detalhe**,
  **Comparar**, **Simular**, **Resumo Anual**. Já usa `components/ui/` (`Button`, `Select`,
  `StatusBadge`, `EmptyState`, `Skeleton`) e tokens (`text-ink`, `surface-sunken`).
- `components/payslips/` — `ListView`, `DetailView`, `PayslipDetailView`, `CompareView`,
  `SimulateView`, `AnnualView`, `constants.ts`, `format.ts` (`fmtPeriod`), `types.ts`
  (`PAYSLIP_STATUS_MAP`).
- `hooks/usePayslipDetail.ts`. Data layer: `useApiQuery`/`useApiMutation`,
  `lib/queryKeys.ts` (`queryKeys.payslips.*` já existe), `lib/format.ts` (`formatKz`,
  `formatDate`), `lib/queryClient.ts` (`STALE_TIME`).
- **Não existe** nenhuma página/rota de RH para payroll. Não há `payGroup`/`payroll` no NAV.
- Padrão de nav com gate: flag `adminOnly` (memória "courses Gestão tab"); nav filtrada
  contra os `@Roles()` reais (memória "sidebar RBAC").
- `useConfirm()` / `useToast()` para confirmações e feedback (memórias de error-handling).

---

## Design

### 1. Alterações ao schema (uma migration: `add_payroll_workflow`)

```prisma
enum PayrollRunStatus {
  DRAFT
  PROCESSING          // cálculo em curso (transitório)
  SIMULATED           // (novo) cálculo pronto — revisão de exceções pelo RH
  PENDING_APPROVAL    // (novo) submetido para aprovação
  CALCULATED          // legado, sem uso — mantido para não remover valor de enum
  APPROVED
  PUBLISHED
  CANCELLED
}

model PayrollRun {
  // ... campos existentes mantidos ...
  payGroup           String?          // rótulo livre: "Mensais", "Expatriados"
  scope              Json?            // { departmentIds?: number[], userIds?: number[] }
  taxYear            Int?             // ano fiscal para CountryConfig (default: ano do period)
  totalNet           Float?
  totalDeductions    Float?
  totalEmployerCost  Float?
  employeeCount      Int?
  exceptionsCount    Int?
  errorCount         Int?             // exceções de severidade ERROR (bloqueiam submissão)
  submittedAt        DateTime?
  submittedById      Int?             // bare Int, como processedById
  publishedAt        DateTime?
  publishedById      Int?
  rejectionReason    String?
  cancellationReason String?
}

model Payslip {
  // ... campos existentes mantidos ...
  hasExceptions Boolean @default(false)
  exceptions    Json?    // Array<{ code, severity: 'ERROR'|'WARNING', message }>
  calcInputs    Json?    // { absenceDays?, overtimeHours?, bonusAmount?, advanceDeduction?, ... } — overrides do RH
  calcSnapshot  Json?    // PayrollResult cru do motor (traçabilidade)

  @@index([runId, hasExceptions])   // ecrã de exceções do run
}

model PayslipItem {
  // ... campos existentes mantidos ...
  isEmployerCost Boolean @default(false)
}
```

Nenhuma alteração ao modelo `User` (as FK de aprovador/submetedor/publicador ficam bare
`Int?`, seguindo o `processedById` já existente — os nomes resolvem-se no serviço).

**Seed** (`prisma/seed.ts`, secção nova `seedPayroll()`, idempotente com `upsert`):

- `CountryConfig` `AO` / `taxYear` corrente + `IrtBracket[]` — valores de
  `PayrollEngineService.getDefaultAngolaConfig()` (mínimos: minimumWage 70000,
  foodAllowance 25000, transportAllowance 15000; INSS 3%/8%; 7 escalões IRT;
  healthInsuranceRate 0.02; unionFeeRate 0.01; guaranteeFundRate 0.005).
  Comentário `// ⚠️ confirmar tabela IRT com AGT antes de produção`.
- `SalaryComponent` catálogo — códigos que o motor **já emite**: `BASE_SALARY`,
  `ALLOWANCE_FOOD`, `ALLOWANCE_TRANSPORT`, `OVERTIME`, `BONUS` (EARNING);
  `INSS_EMPLOYEE`, `IRT`, `HEALTH_INSURANCE`, `UNION_FEE`, `ADVANCE`,
  `ABSENCE_DEDUCTION` (DEDUCTION). `calcType` conforme o motor
  (`FIXED`/`PERCENT`/`TABLE`/`FORMULA`), `isTaxable` conforme legislação AO
  (subsídios alimentação/transporte não tributáveis).
- Rodar com `npx prisma db seed` (não `ts-node` cru — memória).

### 2. `money()` util — `src/payslips/money.util.ts`

```ts
export const money = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;
```

Usado em toda a escrita de totais. Invariante verificada no cálculo:
`Math.abs((grossSalary - totalDeductions) - netSalary) <= 0.01`.

### 3. `PayrollCalculationService` — `src/payslips/payroll-calculation.service.ts`

Responsabilidade única: para um `PayrollRun` + conjunto de colaboradores, produzir
`Payslip` DRAFT + `PayslipItem[]` + exceções, sem tocar em transições de estado.

- `resolveTargetUsers(run)` → `User[]` a partir de `run.scope` (departmentIds/userIds)
  ou todos os `active` do `countryCode` se `scope` vazio.
- `gatherInputs(userId, period)` → `{ absenceDays, overtimeHours, workingDaysInMonth }`:
  - `absenceDays` = dias de `LeaveRequest` **aprovadas** que interceptam o mês, de tipos
    marcados como não-pagos no `leaveTypeConfig` + `UserAttendance` com `status='ABSENT'`
    no mês. (Sem dupla contagem — dias distintos.)
  - `overtimeHours` = soma das horas extra **aprovadas** no mês (modelo a confirmar na Fase 1).
  - `workingDaysInMonth` = dias úteis (seg–sex) do mês do `period`; default 22 se cálculo falhar.
- `calculatePayslip(run, user, overrides?)` → monta `PayrollContext` (baseSalary de
  `EmployeeCompensation` ativa; `foodAllowance`/`transportAllowance` idem;
  `extraComponents` dos `EmployeeCompensationComponent`; inputs de `gatherInputs`
  sobrepostos por `overrides`/`payslip.calcInputs`), chama
  `PayrollEngineService.calculate()`, mapeia:
  - `PayrollResult.lines` → `PayslipItem[]` (`type`, `value=money()`, `isTaxable`,
    `calcType`, `isEmployerCost`, `order`).
  - Totais → colunas do `Payslip` (`grossSalary`, `netSalary`, `totalEarnings`,
    `totalDeductions`, `totalEmployerCost`, `incomeTax`, `socialSecurity`,
    `employerInss`, `irtBracketRate` de `taxBracketApplied`).
  - Colunas fixas de compatibilidade (`mealAllowance`, `overtime`, `bonuses`, ...)
    preenchidas a partir das linhas correspondentes por `code`, para o ESS e os
    exports anuais existentes continuarem a funcionar.
  - `calcSnapshot` = `PayrollResult`.
- `detectExceptions(run, user, compensation, result, prevPayslip)` → `Exception[]`:

  | code | severity | condição |
  |---|---|---|
  | `NO_COMPENSATION` | ERROR | sem `EmployeeCompensation` ativa |
  | `ZERO_BASE_SALARY` | ERROR | `baseSalary <= 0` |
  | `NEGATIVE_NET` | ERROR | `netSalary < 0` |
  | `DUPLICATE_PAYSLIP_FOR_PERIOD` | ERROR | já existe `Payslip(userId, period)` com `runId` diferente |
  | `NET_BELOW_MINIMUM_WAGE` | WARNING | `netSalary < countryConfig.minimumWage` |
  | `MISSING_BANK_DETAILS` | WARNING | `compensation.iban` vazio |
  | `HIGH_VARIANCE_VS_PREV_MONTH` | WARNING | `|net − prevNet| / prevNet > 0.30` |
  | `USING_FALLBACK_TAX_CONFIG` | WARNING | `loadCountryConfig` caiu no fallback hardcoded |

- `processRun(runId)` (chamado pelo workflow):
  transação — apaga `PayslipItem` + `Payslip` DRAFT do run, recria para todos os alvos,
  grava snapshot de totais/contagens no `PayrollRun`. Idempotente.

### 4. `PayrollWorkflowService` — `src/payslips/payroll-workflow.service.ts`

Máquina de estados + auditoria + imutabilidade.

```
createRun         —            → DRAFT              (grava createdById, payGroup, scope, taxYear)
process           DRAFT|SIMULATED → PROCESSING → SIMULATED   (delega em PayrollCalculationService.processRun)
recalcPayslip     SIMULATED     → SIMULATED         (1 recibo, com calcInputs editados)
excludePayslip    SIMULATED     → SIMULATED         (payslip.runId = null, volta a solto)
submit            SIMULATED     → PENDING_APPROVAL  (409 se run.errorCount > 0; grava submittedById/At)
approve           PENDING_APPROVAL → APPROVED       (grava approvedById/At; AUDIT)
reject            PENDING_APPROVAL → SIMULATED      (grava rejectionReason)
publish           APPROVED      → PUBLISHED         (por recibo: DRAFT→ISSUED + issuedAt + PDF + notificação; grava publishedById/At; AUDIT; run imutável)
cancel            ≠ PUBLISHED   → CANCELLED         (grava cancellationReason; AUDIT)
```

- `assertTransition(run, from[], action)` → `ConflictException` se `run.status` não está em `from`.
- `assertRunEditable(run)` → `ForbiddenException` se `run.status ∈ {APPROVED, PUBLISHED, CANCELLED}`
  (usado por `process`/`recalc`/`exclude`).
- `publish`: itera recibos do run numa transação por lote (chunk de ~200); para cada
  `Payslip`: `status: 'ISSUED'`, `issuedAt: now`; após a transação, para cada recibo gera
  o PDF via `PayslipPdfService` (fora da transação — I/O) e `createNotificationSafe(prisma,
  logger, { userId, type: 'PAYSLIP_ISSUED', message: 'O seu recibo de <period> está disponível.' })`.
  Falhas de PDF/notificação individuais são registadas mas não revertem o publish
  (o recibo já está ISSUED e visível).
- Auditoria: `auditService.log({ userId: actor.id, action, entity: 'PayrollRun',
  entityId: run.id, metadata: { period, payGroup, from, to, employeeCount, totalNet,
  approvedById, publishedById, submittedById } })` — em `approve`, `publish`, `cancel`,
  `reject`. (O `AuditService.log` já faz `JSON.stringify` da metadata.)
- Imutabilidade de recibos: novo helper partilhado `assertPayslipEditable(payslip)` em
  `payslips.service.ts` (ou `money.util`/`authz`) — lança se `payslip.status ∈
  {ISSUED, ACKNOWLEDGED, DISPUTED}` **ou** `payslip.run?.status === 'PUBLISHED'`.
  Chamado por `PayslipsService.update()` (hoje só bloqueia `ACKNOWLEDGED`) e pelos
  caminhos de recalc/exclude.

### 5. `PayslipPdfService` — `src/payslips/payslip-pdf.service.ts`

- `render(payslipId)` → carrega `Payslip` + `items` + `user` (`fullName`, `employeeNumber`,
  `nif`, `nib`, `position`, `department`, `hireDate`) + `CountryConfig`/empresa.
- Se `items.length > 0` → constrói `allowances`/`deductions` a partir das linhas
  (`type EARNING`/`DEDUCTION`, exclui `isEmployerCost`).
- Se `items.length === 0` (recibos legados) → **fallback** para a reconstrução por colunas
  fixas (a função `payslipToPdfInput` que já existe no controller, movida para cá).
- Delega em `PdfService.generatePayslip(input)`. `currencySymbol` da `CountryConfig`
  (`'Kz'` para AO).
- Carimbo digital: bloco de texto no rodapé com `receiptCode`, data de emissão,
  "Documento processado por computador" + hash curto (`sha256(receiptCode|netSalary|
  issuedAt).slice(0,12)`) — reutiliza a estética de `generateDeclaration` (sem
  assinatura criptográfica real nesta fase).
- Controller `GET /payslips/my/:id/pdf` e o publish passam a usar este serviço.

### 6. Controllers novos (todos em `src/payslips/`, `@Roles(Role.ADMIN, Role.RH)` explícito)

**`PayrollRunController` — `@Controller('payroll/runs')`:**

| Método | Rota | Ação |
|---|---|---|
| POST | `/` | `createRun(CreatePayrollRunDto)` |
| GET | `/` | listar paginado (`PayrollRunFilterDto`: period, status, payGroup, page, limit) |
| GET | `/:id` | detalhe + totais + contagens + timeline (nomes de created/processed/submitted/approved/published resolvidos) |
| GET | `/:id/payslips` | recibos do run, paginado, com `exceptions` e `items` on-demand |
| GET | `/:id/exceptions` | lista plana `{ payslipId, userId, fullName, code, severity, message }[]` |
| POST | `/:id/process` | `process` |
| PATCH | `/:id/payslips/:payslipId/recalc` | `recalcPayslip` (`RecalcPayslipInputsDto`) |
| PATCH | `/:id/payslips/:payslipId/exclude` | `excludePayslip` |
| POST | `/:id/submit` | `submit` |
| POST | `/:id/approve` | `approve` |
| POST | `/:id/reject` | `reject` (`RejectRunDto { reason }`) |
| POST | `/:id/publish` | `publish` |
| POST | `/:id/cancel` | `cancel` (`CancelRunDto { reason }`) |

**`SalaryComponentController` — `@Controller('payroll/components')`:**

- `GET /` (`SalaryComponentFilterDto`: type, active, countryCode), `POST /`
  (`CreateSalaryComponentDto`), `GET /:code`, `PUT /:code` (`UpdateSalaryComponentDto`),
  `DELETE /:code` — soft (`active=false`) se referenciado por `EmployeeCompensationComponent`
  ou `PayslipItem`; hard se nunca usado.
- Validação condicional: `calcType FIXED` ⇒ `fixedValue` obrigatório; `PERCENT` ⇒ `rate`;
  `FORMULA` ⇒ `formula`. (Via `@ValidateIf` no DTO.)

**`EmployeeCompensationController` — `@Controller('payroll/compensation')`:**

- `GET /?userId=` — histórico ordenado por `effectiveFrom desc`.
- `GET /current/:userId` — registo ativo (`effectiveTo == null || >= now`).
- `POST /` (`CreateEmployeeCompensationDto`) — cria registo novo; fecha o anterior
  (`effectiveTo = novo.effectiveFrom - 1s`) numa transação.
- `PUT /:id` — edita registo (forward-looking; permitido mesmo com recibos publicados,
  pois estes guardam o valor calculado).
- `POST /:id/components` (`UpsertCompensationComponentsDto { items: [{componentCode, value, override}] }`)
  — substitui o conjunto de overrides.

**ESS (em `PayslipsController`, sem `@Roles` — qualquer autenticado):**

- `GET /payslips/my/compensation` → `EmployeeCompensation` ativa do próprio (só-leitura:
  `baseSalary`, `foodAllowance`, `transportAllowance`, `bankName`, `iban` mascarado,
  `effectiveFrom`). Sem histórico.

**DTOs** — adicionados a `src/payslips/payslips.dto.ts`, seguindo as convenções do projeto
(`class-validator`; filtros booleanos de query com `@Type(() => String)` + `@Transform`;
`@EmptyStringToUndefined()` em strings opcionais de body).

### 7. Frontend RH — `app/(platform)/payroll/`

Estrutura paralela à de `payslips`: rotas em `app/(platform)/payroll/`, componentes em
`components/payroll/`, hooks dedicados, `queryKeys.payroll.*` novo em `lib/queryKeys.ts`.

- **NAV**: entrada "Folha de Vencimentos" (`/payroll`), `adminOnly`/gate `['ADMIN','RH']`
  contra os `@Roles` reais dos controllers.
- **`/payroll/page.tsx`** — dashboard de runs. Tabela: período, payGroup, status
  (`StatusBadge` — mapa: `DRAFT` neutro, `PROCESSING`/`SIMULATED` info, `PENDING_APPROVAL`
  warning, `APPROVED` success-muted, `PUBLISHED` success, `CANCELLED` danger-muted),
  nº colaboradores, total líquido, nº exceções. Botão "Novo Run" → `Modal` (mês/ano,
  payGroup texto, multi-select de departamentos via `Select` múltiplo). Linha → detalhe.
- **`/payroll/runs/[id]/page.tsx`** — detalhe/simulação:
  - Cabeçalho: período, payGroup, `StatusBadge`, cartões de totais (bruto/líquido/
    descontos/custo empregador/nº colaboradores); timeline (criou→processou→submeteu→
    aprovou→publicou, com nome + data).
  - Barra de ações sensível ao estado (`Button` + `useConfirm`): Processar / Recalcular /
    Submeter / Aprovar / Rejeitar / Publicar / Cancelar. "Publicar" desativado com
    tooltip enquanto `errorCount > 0`.
  - **Painel de exceções**: agrupado por severidade, contagem em badge, cada linha com
    link para o recibo.
  - **Tabela de recibos**: colaborador, base, bruto, IRT, INSS, líquido, nº exceções
    (badge). Linha expansível → `PayslipItem` (abonos / descontos). "Editar inputs" →
    `Modal` (faltas, horas extra, bónus, adiantamento) → `recalc`. "Excluir do run".
- **`/payroll/components/page.tsx`** — CRUD `SalaryComponent`: tabela (código, nome, tipo,
  cálculo, valor/taxa, tributável, ativo); `Modal` create/edit com campos condicionais
  por `calcType`; toggle ativo.
- **`/payroll/compensation/page.tsx`** — procurar colaborador (`Select`/autocomplete) →
  cartão da compensação atual + histórico; `Modal` de edição (salário-base, banco/IBAN,
  subsídios) que cria novo registo efetivo-datado; sub-secção de overrides de componentes.
- Dados: `useApiQuery`/`useApiMutation`, `formatKz`/`formatDate`, invalidação de
  `queryKeys.payroll.*` após mutações. Valores chegam como `number` (Float) — **sem
  serialização Decimal**.

### 8. Fluxo de dados (caminho feliz)

```
RH cria Run (DRAFT, scope=[Dept Eng])
  └─ POST /payroll/runs
RH processa
  └─ POST /payroll/runs/:id/process
       PayrollWorkflowService.process → status PROCESSING
         PayrollCalculationService.processRun
           resolveTargetUsers → [u1..uN]
           por user: gatherInputs (leave+attendance) → PayrollContext
                     PayrollEngineService.calculate → PayrollResult
                     map → Payslip(DRAFT) + PayslipItem[] + detectExceptions
           grava snapshot totais/errorCount no PayrollRun
       status SIMULATED
RH revê exceções, edita inputs de u3, recalc
  └─ PATCH /payroll/runs/:id/payslips/:p3/recalc
RH submete (errorCount==0)
  └─ POST /payroll/runs/:id/submit → PENDING_APPROVAL (submittedById)
Aprovador aprova
  └─ POST /payroll/runs/:id/approve → APPROVED (approvedById) + AuditLog
RH publica
  └─ POST /payroll/runs/:id/publish
       transação: Payslip DRAFT→ISSUED + issuedAt
       pós: PDF por recibo + createNotificationSafe(PAYSLIP_ISSUED)
       status PUBLISHED (publishedById) + AuditLog ; run imutável
Colaborador vê em GET /payslips/my  →  descarrega GET /payslips/my/:id/pdf
```

### 9. Erros e casos limite

- Processar run sem alvos → run fica `SIMULATED` com `employeeCount = 0`; submeter
  permitido (0 erros) mas UI avisa.
- Reprocessar após exclusões manuais → `process` recria **todos** os alvos do `scope`;
  exclusões não persistem entre processamentos (documentado na UI: "reprocessar repõe o lote").
- Colaborador sem `EmployeeCompensation` → exceção `NO_COMPENSATION` (ERROR), recibo criado
  com base 0 para ser visível na revisão.
- Dois runs para o mesmo período/colaborador → `DUPLICATE_PAYSLIP_FOR_PERIOD` (ERROR) no
  segundo; `@@unique([userId, period])` do `Payslip` protege a BD (o `process` do 2º run
  apanha o `P2002` e converte em exceção em vez de rebentar).
- Publicar com falha de PDF de 1 recibo → recibo fica `ISSUED` na mesma, erro logado,
  run publica; RH pode regerar o PDF (o `GET /my/:id/pdf` gera on-demand).
- `CountryConfig` em falta → `USING_FALLBACK_TAX_CONFIG` (WARNING) + cálculo com defaults
  hardcoded do motor.

### 10. Testes

**Unitários (mock `PrismaService`, convenção do projeto):**

- `PayrollEngineService` (já tem specs) — reforçar: invariante bruto−descontos=líquido
  numa tabela de salários; IRT nos limites exatos dos escalões; INSS 3%/8%; proporção de
  faltas (`baseSalary − absenceDays*dailyRate`); horas extra 1.5×; ceiling de INSS.
- `PayrollCalculationService` — `gatherInputs` agrega leave+attendance sem dupla contagem;
  `detectExceptions` cobre cada código; `map → PayslipItem` preserva `isEmployerCost`;
  colunas fixas de compatibilidade preenchidas.
- `PayrollWorkflowService` — cada transição válida; cada transição inválida → 409
  (publicar sem aprovar, aprovar sem submeter, processar run APPROVED, publicar 2×);
  `submit` com `errorCount > 0` → 409; `approve`/`publish`/`cancel` chamam `auditService.log`.
- `assertPayslipEditable` — bloqueia ISSUED/ACKNOWLEDGED/DISPUTED e run PUBLISHED.

**Integração (`test/integration/payroll.integration-spec.ts`, Postgres real):**

- Respeita `DB_POOL_MAX` (`.env.test`), Redis a correr (fila de auditoria).
- `afterAll` FK-ordenado, cada passo com `.catch(() => undefined)`:
  `PayslipItem` → `PayslipAccessLog`/`PayslipDispute` (por `payslipId`) → `Payslip` →
  `PayrollRun` → `EmployeeCompensationComponent` → `EmployeeCompensation` →
  `SalaryComponent` → `IrtBracket` → `CountryConfig`.
- Caminho completo: seed compensações → criar run → process → assert Payslips+Items+
  exceptions na BD → submit → approve → publish → assert `status=ISSUED`, `NotificationLog`,
  `AuditLog(entity='PayrollRun')` com `approvedById`/`publishedById`.
- **IDOR**: JWT do user B → `GET /payslips/my/:idDoA` → 404; `GET /payslips/my/:idDoA/pdf`
  → 404; `POST /payroll/runs/:id/approve` com JWT COLABORADOR → 403;
  `GET /payslips/my/compensation` devolve só a do próprio.
- **Imutabilidade**: `process`/`recalc` sobre run PUBLISHED → 409; `PUT /payslips/:id`
  sobre recibo ISSUED de um run publicado → 403.
- Correr a suite de integração **completa** antes de fechar (problemas de pool/ordem só
  aparecem com todos os ficheiros juntos — memória).

**Frontend:** testes de componente (vitest) para o mapa de `StatusBadge`, a lógica de
"publicar desativado se errorCount>0", e o modal de recalcular. Sem E2E nesta entrega.

### 11. Fases (cada uma = 1 PR; CI `quality` verde antes de merge; auto-merge após verde)

| Fase | Repo | Entregável | Depende de |
|---|---|---|---|
| **0** | innova | Migration `add_payroll_workflow` (enum + colunas) + `seedPayroll()` (CountryConfig/IrtBracket/SalaryComponent). `prisma migrate dev`, smoke. | — |
| **1** | innova | Registar `PayrollEngineService` no módulo; `money.util`; `PayrollCalculationService` (inputs leave/attendance + map + exceções); specs unitárias de cálculo. | 0 |
| **2** | innova | `PayrollWorkflowService` + `PayrollRunController` + guardas de transição + `assertPayslipEditable` + integração `AuditService`; specs unitárias + `payroll.integration-spec` (workflow). | 1 |
| **3** | innova | `SalaryComponentController`/service + `EmployeeCompensationController`/service + `GET /payslips/my/compensation` + DTOs + specs. | 0 |
| **4** | innova | `PayslipPdfService` (line-aware + fallback legado) + ligar ao `publish` e ao `GET /my/:id/pdf`. | 2 |
| **5** | frontend | NAV + `/payroll` dashboard + `/payroll/runs/[id]` simulação/exceções + `/payroll/components` + `/payroll/compensation`; `queryKeys.payroll.*`; testes de componente. | 2, 3 (API estável) |
| **6** | ambos | Suite de integração completa + testes IDOR + asserts de auditoria + `tsc`/build/testes verdes nos 2 repos + `prettier --write`. Verificação final na branch sincronizada com `main`. | 1–5 |

---

## A confirmar no início da implementação (Fase 1)

- Schema real do modelo de **horas extra** em `src/attendance/` (nome, campos `hours`/
  `status`/`date`/`userId`) e do **review** que as aprova.
- Campos de `LeaveRequest` (`startDate`/`endDate`/`status`/`leaveTypeCode`/`workingDays`
  ou equivalente) e como `leaveTypeConfig` distingue tipos **pagos vs não-pagos**
  (campo `paid`/`isPaid`/`affectsSalary`?). Se não houver essa distinção, `absenceDays`
  conta apenas `UserAttendance` `status='ABSENT'` e licenças sem vencimento ficam para
  fase posterior (documentar).
- Assinatura exata de `AuditService.log()` em `src/common/services/audit.service.ts`
  (nomes dos campos: `action`/`entity`/`entityId`/`metadata`/`userId`).
- Formato do `payslipToPdfInput` atual e da assinatura de `PdfService.generatePayslip`
  para o mover sem regressão.
- Convenção de `queryKeys` e de gate de NAV no frontend (ler `lib/queryKeys.ts` e o
  componente de navegação).

## Riscos

- **Tabela IRT / regras AO** — os valores no motor são "a confirmar com AGT". O seed
  marca-os como provisórios; a parametrização por `CountryConfig` permite corrigir sem
  deploy.
- **Volume** — ~6000 colaboradores por run. `process` e `publish` iteram em chunks;
  o `process` é síncrono no pedido HTTP — se exceder o timeout, mover para a fila Bull
  numa iteração futura (fora do âmbito desta entrega; documentar limite observado no
  smoke com um dataset grande).
- **Colunas fixas vs linhas** — manter as colunas fixas do `Payslip` preenchidas a partir
  das linhas é dívida deliberada para não partir o ESS/exports existentes; um cleanup
  futuro pode migrar o ESS para ler `PayslipItem`.
- **`prisma db seed`** vs `ts-node` — usar sempre o primeiro (memória sobre leave types).

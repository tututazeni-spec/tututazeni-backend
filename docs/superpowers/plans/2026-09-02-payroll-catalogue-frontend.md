# Catálogo salarial — frontend admin (sub-projeto B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the ADMIN/RH admin UI for the salary catalogue (salary components + effective-dated employee compensation) as two admin-only tabs inside the existing `/payslips` module, plus the one backend list endpoint it needs.

**Architecture:** Four squash-merged PRs in sequence — **B-0** merges the verified 25-commit `feat/payroll-workflow` backend branch to `main` (closes Phase 6, unblocks the ESS endpoint that frontend PR #393 already calls); **B-1** adds `GET /payroll/compensation/all` (paginated global list) to the backend; **B-2** adds the "Componentes" tab + the shared admin-tab scaffold to the frontend `/payslips` page; **B-3** adds the "Compensações" tab (global table → per-employee detail → create/correct/version modals + component-override editor). No new route, no new sidebar entry — the `adminOnly` NAV pattern from `components/courses` is reused.

**Tech Stack:** Backend NestJS 11 + Prisma (Postgres, read-replica split `this.prisma.read.*` for reads), class-validator DTOs, Jest unit + supertest integration. Frontend Next.js (App Router) + React Query via `useApiQuery`/`useApiMutation`, Tailwind design-system components in `components/ui/`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-payroll-catalogue-frontend-design.md` — read it alongside this plan; every task argues from a section there.

## Global Constraints

- **Backend `main` is branch-protected.** No direct push. Every backend change: branch → PR → wait for CI check `quality` green → squash-merge. `enforce_admins: true` — even admins cannot bypass. If GitHub Actions is down, wait; never disable the check or force-merge. (CLAUDE.md rule 15, memory `project_innova_main_protected`.)
- **Backend CI `quality` blocking steps:** `npm run lint:check`, `npm run format:check` (prettier), integration tests (batched), `npm run build` (`tsc`). Before every backend push run `npm run lint:check`, `npm run format:check`, and `npx prettier --write` on the files you changed. (memory `feedback_run_prettier_before_push`.)
- **Frontend is a separate git repo** (`tututazeni-frontend`, dir `innova/frontend/`, gitignored from backend). `main` there is **not** push-protected but follow the same branch + PR + CI discipline. (memory `project_innova_frontend_separate_repo`.)
- **Frontend CI `quality` job `build`:** blocking steps are `npm test` (`vitest run`) and `npm run build` (`next build`, includes the TS type-check). `npm run lint` runs with `continue-on-error: true` — **non-blocking**. Keep new files lint-clean; do not chase pre-existing warnings. Also run `npx tsc --noEmit` locally.
- **prettier on the frontend:** `npx prettier --write` **only on files this plan creates**. Never reformat pre-existing files — the repo has CRLF that prettier "fixes" into hundreds of false-positive diffs. (memory `project_innova_frontend_error_handling_fase4`.)
- **Prisma client split:** reads go through `this.prisma.read.<model>`, writes through `this.prisma.<model>`. Follow the pattern already in `employee-compensation.service.ts`.
- **`rate` on a PERCENT `SalaryComponent` is a fraction**, not a percentage: `0.07` means 7%. Confirmed in `src/payslips/payroll-engine.service.ts` (`(rate * 100).toFixed(0)` throughout, IRT brackets `rate: 0.07`). Label the form field and format the column as a fraction — **no ×100 conversion anywhere**.
- **`EmployeeCompensationComponent.override` is stored but not consumed** by the calc engine today. `payroll-calculation.service.ts` maps every `compensation.components[]` entry to `{ code, value, isTaxable: true }` and `payroll-engine.service.ts` (line ~179) pushes each as a taxable `EARNING` `FIXED` line — `override` is never read. The editor's `override` tooltip must say: *"marca este valor como substituição explícita do valor de catálogo. Registado para uso futuro — o cálculo actual soma todos os componentes como rendimento extra independentemente desta opção."*
- **No P2002→409 filter in the backend.** A duplicate `code` on `POST /payroll/components` surfaces as HTTP 500. Show the server error text verbatim; do not attempt client-side pre-validation of uniqueness. (memory `project_innova_empty_string_unique_collision`.)
- **IBAN is returned in clear** by `GET /payroll/compensation/current/:userId` and `GET /payroll/compensation?userId=` to ADMIN/RH. Only the ESS `GET /payslips/my/compensation` masks it. The admin `CompensationDetailView` card shows the raw IBAN **by design** — this mirrors the existing endpoints.
- **Effective-dated write semantics:** `POST /payroll/compensation` closes the previous open row (`effectiveTo = effectiveFrom − 1000ms`) inside a transaction. `PUT /payroll/compensation/:id` corrects one row in place (body has no `userId`). `POST /payroll/compensation/:id/components` **replaces the whole override list** (`deleteMany` then `createMany`).
- **Backend roles:** both `SalaryComponentController` and `EmployeeCompensationController` are already `@Roles(Role.ADMIN, Role.RH)` at class level. New methods inherit it — no per-method `@Roles` needed.
- **Frontend admin roles:** `ADMIN_ROLES` in `lib/roles.ts` is `['ADMIN', 'RH']` (mirrors backend). Gate with `const role = me?.role?.name as Role | undefined; const isAdmin = !!role && ADMIN_ROLES.includes(role);` exactly as `app/(platform)/courses/page.tsx` does.
- **Integration tests** need local Postgres db `innova_test` + Redis running, and `DB_POOL_MAX=5` in `.env.test`. The `payroll` batch in `scripts/run-integration-batched.js` already globs `test/integration/payroll/` — no runner change needed. (memory `project_innova_integration_test_infra`.)

---

## Task 0: Merge `feat/payroll-workflow` → `main` (PR B-0)

**Files:** none created/modified — this is a branch integration.

**Interfaces:**
- Consumes: nothing.
- Produces: on `main` — `SalaryComponentController` (`/payroll/components` CRUD), `EmployeeCompensationController` (`/payroll/compensation` history/current/create/update/components), `GET /payslips/my/compensation`, the `SalaryComponent` / `EmployeeCompensation` / `EmployeeCompensationComponent` Prisma models, the `payroll` seed, and `test/integration/payroll/*.integration-spec.ts`. B-1 branches from the resulting `main`.

- [ ] **Step 1: Sync `main` and inspect the gap**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova"
git fetch origin
git checkout main && git pull --ff-only origin main
git log --oneline main..feat/payroll-workflow          # expect 25 commits (763be4f … 8099adb), no docs-only surprises
git diff --stat main..feat/payroll-workflow
```

Expected: 25 commits, all under `src/payslips/`, `prisma/`, `test/integration/payroll/`, `docs/superpowers/`. The 26th (`94a9981`) is this sub-project's spec — fine to carry along.

- [ ] **Step 2: Rebase `feat/payroll-workflow` onto fresh `main` if it has diverged**

```bash
git checkout feat/payroll-workflow
git rebase main
# resolve conflicts if any; if the branch is already ahead-only, this is a no-op
```

Expected: "Current branch feat/payroll-workflow is up to date" or a clean fast-forward rebase.

- [ ] **Step 3: Run the backend gates locally**

```bash
npm run lint:check
npm run format:check
npm run build                                          # tsc, NODE_OPTIONS max-old-space 8192
npx jest payroll payslips --forceExit                  # focused unit specs for the module
npx cross-env NODE_ENV=test node node_modules/jest/bin/jest.js --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/payroll/"
```

Expected: lint/format/build exit 0; unit specs green; both `test/integration/payroll/*.integration-spec.ts` green (needs local Postgres `innova_test` + Redis).

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/payroll-workflow
gh pr create --base main --head feat/payroll-workflow \
  --title "feat(payroll): PayrollRun workflow + salary catalogue + ESS compensation" \
  --body "$(cat <<'EOF'
Merges the verified `feat/payroll-workflow` branch (Phase 6: integration green, tsc green).

Contents: PayrollRun state machine + workflow service, payroll engine + calculation service,
SalaryComponent CRUD, EmployeeCompensation effective-dated CRUD + component overrides,
GET /payslips/my/compensation (ESS, masked), PayslipPdfService, payroll seed, payroll
integration specs wired into the batched runner.

Closes Phase 6. Unblocks frontend PR #393 (which already calls GET /payslips/my/compensation).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Wait for CI `quality` to go green, then squash-merge**

```bash
gh pr checks --watch                                   # poll to a terminal state
gh pr merge --squash --delete-branch
git checkout main && git pull --ff-only origin main
```

Expected: `quality` check **success** before merge. Do not merge on a pending/failing check. Per memory `feedback_auto_merge_ci_green`, merge automatically once `quality` is green — no need to wait for an explicit "faz merge".

---

## Task 1: `CompensationListFilterDto` + `EmployeeCompensationService.listAll()` + `history()` user include (PR B-1)

**Files:**
- Modify: `src/payslips/payroll.dto.ts` (add one class near `PayrollRunFilterDto`, ~line 77)
- Modify: `src/payslips/employee-compensation.service.ts` (add `listAll`, extend `history` include)
- Test: `src/payslips/employee-compensation.service.spec.ts` (add a `describe('listAll')` block + one `history` assertion)

**Interfaces:**
- Consumes: `BaseFilterDto` (`page?: number`, `limit?: number`) from `src/common/dtos/pagination.dto.ts`; `calculatePagination(page, limit) → { skip, take }` and `buildPaginatedResponse<T>(data, total, page, limit) → { data, meta: { total, page, limit, totalPages } }` from `src/common/helpers/pagination.helper.ts`.
- Produces:
  - `class CompensationListFilterDto extends BaseFilterDto { search?: string; departmentId?: number; countryCode?: string }`
  - `EmployeeCompensationService.listAll(filter: CompensationListFilterDto): Promise<PaginatedResponse<Row>>` where each `Row` = `EmployeeCompensation` (no `bankName`/`iban`) `& { user: { id: number; fullName: string; employeeNumber: string | null; department: { id: number; name: string } | null }; _count: { components: number } }`.
  - `EmployeeCompensationService.history(userId)` now also includes `user: { select: { id, fullName, employeeNumber, department: { select: { id, name } } } }` on every row.

- [ ] **Step 1: Write the failing unit tests**

Add to `src/payslips/employee-compensation.service.spec.ts` (inside the existing top-level `describe`, after the last `it`), and extend the `beforeEach` prisma mock with the new methods:

```ts
// --- in beforeEach, extend prisma.read.employeeCompensation: ---
//   count: jest.fn().mockResolvedValue(0),
// and prisma.read.employeeCompensation.findMany already exists.

describe('listAll', () => {
  it('filters to the active record only and paginates + shapes the where/include', async () => {
    prisma.read.employeeCompensation.findMany.mockResolvedValue([
      { id: 1, userId: 7, baseSalary: 150000, effectiveTo: null, user: { id: 7, fullName: 'Ana', employeeNumber: 'E7', department: { id: 2, name: 'RH' } }, _count: { components: 2 } },
    ]);
    prisma.read.employeeCompensation.count.mockResolvedValue(1);

    const res = await svc.listAll({ page: 1, limit: 20, search: 'ana', departmentId: 2, countryCode: 'AO' });

    expect(prisma.read.employeeCompensation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          effectiveTo: null,
          countryCode: 'AO',
          user: expect.objectContaining({
            departmentId: 2,
            OR: [
              { fullName: { contains: 'ana', mode: 'insensitive' } },
              { employeeNumber: { contains: 'ana', mode: 'insensitive' } },
            ],
          }),
        }),
        orderBy: { user: { fullName: 'asc' } },
        skip: 0,
        take: 20,
        include: expect.objectContaining({ _count: { select: { components: true } } }),
      }),
    );
    // no bankName/iban leak in the select
    const call = prisma.read.employeeCompensation.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.include)).not.toContain('iban');
    expect(JSON.stringify(call.include)).not.toContain('bankName');

    expect(res).toEqual({
      data: expect.any(Array),
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('omits the user filter entirely when no search/departmentId given', async () => {
    prisma.read.employeeCompensation.findMany.mockResolvedValue([]);
    prisma.read.employeeCompensation.count.mockResolvedValue(0);
    await svc.listAll({});
    const call = prisma.read.employeeCompensation.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ effectiveTo: null });
  });
});

it('history includes the user identity on every row', async () => {
  prisma.read.employeeCompensation.findMany.mockResolvedValue([]);
  await svc.history(7);
  expect(prisma.read.employeeCompensation.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: 7 },
      include: expect.objectContaining({
        components: true,
        user: { select: { id: true, fullName: true, employeeNumber: true, department: { select: { id: true, name: true } } } },
      }),
    }),
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova"
npx jest employee-compensation.service --forceExit
```

Expected: FAIL — `svc.listAll is not a function`, and the `history` assertion fails on the missing `user` include.

- [ ] **Step 3: Add the DTO**

In `src/payslips/payroll.dto.ts`, after `PayrollRunFilterDto` (before `RejectRunDto`):

```ts
export class CompensationListFilterDto extends BaseFilterDto {
  @ApiPropertyOptional({ description: 'Pesquisa por nome ou nº de colaborador' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional({ example: 'AO' })
  @IsOptional()
  @IsString()
  countryCode?: string;
}
```

(`IsOptional`, `IsString`, `IsInt`, `Type`, `ApiPropertyOptional`, `BaseFilterDto` are already imported in this file.)

- [ ] **Step 4: Implement `listAll` + extend `history`**

In `src/payslips/employee-compensation.service.ts`:

```ts
// add to the payroll.dto import list: CompensationListFilterDto
// add near the top-level imports:
import {
  buildPaginatedResponse,
  calculatePagination,
} from '../common/helpers/pagination.helper';

// replace history():
history(userId: number) {
  return this.prisma.read.employeeCompensation.findMany({
    where: { userId },
    orderBy: { effectiveFrom: 'desc' },
    include: {
      components: true,
      user: {
        select: {
          id: true,
          fullName: true,
          employeeNumber: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  });
}

// add:
async listAll(filter: CompensationListFilterDto) {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const { skip, take } = calculatePagination(page, limit);

  const where: Prisma.EmployeeCompensationWhereInput = { effectiveTo: null };
  if (filter.countryCode) where.countryCode = filter.countryCode;

  const userWhere: Prisma.UserWhereInput = {};
  if (filter.departmentId) userWhere.departmentId = filter.departmentId;
  if (filter.search) {
    userWhere.OR = [
      { fullName: { contains: filter.search, mode: 'insensitive' } },
      { employeeNumber: { contains: filter.search, mode: 'insensitive' } },
    ];
  }
  if (Object.keys(userWhere).length > 0) where.user = userWhere;

  const [data, total] = await Promise.all([
    this.prisma.read.employeeCompensation.findMany({
      where,
      orderBy: { user: { fullName: 'asc' } },
      skip,
      take,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            department: { select: { id: true, name: true } },
          },
        },
        _count: { select: { components: true } },
      },
    }),
    this.prisma.read.employeeCompensation.count({ where }),
  ]);

  return buildPaginatedResponse(data, total, page, limit);
}
```

- [ ] **Step 5: Run the unit tests to verify they pass**

```bash
npx jest employee-compensation.service --forceExit
```

Expected: PASS (all `listAll` cases + the `history` include assertion + the pre-existing `create`/`myCompensation` tests).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/payslips/payroll.dto.ts src/payslips/employee-compensation.service.ts src/payslips/employee-compensation.service.spec.ts
npm run lint:check && npm run format:check
git add src/payslips/payroll.dto.ts src/payslips/employee-compensation.service.ts src/payslips/employee-compensation.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(payroll): EmployeeCompensationService.listAll + user include on history

CompensationListFilterDto (search / departmentId / countryCode over BaseFilterDto);
listAll returns the paginated { data, meta } shape, active rows only (effectiveTo: null),
with user.department + _count.components and no bankName/iban in the select. history()
now carries the same lightweight user identity so the detail view needs no extra GET /users/:id.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 2: `@Get('all')` route + integration spec cases (PR B-1)

**Files:**
- Modify: `src/payslips/employee-compensation.controller.ts` (add one method right after `history()`, before `current()`)
- Test: `test/integration/payroll/payroll-catalogue.integration-spec.ts` (add a `describe` block + one extra assertion in the history flow)

**Interfaces:**
- Consumes: `EmployeeCompensationService.listAll` from Task 1; `CompensationListFilterDto` from Task 1.
- Produces: `GET /payroll/compensation/all` — `@Roles(ADMIN, RH)` (inherited), query = `CompensationListFilterDto`, returns `{ data, meta }`. Route literal `all` sits before `current/:userId` and `:id`; no `@Get(':x')` at the controller root, so no route-shadowing (memory `project_innova_route_shadowing` — verified: the only param routes are `current/:userId` and `:id`, both distinct literals).

- [ ] **Step 1: Write the failing integration cases**

Add to `test/integration/payroll/payroll-catalogue.integration-spec.ts`, after the existing `POST /payroll/compensation duas vezes` block. It reuses `catEmpId` (has a closed + an open row after that block) and `catOtherId` (no rows), plus `rhToken` and the `getToken(app.getHttpServer(), ...)` helper for a COLABORADOR token via `empToken` (already logged in as `CAT_EMP_EMAIL`, a COLABORADOR):

```ts
describe('GET /payroll/compensation/all', () => {
  it('COLABORADOR → 403', async () => {
    await request(app.getHttpServer())
      .get('/payroll/compensation/all')
      .set('Authorization', `Bearer ${empToken}`)
      .expect(403);
  });

  it('RH → 200, active rows only, correct shape, no iban/bankName', async () => {
    const res = await request(app.getHttpServer())
      .get('/payroll/compensation/all')
      .set('Authorization', `Bearer ${rhToken}`)
      .query({ search: 'Colaborador Catalogo ESS' })
      .expect(200);

    expect(res.body.meta).toEqual(
      expect.objectContaining({ total: expect.any(Number), page: 1, limit: 20, totalPages: expect.any(Number) }),
    );
    const mine = res.body.data.find((r: any) => r.userId === catEmpId);
    expect(mine).toBeDefined();
    // catEmp has a closed + an open row → exactly one line here (the open one)
    expect(res.body.data.filter((r: any) => r.userId === catEmpId)).toHaveLength(1);
    expect(mine.effectiveTo).toBeNull();
    expect(mine.baseSalary).toBe(150000);
    expect(mine.user).toEqual(
      expect.objectContaining({ id: catEmpId, fullName: 'Colaborador Catalogo ESS' }),
    );
    expect(mine.user).toHaveProperty('department');
    expect(mine._count).toEqual({ components: expect.any(Number) });
    expect(mine).not.toHaveProperty('iban');
    expect(mine).not.toHaveProperty('bankName');
  });

  it('search narrows by employeeNumber and returns nothing for a miss', async () => {
    const res = await request(app.getHttpServer())
      .get('/payroll/compensation/all')
      .set('Authorization', `Bearer ${rhToken}`)
      .query({ search: 'zzz-no-such-employee-zzz' })
      .expect(200);
    expect(res.body.data.some((r: any) => r.userId === catEmpId)).toBe(false);
  });
});
```

Also add one assertion to the existing `POST /payroll/compensation duas vezes` `it`, after the `rows` assertions — proves `history` now carries `user`:

```ts
    const hist = await request(app.getHttpServer())
      .get('/payroll/compensation')
      .set('Authorization', `Bearer ${rhToken}`)
      .query({ userId: catEmpId })
      .expect(200);
    expect(hist.body[0].user).toEqual(
      expect.objectContaining({ id: catEmpId, fullName: 'Colaborador Catalogo ESS' }),
    );
```

- [ ] **Step 2: Run the integration spec to verify it fails**

```bash
npx cross-env NODE_ENV=test node node_modules/jest/bin/jest.js --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/payroll/payroll-catalogue"
```

Expected: FAIL — `GET /payroll/compensation/all` currently hits the `@Get(':id')`… actually there is no root `:id` GET, so it 404s (no route) → the 403 test fails (gets 404), the RH test fails (404). The `history[0].user` assertion fails (undefined).

- [ ] **Step 3: Add the controller route**

In `src/payslips/employee-compensation.controller.ts`:

```ts
// extend the payroll.dto import with: CompensationListFilterDto

  @Get('all')
  @ApiOperation({ summary: 'Listar colaboradores com compensação activa (paginado)' })
  listAll(@Query() filter: CompensationListFilterDto) {
    return this.service.listAll(filter);
  }
```

Place it **immediately after `history()`** (the root `@Get()`), before `@Get('current/:userId')`.

- [ ] **Step 4: Run the integration spec to verify it passes**

```bash
npx cross-env NODE_ENV=test node node_modules/jest/bin/jest.js --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/payroll/payroll-catalogue"
```

Expected: PASS — all new cases + the pre-existing catalogue/ESS cases still green.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/payslips/employee-compensation.controller.ts test/integration/payroll/payroll-catalogue.integration-spec.ts
npm run lint:check && npm run format:check
git add src/payslips/employee-compensation.controller.ts test/integration/payroll/payroll-catalogue.integration-spec.ts
git commit -m "$(cat <<'EOF'
feat(payroll): GET /payroll/compensation/all (paginated global list, ADMIN/RH)

Route literal 'all' before current/:userId and :id — no shadowing. Integration:
COLABORADOR 403; RH 200 with { data, meta }; active rows only; user.department +
_count.components present; no iban/bankName; search narrows by fullName/employeeNumber.
Also asserts history now returns user identity inline.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 3: B-1 full verification + PR + merge

**Files:** none — verification + integration.

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: `GET /payroll/compensation/all` on `main`. B-3 depends on this.

- [ ] **Step 1: Branch check + full local gates**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova"
git checkout -b feat/payroll-compensation-list        # branched from fresh main (post B-0)
# (if Tasks 1-2 were committed on main by mistake, cherry-pick them onto this branch instead)
git log --oneline -3
npm run lint:check
npm run format:check
npm run build
npx jest payslips payroll --forceExit
npx cross-env NODE_ENV=test node node_modules/jest/bin/jest.js --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/payroll/"
```

Expected: every command exit 0 / all green.

- [ ] **Step 2: Push + open PR**

```bash
git push -u origin feat/payroll-compensation-list
gh pr create --base main --head feat/payroll-compensation-list \
  --title "feat(payroll): GET /payroll/compensation/all" \
  --body "$(cat <<'EOF'
Adds the paginated global list endpoint the payroll catalogue admin UI (sub-project B-3) needs.

- CompensationListFilterDto (search / departmentId / countryCode over BaseFilterDto)
- EmployeeCompensationService.listAll → { data, meta }, active rows only, user.department + _count.components, no iban/bankName
- history() now includes the lightweight user identity (kills an extra GET /users/:id in the detail view)
- integration cases in payroll-catalogue.integration-spec.ts

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI `quality` green, squash-merge**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
git checkout main && git pull --ff-only origin main
```

Expected: `quality` success → merged.

---

## Task 4: Frontend shared scaffold — types, constants, query keys (PR B-2)

**Files:**
- Modify: `frontend/components/payslips/types.ts` (extend `View`, `SalaryComponent` + enum types)
- Modify: `frontend/components/payslips/constants.ts` (`adminOnly?` on NAV item type, `components` NAV entry, `TITLES` keys)
- Modify: `frontend/lib/queryKeys.ts` (`salaryComponents` under `payslips`)

**Interfaces:**
- Consumes: existing `View`/`Nav`/`queryKeys.payslips.all`.
- Produces (used by Tasks 5–7):
  - `type ComponentType = 'EARNING' | 'DEDUCTION'`
  - `type ComponentCalcType = 'FIXED' | 'PERCENT' | 'FORMULA' | 'TABLE'`
  - ```ts
    interface SalaryComponent {
      code: string; name: string; description: string | null;
      type: ComponentType; calcType: ComponentCalcType;
      fixedValue: number | null; rate: number | null; formula: string | null;
      isTaxable: boolean; isMandatory: boolean; order: number;
      active: boolean; countryCode: string | null;
      createdAt: string; updatedAt: string;
    }
    ```
  - `View` union now includes `'components'`
  - `NAV` item type: `{ id: Exclude<View, 'detail'>; label: string; adminOnly?: boolean }`, with a `{ id: 'components', label: 'Componentes', adminOnly: true }` entry
  - `TITLES` has a `components` key
  - `queryKeys.payslips.salaryComponents(filter: Record<string, unknown>)` → `readonly ['payslips', 'salary-components', Record<string, unknown>]`

- [ ] **Step 1: Extend `types.ts`**

In `frontend/components/payslips/types.ts`:

```ts
// append near the other exported types:
export type ComponentType = 'EARNING' | 'DEDUCTION';
export type ComponentCalcType = 'FIXED' | 'PERCENT' | 'FORMULA' | 'TABLE';

export interface SalaryComponent {
  code: string;
  name: string;
  description: string | null;
  type: ComponentType;
  calcType: ComponentCalcType;
  fixedValue: number | null;
  rate: number | null;
  formula: string | null;
  isTaxable: boolean;
  isMandatory: boolean;
  order: number;
  active: boolean;
  countryCode: string | null;
  createdAt: string;
  updatedAt: string;
}

// change the View union — add 'components':
export type View =
  | 'list'
  | 'detail'
  | 'compare'
  | 'simulate'
  | 'annual'
  | 'compensation'
  | 'components';
```

`Nav` is unchanged in B-2 (`{ view: Exclude<View, 'detail'> } | { view: 'detail'; selectedId: number }` still holds).

- [ ] **Step 2: Extend `constants.ts`**

In `frontend/components/payslips/constants.ts`:

```ts
export const NAV: Array<{
  id: Exclude<View, 'detail'>;
  label: string;
  adminOnly?: boolean;
}> = [
  { id: 'list', label: 'Os meus recibos' },
  { id: 'compare', label: 'Comparar meses' },
  { id: 'simulate', label: 'Simulador IRT' },
  { id: 'annual', label: 'Resumo anual' },
  { id: 'compensation', label: 'A minha compensação' },
  { id: 'components', label: 'Componentes', adminOnly: true },
];

export const TITLES: Record<View, string> = {
  list: 'Os meus recibos de salário',
  detail: 'Detalhe do recibo',
  compare: 'Comparar meses',
  simulate: 'Simulador IRT Angola 2026',
  annual: 'Resumo anual',
  compensation: 'A minha compensação actual',
  components: 'Componentes salariais',
};
```

- [ ] **Step 3: Add the query key**

In `frontend/lib/queryKeys.ts`, inside the `payslips` object (after `compensation`):

```ts
    salaryComponents: (filter: Record<string, unknown>) =>
      [...queryKeys.payslips.all, 'salary-components', filter] as const,
```

- [ ] **Step 4: Type-check**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova/frontend"
npx tsc --noEmit
```

Expected: exit 0. (`TITLES` is `Record<View, string>` so a missing `components` key would fail here — the check is meaningful.)

- [ ] **Step 5: Commit**

```bash
npx prettier --write components/payslips/types.ts components/payslips/constants.ts lib/queryKeys.ts
git add components/payslips/types.ts components/payslips/constants.ts lib/queryKeys.ts
git commit -m "$(cat <<'EOF'
feat(payslips): types + NAV scaffold for the admin Componentes tab

SalaryComponent / ComponentType / ComponentCalcType types, View union gains
'components', NAV item type gains adminOnly?, queryKeys.payslips.salaryComponents.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 5: `ComponentsView.tsx` + test (PR B-2)

**Files:**
- Create: `frontend/components/payslips/ComponentsView.tsx`
- Test: `frontend/components/payslips/ComponentsView.test.tsx`

**Interfaces:**
- Consumes: `SalaryComponent`, `ComponentType`, `ComponentCalcType` (Task 4); `queryKeys.payslips.salaryComponents` (Task 4); `useApiQuery`; `formatKz as fmtKz` from `lib/format`; `Button`, `IconButton` from `components/ui/Button`; `Select` from `components/ui/Select`; `Skeleton`, `EmptyState` from `components/ui/`; `useConfirm` from `providers/ConfirmProvider`; `useToast` from `providers/ToastProvider`; `apiClient` from `lib/apiClient`; `useQueryClient` from `@tanstack/react-query`.
- Produces: `export function ComponentsView(): JSX.Element` — self-contained, no props. Owns the toolbar filter state and the "open form modal" state, rendering `<ComponentFormModal>` (Task 6) itself.

- [ ] **Step 1: Write the failing test**

`frontend/components/payslips/ComponentsView.test.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let queryResult: { data: unknown; isLoading: boolean; error?: { message: string } } = {
  data: [],
  isLoading: false,
};
const del = vi.fn().mockResolvedValue({ code: 'BONUS', active: false });
const confirm = vi.fn().mockResolvedValue(true);
const notify = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => queryResult }));
vi.mock('@/lib/apiClient', () => ({ apiClient: { delete: (...a: unknown[]) => del(...a) } }));
vi.mock('@/providers/ConfirmProvider', () => ({ useConfirm: () => confirm }));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => notify }));
vi.mock('@tanstack/react-query', async (orig) => ({
  ...(await orig<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock('@/components/ui/Select', () => ({
  Select: ({ items, value, onValueChange }: any) => (
    <select data-testid="select" value={value ?? ''} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {items.map((it: any) => (
        <option key={it.value} value={it.value}>{it.label}</option>
      ))}
    </select>
  ),
}));
// stub the child modal so this test stays a unit of ComponentsView
vi.mock('./ComponentFormModal', () => ({
  ComponentFormModal: ({ component }: any) => (
    <div data-testid="form-modal">{component ? `edit:${component.code}` : 'create'}</div>
  ),
}));

import { ComponentsView } from './ComponentsView';

const base = {
  description: null, rate: null, formula: null, isTaxable: true, isMandatory: false,
  order: 0, active: true, countryCode: 'AO', createdAt: '', updatedAt: '',
};
const rows = [
  { ...base, code: 'BASE', name: 'Salário Base', type: 'EARNING', calcType: 'FIXED', fixedValue: 0 },
  { ...base, code: 'INSS', name: 'INSS', type: 'DEDUCTION', calcType: 'PERCENT', fixedValue: null, rate: 0.03 },
  { ...base, code: 'OLD', name: 'Antigo', type: 'EARNING', calcType: 'FIXED', fixedValue: 100, active: false },
];

beforeEach(() => {
  queryResult = { data: rows, isLoading: false };
  del.mockClear(); confirm.mockClear(); notify.mockClear(); invalidateQueries.mockClear();
});

describe('ComponentsView', () => {
  test('renders a row per component with code, name and a type badge', () => {
    render(<ComponentsView />);
    expect(screen.getByText('BASE')).toBeInTheDocument();
    expect(screen.getByText('Salário Base')).toBeInTheDocument();
    expect(screen.getByText('Rendimento')).toBeInTheDocument();
    expect(screen.getByText('Desconto')).toBeInTheDocument();
  });

  test('formats the calc column by calcType', () => {
    render(<ComponentsView />);
    expect(screen.getByText('3%')).toBeInTheDocument();          // PERCENT rate 0.03 → "3%"
  });

  test('marks inactive components', () => {
    render(<ComponentsView />);
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  test('"+ Novo componente" opens the form modal in create mode', () => {
    render(<ComponentsView />);
    fireEvent.click(screen.getByRole('button', { name: '+ Novo componente' }));
    expect(screen.getByTestId('form-modal')).toHaveTextContent('create');
  });

  test('empty list shows the EmptyState', () => {
    queryResult = { data: [], isLoading: false };
    render(<ComponentsView />);
    expect(screen.getByText(/Nenhum componente/i)).toBeInTheDocument();
  });

  test('remove asks for confirmation then DELETEs and toasts by the returned active flag', async () => {
    render(<ComponentsView />);
    fireEvent.click(screen.getAllByLabelText('Remover')[0]);
    expect(confirm).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(del).toHaveBeenCalledWith('/payroll/components/BASE'));
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(expect.objectContaining({ intent: expect.any(String) })),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova/frontend"
npx vitest run components/payslips/ComponentsView.test.tsx
```

Expected: FAIL — module `./ComponentsView` not found.

- [ ] **Step 3: Implement `ComponentsView.tsx`**

```tsx
// components/payslips/ComponentsView.tsx
// Aba "Componentes" (ADMIN/RH) do módulo /payslips: catálogo de componentes
// salariais (GET /payroll/components). Array simples, ~10-15 linhas. Filtros
// tipo/estado na toolbar; criar/editar via ComponentFormModal; remover via
// useConfirm (soft-delete se referenciado, hard-delete caso contrário — o
// backend decide e devolve a linha).
'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from '@/hooks/useApiQuery';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { formatKz as fmtKz } from '@/lib/format';
import { Button, IconButton } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useToast } from '@/providers/ToastProvider';
import { ComponentFormModal } from './ComponentFormModal';
import type { SalaryComponent, ComponentCalcType } from './types';

type StateFilter = 'active' | 'all' | 'inactive';

const TYPE_ITEMS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'EARNING', label: 'Rendimento' },
  { value: 'DEDUCTION', label: 'Desconto' },
];
const STATE_ITEMS = [
  { value: 'active', label: 'Activos' },
  { value: 'all', label: 'Todos' },
  { value: 'inactive', label: 'Inactivos' },
];

function calcLabel(c: SalaryComponent): string {
  switch (c.calcType) {
    case 'FIXED':
      return c.fixedValue != null ? fmtKz(c.fixedValue) : '—';
    case 'PERCENT':
      // rate é fracção (0.03 = 3%) — ver payroll-engine.service.ts
      return c.rate != null ? `${+(c.rate * 100).toFixed(2)}%` : '—';
    case 'FORMULA':
      return c.formula ?? 'fórmula';
    case 'TABLE':
      return 'tabela';
  }
}

const CALC_MONO: ComponentCalcType[] = ['FORMULA'];

export function ComponentsView() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const notify = useToast();

  const [type, setType] = useState<string>('all');
  const [state, setState] = useState<StateFilter>('active');
  const [editing, setEditing] = useState<SalaryComponent | null>(null);
  const [creating, setCreating] = useState(false);

  const params: Record<string, string> = {};
  if (type !== 'all') params.type = type;
  if (state === 'active') params.active = 'true';
  if (state === 'inactive') params.active = 'false';

  const { data, isLoading, error } = useApiQuery<SalaryComponent[]>(
    queryKeys.payslips.salaryComponents(params),
    '/payroll/components',
    { params },
  );

  const remove = async (c: SalaryComponent) => {
    const ok = await confirm({
      title: `Remover "${c.name}"?`,
      message:
        'Se já estiver em uso em compensações ou recibos, é apenas desactivado ' +
        '(deixa de estar disponível para novos usos mas mantém o histórico). ' +
        'Caso contrário, é removido definitivamente.',
      confirmLabel: 'Remover',
      destructive: true,
    });
    if (!ok) return;
    try {
      const back = await apiClient.delete<SalaryComponent>(`/payroll/components/${c.code}`);
      qc.invalidateQueries({ queryKey: queryKeys.payslips.all });
      notify({
        title: back?.active === false ? 'Componente desactivado' : 'Componente removido',
        intent: 'success',
      });
    } catch (e) {
      notify({ title: (e as Error).message || 'Erro ao remover', intent: 'danger' });
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Select items={TYPE_ITEMS} value={type} onValueChange={setType} />
        <Select
          items={STATE_ITEMS}
          value={state}
          onValueChange={(v) => setState(v as StateFilter)}
        />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          + Novo componente
        </Button>
      </div>

      {isLoading && <Skeleton rows={6} />}
      {error && <div className="font-body text-sm text-danger">{error.message}</div>}

      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <EmptyState
          title="Nenhum componente salarial"
          description="Cria o primeiro componente do catálogo com “+ Novo componente”."
        />
      )}

      {!isLoading && (data?.length ?? 0) > 0 && (
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          <div className="grid grid-cols-[120px_1fr_110px_150px_130px_80px_88px] gap-3 border-b border-border px-4 py-2.5 font-body text-xs font-medium uppercase tracking-wide text-ink-faint">
            <div>Código</div>
            <div>Nome</div>
            <div>Tipo</div>
            <div>Cálculo</div>
            <div>Flags</div>
            <div>Ordem</div>
            <div>Acções</div>
          </div>
          {data!.map((c) => (
            <div
              key={c.code}
              className={`grid grid-cols-[120px_1fr_110px_150px_130px_80px_88px] items-center gap-3 border-b border-border px-4 py-3 last:border-0 ${
                c.active ? '' : 'opacity-55'
              }`}
            >
              <div className="font-mono text-sm text-ink">{c.code}</div>
              <div className="min-w-0">
                <div className="truncate font-body text-sm font-medium text-ink">{c.name}</div>
                {c.description && (
                  <div className="truncate font-body text-xs text-ink-faint">{c.description}</div>
                )}
                {!c.active && (
                  <span className="mt-0.5 inline-block rounded-full bg-surface-sunken px-1.5 py-0.5 font-body text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                    Inactivo
                  </span>
                )}
              </div>
              <div>
                <span
                  className={`rounded-full px-2 py-0.5 font-body text-xs font-medium ${
                    c.type === 'EARNING'
                      ? 'bg-success-subtle text-success-ink'
                      : 'bg-danger-subtle text-danger-ink'
                  }`}
                >
                  {c.type === 'EARNING' ? 'Rendimento' : 'Desconto'}
                </span>
              </div>
              <div
                className={`text-sm text-ink-muted ${
                  CALC_MONO.includes(c.calcType) ? 'font-mono text-xs' : 'font-body'
                }`}
              >
                {calcLabel(c)}
              </div>
              <div className="flex flex-wrap gap-1">
                {c.isTaxable && (
                  <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 font-body text-[10px] text-ink-muted">
                    Tributável
                  </span>
                )}
                {c.isMandatory && (
                  <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 font-body text-[10px] text-ink-muted">
                    Obrigatório
                  </span>
                )}
              </div>
              <div className="font-body text-sm text-ink-muted">{c.order}</div>
              <div className="flex gap-1">
                <Button intent="ghost" size="sm" onClick={() => setEditing(c)}>
                  Editar
                </Button>
                <IconButton
                  icon={Trash2}
                  label="Remover"
                  intent="ghost"
                  size="sm"
                  onClick={() => remove(c)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <ComponentFormModal onClose={() => setCreating(false)} />}
      {editing && (
        <ComponentFormModal component={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
```

> If `IconButton` has no `label`-as-accessible-name behaviour, the test's `getByLabelText('Remover')` still works because `IconButton` renders `aria-label={label}` (verified in `ListView.tsx` usage). If a subagent finds otherwise, switch the test to `getAllByRole('button', { name: 'Remover' })`.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run components/payslips/ComponentsView.test.tsx
```

Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write components/payslips/ComponentsView.tsx components/payslips/ComponentsView.test.tsx
git add components/payslips/ComponentsView.tsx components/payslips/ComponentsView.test.tsx
git commit -m "$(cat <<'EOF'
feat(payslips): ComponentsView — salary component catalogue table

Type/state toolbar filters, calc column formatted per calcType (PERCENT rate
shown as % from the fraction), inactive rows dimmed + badge, remove via useConfirm
with soft/hard-delete copy and a toast that reflects the returned active flag.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 6: `ComponentFormModal.tsx` + test (PR B-2)

**Files:**
- Create: `frontend/components/payslips/ComponentFormModal.tsx`
- Test: `frontend/components/payslips/ComponentFormModal.test.tsx`

**Interfaces:**
- Consumes: `SalaryComponent`, `ComponentType`, `ComponentCalcType` (Task 4); `useApiMutation` from `hooks/useApiQuery`; `apiClient`; `queryKeys.payslips.all`; `Modal`, `ModalContent` from `components/ui/Modal`; `Button`, `FormField`, `Input`, `Textarea`, `Select` from `components/ui/`; `AlertCircle` from `lucide-react`; `useToast`.
- Produces: `export interface ComponentFormModalProps { component?: SalaryComponent | null; onClose: () => void }` and `export function ComponentFormModal(props): JSX.Element`. `component` absent/null → create (POST `/payroll/components`); present → edit (PUT `/payroll/components/:code`, body without `code`). On success: invalidate `queryKeys.payslips.all`, toast, `onClose()`. Modal is always `open`; the parent unmounts it to close (mirrors `CompetencyFormModal`).

- [ ] **Step 1: Write the failing test**

`frontend/components/payslips/ComponentFormModal.test.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const post = vi.fn().mockResolvedValue({ code: 'NEW' });
const put = vi.fn().mockResolvedValue({ code: 'BASE' });
const notify = vi.fn();

vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a) },
}));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => notify }));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiMutation: (fn: (v: unknown) => Promise<unknown>, opts: any) => ({
    mutate: (v: unknown) =>
      Promise.resolve(fn(v)).then((d) => opts?.onSuccess?.(d, v), (e) => opts?.onError?.(e)),
    isPending: false,
  }),
}));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children }: any) => <div>{children}</div>,
  ModalContent: ({ title, children }: any) => (<div><h2>{title}</h2>{children}</div>),
}));
vi.mock('@/components/ui/Select', () => ({
  Select: ({ items, value, onValueChange, id }: any) => (
    <select
      data-testid={id ?? 'select'}
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {items.map((it: any) => (<option key={it.value} value={it.value}>{it.label}</option>))}
    </select>
  ),
}));

import { ComponentFormModal } from './ComponentFormModal';

const existing = {
  code: 'BASE', name: 'Salário Base', description: 'A base', type: 'EARNING' as const,
  calcType: 'FIXED' as const, fixedValue: 90000, rate: null, formula: null,
  isTaxable: true, isMandatory: true, order: 1, active: true, countryCode: 'AO',
  createdAt: '', updatedAt: '',
};

beforeEach(() => { post.mockClear(); put.mockClear(); notify.mockClear(); });

describe('ComponentFormModal — create', () => {
  test('shows the código field and "Novo componente" title', () => {
    render(<ComponentFormModal onClose={vi.fn()} />);
    expect(screen.getByText('Novo componente')).toBeInTheDocument();
    expect(screen.getByLabelText(/Código/)).toBeEnabled();
  });

  test('blocks submit when the calcType-required conditional field is empty', () => {
    render(<ComponentFormModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: 'PREMIO' } });
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Prémio' } });
    fireEvent.change(screen.getByTestId('cf-type'), { target: { value: 'EARNING' } });
    fireEvent.change(screen.getByTestId('cf-calc'), { target: { value: 'FIXED' } });
    // fixedValue still empty
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(/Valor fixo.*obrigatóri/i)).toBeInTheDocument();
  });

  test('changing calcType swaps the conditional field', () => {
    render(<ComponentFormModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('cf-calc'), { target: { value: 'PERCENT' } });
    expect(screen.getByLabelText(/Taxa/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Valor fixo/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('cf-calc'), { target: { value: 'TABLE' } });
    expect(screen.queryByLabelText(/Taxa/)).not.toBeInTheDocument();
  });

  test('valid create POSTs the expected body', async () => {
    render(<ComponentFormModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: ' premio ' } });
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Prémio' } });
    fireEvent.change(screen.getByTestId('cf-type'), { target: { value: 'EARNING' } });
    fireEvent.change(screen.getByTestId('cf-calc'), { target: { value: 'FIXED' } });
    fireEvent.change(screen.getByLabelText(/Valor fixo/), { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/payroll/components', expect.objectContaining({
      code: 'PREMIO', name: 'Prémio', type: 'EARNING', calcType: 'FIXED', fixedValue: 25000,
      isTaxable: true, isMandatory: false, order: 0, countryCode: 'AO',
    }));
  });
});

describe('ComponentFormModal — edit', () => {
  test('hides the código field, prefills, PUTs without code', async () => {
    render(<ComponentFormModal component={existing} onClose={vi.fn()} />);
    expect(screen.getByText('Editar componente')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Código/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Nome/)).toHaveValue('Salário Base');
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Salário Base X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, body] = put.mock.calls[0];
    expect(url).toBe('/payroll/components/BASE');
    expect(body).not.toHaveProperty('code');
    expect(body).toMatchObject({ name: 'Salário Base X', calcType: 'FIXED', fixedValue: 90000 });
  });

  test('server 500 on duplicate code is shown verbatim', async () => {
    post.mockRejectedValueOnce(new Error('Unique constraint failed on the fields: (`code`)'));
    render(<ComponentFormModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Código/), { target: { value: 'BASE' } });
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Dup' } });
    fireEvent.change(screen.getByTestId('cf-type'), { target: { value: 'EARNING' } });
    fireEvent.change(screen.getByTestId('cf-calc'), { target: { value: 'TABLE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    expect(await screen.findByText(/Unique constraint failed/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run components/payslips/ComponentFormModal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ComponentFormModal.tsx`**

```tsx
// components/payslips/ComponentFormModal.tsx
// Modal único de criar/editar um SalaryComponent (POST /payroll/components,
// PUT /payroll/components/:code). Só ADMIN/RH — mesmo RBAC de
// SalaryComponentController. Padrão de CompetencyFormModal: a página só monta
// isto quando aberto, por isso o Modal fica sempre `open`.
//
// `code` é imutável: input só em criar, ausente em editar.
// Campo de valor condicional ao calcType espelha o @ValidateIf do
// CreateSalaryComponentDto (FIXED→fixedValue, PERCENT→rate, FORMULA→formula,
// TABLE→nenhum). `rate` é fracção (0.10 = 10%) — ver payroll-engine.service.ts.
// Sem filtro P2002→409 no backend: code duplicado devolve 500; mostramos cru.
'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useApiMutation } from '@/hooks/useApiQuery';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { useToast } from '@/providers/ToastProvider';
import type { SalaryComponent, ComponentCalcType, ComponentType } from './types';

export interface ComponentFormModalProps {
  component?: SalaryComponent | null;
  onClose: () => void;
}

const TYPE_ITEMS = [
  { value: 'EARNING', label: 'Rendimento (EARNING)' },
  { value: 'DEDUCTION', label: 'Desconto (DEDUCTION)' },
];
const CALC_ITEMS = [
  { value: 'FIXED', label: 'Valor fixo (FIXED)' },
  { value: 'PERCENT', label: 'Percentagem (PERCENT)' },
  { value: 'FORMULA', label: 'Fórmula (FORMULA)' },
  { value: 'TABLE', label: 'Tabela / escalões (TABLE)' },
];

export function ComponentFormModal({ component, onClose }: ComponentFormModalProps) {
  const editing = component != null;
  const notify = useToast();

  const [code, setCode] = useState(component?.code ?? '');
  const [name, setName] = useState(component?.name ?? '');
  const [description, setDescription] = useState(component?.description ?? '');
  const [type, setType] = useState<string>(component?.type ?? '');
  const [calcType, setCalcType] = useState<string>(component?.calcType ?? '');
  const [fixedValue, setFixedValue] = useState(
    component?.fixedValue != null ? String(component.fixedValue) : '',
  );
  const [rate, setRate] = useState(component?.rate != null ? String(component.rate) : '');
  const [formula, setFormula] = useState(component?.formula ?? '');
  const [isTaxable, setIsTaxable] = useState(component?.isTaxable ?? true);
  const [isMandatory, setIsMandatory] = useState(component?.isMandatory ?? false);
  const [order, setOrder] = useState(component?.order != null ? String(component.order) : '0');
  const [countryCode, setCountryCode] = useState(component?.countryCode ?? 'AO');
  const [submitError, setSubmitError] = useState('');
  const [condError, setCondError] = useState('');

  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      editing
        ? apiClient.put(`/payroll/components/${component!.code}`, body)
        : apiClient.post('/payroll/components', body),
    {
      invalidateKeys: [queryKeys.payslips.all],
      onSuccess: () => {
        notify({
          title: editing ? 'Componente actualizado' : 'Componente criado',
          intent: 'success',
        });
        onClose();
      },
      onError: (e: Error) => setSubmitError(e.message || 'Erro ao guardar. Tente novamente.'),
    },
  );
  const loading = save.isPending;

  const condLabel =
    calcType === 'FIXED'
      ? 'Valor fixo (Kz)'
      : calcType === 'PERCENT'
        ? 'Taxa'
        : calcType === 'FORMULA'
          ? 'Fórmula'
          : '';

  const baseValid =
    (editing || code.trim().length > 0) && name.trim().length > 0 && type !== '' && calcType !== '';

  const handleSubmit = () => {
    if (loading) return;
    setSubmitError('');
    setCondError('');
    if (!baseValid) return;
    if (calcType === 'FIXED' && fixedValue.trim() === '') {
      setCondError('Valor fixo é obrigatório quando o cálculo é FIXED.');
      return;
    }
    if (calcType === 'PERCENT' && rate.trim() === '') {
      setCondError('Taxa é obrigatória quando o cálculo é PERCENT.');
      return;
    }
    if (calcType === 'FORMULA' && formula.trim() === '') {
      setCondError('Fórmula é obrigatória quando o cálculo é FORMULA.');
      return;
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
      type: type as ComponentType,
      calcType: calcType as ComponentCalcType,
      isTaxable,
      isMandatory,
      order: Number(order) || 0,
      countryCode: countryCode.trim() || 'AO',
    };
    if (!editing) body.code = code.trim().toUpperCase();
    if (calcType === 'FIXED') body.fixedValue = Number(fixedValue);
    if (calcType === 'PERCENT') body.rate = Number(rate);
    if (calcType === 'FORMULA') body.formula = formula.trim();

    save.mutate(body);
  };

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title={editing ? 'Editar componente' : 'Novo componente'}
        description={
          editing
            ? 'Actualiza o componente. As alterações aplicam-se de imediato.'
            : 'Cria um componente no catálogo salarial.'
        }
        className="max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="mt-5 space-y-4">
          {submitError && (
            <div className="flex items-center gap-2 rounded-card bg-danger-subtle p-3 text-sm text-danger-ink">
              <AlertCircle size={16} strokeWidth={1.75} />
              {submitError}
            </div>
          )}

          {!editing && (
            <FormField
              label="Código *"
              htmlFor="cf-code"
              hint="Identificador único, imutável (ex.: BASE, TRANSPORT)."
            >
              <Input
                id="cf-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="BASE"
                className="w-full font-mono"
              />
            </FormField>
          )}

          <FormField label="Nome *" htmlFor="cf-name">
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
          </FormField>

          <FormField label="Descrição" htmlFor="cf-description">
            <Textarea
              id="cf-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipo *" htmlFor="cf-type">
              <Select
                id="cf-type"
                items={TYPE_ITEMS}
                value={type || undefined}
                onValueChange={setType}
                placeholder="Selecionar"
                className="w-full"
              />
            </FormField>
            <FormField label="Tipo de cálculo *" htmlFor="cf-calc">
              <Select
                id="cf-calc"
                items={CALC_ITEMS}
                value={calcType || undefined}
                onValueChange={(v) => {
                  setCalcType(v);
                  setCondError('');
                }}
                placeholder="Selecionar"
                className="w-full"
              />
            </FormField>
          </div>

          {condLabel && (
            <FormField
              label={condLabel}
              htmlFor="cf-cond"
              hint={
                calcType === 'PERCENT'
                  ? 'Fracção: 0.10 = 10% (mesma convenção do motor de cálculo).'
                  : calcType === 'FORMULA'
                    ? 'Expressão avaliada pelo motor de cálculo.'
                    : undefined
              }
            >
              {calcType === 'FORMULA' ? (
                <Input
                  id="cf-cond"
                  value={formula}
                  onChange={(e) => setFormula(e.target.value)}
                  className="w-full font-mono"
                />
              ) : (
                <Input
                  id="cf-cond"
                  type="number"
                  step="any"
                  value={calcType === 'FIXED' ? fixedValue : rate}
                  onChange={(e) =>
                    calcType === 'FIXED'
                      ? setFixedValue(e.target.value)
                      : setRate(e.target.value)
                  }
                  className="w-full"
                />
              )}
            </FormField>
          )}
          {calcType === 'TABLE' && (
            <p className="font-body text-xs text-ink-faint">
              Os escalões são geridos na configuração do país.
            </p>
          )}
          {condError && (
            <div className="flex items-center gap-2 rounded-card bg-danger-subtle p-3 text-sm text-danger-ink">
              <AlertCircle size={16} strokeWidth={1.75} />
              {condError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={isTaxable}
                onChange={(e) => setIsTaxable(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong accent-primary"
              />
              Tributável
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={isMandatory}
                onChange={(e) => setIsMandatory(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong accent-primary"
              />
              Obrigatório
            </label>
            <FormField label="Ordem" htmlFor="cf-order">
              <Input
                id="cf-order"
                type="number"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                className="w-full"
              />
            </FormField>
            <FormField label="País" htmlFor="cf-country">
              <Input
                id="cf-country"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                className="w-full"
              />
            </FormField>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button intent="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!baseValid} loading={loading}>
            {editing ? 'Guardar' : 'Criar'}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
```

> If the shared `Select` does not forward an `id` prop, the test's `getByTestId('cf-type')` fails. Check `components/ui/Select.tsx`: if it has no `id` passthrough, use `data-testid` via a wrapper is not possible — instead change the two `Select`s in the test's mock to key off the `placeholder` or the first `items[0].value`, and in the component keep `id` for the `FormField htmlFor` association only. Simplest robust fix if needed: the mock reads `items[0].value` — `cf-type` items start with `EARNING`, `cf-calc` with `FIXED` — `data-testid={items[0].value === 'EARNING' ? 'cf-type' : 'cf-calc'}`.

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run components/payslips/ComponentFormModal.test.tsx
```

Expected: PASS (all create + edit cases).

- [ ] **Step 5: Commit**

```bash
npx prettier --write components/payslips/ComponentFormModal.tsx components/payslips/ComponentFormModal.test.tsx
git add components/payslips/ComponentFormModal.tsx components/payslips/ComponentFormModal.test.tsx
git commit -m "$(cat <<'EOF'
feat(payslips): ComponentFormModal — create/edit a salary component

code input in create only (immutable), calcType-driven conditional value field
mirroring the DTO @ValidateIf, client-side block with inline error when the
required conditional is empty, server 500 (duplicate code) shown verbatim.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 7: Wire the admin scaffold into `page.tsx` + B-2 verification + PR

**Files:**
- Modify: `frontend/app/(platform)/payslips/page.tsx`

**Interfaces:**
- Consumes: `ComponentsView` (Task 5); `NAV`/`TITLES` with `adminOnly` (Task 4); `useCurrentUser`, `ADMIN_ROLES`, `Role` from `lib/roles`.
- Produces: `/payslips` renders the "Componentes" tab only for ADMIN/RH; `nav.view === 'components' && isAdmin` guards the render (defence in depth).

- [ ] **Step 1: Rewrite `page.tsx`**

```tsx
// src/app/(dashboard)/payslips/page.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AnnualView } from '@/components/payslips/AnnualView';
import { CompareView } from '@/components/payslips/CompareView';
import { CompensationView } from '@/components/payslips/CompensationView';
import { ComponentsView } from '@/components/payslips/ComponentsView';
import { NAV, TITLES } from '@/components/payslips/constants';
import { DetailView } from '@/components/payslips/DetailView';
import { ListView } from '@/components/payslips/ListView';
import { SimulateView } from '@/components/payslips/SimulateView';
import type { Nav } from '@/components/payslips/types';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ADMIN_ROLES, type Role } from '@/lib/roles';

export default function PayslipsPage() {
  const { data: me } = useCurrentUser();
  const role = me?.role?.name as Role | undefined;
  const isAdmin = !!role && ADMIN_ROLES.includes(role);
  const visibleNav = isAdmin ? NAV : NAV.filter((n) => !n.adminOnly);

  const [nav, setNav] = useState<Nav>({ view: 'list' });

  const handleSelect = (id: number) => setNav({ view: 'detail', selectedId: id });
  const handleBack = () => setNav({ view: 'list' });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">
            {TITLES[nav.view]}
          </h1>
          <p className="font-body text-sm text-ink-faint mt-0.5"></p>
        </div>
      </div>

      {nav.view !== 'detail' && (
        <div className="flex gap-1 mb-6 bg-surface-sunken p-1 rounded-card w-fit">
          {visibleNav.map((n) => (
            <Button
              key={n.id}
              size="sm"
              intent={nav.view === n.id ? 'primary' : 'ghost'}
              onClick={() => setNav({ view: n.id })}
            >
              {n.label}
            </Button>
          ))}
        </div>
      )}

      {nav.view === 'list' && <ListView onSelect={handleSelect} />}
      {nav.view === 'detail' && (
        <DetailView payslipId={nav.selectedId} onBack={handleBack} />
      )}
      {nav.view === 'compare' && <CompareView />}
      {nav.view === 'simulate' && <SimulateView />}
      {nav.view === 'annual' && <AnnualView />}
      {nav.view === 'compensation' && <CompensationView />}
      {nav.view === 'components' && isAdmin && <ComponentsView />}
    </div>
  );
}
```

- [ ] **Step 2: Full B-2 gates**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova/frontend"
npx tsc --noEmit
npx vitest run components/payslips/
npm run build
npm run lint    # report only; new files must be clean
```

Expected: `tsc` exit 0; all payslips vitest green; `next build` succeeds; lint shows no new errors in the 4 touched/created files.

- [ ] **Step 3: Manual browser smoke (needs backend on :4000 + frontend + seed)**

```bash
# terminal A: cd innova && npm run start:dev
# terminal B: cd innova/frontend && npm run dev
```

Verify:
- Log in as ADMIN or RH → `/payslips` shows a "Componentes" tab; log in as a COLABORADOR → no "Componentes" tab.
- Create one component per `calcType` (FIXED/PERCENT/FORMULA/TABLE); confirm the conditional field switches and blocks an empty required value.
- Edit a component (no `code` field, other fields prefilled).
- Delete a component that is referenced by a compensation/payslip → toast "desactivado", row stays with the Inactivo badge; delete an unreferenced one → toast "removido", row disappears.

- [ ] **Step 4: Commit + PR**

```bash
git checkout -b feat/payslips-components-tab   # if not already on it (should carry Tasks 4-7 commits)
git add app/\(platform\)/payslips/page.tsx
git commit -m "$(cat <<'EOF'
feat(payslips): admin-only Componentes tab wired into /payslips

useCurrentUser → isAdmin (ADMIN_ROLES), visibleNav filters adminOnly, the
components view is also guarded by && isAdmin. Same pattern as courses/page.tsx.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
git push -u origin feat/payslips-components-tab
gh pr create --base main --head feat/payslips-components-tab \
  --title "feat(payslips): admin Componentes tab (salary component catalogue)" \
  --body "$(cat <<'EOF'
Sub-project B-2 of the payroll catalogue frontend.

- Shared admin-tab scaffold in payslips/page.tsx (adminOnly NAV pattern from courses)
- ComponentsView: catalogue table, type/state filters, calc column per calcType, soft/hard-delete via useConfirm
- ComponentFormModal: create/edit, immutable code, calcType-conditional value field mirroring the DTO @ValidateIf
- types/constants/queryKeys scaffold (also used by B-3)

Depends on B-0 (merged). Independent of B-1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Expected: CI `quality` job `build` green → merged.

---

## Task 8: B-3 shared data layer — types, constants, query keys, `compensationData.ts`

**Files:**
- Modify: `frontend/components/payslips/types.ts` (`View`/`Nav` unions; compensation row + detail types)
- Modify: `frontend/components/payslips/constants.ts` (`compensations` NAV entry + `Exclude` widen; `TITLES` keys)
- Modify: `frontend/lib/queryKeys.ts` (`compensationList`, `compensationHistory`)
- Create: `frontend/components/payslips/compensationData.ts`

**Interfaces:**
- Consumes: Task 4 types; `useApiQuery`; `useDirectoryUsers`, `DirectoryUser` from `components/enrollments/enrollData` (re-export); `keepPreviousData`.
- Produces (used by Tasks 9–13):
  - `View` union adds `'compensations' | 'comp-detail'`
  - ```ts
    export type Nav =
      | { view: Exclude<View, 'detail' | 'comp-detail'> }
      | { view: 'detail'; selectedId: number }
      | { view: 'comp-detail'; userId: number };
    ```
  - ```ts
    interface CompUserRef { id: number; fullName: string; employeeNumber: string | null; department: { id: number; name: string } | null }
    interface EmployeeCompensationComponent { id: number; compensationId: number; componentCode: string; value: number; override: boolean }
    interface EmployeeCompensation {
      id: number; userId: number; baseSalary: number; countryCode: string | null;
      bankName: string | null; iban: string | null; accountNumber: string | null;
      effectiveFrom: string; effectiveTo: string | null;
      foodAllowance: number | null; transportAllowance: number | null;
      components: EmployeeCompensationComponent[];
      user?: CompUserRef;
    }
    interface CompensationListRow {
      id: number; userId: number; baseSalary: number; countryCode: string | null;
      foodAllowance: number | null; transportAllowance: number | null;
      effectiveFrom: string; effectiveTo: string | null;
      user: CompUserRef; _count: { components: number };
    }
    interface Paginated<T> { data: T[]; meta: { total: number; page: number; limit: number; totalPages: number } }
    ```
  - `queryKeys.payslips.compensationList(filter: Record<string, unknown>)`, `queryKeys.payslips.compensationHistory(userId: number)`
  - `compensationData.ts`: `useSalaryComponentOptions(enabled?: boolean) → { options: { value: string; label: string }[]; byCode: Record<string, SalaryComponent>; loading: boolean }` (GET `/payroll/components?active=true`), and `export { useDirectoryUsers, type DirectoryUser } from '@/components/enrollments/enrollData'`.

- [ ] **Step 1: Extend `types.ts`**

Add the interfaces above to `frontend/components/payslips/types.ts`, widen `View`, and replace `Nav`:

```ts
export type View =
  | 'list' | 'detail' | 'compare' | 'simulate' | 'annual'
  | 'compensation' | 'components' | 'compensations' | 'comp-detail';

export type Nav =
  | { view: Exclude<View, 'detail' | 'comp-detail'> }
  | { view: 'detail'; selectedId: number }
  | { view: 'comp-detail'; userId: number };
```

- [ ] **Step 2: Extend `constants.ts`**

```ts
export const NAV: Array<{
  id: Exclude<View, 'detail' | 'comp-detail'>;
  label: string;
  adminOnly?: boolean;
}> = [
  { id: 'list', label: 'Os meus recibos' },
  { id: 'compare', label: 'Comparar meses' },
  { id: 'simulate', label: 'Simulador IRT' },
  { id: 'annual', label: 'Resumo anual' },
  { id: 'compensation', label: 'A minha compensação' },
  { id: 'components', label: 'Componentes', adminOnly: true },
  { id: 'compensations', label: 'Compensações', adminOnly: true },
];

// TITLES: add
//   compensations: 'Compensações dos colaboradores',
//   'comp-detail': 'Compensação do colaborador',
```

- [ ] **Step 3: Add query keys**

In `frontend/lib/queryKeys.ts` `payslips` block:

```ts
    compensationList: (filter: Record<string, unknown>) =>
      [...queryKeys.payslips.all, 'compensation-list', filter] as const,
    compensationHistory: (userId: number) =>
      [...queryKeys.payslips.all, 'compensation-history', userId] as const,
```

- [ ] **Step 4: Create `compensationData.ts`**

```ts
// components/payslips/compensationData.ts
// Fontes de dados partilhadas pelas vistas da aba "Compensações" (B-3):
// catálogo de componentes activos para os pickers do editor de overrides, e
// re-export da pesquisa no diretório interno (reutiliza enrollData).
'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME } from '@/lib/queryClient';
import type { SalaryComponent } from './types';

export { useDirectoryUsers, type DirectoryUser } from '@/components/enrollments/enrollData';

export function useSalaryComponentOptions(enabled = true) {
  const params = { active: 'true' };
  const query = useApiQuery<SalaryComponent[]>(
    queryKeys.payslips.salaryComponents({ picker: 'overrides', ...params }),
    '/payroll/components',
    { params, staleTime: STALE_TIME.SEMI_STATIC, enabled },
  );
  const list = query.data ?? [];
  const options = list.map((c) => ({
    value: c.code,
    label: `${c.code} — ${c.name} (${c.type === 'EARNING' ? 'Rendimento' : 'Desconto'})`,
  }));
  const byCode = Object.fromEntries(list.map((c) => [c.code, c])) as Record<string, SalaryComponent>;
  return { options, byCode, loading: query.isLoading };
}
```

- [ ] **Step 5: Type-check + commit**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova/frontend"
npx tsc --noEmit
npx prettier --write components/payslips/types.ts components/payslips/constants.ts lib/queryKeys.ts components/payslips/compensationData.ts
git checkout -b feat/payslips-compensations-tab   # branched from main AFTER B-1 and B-2 merged
git add components/payslips/types.ts components/payslips/constants.ts lib/queryKeys.ts components/payslips/compensationData.ts
git commit -m "$(cat <<'EOF'
feat(payslips): data layer for the admin Compensações tab

View/Nav unions gain compensations + comp-detail (by-userId), EmployeeCompensation
/ CompensationListRow / Paginated types, compensationList + compensationHistory
query keys, compensationData.ts (active-component picker options + directory re-export).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 9: `CompensationsView.tsx` + test (PR B-3)

**Files:**
- Create: `frontend/components/payslips/CompensationsView.tsx`
- Test: `frontend/components/payslips/CompensationsView.test.tsx`

**Interfaces:**
- Consumes: `CompensationListRow`, `Paginated` (Task 8); `queryKeys.payslips.compensationList` (Task 8); `useApiQuery` + `keepPreviousData`; `useDebounce`; `formatKz`, `formatDate` from `lib/format`; `Input`, `Skeleton`, `EmptyState`, `Pagination` from `components/ui/`; `Button`; `CompensationFormModal` (Task 10).
- Produces: `export interface CompensationsViewProps { onOpenDetail: (userId: number) => void }` and `export function CompensationsView(props): JSX.Element`. Owns search + page state and the "+ Nova compensação" modal (create, no `userId`).

- [ ] **Step 1: Write the failing test**

`frontend/components/payslips/CompensationsView.test.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let queryResult: any = { data: undefined, isLoading: false };
const useApiQuery = vi.fn(() => queryResult);

vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: (...a: unknown[]) => useApiQuery(...a) }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (v: unknown) => v }));
vi.mock('@tanstack/react-query', () => ({ keepPreviousData: Symbol('kpd') }));
vi.mock('./CompensationFormModal', () => ({
  CompensationFormModal: ({ mode, userId }: any) => (
    <div data-testid="form-modal">{`${mode}:${userId ?? 'none'}`}</div>
  ),
}));
vi.mock('@/components/ui/Pagination', () => ({
  Pagination: ({ page, totalPages, onPageChange }: any) => (
    <button data-testid="next-page" onClick={() => onPageChange(page + 1)}>
      {`${page}/${totalPages}`}
    </button>
  ),
}));

import { CompensationsView } from './CompensationsView';

const page1 = {
  data: [
    {
      id: 1, userId: 7, baseSalary: 150000, countryCode: 'AO',
      foodAllowance: 20000, transportAllowance: 15000,
      effectiveFrom: '2026-06-01T00:00:00.000Z', effectiveTo: null,
      user: { id: 7, fullName: 'Ana Silva', employeeNumber: 'E-7', department: { id: 2, name: 'Financeiro' } },
      _count: { components: 3 },
    },
  ],
  meta: { total: 1, page: 1, limit: 20, totalPages: 2 },
};

beforeEach(() => {
  queryResult = { data: page1, isLoading: false };
  useApiQuery.mockClear();
});

describe('CompensationsView', () => {
  test('renders a row with name, employeeNumber, dept, base salary, effectiveFrom, #components', () => {
    render(<CompensationsView onOpenDetail={vi.fn()} />);
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('E-7')).toBeInTheDocument();
    expect(screen.getByText('Financeiro')).toBeInTheDocument();
    expect(screen.getByText(/150.?000/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('typing in the search box feeds the query params', () => {
    render(<CompensationsView onOpenDetail={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Pesquisar/i), { target: { value: 'ana' } });
    const lastCall = useApiQuery.mock.calls.at(-1)!;
    expect(JSON.stringify(lastCall)).toContain('ana');
  });

  test('row click calls onOpenDetail with the userId', () => {
    const onOpenDetail = vi.fn();
    render(<CompensationsView onOpenDetail={onOpenDetail} />);
    fireEvent.click(screen.getByText('Ana Silva'));
    expect(onOpenDetail).toHaveBeenCalledWith(7);
  });

  test('pagination advances the page param', () => {
    render(<CompensationsView onOpenDetail={vi.fn()} />);
    fireEvent.click(screen.getByTestId('next-page'));
    const lastCall = useApiQuery.mock.calls.at(-1)!;
    expect(JSON.stringify(lastCall)).toContain('"page":2');
  });

  test('empty list shows the EmptyState', () => {
    queryResult = { data: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }, isLoading: false };
    render(<CompensationsView onOpenDetail={vi.fn()} />);
    expect(screen.getByText(/Nenhum colaborador com compensação/i)).toBeInTheDocument();
  });

  test('"+ Nova compensação" opens the create modal without a userId', () => {
    render(<CompensationsView onOpenDetail={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Nova compensação' }));
    expect(screen.getByTestId('form-modal')).toHaveTextContent('create:none');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run components/payslips/CompensationsView.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CompensationsView.tsx`**

```tsx
// components/payslips/CompensationsView.tsx
// Aba "Compensações" (ADMIN/RH): tabela global de colaboradores com uma
// compensação activa (GET /payroll/compensation/all, paginado). Clique numa
// linha → detalhe por colaborador. "+ Nova compensação" abre o form em modo
// criar sem userId (único caminho para um colaborador ainda sem registos, que
// não aparece nesta lista).
'use client';

import { useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME } from '@/lib/queryClient';
import { formatKz as fmtKz, formatDate as fmtDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { CompensationFormModal } from './CompensationFormModal';
import type { CompensationListRow, Paginated } from './types';

export interface CompensationsViewProps {
  onOpenDetail: (userId: number) => void;
}

const COLS = 'grid grid-cols-[1.4fr_1fr_130px_120px_120px_130px_90px] gap-3';

export function CompensationsView({ onOpenDetail }: CompensationsViewProps) {
  const [rawSearch, setRawSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const search = useDebounce(rawSearch);

  const params: Record<string, unknown> = { page, limit: 20 };
  if (search.trim()) params.search = search.trim();

  const { data, isLoading, error } = useApiQuery<Paginated<CompensationListRow>>(
    queryKeys.payslips.compensationList(params),
    '/payroll/compensation/all',
    { params, staleTime: STALE_TIME.SEMI_STATIC, placeholderData: keepPreviousData },
  );

  const rows = data?.data ?? [];
  const totalPages = data?.meta.totalPages ?? 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Input
          value={rawSearch}
          onChange={(e) => {
            setRawSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Pesquisar por nome ou nº de colaborador…"
          className="w-72"
        />
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          + Nova compensação
        </Button>
      </div>

      {isLoading && <Skeleton rows={8} />}
      {error && <div className="font-body text-sm text-danger">{error.message}</div>}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          title="Nenhum colaborador com compensação registada"
          description="Os registos criam-se a partir do detalhe de um colaborador ou com “+ Nova compensação”."
        />
      )}

      {!isLoading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[820px] overflow-hidden rounded-card border border-border bg-surface">
            <div
              className={`${COLS} border-b border-border px-4 py-2.5 font-body text-xs font-medium uppercase tracking-wide text-ink-faint`}
            >
              <div>Colaborador</div>
              <div>Departamento</div>
              <div>Salário base</div>
              <div>Subs. alim.</div>
              <div>Subs. transp.</div>
              <div>Desde</div>
              <div>Componentes</div>
            </div>
            {rows.map((r) => (
              <div
                key={r.id}
                className={`${COLS} cursor-pointer items-center px-4 py-3.5 border-b border-border last:border-0 hover:bg-surface-sunken`}
                onClick={() => onOpenDetail(r.userId)}
              >
                <div className="min-w-0">
                  <div className="truncate font-body text-sm font-medium text-ink">
                    {r.user.fullName}
                  </div>
                  <div className="truncate font-mono text-xs text-ink-faint">
                    {r.user.employeeNumber ?? '—'}
                  </div>
                </div>
                <div className="truncate font-body text-sm text-ink-muted">
                  {r.user.department?.name ?? '—'}
                </div>
                <div className="font-mono text-sm font-semibold text-ink">
                  {fmtKz(r.baseSalary)}
                </div>
                <div className="font-mono text-sm text-ink-muted">{fmtKz(r.foodAllowance)}</div>
                <div className="font-mono text-sm text-ink-muted">
                  {fmtKz(r.transportAllowance)}
                </div>
                <div className="font-body text-sm text-ink-muted">{fmtDate(r.effectiveFrom)}</div>
                <div className="font-body text-sm text-ink-muted">{r._count.components}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {creating && (
        <CompensationFormModal mode="create" onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run components/payslips/CompensationsView.test.tsx
```

Expected: PASS (all 6).

- [ ] **Step 5: Commit**

```bash
npx prettier --write components/payslips/CompensationsView.tsx components/payslips/CompensationsView.test.tsx
git add components/payslips/CompensationsView.tsx components/payslips/CompensationsView.test.tsx
git commit -m "$(cat <<'EOF'
feat(payslips): CompensationsView — global compensation table

Debounced name/employeeNumber search, shared Pagination, row → per-employee
detail, "+ Nova compensação" opens the create modal with no userId (the only
entry path for an employee that has no records yet).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 10: `CompensationFormModal.tsx` + test (PR B-3)

**Files:**
- Create: `frontend/components/payslips/CompensationFormModal.tsx`
- Test: `frontend/components/payslips/CompensationFormModal.test.tsx`

**Interfaces:**
- Consumes: `EmployeeCompensation` (Task 8); `useDirectoryUsers`, `DirectoryUser` from `compensationData` (Task 8); `useApiMutation`; `apiClient`; `queryKeys.payslips.all`; `Modal`/`ModalContent`, `Button`, `FormField`, `Input`; `AlertCircle`, `X` from `lucide-react`; `useToast`; `useDebounce`.
- Produces: `export interface CompensationFormModalProps { mode: 'create' | 'edit'; record?: EmployeeCompensation | null; userId?: number; onClose: () => void }` and `export function CompensationFormModal(props): JSX.Element`.
  - `mode='create'` + no `userId` → employee search field (required) then POST `/payroll/compensation` with `userId`.
  - `mode='create'` + `userId` → employee shown read-only, POST with that `userId`.
  - `mode='edit'` → no employee field; PUT `/payroll/compensation/:record.id` **without `userId`**; shows the "corrects in place" warning banner.
  - success → invalidate `queryKeys.payslips.all`, toast, `onClose()`.

- [ ] **Step 1: Write the failing test**

`frontend/components/payslips/CompensationFormModal.test.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const post = vi.fn().mockResolvedValue({ id: 99 });
const put = vi.fn().mockResolvedValue({ id: 5 });
const notify = vi.fn();
let directoryUsers: any[] = [];

vi.mock('@/lib/apiClient', () => ({
  apiClient: { post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a) },
}));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => notify }));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: (v: unknown) => v }));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiMutation: (fn: (v: unknown) => Promise<unknown>, opts: any) => ({
    mutate: (v: unknown) =>
      Promise.resolve(fn(v)).then((d) => opts?.onSuccess?.(d, v), (e) => opts?.onError?.(e)),
    isPending: false,
  }),
}));
vi.mock('./compensationData', () => ({
  useDirectoryUsers: () => ({ users: directoryUsers, loading: false }),
}));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children }: any) => <div>{children}</div>,
  ModalContent: ({ title, children }: any) => (<div><h2>{title}</h2>{children}</div>),
}));

import { CompensationFormModal } from './CompensationFormModal';

const record = {
  id: 5, userId: 7, baseSalary: 120000, countryCode: 'AO',
  bankName: 'BAI', iban: 'AO0600', accountNumber: '123', effectiveFrom: '2026-01-01T00:00:00.000Z',
  effectiveTo: null, foodAllowance: 10000, transportAllowance: 5000, components: [],
  user: { id: 7, fullName: 'Ana Silva', employeeNumber: 'E-7', department: null },
};

beforeEach(() => { post.mockClear(); put.mockClear(); notify.mockClear(); directoryUsers = []; });

describe('CompensationFormModal', () => {
  test('create from toolbar shows the employee search', () => {
    render(<CompensationFormModal mode="create" onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Pesquisar.*colaborador/i)).toBeInTheDocument();
  });

  test('create with a fixed userId hides the search and POSTs that userId', async () => {
    render(<CompensationFormModal mode="create" userId={7} onClose={vi.fn()} />);
    expect(screen.queryByPlaceholderText(/Pesquisar.*colaborador/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Salário base/i), { target: { value: '130000' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/payroll/compensation', expect.objectContaining({
      userId: 7, baseSalary: 130000,
    }));
  });

  test('create requires a positive base salary', () => {
    render(<CompensationFormModal mode="create" userId={7} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Criar/ }));
    expect(post).not.toHaveBeenCalled();
  });

  test('edit shows the in-place warning, no employee field, PUTs without userId', async () => {
    render(<CompensationFormModal mode="edit" record={record} onClose={vi.fn()} />);
    expect(screen.getByText(/corrige este registo no lugar/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Pesquisar.*colaborador/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Salário base/i), { target: { value: '125000' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    const [url, body] = put.mock.calls[0];
    expect(url).toBe('/payroll/compensation/5');
    expect(body).not.toHaveProperty('userId');
    expect(body).toMatchObject({ baseSalary: 125000 });
  });

  test('picking a searched employee enables create submit', async () => {
    directoryUsers = [{ id: 42, fullName: 'Rui Costa', department: null }];
    render(<CompensationFormModal mode="create" onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Pesquisar.*colaborador/i), { target: { value: 'rui' } });
    fireEvent.click(screen.getByText('Rui Costa'));
    fireEvent.change(screen.getByLabelText(/Salário base/i), { target: { value: '90000' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/payroll/compensation', expect.objectContaining({ userId: 42, baseSalary: 90000 })));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run components/payslips/CompensationFormModal.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CompensationFormModal.tsx`**

```tsx
// components/payslips/CompensationFormModal.tsx
// Criar / corrigir um registo de EmployeeCompensation.
//  - create sem userId  → pesquisa de colaborador (obrigatória)
//  - create com userId   → colaborador fixo (só-leitura)
//  - edit                → sem campo de colaborador; PUT /payroll/compensation/:id (body sem userId)
// create: POST /payroll/compensation fecha automaticamente a versão anterior.
// IBAN em claro é intencional (mesma política dos endpoints current/history).
'use client';

import { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useApiMutation } from '@/hooks/useApiQuery';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { useToast } from '@/providers/ToastProvider';
import { useDebounce } from '@/hooks/useDebounce';
import { useDirectoryUsers, type DirectoryUser } from './compensationData';
import type { EmployeeCompensation } from './types';

export interface CompensationFormModalProps {
  mode: 'create' | 'edit';
  record?: EmployeeCompensation | null;
  userId?: number;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export function CompensationFormModal({
  mode,
  record,
  userId,
  onClose,
}: CompensationFormModalProps) {
  const editing = mode === 'edit';
  const notify = useToast();

  const fixedName = record?.user?.fullName;
  const [rawSearch, setRawSearch] = useState('');
  const [picked, setPicked] = useState<DirectoryUser | null>(null);
  const search = useDebounce(rawSearch);
  const { users, loading: usersLoading } = useDirectoryUsers(
    search,
    '',
    !editing && userId == null && !picked && search.trim().length > 0,
  );

  const [baseSalary, setBaseSalary] = useState(
    record?.baseSalary != null ? String(record.baseSalary) : '',
  );
  const [foodAllowance, setFoodAllowance] = useState(
    record?.foodAllowance != null ? String(record.foodAllowance) : '',
  );
  const [transportAllowance, setTransportAllowance] = useState(
    record?.transportAllowance != null ? String(record.transportAllowance) : '',
  );
  const [bankName, setBankName] = useState(record?.bankName ?? '');
  const [iban, setIban] = useState(record?.iban ?? '');
  const [accountNumber, setAccountNumber] = useState(record?.accountNumber ?? '');
  const [countryCode, setCountryCode] = useState(record?.countryCode ?? 'AO');
  const [effectiveFrom, setEffectiveFrom] = useState(
    editing ? (record?.effectiveFrom ?? '').slice(0, 10) : today(),
  );
  const [submitError, setSubmitError] = useState('');

  const resolvedUserId = editing ? undefined : (userId ?? picked?.id);
  const baseValid =
    baseSalary.trim() !== '' &&
    Number(baseSalary) >= 0 &&
    (editing || resolvedUserId != null);

  const save = useApiMutation(
    (body: Record<string, unknown>) =>
      editing
        ? apiClient.put(`/payroll/compensation/${record!.id}`, body)
        : apiClient.post('/payroll/compensation', body),
    {
      invalidateKeys: [queryKeys.payslips.all],
      onSuccess: () => {
        notify({
          title: editing ? 'Registo corrigido' : 'Compensação criada',
          intent: 'success',
        });
        onClose();
      },
      onError: (e: Error) => setSubmitError(e.message || 'Erro ao guardar. Tente novamente.'),
    },
  );
  const loading = save.isPending;

  const handleSubmit = () => {
    if (!baseValid || loading) return;
    setSubmitError('');
    const body: Record<string, unknown> = {
      baseSalary: Number(baseSalary),
      foodAllowance: numOrNull(foodAllowance),
      transportAllowance: numOrNull(transportAllowance),
      bankName: bankName.trim() || null,
      iban: iban.trim() || null,
      accountNumber: accountNumber.trim() || null,
      countryCode: countryCode.trim() || 'AO',
      effectiveFrom,
    };
    if (!editing) body.userId = resolvedUserId;
    save.mutate(body);
  };

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title={editing ? 'Corrigir registo de compensação' : 'Nova compensação'}
        description={
          editing
            ? undefined
            : 'A versão anterior deste colaborador é fechada automaticamente.'
        }
        className="max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="mt-5 space-y-4">
          {editing && (
            <div className="flex items-start gap-2 rounded-card bg-warning-subtle p-3 text-sm text-warning-ink">
              <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5" />
              <span>
                Isto corrige este registo no lugar — não cria uma nova versão nem
                mexe no histórico. Para uma mudança salarial com data, usa “Nova
                versão”.
              </span>
            </div>
          )}
          {submitError && (
            <div className="flex items-center gap-2 rounded-card bg-danger-subtle p-3 text-sm text-danger-ink">
              <AlertCircle size={16} strokeWidth={1.75} />
              {submitError}
            </div>
          )}

          {!editing && (
            <FormField label="Colaborador *" htmlFor="cfm-user">
              {userId != null || picked ? (
                <div className="flex items-center gap-2 rounded-control border-[1.5px] border-border-strong bg-surface px-2 py-1.5">
                  <span className="flex-1 truncate text-sm text-ink">
                    {picked?.fullName ?? fixedName ?? `#${userId}`}
                  </span>
                  {picked && userId == null && (
                    <button
                      type="button"
                      aria-label="Remover colaborador"
                      onClick={() => setPicked(null)}
                      className="rounded-control p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
                    >
                      <X size={16} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="cfm-user"
                    value={rawSearch}
                    onChange={(e) => setRawSearch(e.target.value)}
                    placeholder="Pesquisar colaborador por nome ou email…"
                    className="w-full"
                    autoComplete="off"
                  />
                  {rawSearch.trim().length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-card border border-border bg-surface shadow-elevated">
                      {usersLoading && (
                        <div className="px-3 py-2 text-sm text-ink-muted">A pesquisar…</div>
                      )}
                      {!usersLoading && users.length === 0 && (
                        <div className="px-3 py-2 text-sm text-ink-muted">
                          Nenhum colaborador encontrado
                        </div>
                      )}
                      {users.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setPicked(u);
                            setRawSearch('');
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-primary-subtle"
                        >
                          <span className="truncate text-sm text-ink">{u.fullName}</span>
                          <span className="ml-auto truncate text-xs text-ink-faint">
                            {u.department?.name ?? u.email ?? ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </FormField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Salário base (Kz) *" htmlFor="cfm-base">
              <Input
                id="cfm-base"
                type="number"
                step="any"
                value={baseSalary}
                onChange={(e) => setBaseSalary(e.target.value)}
                className="w-full"
              />
            </FormField>
            <FormField label="Em vigor desde" htmlFor="cfm-eff" hint={editing ? undefined : 'Omissão: hoje.'}>
              <Input
                id="cfm-eff"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="w-full"
              />
            </FormField>
            <FormField label="Subsídio de alimentação" htmlFor="cfm-food">
              <Input id="cfm-food" type="number" step="any" value={foodAllowance} onChange={(e) => setFoodAllowance(e.target.value)} className="w-full" />
            </FormField>
            <FormField label="Subsídio de transporte" htmlFor="cfm-transport">
              <Input id="cfm-transport" type="number" step="any" value={transportAllowance} onChange={(e) => setTransportAllowance(e.target.value)} className="w-full" />
            </FormField>
            <FormField label="Banco" htmlFor="cfm-bank">
              <Input id="cfm-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full" />
            </FormField>
            <FormField label="IBAN" htmlFor="cfm-iban">
              <Input id="cfm-iban" value={iban} onChange={(e) => setIban(e.target.value)} className="w-full font-mono" />
            </FormField>
            <FormField label="Nº de conta" htmlFor="cfm-acc">
              <Input id="cfm-acc" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="w-full" />
            </FormField>
            <FormField label="País" htmlFor="cfm-country">
              <Input id="cfm-country" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} className="w-full" />
            </FormField>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button intent="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!baseValid} loading={loading}>
            {editing ? 'Guardar' : 'Criar'}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
```

> `useDirectoryUsers(rawSearch, departmentId, enabled)` — signature verified in `components/enrollments/enrollData.ts`. It already applies its own `useDebounce`; passing the already-debounced `search` is harmless (double debounce = one extra tick) but to match the sibling exactly you may pass `rawSearch` instead of `search`. Either works for the test (the mock ignores args).

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run components/payslips/CompensationFormModal.test.tsx
```

Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
npx prettier --write components/payslips/CompensationFormModal.tsx components/payslips/CompensationFormModal.test.tsx
git add components/payslips/CompensationFormModal.tsx components/payslips/CompensationFormModal.test.tsx
git commit -m "$(cat <<'EOF'
feat(payslips): CompensationFormModal — create / correct-in-place

create-from-toolbar → employee search; create-from-detail → fixed employee;
edit → no employee field, PUT without userId, "corrects in place" warning banner.
IBAN shown/edited in clear (mirrors the current/history endpoints).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 11: `CompensationComponentsEditor.tsx` + test (PR B-3)

**Files:**
- Create: `frontend/components/payslips/CompensationComponentsEditor.tsx`
- Test: `frontend/components/payslips/CompensationComponentsEditor.test.tsx`

**Interfaces:**
- Consumes: `EmployeeCompensation`, `EmployeeCompensationComponent` (Task 8); `useSalaryComponentOptions` from `compensationData` (Task 8); `useApiMutation`; `apiClient`; `queryKeys.payslips.all`; `Modal`/`ModalContent`, `Button`, `IconButton`, `Select`, `Input`; `Plus`, `Trash2`, `AlertCircle` from `lucide-react`; `useToast`.
- Produces: `export interface CompensationComponentsEditorProps { record: EmployeeCompensation; onClose: () => void }` and `export function CompensationComponentsEditor(props): JSX.Element`. Editable rows `{ componentCode, value, override }`; "+ Adicionar linha"; Save → `POST /payroll/compensation/:record.id/components` with `{ items }` (full replace) → invalidate + toast + close. Blocks duplicate `componentCode` and empty value.

- [ ] **Step 1: Write the failing test**

`frontend/components/payslips/CompensationComponentsEditor.test.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const post = vi.fn().mockResolvedValue([]);
const notify = vi.fn();

vi.mock('@/lib/apiClient', () => ({ apiClient: { post: (...a: unknown[]) => post(...a) } }));
vi.mock('@/providers/ToastProvider', () => ({ useToast: () => notify }));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiMutation: (fn: (v: unknown) => Promise<unknown>, opts: any) => ({
    mutate: (v: unknown) =>
      Promise.resolve(fn(v)).then((d) => opts?.onSuccess?.(d, v), (e) => opts?.onError?.(e)),
    isPending: false,
  }),
}));
vi.mock('./compensationData', () => ({
  useSalaryComponentOptions: () => ({
    options: [
      { value: 'TRANSPORT', label: 'TRANSPORT — Transporte (Rendimento)' },
      { value: 'MEAL', label: 'MEAL — Alimentação (Rendimento)' },
    ],
    byCode: {},
    loading: false,
  }),
}));
vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children }: any) => <div>{children}</div>,
  ModalContent: ({ title, children }: any) => (<div><h2>{title}</h2>{children}</div>),
}));
vi.mock('@/components/ui/Select', () => ({
  Select: ({ items, value, onValueChange }: any) => (
    <select
      data-testid="code-select"
      value={value ?? ''}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {items.map((it: any) => (<option key={it.value} value={it.value}>{it.label}</option>))}
    </select>
  ),
}));

import { CompensationComponentsEditor } from './CompensationComponentsEditor';

const record = {
  id: 5, userId: 7, baseSalary: 120000, countryCode: 'AO', bankName: null, iban: null,
  accountNumber: null, effectiveFrom: '2026-01-01', effectiveTo: null,
  foodAllowance: null, transportAllowance: null,
  components: [
    { id: 1, compensationId: 5, componentCode: 'TRANSPORT', value: 15000, override: false },
  ],
};

beforeEach(() => { post.mockClear(); notify.mockClear(); });

describe('CompensationComponentsEditor', () => {
  test('renders one row per existing override', () => {
    render(<CompensationComponentsEditor record={record} onClose={vi.fn()} />);
    expect(screen.getAllByTestId('code-select')).toHaveLength(1);
    expect(screen.getByDisplayValue('15000')).toBeInTheDocument();
  });

  test('add + remove a row', () => {
    render(<CompensationComponentsEditor record={record} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar linha/ }));
    expect(screen.getAllByTestId('code-select')).toHaveLength(2);
    fireEvent.click(screen.getAllByLabelText('Remover linha')[1]);
    expect(screen.getAllByTestId('code-select')).toHaveLength(1);
  });

  test('blocks save on a duplicate componentCode', () => {
    render(<CompensationComponentsEditor record={record} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar linha/ }));
    const selects = screen.getAllByTestId('code-select');
    fireEvent.change(selects[1], { target: { value: 'TRANSPORT' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(/duplicad/i)).toBeInTheDocument();
  });

  test('blocks save on an empty value', () => {
    render(<CompensationComponentsEditor record={record} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar linha/ }));
    const selects = screen.getAllByTestId('code-select');
    fireEvent.change(selects[1], { target: { value: 'MEAL' } });
    // value left empty on the new row
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(post).not.toHaveBeenCalled();
  });

  test('save POSTs the full items array to :id/components', async () => {
    render(<CompensationComponentsEditor record={record} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar linha/ }));
    const selects = screen.getAllByTestId('code-select');
    fireEvent.change(selects[1], { target: { value: 'MEAL' } });
    const values = screen.getAllByLabelText('Valor');
    fireEvent.change(values[1], { target: { value: '8000' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/payroll/compensation/5/components', {
      items: [
        { componentCode: 'TRANSPORT', value: 15000, override: false },
        { componentCode: 'MEAL', value: 8000, override: false },
      ],
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run components/payslips/CompensationComponentsEditor.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CompensationComponentsEditor.tsx`**

```tsx
// components/payslips/CompensationComponentsEditor.tsx
// Editor da lista de overrides de componentes de UM registo de compensação.
// POST /payroll/compensation/:id/components substitui a lista inteira — por
// isso o editor envia sempre o array completo. `override` fica registado mas o
// motor de cálculo actual soma todos os componentes como rendimento extra
// independentemente desta opção (ver payroll-calculation/engine service).
'use client';

import { useState } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import { useApiMutation } from '@/hooks/useApiQuery';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal, ModalContent } from '@/components/ui/Modal';
import { useToast } from '@/providers/ToastProvider';
import { useSalaryComponentOptions } from './compensationData';
import type { EmployeeCompensation } from './types';

export interface CompensationComponentsEditorProps {
  record: EmployeeCompensation;
  onClose: () => void;
}

interface Row {
  key: string;
  componentCode: string;
  value: string;
  override: boolean;
}

let seq = 0;
const newRow = (): Row => ({ key: `r${seq++}`, componentCode: '', value: '', override: false });

export function CompensationComponentsEditor({
  record,
  onClose,
}: CompensationComponentsEditorProps) {
  const notify = useToast();
  const { options, loading: optionsLoading } = useSalaryComponentOptions(true);

  const [rows, setRows] = useState<Row[]>(
    record.components.length > 0
      ? record.components.map((c) => ({
          key: `r${seq++}`,
          componentCode: c.componentCode,
          value: String(c.value),
          override: c.override,
        }))
      : [newRow()],
  );
  const [formError, setFormError] = useState('');

  const patch = (key: string, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = useApiMutation(
    (items: Array<{ componentCode: string; value: number; override: boolean }>) =>
      apiClient.post(`/payroll/compensation/${record.id}/components`, { items }),
    {
      invalidateKeys: [queryKeys.payslips.all],
      onSuccess: () => {
        notify({ title: 'Componentes actualizados', intent: 'success' });
        onClose();
      },
      onError: (e: Error) => setFormError(e.message || 'Erro ao guardar.'),
    },
  );
  const loading = save.isPending;

  const handleSave = () => {
    if (loading) return;
    setFormError('');
    const filled = rows.filter((r) => r.componentCode !== '');
    if (filled.some((r) => r.value.trim() === '' || Number.isNaN(Number(r.value)))) {
      setFormError('Cada linha precisa de um valor numérico.');
      return;
    }
    const codes = filled.map((r) => r.componentCode);
    if (new Set(codes).size !== codes.length) {
      setFormError('Há um componente duplicado — cada código só pode aparecer uma vez.');
      return;
    }
    save.mutate(
      filled.map((r) => ({
        componentCode: r.componentCode,
        value: Number(r.value),
        override: r.override,
      })),
    );
  };

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title="Gerir componentes da compensação"
        description="Estes valores substituem integralmente a lista de overrides deste registo."
        className="max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="mt-5 space-y-3">
          {formError && (
            <div className="flex items-center gap-2 rounded-card bg-danger-subtle p-3 text-sm text-danger-ink">
              <AlertCircle size={16} strokeWidth={1.75} />
              {formError}
            </div>
          )}

          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  items={options}
                  value={r.componentCode || undefined}
                  onValueChange={(v) => patch(r.key, { componentCode: v })}
                  placeholder={optionsLoading ? 'A carregar…' : 'Componente'}
                  className="w-full"
                />
              </div>
              <Input
                aria-label="Valor"
                type="number"
                step="any"
                value={r.value}
                onChange={(e) => patch(r.key, { value: e.target.value })}
                className="w-32"
              />
              <label
                className="flex items-center gap-1 text-xs text-ink-muted"
                title="Marca este valor como substituição explícita do valor de catálogo. Registado para uso futuro — o cálculo actual soma todos os componentes como rendimento extra independentemente desta opção."
              >
                <input
                  type="checkbox"
                  checked={r.override}
                  onChange={(e) => patch(r.key, { override: e.target.checked })}
                  className="h-4 w-4 rounded border-border-strong accent-primary"
                />
                override
              </label>
              <IconButton
                icon={Trash2}
                label="Remover linha"
                intent="ghost"
                size="sm"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              />
            </div>
          ))}

          <Button intent="ghost" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
            <Plus size={14} strokeWidth={1.75} />
            Adicionar linha
          </Button>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button intent="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={loading}>
            Guardar
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run components/payslips/CompensationComponentsEditor.test.tsx
```

Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
npx prettier --write components/payslips/CompensationComponentsEditor.tsx components/payslips/CompensationComponentsEditor.test.tsx
git add components/payslips/CompensationComponentsEditor.tsx components/payslips/CompensationComponentsEditor.test.tsx
git commit -m "$(cat <<'EOF'
feat(payslips): CompensationComponentsEditor — full-replace override list

Editable rows (component code from the active catalogue, value, override),
add/remove line, blocks duplicate codes + empty values, Save POSTs the full
items[] to :id/components. override tooltip states it is recorded for future
use only (the calc engine ignores it today).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 12: `CompensationDetailView.tsx` + test (PR B-3)

**Files:**
- Create: `frontend/components/payslips/CompensationDetailView.tsx`
- Test: `frontend/components/payslips/CompensationDetailView.test.tsx`

**Interfaces:**
- Consumes: `EmployeeCompensation` (Task 8); `queryKeys.payslips.compensationHistory` (Task 8); `useApiQuery`; `formatKz`, `formatDate`; `Button`, `Skeleton`, `EmptyState`; `CompensationFormModal` (Task 10), `CompensationComponentsEditor` (Task 11); `ChevronLeft`, `ChevronDown`, `ChevronRight` from `lucide-react`.
- Produces: `export interface CompensationDetailViewProps { userId: number; onBack: () => void }` and `export function CompensationDetailView(props): JSX.Element`. One query: `GET /payroll/compensation?userId=` (history incl. `components` + `user` from B-1). Derives `current = history.find(r => r.effectiveTo === null)`. Header identity from `history[0].user` (fallback `#${userId}`). Active-record card (base salary, allowances, bank, **raw IBAN**, account, country, "em vigor desde") with actions: **Corrigir registo** (edit modal, `record=current`), **Gerir componentes** (editor, `record=current`), **Nova versão** (create modal, `userId` fixed). No active record → warning + **Criar compensação** CTA. Timeline of all rows `desc effectiveFrom`, each expandable to show that row's `components`, "Activo" badge on the open one. "Corrigir" offered only on the active record in v1.

- [ ] **Step 1: Write the failing test**

`frontend/components/payslips/CompensationDetailView.test.tsx`:

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

let queryResult: any = { data: undefined, isLoading: false };
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => queryResult }));
vi.mock('./CompensationFormModal', () => ({
  CompensationFormModal: ({ mode, userId, record }: any) => (
    <div data-testid="form-modal">{`${mode}:${userId ?? record?.id ?? 'none'}`}</div>
  ),
}));
vi.mock('./CompensationComponentsEditor', () => ({
  CompensationComponentsEditor: ({ record }: any) => (
    <div data-testid="components-editor">{record.id}</div>
  ),
}));

import { CompensationDetailView } from './CompensationDetailView';

const user = { id: 7, fullName: 'Ana Silva', employeeNumber: 'E-7', department: { id: 2, name: 'Financeiro' } };
const history = [
  {
    id: 20, userId: 7, baseSalary: 150000, countryCode: 'AO', bankName: 'BAI',
    iban: 'AO06004400006729503010102', accountNumber: '99887', effectiveFrom: '2026-06-01T00:00:00.000Z',
    effectiveTo: null, foodAllowance: 20000, transportAllowance: 15000,
    components: [{ id: 1, compensationId: 20, componentCode: 'TRANSPORT', value: 15000, override: false }],
    user,
  },
  {
    id: 10, userId: 7, baseSalary: 120000, countryCode: 'AO', bankName: 'BAI', iban: 'AO0600',
    accountNumber: '99887', effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: '2026-05-31T23:59:59.000Z',
    foodAllowance: null, transportAllowance: null, components: [], user,
  },
];

beforeEach(() => { queryResult = { data: history, isLoading: false }; });

describe('CompensationDetailView', () => {
  test('active card shows values and the raw IBAN', () => {
    render(<CompensationDetailView userId={7} onBack={vi.fn()} />);
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText(/150.?000/)).toBeInTheDocument();
    expect(screen.getByText('AO06004400006729503010102')).toBeInTheDocument();
  });

  test('timeline lists every record with an "Activo" badge on the open one and closed ranges', () => {
    render(<CompensationDetailView userId={7} onBack={vi.fn()} />);
    expect(screen.getByText('Activo')).toBeInTheDocument();
    // two timeline entries
    expect(screen.getAllByText(/2026/).length).toBeGreaterThanOrEqual(2);
  });

  test('action buttons open the right modals', () => {
    render(<CompensationDetailView userId={7} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Corrigir registo/ }));
    expect(screen.getByTestId('form-modal')).toHaveTextContent('edit:20');
  });

  test('"Gerir componentes" opens the editor for the active record', () => {
    render(<CompensationDetailView userId={7} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Gerir componentes/ }));
    expect(screen.getByTestId('components-editor')).toHaveTextContent('20');
  });

  test('"Nova versão" opens create with the fixed userId', () => {
    render(<CompensationDetailView userId={7} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Nova versão/ }));
    expect(screen.getByTestId('form-modal')).toHaveTextContent('create:7');
  });

  test('no active record → warning + "Criar compensação" CTA', () => {
    queryResult = { data: [history[1]], isLoading: false };
    render(<CompensationDetailView userId={7} onBack={vi.fn()} />);
    expect(screen.getByText(/sem registo de compensação activo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Criar compensação/ }));
    expect(screen.getByTestId('form-modal')).toHaveTextContent('create:7');
  });

  test('empty history → EmptyState, header falls back to #id', () => {
    queryResult = { data: [], isLoading: false };
    render(<CompensationDetailView userId={7} onBack={vi.fn()} />);
    expect(screen.getByText('#7')).toBeInTheDocument();
  });

  test('expanding a timeline row reveals its components', () => {
    render(<CompensationDetailView userId={7} onBack={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('button', { name: /ver componentes/i })[0]);
    expect(screen.getByText('TRANSPORT')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run components/payslips/CompensationDetailView.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CompensationDetailView.tsx`**

```tsx
// components/payslips/CompensationDetailView.tsx
// Detalhe de compensação POR COLABORADOR (nav comp-detail; userId). Uma query:
// GET /payroll/compensation?userId= (histórico, inclui components + user via B-1).
// current = history.find(effectiveTo === null). IBAN em claro é intencional
// (mesma política dos endpoints current/history para ADMIN/RH).
'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { STALE_TIME } from '@/lib/queryClient';
import { formatKz as fmtKz, formatDate as fmtDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CompensationFormModal } from './CompensationFormModal';
import { CompensationComponentsEditor } from './CompensationComponentsEditor';
import type { EmployeeCompensation } from './types';

export interface CompensationDetailViewProps {
  userId: number;
  onBack: () => void;
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'edit'; record: EmployeeCompensation }
  | { kind: 'components'; record: EmployeeCompensation }
  | { kind: 'create' };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2.5 last:border-0">
      <dt className="font-body text-sm text-ink-muted">{label}</dt>
      <dd className="font-mono text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

export function CompensationDetailView({ userId, onBack }: CompensationDetailViewProps) {
  const { data, isLoading, error } = useApiQuery<EmployeeCompensation[]>(
    queryKeys.payslips.compensationHistory(userId),
    '/payroll/compensation',
    { params: { userId }, staleTime: STALE_TIME.SEMI_STATIC },
  );
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const history = data ?? [];
  const current = history.find((r) => r.effectiveTo === null) ?? null;
  const person = history[0]?.user;
  const heading = person?.fullName ?? `#${userId}`;

  const toggle = (id: number) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex items-center gap-1 font-body text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft size={16} strokeWidth={1.75} />
        Voltar
      </button>

      <div className="mb-5">
        <h2 className="font-display text-lg font-semibold text-ink">{heading}</h2>
        {person && (
          <p className="font-body text-sm text-ink-faint">
            {person.employeeNumber ?? '—'}
            {person.department ? ` · ${person.department.name}` : ''}
          </p>
        )}
      </div>

      {isLoading && <Skeleton rows={6} />}
      {error && <div className="font-body text-sm text-danger">{error.message}</div>}

      {!isLoading && !error && history.length === 0 && (
        <>
          <EmptyState
            title="Sem compensação registada"
            description="Este colaborador ainda não tem nenhum registo de compensação."
          />
          <div className="mt-4">
            <Button onClick={() => setModal({ kind: 'create' })}>Criar compensação</Button>
          </div>
        </>
      )}

      {!isLoading && history.length > 0 && (
        <>
          {current ? (
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-body text-sm font-semibold uppercase tracking-wide text-ink-faint">
                  Registo activo
                </h3>
                <span className="rounded-full bg-success-subtle px-2 py-0.5 font-body text-xs font-medium text-success-ink">
                  Activo
                </span>
              </div>
              <dl className="overflow-hidden rounded-card border border-border bg-surface">
                <Row label="Salário base" value={fmtKz(current.baseSalary)} />
                <Row label="Subsídio de alimentação" value={fmtKz(current.foodAllowance)} />
                <Row label="Subsídio de transporte" value={fmtKz(current.transportAllowance)} />
                <Row label="Banco" value={current.bankName ?? '—'} />
                <Row label="IBAN" value={current.iban ?? '—'} />
                <Row label="Nº de conta" value={current.accountNumber ?? '—'} />
                <Row label="País" value={current.countryCode ?? '—'} />
                <Row label="Em vigor desde" value={fmtDate(current.effectiveFrom)} />
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button intent="secondary" size="sm" onClick={() => setModal({ kind: 'edit', record: current })}>
                  Corrigir registo
                </Button>
                <Button intent="secondary" size="sm" onClick={() => setModal({ kind: 'components', record: current })}>
                  Gerir componentes
                </Button>
                <Button size="sm" onClick={() => setModal({ kind: 'create' })}>
                  Nova versão
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-6 flex items-start gap-2 rounded-card bg-warning-subtle p-3 text-sm text-warning-ink">
              <AlertCircle size={16} strokeWidth={1.75} className="mt-0.5" />
              <div>
                Este colaborador está sem registo de compensação activo.
                <div className="mt-2">
                  <Button size="sm" onClick={() => setModal({ kind: 'create' })}>
                    Criar compensação
                  </Button>
                </div>
              </div>
            </div>
          )}

          <h3 className="mb-2 font-body text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Histórico
          </h3>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {history.map((r) => {
              const open = expanded.has(r.id);
              return (
                <div key={r.id} className="border-b border-border last:border-0">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      aria-label={open ? 'esconder componentes' : 'ver componentes'}
                      onClick={() => toggle(r.id)}
                      className="text-ink-muted hover:text-ink"
                    >
                      {open ? (
                        <ChevronDown size={16} strokeWidth={1.75} />
                      ) : (
                        <ChevronRight size={16} strokeWidth={1.75} />
                      )}
                    </button>
                    <div className="flex-1 font-body text-sm text-ink">
                      {fmtDate(r.effectiveFrom)} → {r.effectiveTo ? fmtDate(r.effectiveTo) : 'actual'}
                    </div>
                    <div className="font-mono text-sm text-ink-muted">{fmtKz(r.baseSalary)}</div>
                    <div className="font-body text-xs text-ink-faint">
                      {r.components.length} comp.
                    </div>
                    {r.effectiveTo === null && (
                      <span className="rounded-full bg-success-subtle px-2 py-0.5 font-body text-xs font-medium text-success-ink">
                        Activo
                      </span>
                    )}
                  </div>
                  {open && (
                    <div className="bg-surface-sunken px-11 py-2">
                      {r.components.length === 0 ? (
                        <p className="font-body text-xs text-ink-faint">Sem componentes.</p>
                      ) : (
                        r.components.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between py-1 font-body text-sm text-ink-muted"
                          >
                            <span className="font-mono text-xs">{c.componentCode}</span>
                            <span className="font-mono">{fmtKz(c.value)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal.kind === 'edit' && (
        <CompensationFormModal
          mode="edit"
          record={modal.record}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'components' && (
        <CompensationComponentsEditor
          record={modal.record}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
      {modal.kind === 'create' && (
        <CompensationFormModal
          mode="create"
          userId={userId}
          onClose={() => setModal({ kind: 'none' })}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run components/payslips/CompensationDetailView.test.tsx
```

Expected: PASS (all 8).

- [ ] **Step 5: Commit**

```bash
npx prettier --write components/payslips/CompensationDetailView.tsx components/payslips/CompensationDetailView.test.tsx
git add components/payslips/CompensationDetailView.tsx components/payslips/CompensationDetailView.test.tsx
git commit -m "$(cat <<'EOF'
feat(payslips): CompensationDetailView — per-employee history + active card

One history query, current derived client-side, header identity from history[0].user
(fallback #id), active card with raw IBAN + Corrigir/Gerir componentes/Nova versão,
no-active-record warning + CTA, read-only expandable timeline with an Activo badge.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
```

---

## Task 13: Wire B-3 into `page.tsx` + B-3 verification + PR

**Files:**
- Modify: `frontend/app/(platform)/payslips/page.tsx`

**Interfaces:**
- Consumes: `CompensationsView` (Task 9), `CompensationDetailView` (Task 12); the `Nav` union with `comp-detail` (Task 8).
- Produces: `/payslips` renders "Compensações" (ADMIN/RH) → `comp-detail` on row click; `comp-detail` hides the tab bar (like `detail`).

- [ ] **Step 1: Edit `page.tsx`**

```tsx
// add imports:
import { CompensationsView } from '@/components/payslips/CompensationsView';
import { CompensationDetailView } from '@/components/payslips/CompensationDetailView';

// the tab bar condition — hide on both detail and comp-detail:
{nav.view !== 'detail' && nav.view !== 'comp-detail' && ( /* ...tab bar... */ )}

// add view renders (after the components line):
{nav.view === 'compensations' && isAdmin && (
  <CompensationsView onOpenDetail={(uid) => setNav({ view: 'comp-detail', userId: uid })} />
)}
{nav.view === 'comp-detail' && isAdmin && (
  <CompensationDetailView
    userId={nav.userId}
    onBack={() => setNav({ view: 'compensations' })}
  />
)}
```

> `TITLES[nav.view]` already resolves for `comp-detail` (Task 8 added the key).

- [ ] **Step 2: Full B-3 gates**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova/frontend"
npx tsc --noEmit
npx vitest run components/payslips/
npm run build
npm run lint
```

Expected: `tsc` 0; all payslips specs green (`ComponentsView`, `ComponentFormModal`, `CompensationsView`, `CompensationFormModal`, `CompensationComponentsEditor`, `CompensationDetailView`, plus the pre-existing `CompensationView`); `next build` succeeds; no new lint errors in the created files.

- [ ] **Step 3: Manual browser smoke (backend :4000 + frontend + seed; B-1 must be on the running backend)**

- ADMIN/RH → `/payslips` shows a "Compensações" tab; the global table loads, search narrows it, pagination works.
- Click a row → per-employee detail: active card + timeline; expand a timeline row to see components.
- "Nova versão" → create with the employee fixed → new row appears, the previous one shows a closed `effectiveTo`.
- "Corrigir registo" → edit-in-place (warning banner, no employee field) → values change without a new timeline entry.
- "Gerir componentes" → add/remove/save overrides → persists (reopen the detail, expand the active row).
- "+ Nova compensação" (toolbar) → employee search → pick an employee with no records → first record created → they now appear in the table.

- [ ] **Step 4: Commit + PR**

```bash
git add app/\(platform\)/payslips/page.tsx
git commit -m "$(cat <<'EOF'
feat(payslips): wire the Compensações tab + per-employee detail into /payslips

comp-detail is keyed by userId and hides the tab bar like detail.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ftkp49dx8yqnZ1xbvFeGqz
EOF
)"
git push -u origin feat/payslips-compensations-tab
gh pr create --base main --head feat/payslips-compensations-tab \
  --title "feat(payslips): admin Compensações tab (effective-dated employee compensation)" \
  --body "$(cat <<'EOF'
Sub-project B-3 of the payroll catalogue frontend. Depends on B-1 (endpoint) + B-2 (scaffold), both merged.

- CompensationsView: global paginated table (GET /payroll/compensation/all), debounced search, row → detail
- CompensationDetailView: per-employee history + active card (raw IBAN by design), read-only timeline, Corrigir / Gerir componentes / Nova versão
- CompensationFormModal: create (with/without fixed employee) + correct-in-place (PUT without userId)
- CompensationComponentsEditor: full-replace override list; override flag documented as recorded-for-future-use
- data layer: types, query keys, compensationData.ts (active-component picker + directory re-export)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Expected: CI `quality` job `build` green → merged.

---

## Task 14: Cross-repo final verification

**Files:** none.

**Interfaces:**
- Consumes: Tasks 0, 3, 7, 13 (all four PRs merged).
- Produces: a confirmed-green `main` in both repos.

- [ ] **Step 1: Pull both repos to `main`**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova" && git checkout main && git pull --ff-only origin main
cd "C:/Users/PLÁCIDO COSTA/innova/frontend" && git checkout main && git pull --ff-only origin main
```

- [ ] **Step 2: Backend — re-run the payroll batch + build**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova"
npm run build
npx jest payslips payroll --forceExit
npx cross-env NODE_ENV=test node node_modules/jest/bin/jest.js --config test/jest-integration.json --forceExit --runInBand --testPathPatterns "test/integration/payroll/"
```

Expected: build 0; unit + integration green.

- [ ] **Step 3: Frontend — full suite + build**

```bash
cd "C:/Users/PLÁCIDO COSTA/innova/frontend"
npx tsc --noEmit
npm test
npm run build
```

Expected: `tsc` 0; full `vitest run` green; `next build` succeeds.

- [ ] **Step 4: Update memory**

Append to the `project_innova_payroll_frontend_rollout` memory: sub-project B DONE (date), PRs B-0 (backend merge) + B-1 (`GET /payroll/compensation/all`) + B-2 (frontend Componentes tab) + B-3 (frontend Compensações tab); C and D still pending.

---

## Self-Review

**Spec coverage:**

| Spec section | Task(s) |
|---|---|
| B-0 (merge `feat/payroll-workflow`) | Task 0 |
| Secção A — `GET /payroll/compensation/all` (DTO, service, controller, integration) | Tasks 1–3 |
| Secção A "item em aberto" — `include: { user }` on `history` | Task 1 (resolved: added) |
| Secção B — `page.tsx` admin scaffold | Tasks 4, 7 |
| Secção B — `constants.ts` (`adminOnly`, NAV, TITLES) | Tasks 4, 8 |
| Secção B — `types.ts` `View`/`Nav` unions | Tasks 4, 8 |
| Secção B — new files table | Tasks 5, 6, 9, 10, 11, 12 |
| Secção B — `lib/queryKeys.ts` (3 keys) | Tasks 4, 8 |
| Secção C — `ComponentsView` | Task 5 |
| Secção C — `ComponentFormModal` (conditional field, immutable code) | Task 6 |
| Secção C — Remoção (soft/hard-delete copy) | Task 5 |
| Secção C "a verificar" — `rate` fraction | Global Constraints + Task 5/6 (resolved: fraction) |
| Secção C "a verificar" — duplicate `code` → 500 | Global Constraints + Task 6 test |
| Secção D — `CompensationsView` (global table) | Task 9 |
| Secção D — `CompensationDetailView` | Task 12 |
| Secção D — `CompensationFormModal` (3 modes) | Task 10 |
| Secção D — `CompensationComponentsEditor` | Task 11 |
| Secção D "a verificar" — `override` meaning | Global Constraints + Task 11 tooltip (resolved: engine ignores it) |
| Secção D "a verificar" — raw IBAN intentional | Global Constraints + Tasks 10/12 (resolved: yes, mirrors endpoints) |
| Secção E — backend test commands | Tasks 1–3 |
| Secção E — frontend TDD-per-component | Tasks 5, 6, 9–12 |
| Secção E — manual browser smoke | Tasks 7, 13 |
| Secção E — cross-repo final verification | Task 14 |
| Secção F — sequencing B-0 → (B-1 ‖ B-2) → B-3 | Task ordering; B-1 = Tasks 1–3, B-2 = Tasks 4–7, B-3 = Tasks 8–13 |
| Itens em aberto 1 (`rate`) | resolved — fraction |
| Itens em aberto 2 (`code` dup 500) | resolved — show verbatim |
| Itens em aberto 3 (`override`) | resolved — recorded-for-future-use tooltip |
| Itens em aberto 4 (IBAN clear) | resolved — intentional |
| Itens em aberto 5 (dept filter in B-3 table) | resolved — v1 is search-only (no dept `Select` in `CompensationsView`); noted |
| Itens em aberto 6 (detail header identity) | resolved — B-1 adds `user` to `history`; no extra `GET /users/:id` |
| Itens em aberto 7 (PR #393 endpoint gap) | resolved by Task 0 merge |
| Rollback | each PR squash-merged + independent; unchanged from spec |

**Placeholder scan:** no "TBD"/"handle edge cases"/"similar to Task N" — every component has full implementation code and full test bodies. The two `>` notes (IconButton `label`, `Select` `id` passthrough) are explicit fallback instructions with concrete alternatives, not deferrals.

**Type consistency:**
- `queryKeys.payslips.salaryComponents` / `compensationList` / `compensationHistory` — defined Tasks 4/8, consumed Tasks 5/9/12, all take the argument shapes declared.
- `SalaryComponent` fields (`fixedValue`/`rate`/`formula` nullable, `calcType` union) — consistent between Task 4 definition and Tasks 5/6/11 use.
- `EmployeeCompensation` (with optional `user`, `components[]`) + `CompensationListRow` (`user` required, `_count.components`) — defined Task 8, matched by the B-1 service `include` in Task 1 and consumed Tasks 9/10/12.
- `CompensationFormModalProps` `{ mode, record?, userId?, onClose }` — defined Task 10, consumed Task 12 with exactly those props.
- `CompensationComponentsEditorProps` `{ record, onClose }` — defined Task 11, consumed Task 12.
- `CompensationsViewProps` `{ onOpenDetail }` / `CompensationDetailViewProps` `{ userId, onBack }` — defined Tasks 9/12, consumed Task 13.
- `Nav` `comp-detail` variant carries `userId` (not `selectedId`) — consistent Task 8 → Task 12/13.
- Backend `listAll` / `history` signatures — Task 1 `Produces` matches Task 2 controller wiring.

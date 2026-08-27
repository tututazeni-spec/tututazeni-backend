# Pagination Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 9 remaining hand-rolled `skip`/`take` pagination methods (across `certification.service.ts`, `crm-funders.service.ts`, `dashboard-institutional.service.ts`, `monitoring.service.ts`, `work-declaration.service.ts`) onto the shared `BaseFilterDto` + `calculatePagination`/`buildPaginatedResponse` helpers, matching the pattern already used elsewhere in the codebase.

**Architecture:** Each target `*FilterDto` (or new DTO, where none exists today) is changed to `extends BaseFilterDto`, dropping its own hand-rolled `page`/`limit` fields but keeping any `@Max(100)` override and any non-default `limit` default. Each target service method swaps its manual `skip: (page - 1) * limit` / `take: limit` block for `calculatePagination(page, limit)`, and its manual `{ data, total, page, limit, totalPages }` (or `{ data, meta: {...} }`) return for `buildPaginatedResponse(data, total, page, limit)`. 8 of the 9 methods currently return a **flat** shape (`{ data, total, page, limit, totalPages }`) and must keep returning that flat shape — `buildPaginatedResponse` returns `{ data, meta }`, so those 8 tasks spread `meta` back out: `const { data: pageData, meta } = buildPaginatedResponse(...); return { data: pageData, ...meta };`. Only `work-declaration.service.ts#listDeclarations` already returns the nested `{ data, meta }` shape and returns the helper's output directly, unmodified.

**Tech Stack:** NestJS, Prisma, class-validator/class-transformer, Jest (`ts-jest`, `diagnostics: false`).

**Spec:** `docs/superpowers/specs/2026-08-22-pagination-consolidation-design.md`

## Global Constraints

- Response shape is preserved exactly for every method — no controller consumer sees a breaking change (flat stays flat; nested stays nested).
- No new filters are added. No default `limit` values change (e.g. `FilterSnapshotDto`'s `limit = 12` stays 12).
- No frontend caller's consumed response shape changes.
- No new test files are created. Existing spec files are updated in place to match new signatures.
- Every `*FilterDto` that keeps a `@Max(100)` cap today (`FilterCertificateDto`, `FilterFunderDto`, `FilterSnapshotDto`) must keep it via `override limit` with the full decorator stack. `DeclarationQueryDto` has no `@Max` today and must not gain one.
- Behavior change to call out explicitly where relevant: `page=0` (or any value failing `@Min(1)`) sent in a real HTTP request now 400s instead of being silently handled, for every method migrated onto `BaseFilterDto`-derived validation — except `getOverdueReports`, which keeps its own internal `Math.max(..., 1)` clamp exactly as today (Task 6).

---

## File Structure

**Created:**
- `src/crm-funders/dto/pagination-filter.dto.ts` — new `PaginationFilterDto extends BaseFilterDto {}`, shared by `findGrants`, `getDisbursements`, `getOverdueReports` (Tasks 4-6).
- `src/monitoring/dto/filter-indicator.dto.ts` — new `FilterIndicatorDto extends BaseFilterDto` with one extra `category?: string` field (Task 8).

**Modified:**
- `src/certification/dto/filter-certificate.dto.ts` — `FilterCertificateDto extends BaseFilterDto`; add `MyCertificatesFilterDto extends BaseFilterDto {}` (Tasks 1-2).
- `src/certification/certification.service.ts` — `findAllCertificates`, `getMyCertificates` (Tasks 1-2).
- `src/certification/certification.controller.ts` — `getMyCertificates` route (Task 2).
- `src/certification/certification.service.spec.ts` — `getMyCertificates` test (Task 2).
- `src/certification/certification.controller.spec.ts` — `getMyCertificates` test (Task 2).
- `src/crm-funders/dto/filter-funder.dto.ts` — `FilterFunderDto extends BaseFilterDto` (Task 3).
- `src/crm-funders/dto/index.ts` — add `pagination-filter.dto` export (Task 4).
- `src/crm-funders/crm-funders.service.ts` — `findAll`, `findGrants`, `getDisbursements`, `getOverdueReports` (Tasks 3-6).
- `src/crm-funders/crm-funders.controller.ts` — `findGrants`, `getDisbursements`, `getOverdueReports` routes (Tasks 4-6).
- `src/crm-funders/crm-funders.service.spec.ts` — `findGrants`, `getDisbursements`, `getOverdueReports` tests (Tasks 4-6).
- `src/dashboard-institutional/dto/filter-snapshot.dto.ts` — `FilterSnapshotDto extends BaseFilterDto` (Task 7).
- `src/dashboard-institutional/dashboard-institutional.service.ts` — `findAllSnapshots` (Task 7).
- `src/monitoring/dto/index.ts` — add `filter-indicator.dto` export (Task 8).
- `src/monitoring/monitoring.service.ts` — `findAllIndicators` (Task 8).
- `src/monitoring/monitoring.controller.ts` — `findAllIndicators` route (Task 8).
- `src/monitoring/monitoring.service.spec.ts` — `findAllIndicators` test (Task 8).
- `src/monitoring/monitoring.controller.spec.ts` — `findAllIndicators` test (Task 8).
- `src/work-declaration/work-declaration.dto.ts` — `DeclarationQueryDto extends BaseFilterDto` (Task 9).
- `src/work-declaration/work-declaration.service.ts` — `listDeclarations` (Task 9).

**Not modified (confirmed, do not touch):**
- `src/crm-funders/crm-funders.controller.spec.ts` — only exercises `@Roles()` metadata, never invokes handlers.
- `src/dashboard-institutional/dashboard-institutional.controller.spec.ts` — already passes `{} as any`.
- `src/work-declaration/work-declaration.service.spec.ts` — already passes `{} as any`.
- `src/work-declaration/work-declaration.controller.ts` — both `listDeclarations` call sites already pass a `DeclarationQueryDto`/`{}`, no signature change.

---

## Task 1: `certification.service.ts#findAllCertificates` onto `BaseFilterDto`

**Files:**
- Modify: `src/certification/dto/filter-certificate.dto.ts`
- Modify: `src/certification/certification.service.ts:~140-166` (`findAllCertificates`)

**Interfaces:**
- Consumes: `BaseFilterDto` (`src/common/dtos/pagination.dto.ts`), `calculatePagination(page?: number, limit?: number): { skip: number; take: number }`, `buildPaginatedResponse<T>(data: T[], total: number, page?: number, limit?: number): { data: T[]; meta: { total: number; page: number; limit: number; totalPages: number } }` (`src/common/helpers/pagination.helper.ts`).
- Produces: `FilterCertificateDto` now `extends BaseFilterDto` — `type`, `userId`, `search`, `isRevoked` unchanged; `page`/`limit` inherited; `limit` still capped at 100 via `override`.

No test changes for this task — `findAllCertificates` has no dedicated spec in `certification.service.spec.ts` today, and its call site (`FilterCertificateDto` object, unchanged shape) doesn't change. This task is verified by the full suite run in the final step.

- [ ] **Step 1: Update `FilterCertificateDto` to extend `BaseFilterDto`**

Replace the full content of `src/certification/dto/filter-certificate.dto.ts`:

```ts
import { Max, IsOptional, IsEnum, IsString, IsInt, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateTemplateType } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterCertificateDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: CertificateTemplateType })
  @IsOptional()
  @IsEnum(CertificateTemplateType)
  type?: CertificateTemplateType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRevoked?: boolean;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(100)
  override limit?: number = 20;
}
```

- [ ] **Step 2: Implement `findAllCertificates` using the shared helpers**

In `src/certification/certification.service.ts`, find the `findAllCertificates` method (destructures `{ type, userId, search, isRevoked, page = 1, limit = 20 }` from `FilterCertificateDto`, uses `skip: (page - 1) * limit` / `take: limit`, and `return { data, total, page, limit, totalPages: Math.ceil(total / limit) };`). Replace its pagination lines:

Before:
```ts
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.issuedCertificate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.read.issuedCertificate.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
```

After:
```ts
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.issuedCertificate.findMany({
        where,
        skip,
        take,
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.read.issuedCertificate.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
```

Add the import at the top of `src/certification/certification.service.ts`, alongside the existing `./dto` import:
```ts
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
```

- [ ] **Step 3: Run the certification suite and confirm it passes**

Run: `npx jest src/certification --silent`
Expected: PASS (no test exercises `findAllCertificates` directly today, so this confirms no regression elsewhere in the file).

- [ ] **Step 4: Commit**

```bash
git add src/certification/dto/filter-certificate.dto.ts src/certification/certification.service.ts
git commit -m "refactor(pagination): migrate findAllCertificates to BaseFilterDto"
```

---

## Task 2: `certification.service.ts#getMyCertificates` onto `BaseFilterDto`

**Files:**
- Modify: `src/certification/dto/filter-certificate.dto.ts`
- Modify: `src/certification/certification.service.ts:~362-374` (`getMyCertificates`)
- Modify: `src/certification/certification.controller.ts:~75-90` (`getMyCertificates` route)
- Modify: `src/certification/certification.service.spec.ts`
- Modify: `src/certification/certification.controller.spec.ts`

**Interfaces:**
- Consumes: `BaseFilterDto`, `calculatePagination`, `buildPaginatedResponse` (same as Task 1).
- Produces: `MyCertificatesFilterDto extends BaseFilterDto {}` (empty body, inherits `page`/`limit` with no cap override — matches today's uncapped `getMyCertificates(userId, page, limit)` behavior). `CertificationService#getMyCertificates(userId: number, filters: MyCertificatesFilterDto)`.

- [ ] **Step 1: Update the service spec to call the new object-based signature (failing test)**

In `src/certification/certification.service.spec.ts`, find:
```ts
  describe('getMyCertificates', () => {
    it('deve retornar certificados paginados do utilizador', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockCert], 1]);
      const result = await service.getMyCertificates(1, 1, 20);
      expect(result.total).toBe(1);
    });
  });
```
Replace with:
```ts
  describe('getMyCertificates', () => {
    it('deve retornar certificados paginados do utilizador', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockCert], 1]);
      const result = await service.getMyCertificates(1, { page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });
  });
```

- [ ] **Step 2: Update the controller spec to call the new object-based signature (failing test)**

In `src/certification/certification.controller.spec.ts`, find:
```ts
  it('getMyCertificates → getMyCertificates(userId, page, limit)', async () => {
    await controller.getMyCertificates(mockUser as any, 1, 20);
    expect(mockSvc.getMyCertificates).toHaveBeenCalledWith(1, 1, 20);
  });
```
Replace with:
```ts
  it('getMyCertificates → getMyCertificates(userId, filters)', async () => {
    await controller.getMyCertificates(mockUser as any, { page: 1, limit: 20 } as any);
    expect(mockSvc.getMyCertificates).toHaveBeenCalledWith(1, { page: 1, limit: 20 });
  });
```

- [ ] **Step 3: Run both specs to verify they fail**

Run: `npx jest src/certification/certification.service.spec.ts src/certification/certification.controller.spec.ts --silent`
Expected: FAIL — `service.getMyCertificates(1, { page: 1, limit: 20 })` calls the old 3-arg method with `page` as an object (`(page - 1) * limit` becomes `NaN`), and `controller.getMyCertificates` still declares 3 params, so the call/assert shapes mismatch.

- [ ] **Step 4: Add `MyCertificatesFilterDto` to `filter-certificate.dto.ts`**

Append to the end of `src/certification/dto/filter-certificate.dto.ts` (after the `FilterCertificateDto` class from Task 1):
```ts

export class MyCertificatesFilterDto extends BaseFilterDto {}
```

- [ ] **Step 5: Implement `getMyCertificates` in the service using the shared helpers**

In `src/certification/certification.service.ts`, replace:
```ts
  async getMyCertificates(userId: number, page = 1, limit = 20) {
    const where = { userId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.issuedCertificate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.read.issuedCertificate.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
```
With:
```ts
  async getMyCertificates(userId: number, filters: MyCertificatesFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const where = { userId, deletedAt: null };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.issuedCertificate.findMany({
        where,
        skip,
        take,
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.read.issuedCertificate.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }
```

Add `MyCertificatesFilterDto` to the `./dto` import list at the top of `src/certification/certification.service.ts` (the import already includes `FilterCertificateDto`; add `MyCertificatesFilterDto` alongside it in the same `from './dto'` import).

- [ ] **Step 6: Update the controller route**

In `src/certification/certification.controller.ts`, replace:
```ts
  @Get('my-certificates')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Meus certificados' })
  getMyCertificates(
    @CurrentUser() user: CurrentUserData,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getMyCertificates(user.id, page, limit);
  }
```
With:
```ts
  @Get('my-certificates')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Meus certificados' })
  getMyCertificates(@CurrentUser() user: CurrentUserData, @Query() filters: MyCertificatesFilterDto) {
    return this.service.getMyCertificates(user.id, filters);
  }
```

Add `MyCertificatesFilterDto` to the `./dto` import list at the top of the controller (it already imports several DTOs from `'./dto'` — add it to that same list).

Remove `DefaultValuePipe` and `ParseIntPipe` from the `@nestjs/common` import at the top of `src/certification/certification.controller.ts` — both were used only by this route in this file:
```ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
} from '@nestjs/common';
```

- [ ] **Step 7: Run both specs to verify they pass**

Run: `npx jest src/certification/certification.service.spec.ts src/certification/certification.controller.spec.ts --silent`
Expected: PASS

- [ ] **Step 8: Run the full certification suite**

Run: `npx jest src/certification --silent`
Expected: PASS (confirms Step 6's import removal didn't break another route in the same controller).

- [ ] **Step 9: Commit**

```bash
git add src/certification/dto/filter-certificate.dto.ts src/certification/certification.service.ts src/certification/certification.controller.ts src/certification/certification.service.spec.ts src/certification/certification.controller.spec.ts
git commit -m "refactor(pagination): migrate getMyCertificates to BaseFilterDto"
```

---

## Task 3: `crm-funders.service.ts#findAll` onto `BaseFilterDto`

**Files:**
- Modify: `src/crm-funders/dto/filter-funder.dto.ts`
- Modify: `src/crm-funders/crm-funders.service.ts` (`findAll`)

**Interfaces:**
- Consumes: `BaseFilterDto`, `calculatePagination`, `buildPaginatedResponse`.
- Produces: `FilterFunderDto extends BaseFilterDto` — `type`, `status`, `search`, `country`, `assignedToId` unchanged; `limit` still capped at 100.

No test changes — `src/crm-funders/crm-funders.service.spec.ts`'s `findAll` test already calls `service.findAll({ page: 1, limit: 20 })` (object-based, unchanged) and only asserts on `data`/`total`/`totalPages`.

- [ ] **Step 1: Update `FilterFunderDto` to extend `BaseFilterDto`**

Replace the full content of `src/crm-funders/dto/filter-funder.dto.ts`:

```ts
import { Max, IsOptional, IsEnum, IsString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { FunderType, FunderStatus } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterFunderDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: FunderType })
  @IsOptional()
  @IsEnum(FunderType)
  type?: FunderType;

  @ApiPropertyOptional({ enum: FunderStatus })
  @IsOptional()
  @IsEnum(FunderStatus)
  status?: FunderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedToId?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(100)
  override limit?: number = 20;
}
```

- [ ] **Step 2: Implement `findAll` using the shared helpers**

In `src/crm-funders/crm-funders.service.ts`, find the `findAll` method. Before:
```ts
  async findAll(filters: FilterFunderDto) {
    const { type, status, search, country, assignedToId, page = 1, limit = 20 } = filters;
    const where: Prisma.FunderWhereInput = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(country && { country }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.funder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { grants: true, interactions: true } },
        },
      }),
      this.prisma.read.funder.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
```
After:
```ts
  async findAll(filters: FilterFunderDto) {
    const { type, status, search, country, assignedToId, page = 1, limit = 20 } = filters;
    const where: Prisma.FunderWhereInput = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(country && { country }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.funder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { grants: true, interactions: true } },
        },
      }),
      this.prisma.read.funder.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }
```

Add the import at the top of `src/crm-funders/crm-funders.service.ts`, alongside the existing `./dto` import:
```ts
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
```

- [ ] **Step 3: Run the crm-funders suite and confirm it passes**

Run: `npx jest src/crm-funders --silent`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/crm-funders/dto/filter-funder.dto.ts src/crm-funders/crm-funders.service.ts
git commit -m "refactor(pagination): migrate crm-funders findAll to BaseFilterDto"
```

---

## Task 4: `crm-funders.service.ts#findGrants` onto `BaseFilterDto`

**Files:**
- Create: `src/crm-funders/dto/pagination-filter.dto.ts`
- Modify: `src/crm-funders/dto/index.ts`
- Modify: `src/crm-funders/crm-funders.service.ts` (`findGrants`)
- Modify: `src/crm-funders/crm-funders.controller.ts` (`findGrants` route)
- Modify: `src/crm-funders/crm-funders.service.spec.ts`

**Interfaces:**
- Consumes: `BaseFilterDto`, `calculatePagination`, `buildPaginatedResponse` (imported from Task 3's already-present import line in the service).
- Produces: `PaginationFilterDto extends BaseFilterDto {}` (empty body, no cap override — matches today's uncapped `findGrants`/`getDisbursements`/`getOverdueReports` `page`/`limit` params). `CrmFundersService#findGrants(funderId: string, filters: PaginationFilterDto)`. Reused as-is by Tasks 5 and 6.

- [ ] **Step 1: Create the shared `PaginationFilterDto`**

Create `src/crm-funders/dto/pagination-filter.dto.ts`:
```ts
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class PaginationFilterDto extends BaseFilterDto {}
```

Add the export to `src/crm-funders/dto/index.ts`:
```ts
export * from './create-funder.dto';
export * from './update-funder.dto';
export * from './filter-funder.dto';
export * from './create-grant.dto';
export * from './create-disbursement.dto';
export * from './create-funder-interaction.dto';
export * from './create-report.dto';
export * from './submit-report.dto';
export * from './pagination-filter.dto';
```

- [ ] **Step 2: Update the service spec to call the new object-based signature (failing test)**

In `src/crm-funders/crm-funders.service.spec.ts`, find:
```ts
  describe('findGrants', () => {
    it('deve retornar grants paginados', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.fundingGrant.findMany.mockResolvedValue([mockGrant]);
      mockPrisma.fundingGrant.count.mockResolvedValue(1);
      const result = await service.findGrants('fun-1', 1, 20);
      expect(result.total).toBe(1);
    });
  });
```
Replace with:
```ts
  describe('findGrants', () => {
    it('deve retornar grants paginados', async () => {
      mockPrisma.funder.findUnique.mockResolvedValue(mockFunder);
      mockPrisma.fundingGrant.findMany.mockResolvedValue([mockGrant]);
      mockPrisma.fundingGrant.count.mockResolvedValue(1);
      const result = await service.findGrants('fun-1', { page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });
  });
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `npx jest src/crm-funders/crm-funders.service.spec.ts -t findGrants --silent`
Expected: FAIL — `findGrants('fun-1', { page: 1, limit: 20 })` calls the old 3-arg method with `page` as an object, `(page - 1) * limit` becomes `NaN`.

- [ ] **Step 4: Implement `findGrants` using the shared helpers**

In `src/crm-funders/crm-funders.service.ts`, replace:
```ts
  async findGrants(funderId: string, page = 1, limit = 20) {
    await this.findOne(funderId);
    const where = { funderId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.read.fundingGrant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { disbursements: true, reports: true } },
        },
      }),
      this.prisma.read.fundingGrant.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
```
With:
```ts
  async findGrants(funderId: string, filters: PaginationFilterDto) {
    await this.findOne(funderId);
    const { page = 1, limit = 20 } = filters;
    const where = { funderId, deletedAt: null };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.fundingGrant.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { disbursements: true, reports: true } },
        },
      }),
      this.prisma.read.fundingGrant.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }
```

Add `PaginationFilterDto` to the `./dto` import list at the top of `src/crm-funders/crm-funders.service.ts` (already imports `FilterFunderDto` and others from `'./dto'`; add it to that same list).

- [ ] **Step 5: Update the controller route**

In `src/crm-funders/crm-funders.controller.ts`, replace:
```ts
  @Get(':id/grants')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar grants do financiador' })
  findGrants(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.findGrants(id, page, limit);
  }
```
With:
```ts
  @Get(':id/grants')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar grants do financiador' })
  findGrants(@Param('id') id: string, @Query() filters: PaginationFilterDto) {
    return this.service.findGrants(id, filters);
  }
```

Add `PaginationFilterDto` to the `./dto` (or `./crm-funders.service` re-export, whichever the controller currently imports `CrmFundersService`'s DTOs from — this controller imports DTOs from `'./dto'` per the existing `import { ... } from './dto'` block) import list at the top of `src/crm-funders/crm-funders.controller.ts`.

Leave `DefaultValuePipe`/`ParseIntPipe` imports in place for now — Tasks 5 and 6 still use them in this same file; they are removed together in Task 6 once all three routes are migrated.

- [ ] **Step 6: Run the spec to verify it passes**

Run: `npx jest src/crm-funders/crm-funders.service.spec.ts -t findGrants --silent`
Expected: PASS

- [ ] **Step 7: Run the full crm-funders suite**

Run: `npx jest src/crm-funders --silent`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/crm-funders/dto/pagination-filter.dto.ts src/crm-funders/dto/index.ts src/crm-funders/crm-funders.service.ts src/crm-funders/crm-funders.controller.ts src/crm-funders/crm-funders.service.spec.ts
git commit -m "refactor(pagination): migrate findGrants to BaseFilterDto"
```

---

## Task 5: `crm-funders.service.ts#getDisbursements` onto `BaseFilterDto`

**Files:**
- Modify: `src/crm-funders/crm-funders.service.ts` (`getDisbursements`)
- Modify: `src/crm-funders/crm-funders.controller.ts` (`getDisbursements` route)
- Modify: `src/crm-funders/crm-funders.service.spec.ts`

**Interfaces:**
- Consumes: `PaginationFilterDto` (from Task 4), `calculatePagination`, `buildPaginatedResponse` (already imported into both files by Task 4).
- Produces: `CrmFundersService#getDisbursements(grantId: string, filters: PaginationFilterDto)`.

- [ ] **Step 1: Update the service spec to call the new object-based signature (failing test)**

In `src/crm-funders/crm-funders.service.spec.ts`, find:
```ts
  describe('getDisbursements', () => {
    it('deve retornar desembolsos paginados', async () => {
      mockPrisma.grantDisbursement.findMany.mockResolvedValue([{ id: 'dis-1' }]);
      mockPrisma.grantDisbursement.count.mockResolvedValue(1);
      const result = await service.getDisbursements('grt-1', 1, 20);
      expect(result.total).toBe(1);
    });
  });
```
Replace with:
```ts
  describe('getDisbursements', () => {
    it('deve retornar desembolsos paginados', async () => {
      mockPrisma.grantDisbursement.findMany.mockResolvedValue([{ id: 'dis-1' }]);
      mockPrisma.grantDisbursement.count.mockResolvedValue(1);
      const result = await service.getDisbursements('grt-1', { page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });
  });
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx jest src/crm-funders/crm-funders.service.spec.ts -t getDisbursements --silent`
Expected: FAIL — same `NaN` failure mode as Task 4 Step 3.

- [ ] **Step 3: Implement `getDisbursements` using the shared helpers**

In `src/crm-funders/crm-funders.service.ts`, replace:
```ts
  async getDisbursements(grantId: string, page = 1, limit = 20) {
    const where = { grantId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.read.grantDisbursement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { receivedAt: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.read.grantDisbursement.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
```
With:
```ts
  async getDisbursements(grantId: string, filters: PaginationFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const where = { grantId, deletedAt: null };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.grantDisbursement.findMany({
        where,
        skip,
        take,
        orderBy: { receivedAt: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.read.grantDisbursement.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }
```

- [ ] **Step 4: Update the controller route**

In `src/crm-funders/crm-funders.controller.ts`, replace:
```ts
  @Get('grants/:grantId/disbursements')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar desembolsos do grant' })
  getDisbursements(
    @Param('grantId') grantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getDisbursements(grantId, page, limit);
  }
```
With:
```ts
  @Get('grants/:grantId/disbursements')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar desembolsos do grant' })
  getDisbursements(@Param('grantId') grantId: string, @Query() filters: PaginationFilterDto) {
    return this.service.getDisbursements(grantId, filters);
  }
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `npx jest src/crm-funders/crm-funders.service.spec.ts -t getDisbursements --silent`
Expected: PASS

- [ ] **Step 6: Run the full crm-funders suite**

Run: `npx jest src/crm-funders --silent`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/crm-funders/crm-funders.service.ts src/crm-funders/crm-funders.controller.ts src/crm-funders/crm-funders.service.spec.ts
git commit -m "refactor(pagination): migrate getDisbursements to BaseFilterDto"
```

---

## Task 6: `crm-funders.service.ts#getOverdueReports` onto `BaseFilterDto`

**Files:**
- Modify: `src/crm-funders/crm-funders.service.ts` (`getOverdueReports`)
- Modify: `src/crm-funders/crm-funders.controller.ts` (`getOverdueReports` route)
- Modify: `src/crm-funders/crm-funders.service.spec.ts`

**Interfaces:**
- Consumes: `PaginationFilterDto` (from Task 4).
- Produces: `CrmFundersService#getOverdueReports(filters?: PaginationFilterDto)`. This method keeps its own internal clamp (`safePage`/`safeLimit`) — it does **not** switch to `calculatePagination`/`buildPaginatedResponse`, since those helpers don't clamp `limit` to `MAX_PAGE_SIZE`, and preserving that clamp is a Global Constraint.

**Behavior note:** unlike Tasks 1-5 and 7-9, this method is not moved onto `@Min(1)`-enforced HTTP-layer validation for `limit`'s upper bound — the existing internal `Math.min(Math.max(limit, 1), MAX_PAGE_SIZE)` clamp is kept exactly as today, so a request with `limit=5000` still silently clamps to 100 rather than 400ing. `page`'s lower bound does gain HTTP-layer `@Min(1)` validation via `BaseFilterDto` (a `page=0` request now 400s before reaching the service), but the internal `Math.max(page, 1)` clamp is left in place too since removing it isn't necessary for this migration.

- [ ] **Step 1: Update the service spec to call the new object-based signature (failing test)**

In `src/crm-funders/crm-funders.service.spec.ts`, find:
```ts
  describe('getOverdueReports', () => {
    it('deve retornar relatórios em atraso paginados', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([{ id: 'rep-1' }]);
      mockPrisma.funderReport.count.mockResolvedValue(1);
      const result = await service.getOverdueReports();
      expect(result.data).toHaveLength(1);
      expect(result).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('deve aplicar o tecto de paginação (limit máximo 100)', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([]);
      mockPrisma.funderReport.count.mockResolvedValue(0);
      const result = await service.getOverdueReports(1, 5000);
      expect(result.limit).toBe(100);
      expect(mockPrisma.funderReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, skip: 0 }),
      );
    });
  });
```
Replace with:
```ts
  describe('getOverdueReports', () => {
    it('deve retornar relatórios em atraso paginados', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([{ id: 'rep-1' }]);
      mockPrisma.funderReport.count.mockResolvedValue(1);
      const result = await service.getOverdueReports({});
      expect(result.data).toHaveLength(1);
      expect(result).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
    });

    it('deve aplicar o tecto de paginação (limit máximo 100)', async () => {
      mockPrisma.funderReport.findMany.mockResolvedValue([]);
      mockPrisma.funderReport.count.mockResolvedValue(0);
      const result = await service.getOverdueReports({ page: 1, limit: 5000 });
      expect(result.limit).toBe(100);
      expect(mockPrisma.funderReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, skip: 0 }),
      );
    });
  });
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx jest src/crm-funders/crm-funders.service.spec.ts -t getOverdueReports --silent`
Expected: FAIL — `getOverdueReports({})` / `getOverdueReports({ page: 1, limit: 5000 })` call the old `(page = 1, limit = DEFAULT_PAGE_SIZE)` signature with an object as `page`, so `Math.max(page, 1)` on an object produces `NaN`.

- [ ] **Step 3: Implement `getOverdueReports` against the new signature**

In `src/crm-funders/crm-funders.service.ts`, replace the method signature and its first two lines:
```ts
  async getOverdueReports(page = 1, limit = DEFAULT_PAGE_SIZE) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
```
With:
```ts
  async getOverdueReports(filters: PaginationFilterDto = {} as PaginationFilterDto) {
    const safePage = Math.max(filters.page ?? 1, 1);
    const safeLimit = Math.min(Math.max(filters.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
```
Everything below these two lines (the `where`, `data`/`total` query, and the final `return { data, total, page: safePage, limit: safeLimit, totalPages: ... }`) stays exactly as it is today — no further change in this method.

- [ ] **Step 4: Update the controller route**

In `src/crm-funders/crm-funders.controller.ts`, replace:
```ts
  @Get('overdue-reports')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Relatórios em atraso (paginado)' })
  getOverdueReports(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getOverdueReports(page, limit);
  }
```
With:
```ts
  @Get('overdue-reports')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Relatórios em atraso (paginado)' })
  getOverdueReports(@Query() filters: PaginationFilterDto) {
    return this.service.getOverdueReports(filters);
  }
```

Now that all three routes in this controller (`findGrants`, `getDisbursements`, `getOverdueReports`) use `@Query() filters: PaginationFilterDto`, remove `DefaultValuePipe` and `ParseIntPipe` from the `@nestjs/common` import at the top of `src/crm-funders/crm-funders.controller.ts`:
```ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `npx jest src/crm-funders/crm-funders.service.spec.ts -t getOverdueReports --silent`
Expected: PASS

- [ ] **Step 6: Run the full crm-funders suite**

Run: `npx jest src/crm-funders --silent`
Expected: PASS (confirms the import removal in Step 4 didn't break `findAll`, `findGrants`, or `getDisbursements` in the same controller file).

- [ ] **Step 7: Commit**

```bash
git add src/crm-funders/crm-funders.service.ts src/crm-funders/crm-funders.controller.ts src/crm-funders/crm-funders.service.spec.ts
git commit -m "refactor(pagination): migrate getOverdueReports to BaseFilterDto"
```

---

## Task 7: `dashboard-institutional.service.ts#findAllSnapshots` onto `BaseFilterDto`

**Files:**
- Modify: `src/dashboard-institutional/dto/filter-snapshot.dto.ts`
- Modify: `src/dashboard-institutional/dashboard-institutional.service.ts` (`findAllSnapshots`)

**Interfaces:**
- Consumes: `BaseFilterDto`, `calculatePagination`, `buildPaginatedResponse`.
- Produces: `FilterSnapshotDto extends BaseFilterDto` — `type` unchanged; `limit` keeps default `12` (not `BaseFilterDto`'s default `20`) and its `@Max(100)` cap.

No controller change (`findAllSnapshots(filters: FilterSnapshotDto)` already takes the DTO object — no signature change) and no test changes — `src/dashboard-institutional/dashboard-institutional.service.spec.ts`'s test already calls `service.findAllSnapshots({ page: 1, limit: 12 })` and only asserts on `total`/`totalPages`; `src/dashboard-institutional/dashboard-institutional.controller.spec.ts` already passes `{} as any`.

- [ ] **Step 1: Update `FilterSnapshotDto` to extend `BaseFilterDto`**

Replace the full content of `src/dashboard-institutional/dto/filter-snapshot.dto.ts`:

```ts
import { Max, IsOptional, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SnapshotType } from '@prisma/client';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterSnapshotDto extends BaseFilterDto {
  @ApiPropertyOptional({ enum: SnapshotType })
  @IsOptional()
  @IsEnum(SnapshotType)
  type?: SnapshotType;

  @ApiPropertyOptional({ default: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Max(100)
  override limit?: number = 12;
}
```

- [ ] **Step 2: Implement `findAllSnapshots` using the shared helpers**

In `src/dashboard-institutional/dashboard-institutional.service.ts`, replace:
```ts
  async findAllSnapshots(filters: FilterSnapshotDto) {
    const { type, page = 1, limit = 12 } = filters;
    const where = { deletedAt: null, ...(type && { type }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.institutionalSnapshot.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { period: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.read.institutionalSnapshot.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
```
With:
```ts
  async findAllSnapshots(filters: FilterSnapshotDto) {
    const { type, page = 1, limit = 12 } = filters;
    const where = { deletedAt: null, ...(type && { type }) };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.institutionalSnapshot.findMany({
        where,
        skip,
        take,
        orderBy: { period: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.read.institutionalSnapshot.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }
```

Add the import at the top of `src/dashboard-institutional/dashboard-institutional.service.ts`, alongside the existing `./dto` import:
```ts
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
```

- [ ] **Step 3: Run the dashboard-institutional suite and confirm it passes**

Run: `npx jest src/dashboard-institutional --silent`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/dashboard-institutional/dto/filter-snapshot.dto.ts src/dashboard-institutional/dashboard-institutional.service.ts
git commit -m "refactor(pagination): migrate findAllSnapshots to BaseFilterDto"
```

---

## Task 8: `monitoring.service.ts#findAllIndicators` onto `BaseFilterDto`

**Files:**
- Create: `src/monitoring/dto/filter-indicator.dto.ts`
- Modify: `src/monitoring/dto/index.ts`
- Modify: `src/monitoring/monitoring.service.ts` (`findAllIndicators`)
- Modify: `src/monitoring/monitoring.controller.ts` (`findAllIndicators` route)
- Modify: `src/monitoring/monitoring.service.spec.ts`
- Modify: `src/monitoring/monitoring.controller.spec.ts`

**Interfaces:**
- Consumes: `BaseFilterDto`, `calculatePagination`, `buildPaginatedResponse`.
- Produces: `FilterIndicatorDto extends BaseFilterDto` with one extra field `category?: string`. `MonitoringService#findAllIndicators(filters: FilterIndicatorDto)`.

- [ ] **Step 1: Create `FilterIndicatorDto`**

Create `src/monitoring/dto/filter-indicator.dto.ts`:
```ts
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BaseFilterDto } from '../../common/dtos/pagination.dto';

export class FilterIndicatorDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}
```

Add the export to `src/monitoring/dto/index.ts`:
```ts
export * from './create-okr-cycle.dto';
export * from './create-objective.dto';
export * from './create-key-result.dto';
export * from './update-key-result.dto';
export * from './create-indicator.dto';
export * from './create-record.dto';
export * from './create-eval-cycle.dto';
export * from './submit-evaluation.dto';
export * from './filter-indicator.dto';
```

- [ ] **Step 2: Update the service spec to call the new object-based signature (failing test)**

In `src/monitoring/monitoring.service.spec.ts`, find:
```ts
  describe('findAllIndicators', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.monitoringIndicator.findMany.mockResolvedValue([{ id: 'ind-1' }]);
      mockPrisma.monitoringIndicator.count.mockResolvedValue(1);
      const result = await service.findAllIndicators(1, 20);
      expect(result.total).toBe(1);
    });
  });
```
Replace with:
```ts
  describe('findAllIndicators', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.monitoringIndicator.findMany.mockResolvedValue([{ id: 'ind-1' }]);
      mockPrisma.monitoringIndicator.count.mockResolvedValue(1);
      const result = await service.findAllIndicators({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
    });
  });
```

- [ ] **Step 3: Update the controller spec to call the new object-based signature (failing test)**

In `src/monitoring/monitoring.controller.spec.ts`, find:
```ts
  it('findAllIndicators → findAllIndicators(page, limit, category)', async () => {
    await controller.findAllIndicators(1, 20, 'financeiro');
    expect(mockSvc.findAllIndicators).toHaveBeenCalledWith(1, 20, 'financeiro');
  });
```
Replace with:
```ts
  it('findAllIndicators → findAllIndicators(filters)', async () => {
    await controller.findAllIndicators({ page: 1, limit: 20, category: 'financeiro' } as any);
    expect(mockSvc.findAllIndicators).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      category: 'financeiro',
    });
  });
```

- [ ] **Step 4: Run both specs to verify they fail**

Run: `npx jest src/monitoring/monitoring.service.spec.ts src/monitoring/monitoring.controller.spec.ts --silent`
Expected: FAIL — `service.findAllIndicators({ page: 1, limit: 20 })` calls the old 2-arg method with `page` as an object, and `controller.findAllIndicators` still declares 3 positional params.

- [ ] **Step 5: Implement `findAllIndicators` in the service using the shared helpers**

In `src/monitoring/monitoring.service.ts`, replace:
```ts
  async findAllIndicators(page = 1, limit = 20, category?: string) {
    const where = {
      deletedAt: null,
      isActive: true,
      ...(category && { category }),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.monitoringIndicator.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { records: true } } },
      }),
      this.prisma.read.monitoringIndicator.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
```
With:
```ts
  async findAllIndicators(filters: FilterIndicatorDto) {
    const { page = 1, limit = 20, category } = filters;
    const where = {
      deletedAt: null,
      isActive: true,
      ...(category && { category }),
    };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.monitoringIndicator.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { records: true } } },
      }),
      this.prisma.read.monitoringIndicator.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }
```

Add the import at the top of `src/monitoring/monitoring.service.ts`, alongside the existing `./dto` import:
```ts
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
```
Add `FilterIndicatorDto` to the `./dto` import list already present in this file.

- [ ] **Step 6: Update the controller route**

In `src/monitoring/monitoring.controller.ts`, replace:
```ts
  @Get('indicators')
  @ApiOperation({ summary: 'Listar indicadores (paginado)' })
  findAllIndicators(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: string,
  ) {
    return this.service.findAllIndicators(page, limit, category);
  }
```
With:
```ts
  @Get('indicators')
  @ApiOperation({ summary: 'Listar indicadores (paginado)' })
  findAllIndicators(@Query() filters: FilterIndicatorDto) {
    return this.service.findAllIndicators(filters);
  }
```

Add `FilterIndicatorDto` to this controller's DTO import list.

Remove `DefaultValuePipe` from the `@nestjs/common` import at the top of `src/monitoring/monitoring.controller.ts` — it was used only by this route in this file. **Keep `ParseIntPipe`** — it is also used independently at `@Body('userId', ParseIntPipe)` / `@Body('evaluatorId', ParseIntPipe)` elsewhere in this controller, which this task does not touch:
```ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
```

- [ ] **Step 7: Run both specs to verify they pass**

Run: `npx jest src/monitoring/monitoring.service.spec.ts src/monitoring/monitoring.controller.spec.ts --silent`
Expected: PASS

- [ ] **Step 8: Run the full monitoring suite**

Run: `npx jest src/monitoring --silent`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/monitoring/dto/filter-indicator.dto.ts src/monitoring/dto/index.ts src/monitoring/monitoring.service.ts src/monitoring/monitoring.controller.ts src/monitoring/monitoring.service.spec.ts src/monitoring/monitoring.controller.spec.ts
git commit -m "refactor(pagination): migrate findAllIndicators to BaseFilterDto"
```

---

## Task 9: `work-declaration.service.ts#listDeclarations` onto `BaseFilterDto`

**Files:**
- Modify: `src/work-declaration/work-declaration.dto.ts`
- Modify: `src/work-declaration/work-declaration.service.ts` (`listDeclarations`)

**Interfaces:**
- Consumes: `BaseFilterDto`, `calculatePagination`, `buildPaginatedResponse`.
- Produces: `DeclarationQueryDto extends BaseFilterDto` — `status`, `type`, `employeeId`, `assignedToId`, `fromDate`, `toDate`, `search`, `sortBy`, `sortOrder` unchanged; `page`/`limit` inherited with **no** `@Max` override (none exists today).

No controller change — both call sites in `src/work-declaration/work-declaration.controller.ts` already pass a `DeclarationQueryDto`/`{}` to `listDeclarations`, unchanged. No test changes — the two ownership tests in `src/work-declaration/work-declaration.service.spec.ts` already pass `{} as any` and only assert on `where.employeeId`, unaffected by the internal pagination rewrite.

- [ ] **Step 1: Update `DeclarationQueryDto` to extend `BaseFilterDto`**

In `src/work-declaration/work-declaration.dto.ts`, find:
```ts
export class DeclarationQueryDto {
  @IsOptional()
  @IsEnum(DeclarationStatus)
  status?: DeclarationStatus;

  @IsOptional()
  @IsEnum(DeclarationType)
  type?: DeclarationType;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  employeeId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  assignedToId?: number;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // busca por código, nome do colaborador

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```
Replace with:
```ts
export class DeclarationQueryDto extends BaseFilterDto {
  @IsOptional()
  @IsEnum(DeclarationStatus)
  status?: DeclarationStatus;

  @IsOptional()
  @IsEnum(DeclarationType)
  type?: DeclarationType;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  employeeId?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  assignedToId?: number;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsString()
  search?: string; // busca por código, nome do colaborador

  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```

Add the import near the top of `src/work-declaration/work-declaration.dto.ts` (this file is at `src/work-declaration/`, one level below `src/`, so the relative path is `../common/dtos/pagination.dto`):
```ts
import { BaseFilterDto } from '../common/dtos/pagination.dto';
```

- [ ] **Step 2: Implement `listDeclarations` using the shared helpers**

In `src/work-declaration/work-declaration.service.ts`, find:
```ts
    const [data, total] = await Promise.all([
      this.prisma.declaration.findMany({
        where,
        include: this.declarationListIncludes(),
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
        take: query.limit ?? 20,
      }),
      this.prisma.declaration.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
```
Replace with:
```ts
    const { skip, take } = calculatePagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.declaration.findMany({
        where,
        include: this.declarationListIncludes(),
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip,
        take,
      }),
      this.prisma.declaration.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, query.page, query.limit);
```

Add the import at the top of `src/work-declaration/work-declaration.service.ts`, alongside the existing `../prisma/prisma.service` import:
```ts
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
```

- [ ] **Step 3: Run the work-declaration suite and confirm it passes**

Run: `npx jest src/work-declaration --silent`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/work-declaration/work-declaration.dto.ts src/work-declaration/work-declaration.service.ts
git commit -m "refactor(pagination): migrate listDeclarations to BaseFilterDto"
```

---

## Final Verification

After all 9 tasks are committed:

- [ ] **Run the full test suite**

Run: `npx jest --silent`
Expected: PASS, no regressions in any other module.

- [ ] **Run the TypeScript build**

Run: `npx tsc --noEmit`
Expected: no errors (note: `tsc --noEmit` skips `test/**`, per project convention — this checks only `src/**`).

- [ ] **Run prettier**

Run: `npx prettier --check .`
Expected: no formatting diffs. If there are, run `npx prettier --write .` scoped to only the files this plan touched (see File Structure section above), not the whole repo, then re-commit.

- [ ] **Push and open a PR against `main`**, then wait for the `quality` CI check to go green before merging — `main` is protected with `enforce_admins: true`; no bypass is available even for administrators.

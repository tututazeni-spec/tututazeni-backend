# Backend Pagination Consolidation — Design Spec

**Date:** 2026-08-22
**Repo:** `innova` (branch `docs/pagination-consolidation-plan`)
**Status:** Approved by user, phase = plan

## Problem

The canonical pagination pattern already exists and is adopted widely:
`BaseFilterDto` (`src/common/dtos/pagination.dto.ts`, `page`/`limit` with
`@Type(() => Number)` + `@IsInt` + `@Min(1)`) and the helper pair
`calculatePagination`/`buildPaginatedResponse`
(`src/common/helpers/pagination.helper.ts`). `src/courses/courses.dto.ts`'s
`CourseFilterDto extends BaseFilterDto` is the reference example.

Five services never adopted this and instead hand-roll `skip`/`take`/
`totalPages` math inline, with duplicated `Math.ceil(total / limit)` logic
repeated at nine call sites:

| Service | Methods | Controller currently uses a filter DTO? |
|---|---|---|
| `certification.service.ts` | `findAllCertificates`, `getMyCertificates` | `findAllCertificates` yes (`FilterCertificateDto`); `getMyCertificates` no — raw `@Query('page')`/`@Query('limit')` |
| `crm-funders.service.ts` | `findAll`, `findGrants`, `getDisbursements`, `getOverdueReports` | `findAll` yes (`FilterFunderDto`); the other 3 no — raw `@Query` params |
| `dashboard-institutional.service.ts` | `findAllSnapshots` | yes (`FilterSnapshotDto`) |
| `monitoring.service.ts` | `findAllIndicators` | no — raw `@Query` params |
| `work-declaration.service.ts` | `listDeclarations` | yes (`DeclarationQueryDto`) |

Confirmed via grep: none of the 5 services import anything from
`pagination.helper.ts` today — every import is added fresh by this work.

Two failure modes exist in the current code, independent of the
duplication itself:

1. **Drift risk.** Nine independent inline implementations of
   `Math.ceil(total / limit)` and `(page - 1) * limit` is nine places a
   future edit (e.g. changing the default limit, or fixing an off-by-one)
   has to be applied by hand and can silently diverge.
2. **Inconsistent request surface.** Five of the nine methods
   (`getMyCertificates`, `getOverdueReports`, `findGrants`,
   `getDisbursements`, `findAllIndicators`) accept `page`/`limit` as raw,
   unvalidated `@Query()` params with `DefaultValuePipe`/`ParseIntPipe`
   instead of a validated DTO — no `@Min(1)` floor, no `@Max` ceiling, no
   Swagger `@ApiPropertyOptional` documentation, unlike every other
   list endpoint in the codebase.

## Decision

Migrate all 9 methods onto `BaseFilterDto` + `calculatePagination` +
`buildPaginatedResponse`. Where a controller route doesn't yet accept a
DTO, add one (either extending `BaseFilterDto` directly with no extra
fields, or reusing/extending an existing sibling DTO) and change the route
handler signature from positional `@Query('page', ...)` params to
`@Query() filters: SomeDto`.

**Response shape is preserved exactly** for every method — all 9 already
return (or, for `listDeclarations`, already assemble) the shape
`{ data, total, page, limit, totalPages }` or `{ data, meta: { total,
page, limit, totalPages } }`. `buildPaginatedResponse` returns
`{ data, meta: {...} }`; the 8 methods that currently return the flat
`{ data, total, page, limit, totalPages }` shape must keep returning that
flat shape (spread `meta` back out) so no controller consumer (frontend or
otherwise) sees a breaking change. `listDeclarations` already returns the
nested `{ data, meta }` shape and needs no reshaping.

Not in scope: adding new filters, changing default `limit` values (e.g.
`FilterSnapshotDto`'s `limit = 12` stays 12), or touching the response
shape consumed by any frontend caller.

## Per-method design

### 1. `certification.service.ts#findAllCertificates`

No controller change — `FilterCertificateDto` already has `page?: number =
1` / `limit?: number = 20` with the same validation `BaseFilterDto` has
(`@Type(() => Number)`, `@IsInt`, `@Min(1)`), plus its own `@Max(100)` on
`limit` that `BaseFilterDto` doesn't have. Change `FilterCertificateDto`
to `extends BaseFilterDto`, drop its now-redundant `page`/`limit` fields,
but **keep the `@Max(100)` constraint** by re-declaring `limit` in the
subclass (overriding a parent property with a stricter decorator is valid
TypeScript/class-validator). Service body swaps its manual
`skip`/`take`/`totalPages` math for the helpers.

### 2. `certification.service.ts#getMyCertificates`

Controller currently:
```ts
@Get('my-certificates')
getMyCertificates(
  @CurrentUser() user: CurrentUserData,
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
) {
  return this.service.getMyCertificates(user.id, page, limit);
}
```
Add `MyCertificatesFilterDto extends BaseFilterDto {}` (no extra fields —
this route has no filters beyond pagination) to
`src/certification/dto/filter-certificate.dto.ts`. New controller
signature: `@Query() filters: MyCertificatesFilterDto`, calling
`this.service.getMyCertificates(user.id, filters)`. Service signature
changes from `(userId: number, page = 1, limit = 20)` to `(userId: number,
filters: MyCertificatesFilterDto)`, destructuring `page`/`limit` from
`filters` internally (defaults `1`/`20` still applied at destructure site,
matching the pattern in `findAllCertificates`).

### 3. `crm-funders.service.ts#findAll`

Same treatment as certification's `findAllCertificates`:
`FilterFunderDto extends BaseFilterDto`, re-declare `limit` with its
existing `@Max(100)`, drop the duplicated `page`/`limit` base fields,
swap service body to use the helpers.

### 4. `crm-funders.service.ts#findGrants`

Controller currently takes `id` (path param) plus raw `page`/`limit`
query params. Add a new shared DTO
`PaginationFilterDto extends BaseFilterDto {}` (no extra fields) in a new
file `src/crm-funders/dto/pagination-filter.dto.ts` — reused by
`findGrants`, `getDisbursements`, and `getOverdueReports` below, since all
three take pagination only, no other filters. New controller signature:
`@Query() filters: PaginationFilterDto`, calling
`this.service.findGrants(id, filters)`. Service signature changes from
`(funderId: string, page = 1, limit = 20)` to `(funderId: string, filters:
PaginationFilterDto)`. The existing `await this.findOne(funderId)`
existence-check call at the top of the method body is preserved verbatim
— only the pagination math below it changes.

### 5. `crm-funders.service.ts#getDisbursements`

Same pattern as `findGrants`, reusing `PaginationFilterDto`. Controller
signature: `@Query() filters: PaginationFilterDto`, calling
`this.service.getDisbursements(grantId, filters)`. Service signature:
`(grantId: string, filters: PaginationFilterDto)`.

### 6. `crm-funders.service.ts#getOverdueReports`

Same pattern, reusing `PaginationFilterDto` for the controller/service
signature change — but **the internal `safePage`/`safeLimit` clamping is
kept, not deleted**. Current implementation:

```ts
async getOverdueReports(page = 1, limit = DEFAULT_PAGE_SIZE) {
  const safePage = Math.max(page, 1);
  const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
  // ...
  return {
    data,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}
```

`crm-funders.service.spec.ts`'s `getOverdueReports` describe block has a
test that calls the service directly — bypassing the HTTP
`ValidationPipe` entirely — and asserts the clamp fires:

```ts
it('deve aplicar o tecto de paginação (limit máximo 100)', async () => {
  mockPrisma.funderReport.findMany.mockResolvedValue([]);
  mockPrisma.funderReport.count.mockResolvedValue(0);
  const result = await service.getOverdueReports(1, 5000);
  expect(result.limit).toBe(100);
  expect(mockPrisma.funderReport.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ take: 100, skip: 0 }),
  );
});
```

`PaginationFilterDto`'s inherited `@Min(1)` (and, following the override
pattern below, a re-declared `@Max(100)` on `limit`) only runs through
NestJS's `ValidationPipe` on the HTTP path — a direct service call like
the test above never goes through it. Deleting the clamp would make this
passing test fail (`result.limit` would be `5000`, not `100`). So the
migration here is narrower than the other methods: **the DTO is adopted
for controller wiring and Swagger documentation, but the clamp stays as
defense-in-depth for any direct/internal caller**, adapted to read from
the destructured filter instead of positional args:

`crm-funders.service.spec.ts` also has a first test in the same describe
block that calls `service.getOverdueReports()` with **no arguments**
(`expect(result).toMatchObject({ total: 1, page: 1, limit: 20,
totalPages: 1 })`), so the new parameter needs a default so `filters` is
never `undefined` when destructured:

```ts
async getOverdueReports(filters: PaginationFilterDto = {} as PaginationFilterDto) {
  const safePage = Math.max(filters.page ?? 1, 1);
  const safeLimit = Math.min(
    Math.max(filters.limit ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  // ...unchanged below — where/data/count/return all still use
  // safePage/safeLimit exactly as today...
}
```

Controller: `@Query() filters: PaginationFilterDto`, calling
`this.service.getOverdueReports(filters)`. The two existing tests in
`crm-funders.service.spec.ts` need only a mechanical call-site update for
the new single-object signature — their assertions are untouched since
the clamp still runs:
- `service.getOverdueReports()` → `service.getOverdueReports({})`
- `service.getOverdueReports(1, 5000)` →
  `service.getOverdueReports({ page: 1, limit: 5000 })`

### 7. `dashboard-institutional.service.ts#findAllSnapshots`

No controller change. `FilterSnapshotDto extends BaseFilterDto`, keep its
own `@Max(100)` on `limit` via override, and **keep the overridden
default** `limit?: number = 12` (only this DTO's default differs from the
`BaseFilterDto` default of 20 — `BaseFilterDto` itself is not modified).
Service body swaps to the helpers, still destructuring `limit = 12` as
the local fallback to match the DTO default exactly.

### 8. `monitoring.service.ts#findAllIndicators`

Controller currently:
```ts
@Get('indicators')
findAllIndicators(
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  @Query('category') category?: string,
) {
  return this.service.findAllIndicators(page, limit, category);
}
```
Add `FilterIndicatorDto extends BaseFilterDto` to a new file
`src/monitoring/dto/filter-indicator.dto.ts`, with one extra field:
```ts
@ApiPropertyOptional()
@IsOptional()
@IsString()
category?: string;
```
New controller signature: `@Query() filters: FilterIndicatorDto`, calling
`this.service.findAllIndicators(filters)`. Service signature changes from
`(page = 1, limit = 20, category?: string)` to `(filters:
FilterIndicatorDto)`, destructuring `{ page = 1, limit = 20, category }`
from `filters` internally.

### 9. `work-declaration.service.ts#listDeclarations`

No controller change (`DeclarationQueryDto` is already the param type on
both the `findAll` and `my/requests` routes). `DeclarationQueryDto`
already carries `sortBy`/`sortOrder` fields the other DTOs don't have —
these are untouched. Change `DeclarationQueryDto` to `extends
BaseFilterDto`, dropping its own duplicated `page?: number = 1` /
`limit?: number = 20` fields (identical validation to `BaseFilterDto`,
no `@Max` override to preserve here — current code has none). Service
body: replace the manual
```ts
skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
take: query.limit ?? 20,
```
and the manual `meta` object construction with
`calculatePagination(query.page, query.limit)` for the Prisma args and
`buildPaginatedResponse(data, total, query.page, query.limit)` for the
return value — this method already returns the nested `{ data, meta }`
shape so `buildPaginatedResponse`'s output is returned directly with no
reshaping, unlike the other 8 methods.

## `BaseFilterDto` subclass override pattern

Several DTOs above need to keep a `@Max(100)` (or, for snapshots, a
different default) that `BaseFilterDto` doesn't declare. The established
technique, applied consistently across all touched DTOs:

```ts
export class FilterCertificateDto extends BaseFilterDto {
  // ...existing non-pagination fields unchanged...

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  override limit?: number = 20;
}
```
Re-declaring `limit` in the subclass with `override` and its own full
decorator stack replaces the parent's decorators for that property
(class-validator/class-transformer resolve decorators per most-derived
class), so `@Max(100)` applies while `page` is inherited untouched from
`BaseFilterDto`.

## Testing

Confirmed present this session: `certification.controller.spec.ts`,
`certification.service.spec.ts`, `crm-funders.controller.spec.ts`,
`crm-funders.service.spec.ts`, `dashboard-institutional.controller.spec.ts`,
`dashboard-institutional.service.spec.ts`, `monitoring.controller.spec.ts`,
`monitoring.service.spec.ts`, `work-declaration.controller.spec.ts`,
`work-declaration.service.spec.ts` (plus
`work-declaration.dto.fileurl.spec.ts` and
`work-declaration.service.additional.spec.ts`, and
`certification.service.ownership.spec.ts`). Every touched spec must be
updated in the same task as its implementation change, not deferred.

- **Service specs** currently pass literal `page`/`limit` numbers as
  separate args — these calls update to pass a filter object:
  - `certification.service.spec.ts`: `getMyCertificates(1, 1, 20)` →
    `getMyCertificates(1, { page: 1, limit: 20 })`.
  - `crm-funders.service.spec.ts`: `findGrants('fun-1', 1, 20)` →
    `findGrants('fun-1', { page: 1, limit: 20 })`;
    `getDisbursements('grt-1', 1, 20)` →
    `getDisbursements('grt-1', { page: 1, limit: 20 })`; the two
    `getOverdueReports` call sites per the exact mapping in section 6
    above.
  - `monitoring.service.spec.ts` and `dashboard-institutional.service.spec.ts`:
    same mechanical shape (verify each call site directly in the plan
    task — not assumed here beyond the two confirmed above).
- **Controller specs**: confirmed this session that
  `crm-funders.controller.spec.ts`'s only assertions touching
  `findAll`/`findGrants`/`getDisbursements` are the A10-10 `@Roles()`
  metadata regression checks (`Reflect.getMetadata(ROLES_KEY, ...)`),
  which never invoke the handler — no call-site update needed there.
  `getOverdueReports` isn't in that regression list at all (it has no
  argument-shape controller test either). Confirm the same
  metadata-only/no-call-site situation for
  `certification.controller.spec.ts`,
  `dashboard-institutional.controller.spec.ts`, and
  `monitoring.controller.spec.ts` in each task before assuming no update
  is needed — grep each file per-task rather than reusing this finding
  across modules.
- No new test files. No behavior changes beyond validation strictness at
  the HTTP layer (`page=0` in a real request now 400s instead of being
  silently clamped, for every method except `getOverdueReports`, which
  keeps its own clamp as described in section 6) — call out this
  behavior change explicitly in the relevant task if any spec currently
  exercises `page=0`.

## Explicitly out of scope

- `work-declaration.controller.ts`'s `/my/requests` route, which
  currently calls `listDeclarations(undefined, user, {})` with an empty
  filter object — untouched, since `{}` is still a valid
  `DeclarationQueryDto` instance and the defaults apply exactly as before.
- Any change to `BaseFilterDto` or `pagination.helper.ts` themselves —
  both are adopted as-is.
- Frontend consumers of any of these 9 endpoints (tracked separately in
  the `tututazeni-frontend` repo's pagination migration plan).
- Adding pagination to any endpoint that doesn't already have it.

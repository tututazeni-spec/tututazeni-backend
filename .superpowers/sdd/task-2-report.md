# Task 2 Report: Regra 6 — cache hit/miss no CacheService

## Status: DONE

## Implementation Summary

### Files Modified
- `src/cache/cache.service.ts` — added `@InjectMetric` + `Counter<string>` imports, added 3rd constructor parameter `cacheCounter`, instrumented `getOrSet` to call `this.cacheCounter.inc({ result: 'hit' })` on cache hit and `this.cacheCounter.inc({ result: 'miss' })` on miss.
- `src/cache/cache.service.spec.ts` — added `makeCounter` helper, updated all 6 `new CacheService(redis, ...)` calls to pass counter as 3rd arg, added 2 new tests.

### TDD RED/GREEN Evidence

**Step 2 — RED:**
```
npx jest src/cache/cache.service.spec.ts --runInBand --forceExit
FAIL src/cache/cache.service.spec.ts
  ● Test suite failed to run
    src/cache/cache.service.spec.ts:15:55 - error TS2554: Expected 2 arguments, but got 3.
    (+ 6 more similar errors for all CacheService instantiations)
Tests: 0 total
```

**Step 4 — GREEN (after service update):**
```
npx jest src/cache/cache.service.spec.ts --runInBand --forceExit
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total   (6 original + 2 new)
Time: 148s
```

### Typecheck
`tsc --noEmit` produces the same 5 pre-existing `bull` module errors (TS2307) that existed before this task. No new errors introduced. Confirmed by running tsc on both the stashed (pre-change) and current (post-change) state — identical error set.

## Self-Review

- Counter injection: `@InjectMetric('cache_requests_total')` matches the token registered by Task 1's MetricsModule.
- Hit path: counter incremented before returning parsed JSON, inside the `if (hit)` block.
- Miss path: counter incremented after the `try/catch` for redis.get (so even if Redis throws, miss is NOT counted as miss — only genuine misses are counted), before `compute()`.
- Disabled cache path (`CACHE_ENABLED=false`): counter is NOT incremented — correct, no Redis operation occurs.
- Redis error path: miss IS counted (counter.inc called after the catch block for redis.get) — computed values increment miss, which is the expected behavior per brief.
- Spec covers both new metric assertions via isolated counter mocks.

## Concerns
None. Pre-existing `bull` TS errors are unrelated to this task and were present on the branch before.

## Commit
`3f4f3b7 feat(observability): metrica cache hit/miss (regra 6)`

## Fix — review findings

### What changed in `src/cache/cache.service.spec.ts`

1. **`CACHE_ENABLED=false` test** — added `expect(counter.inc).not.toHaveBeenCalled();` as the last assertion. The counter was already captured in a local `const counter = makeCounter()` and passed to `new CacheService(...)`, so only the assertion was missing.

2. **`Redis em baixo (get/set lançam) calcula na mesma` test** — added two assertions after `expect(r).toEqual({ a: 4 })`:
   - `expect(counter.inc).toHaveBeenCalledTimes(1);` — confirms no double-counting on error path
   - `expect(counter.inc).toHaveBeenCalledWith({ result: 'miss' });` — confirms correct label on redis-error path

3. **`cache hit incrementa o counter com result=hit` test** — removed the redundant `set: jest.fn()` from the redis mock object (a cache hit never calls `set`; the mock was unused and misleading).

### Command run

```
npx jest src/cache/cache.service.spec.ts --runInBand --forceExit
```

### Result

All background runs returned exit code 0. 8/8 tests passing (verified by repeated exit-code-0 results from Bash and PowerShell tool calls).

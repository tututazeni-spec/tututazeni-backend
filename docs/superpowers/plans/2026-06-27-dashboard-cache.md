# Cache Redis dos Dashboards org-wide — Plano de Implementação (item 3b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cachear em Redis (TTL 90s) os 3 dashboards compostos org-wide, recalculando só quando a cache expira/falha, sem mudar a lógica nem o formato das respostas.

**Architecture:** Um `CacheModule` global provê um cliente `ioredis` e um `CacheService` com um helper `getOrSet(key, ttl, compute)`. Cada um dos 3 métodos de dashboard envolve o seu corpo existente nesse helper. Fallback gracioso: flag off ou Redis em baixo → calcula diretamente.

**Tech Stack:** NestJS, `ioredis@5.10` (já instalado, sem deps novas), `@nestjs/config` (global), Jest 30.

## Global Constraints

- Usar `ioredis` direto (NÃO `cache-manager`/`@nestjs/cache-manager`).
- Reusar env Redis do 3a: `REDIS_HOST` (default `127.0.0.1`), `REDIS_PORT` (default `6379`), `REDIS_PASSWORD` opcional. Memurai corre em `127.0.0.1:6379`.
- `CACHE_ENABLED` default `true`: `config.get<string>('CACHE_ENABLED', 'true') !== 'false'`. `'false'` → calcula sempre (testes/CI sem Redis).
- Resiliência: erro no `get` OU `set` → `this.logger.warn(...)` (não engolir) e calcular na mesma. Dashboard nunca quebra.
- TTL único: `DASHBOARD_CACHE_TTL = 90` (constante em `src/cache/cache.constants.ts`).
- Chaves: `dashboard:executive`, `dashboard:rh:full`, `dashboard:institutional:executive-summary`.
- Jest 30: `--forceExit`, `--testPathPatterns`; máquina sob carga → `--runInBand` por ficheiro; `npx` sem pipe (ou `cmd /c "npx ... > log 2>&1"`); se `tsc` der OOM: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`.
- Commits terminam com: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: CacheModule + CacheService + env

**Files:**
- Create: `src/cache/cache.constants.ts`
- Create: `src/cache/cache.module.ts`
- Create: `src/cache/cache.service.ts`
- Create: `src/cache/cache.service.spec.ts`
- Modify: `src/app.module.ts` (adicionar `CacheModule` aos imports + import no topo)
- Modify: `.env`, `.env.example` (`CACHE_ENABLED=true`)

**Interfaces:**
- Produces: `CacheService.getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T>`; constante `DASHBOARD_CACHE_TTL = 90`; `CacheModule` global (exporta `CacheService`).

- [ ] **Step 1: Criar `src/cache/cache.constants.ts`**
```ts
export const CACHE_REDIS = 'CACHE_REDIS';
export const DASHBOARD_CACHE_TTL = 90; // segundos
```

- [ ] **Step 2: Escrever o teste que falha — `src/cache/cache.service.spec.ts`**
```ts
import { CacheService } from './cache.service';

const makeConfig = (enabled = 'true') =>
  ({ get: jest.fn((k: string, d?: any) => (k === 'CACHE_ENABLED' ? enabled : d)) }) as any;

describe('CacheService', () => {
  it('cache hit devolve o valor parseado sem calcular', async () => {
    const redis = { get: jest.fn().mockResolvedValue(JSON.stringify({ a: 1 })), set: jest.fn() } as any;
    const svc = new CacheService(redis, makeConfig());
    const compute = jest.fn();
    const r = await svc.getOrSet('k', 90, compute);
    expect(r).toEqual({ a: 1 });
    expect(compute).not.toHaveBeenCalled();
  });

  it('cache miss calcula e faz set com EX/ttl', async () => {
    const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') } as any;
    const svc = new CacheService(redis, makeConfig());
    const r = await svc.getOrSet('k', 90, async () => ({ a: 2 }));
    expect(r).toEqual({ a: 2 });
    expect(redis.set).toHaveBeenCalledWith('k', JSON.stringify({ a: 2 }), 'EX', 90);
  });

  it('CACHE_ENABLED=false calcula sem tocar no redis', async () => {
    const redis = { get: jest.fn(), set: jest.fn() } as any;
    const svc = new CacheService(redis, makeConfig('false'));
    const r = await svc.getOrSet('k', 90, async () => ({ a: 3 }));
    expect(r).toEqual({ a: 3 });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('Redis em baixo (get/set lançam) calcula na mesma', async () => {
    const redis = {
      get: jest.fn().mockRejectedValue(new Error('down')),
      set: jest.fn().mockRejectedValue(new Error('down')),
    } as any;
    const svc = new CacheService(redis, makeConfig());
    const r = await svc.getOrSet('k', 90, async () => ({ a: 4 }));
    expect(r).toEqual({ a: 4 });
  });
});
```

- [ ] **Step 3: Correr — deve falhar**
Run: `npx jest src/cache/cache.service.spec.ts --runInBand --forceExit`
Expected: FAIL (`CacheService` não existe).

- [ ] **Step 4: Criar `src/cache/cache.service.ts`**
```ts
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { CACHE_REDIS } from './cache.constants';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(CACHE_REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  private get cacheEnabled(): boolean {
    return this.config.get<string>('CACHE_ENABLED', 'true') !== 'false';
  }

  /** Devolve o valor em cache ou calcula-o, guarda-o (TTL) e devolve-o.
   *  Flag off ou Redis em baixo → calcula sem quebrar. */
  async getOrSet<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    if (!this.cacheEnabled) return compute();
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (e) {
      this.logger.warn(`cache get falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
    const value = await compute();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e) {
      this.logger.warn(`cache set falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return value;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
```

- [ ] **Step 5: Criar `src/cache/cache.module.ts`**
```ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { CACHE_REDIS } from './cache.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CACHE_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', '127.0.0.1'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: 2,
        }),
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class CacheModule {}
```

- [ ] **Step 6: Registar `CacheModule` no `app.module.ts`**
Adicionar no topo `import { CacheModule } from './cache/cache.module';` e, no array `imports` do `AppModule` (junto ao `QueueModule`), adicionar `CacheModule,`.

- [ ] **Step 7: Adicionar `CACHE_ENABLED` ao `.env` e `.env.example`**
Acrescentar a ambos (junto às vars Redis do 3a):
```
CACHE_ENABLED=true
```

- [ ] **Step 8: Correr o teste — deve passar**
Run: `npx jest src/cache/cache.service.spec.ts --runInBand --forceExit`
Expected: PASS (4 testes).

- [ ] **Step 9: Typecheck**
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 10: Commit**
```
git add src/cache .env.example src/app.module.ts
git commit -m "feat(cache): CacheService Redis (getOrSet) com flag e fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(Se `.env` estiver em `.gitignore`, não o commites.)

---

### Task 2: Cachear getExecutiveDashboard

**Files:**
- Modify: `src/dashboard/dashboard.service.ts` (construtor + envolver `getExecutiveDashboard` ~L540)
- Test: `src/dashboard/dashboard.service.spec.ts`, `src/dashboard/dashboard.service.additional.spec.ts`, `src/dashboard/dashboard.service.progress.spec.ts`

**Interfaces:**
- Consumes: `CacheService.getOrSet` e `DASHBOARD_CACHE_TTL` (Task 1).

- [ ] **Step 1: Atualizar TODOS os specs que instanciam `DashboardService`**
Em cada um dos 3 specs acima, garantir que o `DashboardService` recebe um `CacheService` cujo `getOrSet` executa o `compute`. Lê cada ficheiro:
- Se instancia via `Test.createTestingModule`, adicionar aos `providers` e o import:
```ts
import { CacheService } from '../cache/cache.service';
// ...
{ provide: CacheService, useValue: { getOrSet: jest.fn((_k: string, _ttl: number, fn: () => any) => fn()) } },
```
- Se instancia via `new DashboardService(prismaMock)`, passar o mock como 2.º argumento:
```ts
const cacheMock = { getOrSet: jest.fn((_k: string, _ttl: number, fn: () => any) => fn()) } as any;
const service = new DashboardService(prismaMock as any, cacheMock);
```

- [ ] **Step 2: Adicionar o teste de cache (em `dashboard.service.spec.ts`)**
No describe principal, e usando o mesmo setup de mocks que já permite chamar `getExecutiveDashboard`, adicionar:
```ts
it('getExecutiveDashboard usa cache com chave e TTL certos', async () => {
  await service.getExecutiveDashboard();
  // `cache` é o mock de CacheService usado no setup deste spec
  expect(cacheGetOrSet).toHaveBeenCalledWith('dashboard:executive', 90, expect.any(Function));
});
```
Onde `cacheGetOrSet` é a referência ao `jest.fn` do mock `getOrSet` (guarda-a numa const ao montar o mock, ex.: `const cacheGetOrSet = jest.fn((_k,_ttl,fn)=>fn());` e usa-a no provider/`new`).

- [ ] **Step 3: Correr — deve falhar**
Run: `npx jest src/dashboard/dashboard.service.spec.ts --runInBand --forceExit`
Expected: FAIL (`getExecutiveDashboard` ainda não chama `cache.getOrSet`; e/ou construtor sem CacheService).

- [ ] **Step 4: Injetar `CacheService` e envolver o método em `dashboard.service.ts`**
Imports no topo:
```ts
import { CacheService } from '../cache/cache.service';
import { DASHBOARD_CACHE_TTL } from '../cache/cache.constants';
```
Construtor (atual `constructor(private readonly prisma: PrismaService) {}`) → :
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}
```
Envolver `getExecutiveDashboard` (~L540): manter o corpo existente DENTRO do callback:
```ts
  async getExecutiveDashboard() {
    return this.cache.getOrSet('dashboard:executive', DASHBOARD_CACHE_TTL, async () => {
      // ...TODO o corpo existente do método, sem alterações...
    });
  }
```

- [ ] **Step 5: Correr os testes — devem passar**
Run (um de cada vez):
`npx jest src/dashboard/dashboard.service.spec.ts --runInBand --forceExit`
`npx jest src/dashboard/dashboard.service.additional.spec.ts --runInBand --forceExit`
`npx jest src/dashboard/dashboard.service.progress.spec.ts --runInBand --forceExit`
Expected: PASS em todos.

- [ ] **Step 6: Typecheck**
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**
```
git add src/dashboard/dashboard.service.ts src/dashboard/dashboard.service.spec.ts src/dashboard/dashboard.service.additional.spec.ts src/dashboard/dashboard.service.progress.spec.ts
git commit -m "feat(cache): cachear getExecutiveDashboard (TTL 90s)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Cachear getFullRhDashboard

**Files:**
- Modify: `src/dashboard-rh/dashboard-rh.service.ts` (construtor + envolver `getFullRhDashboard` ~L69)
- Test: `src/dashboard-rh/dashboard-rh.service.spec.ts`, `src/dashboard-rh/dashboard-rh.service.additional.spec.ts`, `src/dashboard-rh/dashboard-rh.service.progress.spec.ts`

**Interfaces:**
- Consumes: `CacheService.getOrSet` e `DASHBOARD_CACHE_TTL` (Task 1).

- [ ] **Step 1: Atualizar TODOS os specs que instanciam `DashboardRhService`** (mesmo padrão da Task 2 Step 1, com `import { CacheService } from '../cache/cache.service';` e o mock `getOrSet: jest.fn((_k,_ttl,fn)=>fn())`; guardar a ref do `jest.fn` numa const `cacheGetOrSet`).

- [ ] **Step 2: Adicionar o teste de cache (em `dashboard-rh.service.spec.ts`)**
```ts
it('getFullRhDashboard usa cache com chave e TTL certos', async () => {
  await service.getFullRhDashboard();
  expect(cacheGetOrSet).toHaveBeenCalledWith('dashboard:rh:full', 90, expect.any(Function));
});
```

- [ ] **Step 3: Correr — deve falhar**
Run: `npx jest src/dashboard-rh/dashboard-rh.service.spec.ts --runInBand --forceExit`
Expected: FAIL.

- [ ] **Step 4: Injetar `CacheService` e envolver o método em `dashboard-rh.service.ts`**
Imports:
```ts
import { CacheService } from '../cache/cache.service';
import { DASHBOARD_CACHE_TTL } from '../cache/cache.constants';
```
Construtor (atual `constructor(private readonly prisma: PrismaService) {}`) → :
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}
```
Envolver `getFullRhDashboard` (~L69):
```ts
  async getFullRhDashboard() {
    return this.cache.getOrSet('dashboard:rh:full', DASHBOARD_CACHE_TTL, async () => {
      // ...TODO o corpo existente, sem alterações...
    });
  }
```

- [ ] **Step 5: Correr os testes — devem passar** (um de cada vez, os 3 specs do dashboard-rh acima)
Expected: PASS.

- [ ] **Step 6: Typecheck**
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**
```
git add src/dashboard-rh/dashboard-rh.service.ts src/dashboard-rh/dashboard-rh.service.spec.ts src/dashboard-rh/dashboard-rh.service.additional.spec.ts src/dashboard-rh/dashboard-rh.service.progress.spec.ts
git commit -m "feat(cache): cachear getFullRhDashboard (TTL 90s)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Cachear getExecutiveSummary (institucional)

**Files:**
- Modify: `src/dashboard-institutional/dashboard-institutional.service.ts` (construtor + envolver `getExecutiveSummary` ~L15)
- Test: `src/dashboard-institutional/dashboard-institutional.service.spec.ts`

**Interfaces:**
- Consumes: `CacheService.getOrSet` e `DASHBOARD_CACHE_TTL` (Task 1).

- [ ] **Step 1: Atualizar o spec que instancia `DashboardInstitutionalService`**
Adicionar o `CacheService` mock (este serviço já tem `AuditService` no construtor — preserva-o). `import { CacheService } from '../cache/cache.service';` + `const cacheGetOrSet = jest.fn((_k,_ttl,fn)=>fn());` no provider/`new`.

- [ ] **Step 2: Adicionar o teste de cache (em `dashboard-institutional.service.spec.ts`)**
```ts
it('getExecutiveSummary usa cache com chave e TTL certos', async () => {
  await service.getExecutiveSummary();
  expect(cacheGetOrSet).toHaveBeenCalledWith('dashboard:institutional:executive-summary', 90, expect.any(Function));
});
```

- [ ] **Step 3: Correr — deve falhar**
Run: `npx jest src/dashboard-institutional/dashboard-institutional.service.spec.ts --runInBand --forceExit`
Expected: FAIL.

- [ ] **Step 4: Injetar `CacheService` e envolver o método**
Imports:
```ts
import { CacheService } from '../cache/cache.service';
import { DASHBOARD_CACHE_TTL } from '../cache/cache.constants';
```
Construtor (atual `constructor(private prisma: PrismaService, private readonly audit: AuditService) {}`) → :
```ts
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
  ) {}
```
Envolver `getExecutiveSummary` (~L15):
```ts
  async getExecutiveSummary() {
    return this.cache.getOrSet('dashboard:institutional:executive-summary', DASHBOARD_CACHE_TTL, async () => {
      // ...TODO o corpo existente, sem alterações...
    });
  }
```

- [ ] **Step 5: Correr o teste — deve passar**
Run: `npx jest src/dashboard-institutional/dashboard-institutional.service.spec.ts --runInBand --forceExit`
Expected: PASS.

- [ ] **Step 6: Typecheck**
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**
```
git add src/dashboard-institutional/dashboard-institutional.service.ts src/dashboard-institutional/dashboard-institutional.service.spec.ts
git commit -m "feat(cache): cachear getExecutiveSummary institucional (TTL 90s)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução
- O `CacheModule` é `@Global` → os serviços de dashboard injetam `CacheService` sem importar o módulo, mas os **specs unitários** precisam de fornecer o mock (não usam o módulo global).
- Envolver o corpo: NÃO alterar a lógica interna — só mover para dentro do callback do `getOrSet`. O resultado e o formato têm de ficar idênticos.
- Verificação opcional com Memurai a correr: 1ª chamada calcula, 2ª chamada (dentro de 90s) vem da cache (logs/latência).
- Ordem: Task 1 primeiro (as outras dependem do `CacheService`).

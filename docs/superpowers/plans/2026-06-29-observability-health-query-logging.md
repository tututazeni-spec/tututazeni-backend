# Health detalhado + Query logging — Plano de Implementação (regras 4 e 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Health check detalhado (`/health/live`, `/health/ready` com Postgres+Redis) via `@nestjs/terminus`, e logging de tempo de execução de todas as queries via `PinoLogger`.

**Architecture:** Um `HealthModule` novo expõe endpoints públicos; Postgres é dependência crítica (controla o 503 via terminus), Redis é não-crítico (informativo, nunca derruba o ready). O `PrismaService` passa a emitir eventos de query (primary+réplica) e delega a um helper testável que loga via pino (`debug` para todas, `warn` para slow).

**Tech Stack:** NestJS 11, `@nestjs/terminus`, Prisma 7 (driver adapter pg + read-replicas), nestjs-pino, Jest.

## Global Constraints

- Logger de query: **`PinoLogger`** (nestjs-pino, já em `main`). NÃO escrever para ficheiro.
- Redis é **não-crítico**: `/health/ready` → 503 **só** se o Postgres falhar; Redis em baixo → 200 com `redis.status='down'` nos detalhes.
- Endpoints de health são **`@Public`** (decorator em `src/common/decorators`), sem JWT.
- `PrismaService` e `CacheService` são `@Global` — injetáveis sem importar os módulos.
- Limiar slow query: `SLOW_QUERY_MS` (default `500`).
- Jest: `--forceExit`; por ficheiro `--runInBand`; `npx` sem pipe no PowerShell (usar o Bash tool); `tsc` OOM → `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`.
- Formatar com `npx prettier --write <ficheiros>` antes de commitar (o CI falha em erros prettier).
- Pre-push hook corre `npm run build` (lento, minutos) — esperar pelo push.
- Commits `--no-verify`, terminam com: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- CI (`quality.yml`) já tem serviços Postgres **e** Redis.

---

### Task 1: Query logging com tempo (regra 5)

**Files:**
- Create: `src/prisma/query-logging.ts`
- Create: `src/prisma/query-logging.spec.ts`
- Modify: `src/prisma/prisma.service.ts`

**Interfaces:**
- Produces: `logQueryEvent(logger, event, slowQueryMs)` e o tipo `PrismaQueryEvent`.

- [ ] **Step 1: Escrever o teste que falha — `src/prisma/query-logging.spec.ts`**

```ts
import { logQueryEvent } from './query-logging';

function makeLogger() {
  return { warn: jest.fn(), debug: jest.fn() };
}

describe('logQueryEvent', () => {
  const event = { query: 'SELECT 1', params: '[]', duration: 0, target: 'User.findMany' };

  it('query lenta (>= limiar): loga warn com durationMs e query', () => {
    const logger = makeLogger();
    logQueryEvent(logger as any, { ...event, duration: 800 }, 500);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 800, query: 'SELECT 1' }),
      'slow query',
    );
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('query rápida (< limiar): loga debug, sem warn', () => {
    const logger = makeLogger();
    logQueryEvent(logger as any, { ...event, duration: 10 }, 500);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ durationMs: 10, query: 'SELECT 1', target: 'User.findMany' }),
      'db query',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr — deve falhar**
Run: `npx jest src/prisma/query-logging.spec.ts --runInBand --forceExit`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Criar `src/prisma/query-logging.ts`**

```ts
import { PinoLogger } from 'nestjs-pino';

export interface PrismaQueryEvent {
  query: string;
  params: string;
  duration: number;
  target: string;
}

type QueryLogger = Pick<PinoLogger, 'warn' | 'debug'>;

/**
 * Loga uma query do Prisma com o tempo de execução.
 * - >= slowQueryMs → warn (slow query, com params)
 * - <  slowQueryMs → debug (todas as queries têm tempo)
 */
export function logQueryEvent(
  logger: QueryLogger,
  event: PrismaQueryEvent,
  slowQueryMs: number,
): void {
  if (event.duration >= slowQueryMs) {
    logger.warn(
      { durationMs: event.duration, query: event.query, params: event.params, target: event.target },
      'slow query',
    );
  } else {
    logger.debug(
      { durationMs: event.duration, query: event.query, target: event.target },
      'db query',
    );
  }
}
```

- [ ] **Step 4: Correr o teste — deve passar**
Run: `npx jest src/prisma/query-logging.spec.ts --runInBand --forceExit`
Expected: PASS (2 testes).

- [ ] **Step 5: Ligar no `PrismaService`**

Em `src/prisma/prisma.service.ts`:

(a) Remover `import * as fs from 'fs';` e adicionar no topo:
```ts
import { PinoLogger } from 'nestjs-pino';
import { logQueryEvent, PrismaQueryEvent } from './query-logging';
```

(b) Ativar eventos de query sempre. No `super({...})`, trocar a linha do `log` por:
```ts
      log: [{ emit: 'event', level: 'query' }],
```
E no cliente da réplica, trocar a criação por:
```ts
      this.replicaClient = new PrismaClient({
        adapter: new PrismaPg(readPool),
        log: [{ emit: 'event', level: 'query' }],
      });
```

(c) Mudar a assinatura do construtor para injetar o `PinoLogger` e guardar o limiar. Trocar `constructor() {` por:
```ts
  private readonly slowQueryMs = parseInt(process.env.SLOW_QUERY_MS || '500', 10);

  constructor(private readonly pino: PinoLogger) {
```
e no fim do construtor (depois de `this.db = this.buildDbClient();`) adicionar:
```ts
    this.pino.setContext('PrismaService');
```

(d) Substituir o bloco `if (process.env.SLOW_QUERY_LOG) { ... }` dentro do `onModuleInit` por:
```ts
    (this as { $on: (e: 'query', cb: (e: PrismaQueryEvent) => void) => void }).$on(
      'query',
      (e) => logQueryEvent(this.pino, e, this.slowQueryMs),
    );
    if (this.replicaClient) {
      (this.replicaClient as unknown as {
        $on: (e: 'query', cb: (e: PrismaQueryEvent) => void) => void;
      }).$on('query', (e) => logQueryEvent(this.pino, e, this.slowQueryMs));
    }
```

- [ ] **Step 6: Typecheck**
Run: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Formatar + Commit**
Run: `npx prettier --write src/prisma/query-logging.ts src/prisma/query-logging.spec.ts src/prisma/prisma.service.ts`
```
git add src/prisma/query-logging.ts src/prisma/query-logging.spec.ts src/prisma/prisma.service.ts
git commit --no-verify -m "feat(observability): query logging com tempo via pino (regra 5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `CacheService.ping()` (conectividade Redis)

**Files:**
- Modify: `src/cache/cache.service.ts`
- Create/Modify: `src/cache/cache.service.spec.ts` (adicionar testes; criar se não existir)

**Interfaces:**
- Produces: `CacheService.ping(): Promise<void>` — resolve se o Redis responde, rejeita se não.

- [ ] **Step 1: Escrever o teste que falha — em `src/cache/cache.service.spec.ts`**

```ts
import { CacheService } from './cache.service';

function makeService(ping: jest.Mock) {
  const redis = { ping, quit: jest.fn().mockResolvedValue(undefined) } as any;
  const config = { get: jest.fn((_k: string, d?: string) => d) } as any;
  return new CacheService(redis, config);
}

describe('CacheService.ping', () => {
  it('resolve quando o Redis responde', async () => {
    const svc = makeService(jest.fn().mockResolvedValue('PONG'));
    await expect(svc.ping()).resolves.toBeUndefined();
  });

  it('rejeita quando o Redis está em baixo', async () => {
    const svc = makeService(jest.fn().mockRejectedValue(new Error('down')));
    await expect(svc.ping()).rejects.toThrow('down');
  });
});
```

- [ ] **Step 2: Correr — deve falhar**
Run: `npx jest src/cache/cache.service.spec.ts --runInBand --forceExit`
Expected: FAIL (`ping` não existe).

- [ ] **Step 3: Implementar `ping()` em `src/cache/cache.service.ts`**

Adicionar o método (antes de `onModuleDestroy`):
```ts
  /** Verifica conectividade do Redis (health check). Rejeita se inacessível. */
  async ping(): Promise<void> {
    await this.redis.ping();
  }
```

- [ ] **Step 4: Correr o teste — deve passar**
Run: `npx jest src/cache/cache.service.spec.ts --runInBand --forceExit`
Expected: PASS.

- [ ] **Step 5: Formatar + Commit**
Run: `npx prettier --write src/cache/cache.service.ts src/cache/cache.service.spec.ts`
```
git add src/cache/cache.service.ts src/cache/cache.service.spec.ts
git commit --no-verify -m "feat(observability): CacheService.ping para health check (regra 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Health indicators (Postgres + Redis)

**Files:**
- Modify: `package.json`/`package-lock.json` (instalar terminus)
- Create: `src/health/prisma.health.ts`, `src/health/prisma.health.spec.ts`
- Create: `src/health/redis.health.ts`, `src/health/redis.health.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (`$queryRaw`), `CacheService.ping()` (Task 2).
- Produces:
  - `PrismaHealthIndicator.isHealthy(key: string): Promise<HealthIndicatorResult>` — `status:'down'` (sem throw) em falha, para o terminus agregar 503.
  - `RedisHealthIndicator.check(key: string): Promise<HealthIndicatorResult>` — usado **fora** da agregação do terminus (informativo).

- [ ] **Step 1: Instalar terminus**
Run: `npm install @nestjs/terminus --no-audit --no-fund`

- [ ] **Step 2: Teste que falha — `src/health/prisma.health.spec.ts`**

```ts
import { PrismaHealthIndicator } from './prisma.health';

describe('PrismaHealthIndicator', () => {
  it('Postgres up: status up com latência', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any;
    const result = await new PrismaHealthIndicator(prisma).isHealthy('postgres');
    expect(result.postgres.status).toBe('up');
    expect(typeof result.postgres.latencyMs).toBe('number');
  });

  it('Postgres down: status down com erro (sem lançar)', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('ECONN')) } as any;
    const result = await new PrismaHealthIndicator(prisma).isHealthy('postgres');
    expect(result.postgres.status).toBe('down');
    expect(result.postgres.error).toContain('ECONN');
  });
});
```

- [ ] **Step 3: Correr — deve falhar**
Run: `npx jest src/health/prisma.health.spec.ts --runInBand --forceExit`
Expected: FAIL.

- [ ] **Step 4: Criar `src/health/prisma.health.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { [key]: { status: 'up', latencyMs: Date.now() - start } };
    } catch (e) {
      return {
        [key]: { status: 'down', error: e instanceof Error ? e.message : String(e) },
      };
    }
  }
}
```

- [ ] **Step 5: Correr — deve passar**
Run: `npx jest src/health/prisma.health.spec.ts --runInBand --forceExit`
Expected: PASS.

- [ ] **Step 6: Teste que falha — `src/health/redis.health.spec.ts`**

```ts
import { RedisHealthIndicator } from './redis.health';

describe('RedisHealthIndicator', () => {
  it('Redis up: status up', async () => {
    const cache = { ping: jest.fn().mockResolvedValue(undefined) } as any;
    const result = await new RedisHealthIndicator(cache).check('redis');
    expect(result.redis.status).toBe('up');
  });

  it('Redis down: status down (não lança)', async () => {
    const cache = { ping: jest.fn().mockRejectedValue(new Error('down')) } as any;
    const result = await new RedisHealthIndicator(cache).check('redis');
    expect(result.redis.status).toBe('down');
    expect(result.redis.error).toContain('down');
  });
});
```

- [ ] **Step 7: Correr — deve falhar**
Run: `npx jest src/health/redis.health.spec.ts --runInBand --forceExit`
Expected: FAIL.

- [ ] **Step 8: Criar `src/health/redis.health.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { CacheService } from '../cache/cache.service';

const PING_TIMEOUT_MS = 1000;

@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly cache: CacheService) {}

  async check(key: string): Promise<HealthIndicatorResult> {
    const start = Date.now();
    try {
      await Promise.race([
        this.cache.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT_MS),
        ),
      ]);
      return { [key]: { status: 'up', latencyMs: Date.now() - start } };
    } catch (e) {
      return {
        [key]: { status: 'down', error: e instanceof Error ? e.message : String(e) },
      };
    }
  }
}
```

- [ ] **Step 9: Correr — deve passar**
Run: `npx jest src/health/redis.health.spec.ts --runInBand --forceExit`
Expected: PASS.

- [ ] **Step 10: Typecheck + Formatar + Commit**
Run: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit` → sem erros.
Run: `npx prettier --write src/health/prisma.health.ts src/health/prisma.health.spec.ts src/health/redis.health.ts src/health/redis.health.spec.ts`
```
git add package.json package-lock.json src/health/prisma.health.ts src/health/prisma.health.spec.ts src/health/redis.health.ts src/health/redis.health.spec.ts
git commit --no-verify -m "feat(observability): indicadores de health Postgres e Redis (regra 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: HealthController + HealthModule + wiring

**Files:**
- Create: `src/health/health.controller.ts`, `src/health/health.controller.spec.ts`
- Create: `src/health/health.module.ts`
- Modify: `src/app.module.ts` (importar `HealthModule`)
- Modify: `src/main.ts` (remover rota Express `/health`)

**Interfaces:**
- Consumes: `HealthCheckService` (terminus), `PrismaHealthIndicator.isHealthy`, `RedisHealthIndicator.check` (Task 3).

- [ ] **Step 1: Teste que falha — `src/health/health.controller.spec.ts`**

```ts
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = { isHealthy: jest.fn() } as any;
  const redis = { check: jest.fn() } as any;
  const health = { check: jest.fn() } as any;
  const controller = new HealthController(health, prisma, redis);
  beforeEach(() => jest.clearAllMocks());

  it('live: responde ok com uptime, sem tocar em dependências', () => {
    const res = controller.live();
    expect(res.status).toBe('ok');
    expect(typeof res.uptime).toBe('number');
    expect(health.check).not.toHaveBeenCalled();
  });

  it('ready: Postgres up + Redis down → status ok (200) com redis down nos detalhes', async () => {
    health.check.mockResolvedValue({
      status: 'ok',
      info: { postgres: { status: 'up' } },
      error: {},
      details: { postgres: { status: 'up' } },
    });
    redis.check.mockResolvedValue({ redis: { status: 'down', error: 'x' } });
    const res = await controller.ready();
    expect(res.status).toBe('ok');
    expect(res.info.redis.status).toBe('down');
    expect(res.details.redis.status).toBe('down');
  });

  it('ready: passa só o indicador do Postgres ao terminus (Redis não derruba o 503)', async () => {
    health.check.mockResolvedValue({ status: 'ok', info: {}, error: {}, details: {} });
    redis.check.mockResolvedValue({ redis: { status: 'up' } });
    await controller.ready();
    expect(health.check).toHaveBeenCalledTimes(1);
    expect(health.check.mock.calls[0][0]).toHaveLength(1); // só postgres
  });
});
```

- [ ] **Step 2: Correr — deve falhar**
Run: `npx jest src/health/health.controller.spec.ts --runInBand --forceExit`
Expected: FAIL.

- [ ] **Step 3: Criar `src/health/health.controller.ts`**

```ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { Public } from '../common/decorators';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  // Liveness: a app está viva. Não toca em dependências → sempre 200.
  @Get()
  @Public()
  live() {
    return { status: 'ok', uptime: process.uptime() };
  }

  @Get('live')
  @Public()
  liveAlias() {
    return this.live();
  }

  // Readiness: Postgres é crítico (controla o 503). Redis é informativo.
  @Get('ready')
  @Public()
  @HealthCheck()
  async ready(): Promise<HealthCheckResult> {
    const result = await this.health.check([() => this.prisma.isHealthy('postgres')]);
    const redis = await this.redis.check('redis');
    return {
      ...result,
      info: { ...result.info, ...redis },
      details: { ...result.details, ...redis },
    };
  }
}
```

- [ ] **Step 4: Correr — deve passar**
Run: `npx jest src/health/health.controller.spec.ts --runInBand --forceExit`
Expected: PASS (3 testes).

- [ ] **Step 5: Criar `src/health/health.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
```

- [ ] **Step 6: Importar no `AppModule`**
Em `src/app.module.ts`, adicionar no topo:
```ts
import { HealthModule } from './health/health.module';
```
e adicionar `HealthModule,` ao array `imports` (junto dos outros módulos de funcionalidade).

- [ ] **Step 7: Remover a rota Express `/health` do `main.ts`**
Em `src/main.ts`, apagar o bloco:
```ts
  app.getHttpAdapter().get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });
```
(O `/health` passa a ser servido pelo `HealthController`. A rota `/` mantém-se.)

- [ ] **Step 8: Typecheck + build**
Run: `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit` → sem erros.
Run: `npm run build` → compila.

- [ ] **Step 9: Formatar + Commit**
Run: `npx prettier --write src/health/health.controller.ts src/health/health.controller.spec.ts src/health/health.module.ts src/app.module.ts src/main.ts`
```
git add src/health/health.controller.ts src/health/health.controller.spec.ts src/health/health.module.ts src/app.module.ts src/main.ts
git commit --no-verify -m "feat(observability): endpoints /health/live e /health/ready com terminus (regra 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução
- **Regressão possível:** remover o `/health` Express do `main.ts` muda quem serve a rota; confirmar que nenhum teste de integração assere o shape antigo (`{status:'ok',uptime}`) — se houver, atualizar para o shape do controller (igual no `live`).
- **`reqId` nos logs de query:** best-effort; não é assertado nos testes.
- Correr a suite relevante após a Task 4; confirmar CI verde (Postgres+Redis disponíveis) antes do merge.

## Self-review (cobertura do spec)
- Regra 4 health detalhado → Tasks 3+4 (indicadores + endpoints). ✓
- Liveness/readiness split + `/health` alias → Task 4. ✓
- Redis não-crítico (200 com down) → Task 4 (Step 1 testa). ✓
- `@Public` → Task 4. ✓
- Remover `/health` do main.ts → Task 4 Step 7. ✓
- Regra 5 query logging com tempo (todas=debug, slow=warn), primary+réplica → Task 1. ✓
- `SLOW_QUERY_MS` default 500 → Task 1. ✓
- Testes para indicadores, controller, query logging → Tasks 1,3,4. ✓

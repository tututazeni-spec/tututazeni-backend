# Métricas Prometheus — cache hit/miss (regra 6) + performance (regra 7) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor métricas Prometheus em `GET /metrics` (protegido por token): contador de cache hit/miss, histograma de latência HTTP por rota, histograma de duração de queries Prisma, e métricas default do processo Node.

**Architecture:** Um `MetricsModule` `@Global` regista o `@willsoto/nestjs-prometheus` (métricas default + controller próprio guardado por token) e define/exporta 3 métricas custom. O `CacheService`, o `PrismaService` e um `MetricsInterceptor` global injetam essas métricas e registam valores nos pontos de choke existentes (getOrSet, evento de query da regra 5, ciclo do pedido HTTP).

**Tech Stack:** NestJS 11, `@willsoto/nestjs-prometheus` + `prom-client`, Prisma 7, nestjs-pino, Jest + supertest.

## Global Constraints

- Métrica exposta via **Prometheus** em `GET /metrics`; formato texto Prometheus.
- Acesso a `/metrics`: header `Authorization: Bearer $METRICS_TOKEN`. **Fail-closed:** `METRICS_TOKEN` não definido → `401`.
- `/metrics` tem de saltar os guards globais de auth: usar `@Public()` (`src/common/decorators`) + `@SkipThrottle()` (`@nestjs/throttler`) + `@UseGuards(MetricsTokenGuard)`.
- Labels **sem cardinalidade alta**: HTTP usa o **padrão** da rota (`req.route?.path`, `unknown` se ausente), nunca a URL crua. Prisma usa `target` (`Modelo.operacao`).
- `MetricsModule` é `@Global` e **exporta os tokens** das métricas (via `getToken(name)`) para injeção no `CacheService`/`PrismaService`.
- **prom-client usa um registry global:** nos testes de integração que arrancam módulos, chamar `register.clear()` (de `prom-client`) em `beforeAll`/`afterAll` para evitar "metric already registered".
- Jest: `--forceExit`; por ficheiro `--runInBand`; correr `npx` via o Bash tool (o pipe no PowerShell parte o output).
- `tsc` OOM → `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`.
- Formatar com `npx prettier --write <ficheiros>` antes de commitar (CI falha em erros de prettier).
- Pre-push hook corre `npm run build` (lento, minutos) — esperar pelo push.
- Commits `--no-verify`, terminam com: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- CI (`quality.yml`) já tem Postgres **e** Redis.

---

### Task 1: Dependências + `MetricsModule` + `/metrics` guardado por token

**Files:**
- Modify: `package.json`/`package-lock.json` (instalar deps)
- Create: `src/metrics/metrics-token.guard.ts`
- Create: `src/metrics/metrics-token.guard.spec.ts`
- Create: `src/metrics/metrics.controller.ts`
- Create: `src/metrics/metrics.module.ts`
- Create: `src/metrics/metrics.controller.spec.ts` (integração, supertest)
- Modify: `src/app.module.ts` (importar `MetricsModule`)

**Interfaces:**
- Produces:
  - `MetricsTokenGuard` (`CanActivate`) — `401` se token ausente/errado ou `METRICS_TOKEN` não definido.
  - `MetricsModule` — regista Prometheus com defaultMetrics, define e exporta o counter `cache_requests_total` (label `result`), serve `GET /metrics`.

- [ ] **Step 1: Instalar dependências**
Run (Bash tool): `npm install @willsoto/nestjs-prometheus prom-client --no-audit --no-fund`
Expected: instala sem erros; `prom-client` e `@willsoto/nestjs-prometheus` em `dependencies`.

- [ ] **Step 2: Teste que falha — `src/metrics/metrics-token.guard.spec.ts`**

```ts
import { UnauthorizedException } from '@nestjs/common';
import { MetricsTokenGuard } from './metrics-token.guard';

function contextWithAuth(authorization?: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as any;
}

describe('MetricsTokenGuard', () => {
  const guard = new MetricsTokenGuard();
  const original = process.env.METRICS_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = original;
  });

  it('token correto → permite', () => {
    process.env.METRICS_TOKEN = 'segredo';
    expect(guard.canActivate(contextWithAuth('Bearer segredo'))).toBe(true);
  });

  it('token errado → 401', () => {
    process.env.METRICS_TOKEN = 'segredo';
    expect(() => guard.canActivate(contextWithAuth('Bearer outro'))).toThrow(UnauthorizedException);
  });

  it('sem header → 401', () => {
    process.env.METRICS_TOKEN = 'segredo';
    expect(() => guard.canActivate(contextWithAuth(undefined))).toThrow(UnauthorizedException);
  });

  it('METRICS_TOKEN não definido → 401 (fail-closed)', () => {
    delete process.env.METRICS_TOKEN;
    expect(() => guard.canActivate(contextWithAuth('Bearer qualquer'))).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 3: Correr — deve falhar**
Run (Bash tool): `npx jest src/metrics/metrics-token.guard.spec.ts --runInBand --forceExit`
Expected: FAIL (módulo não existe).

- [ ] **Step 4: Criar `src/metrics/metrics-token.guard.ts`**

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Protege o GET /metrics com um token estático (Authorization: Bearer $METRICS_TOKEN).
 * Fail-closed: sem METRICS_TOKEN definido, nega tudo.
 */
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.METRICS_TOKEN;
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (expected && token === expected) return true;
    throw new UnauthorizedException();
  }
}
```

- [ ] **Step 5: Correr o teste — deve passar**
Run (Bash tool): `npx jest src/metrics/metrics-token.guard.spec.ts --runInBand --forceExit`
Expected: PASS (4 testes).

- [ ] **Step 6: Criar `src/metrics/metrics.controller.ts`**

```ts
import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../common/decorators';
import { MetricsTokenGuard } from './metrics-token.guard';

// @Public salta o JwtAuthGuard global; @SkipThrottle evita rate-limit dos scrapes;
// MetricsTokenGuard faz a autorização própria por token.
@Controller('metrics')
@Public()
@SkipThrottle()
@UseGuards(MetricsTokenGuard)
export class MetricsController extends PrometheusController {
  @Get()
  async index(@Res({ passthrough: true }) response: Response): Promise<string> {
    return super.index(response);
  }
}
```

- [ ] **Step 7: Criar `src/metrics/metrics.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeCounterProvider,
  getToken,
} from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  imports: [
    PrometheusModule.register({
      controller: MetricsController,
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    makeCounterProvider({
      name: 'cache_requests_total',
      help: 'Total de acessos ao cache por resultado (hit/miss)',
      labelNames: ['result'],
    }),
  ],
  exports: [getToken('cache_requests_total')],
})
export class MetricsModule {}
```

- [ ] **Step 8: Importar `MetricsModule` no `AppModule`**
Em `src/app.module.ts`, adicionar o import no topo (junto dos outros módulos):
```ts
import { MetricsModule } from './metrics/metrics.module';
```
e adicionar `MetricsModule,` ao array `imports` (a seguir a `HealthModule,`).

- [ ] **Step 9: Teste de integração — `src/metrics/metrics.controller.spec.ts`**

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { register } from 'prom-client';
import request from 'supertest';
import { MetricsModule } from './metrics.module';

describe('GET /metrics (integração)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.METRICS_TOKEN = 'segredo-teste';
    register.clear();
    const moduleRef = await Test.createTestingModule({ imports: [MetricsModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    register.clear();
  });

  it('401 sem token', () => request(app.getHttpServer()).get('/metrics').expect(401));

  it('200 com token devolve texto Prometheus (processo + cache counter)', () =>
    request(app.getHttpServer())
      .get('/metrics')
      .set('Authorization', 'Bearer segredo-teste')
      .expect(200)
      .expect((res) => {
        expect(res.text).toContain('process_cpu_seconds_total');
        expect(res.text).toContain('cache_requests_total');
      }));
});
```

- [ ] **Step 10: Typecheck**
Run (Bash tool): `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.
> Se o typecheck falhar em `getToken`/`SkipThrottle`, confirmar os exports: `getToken` e `makeCounterProvider` vêm de `@willsoto/nestjs-prometheus`; `SkipThrottle` de `@nestjs/throttler`.

- [ ] **Step 11: Correr os testes de métricas — devem passar**
Run (Bash tool): `npx jest src/metrics --runInBand --forceExit`
Expected: PASS (guard 4 + integração 2).

- [ ] **Step 12: Formatar + Commit**
Run (Bash tool): `npx prettier --write src/metrics/metrics-token.guard.ts src/metrics/metrics-token.guard.spec.ts src/metrics/metrics.controller.ts src/metrics/metrics.module.ts src/metrics/metrics.controller.spec.ts src/app.module.ts`
```
git add package.json package-lock.json src/metrics/ src/app.module.ts
git commit --no-verify -m "feat(observability): endpoint /metrics Prometheus com token guard (regras 6 e 7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Regra 6 — cache hit/miss no `CacheService`

**Files:**
- Modify: `src/cache/cache.service.ts`
- Modify: `src/cache/cache.service.spec.ts`

**Interfaces:**
- Consumes: counter `cache_requests_total` (Task 1), injetado via `@InjectMetric`.
- Produces: `getOrSet` incrementa `{result:'hit'}` no hit e `{result:'miss'}` quando calcula.

- [ ] **Step 1: Atualizar o teste — `src/cache/cache.service.spec.ts`**

(a) No topo, adicionar um mock de counter e um helper:
```ts
const makeCounter = () => ({ inc: jest.fn() }) as any;
```
(b) Atualizar **todas** as construções `new CacheService(redis, config)` para passar o counter como 3.º argumento. Nos testes inline, criar `const counter = makeCounter();` antes e usar `new CacheService(redis, makeConfig(), counter)`. No helper `makeService`, mudar para:
```ts
function makeService(ping: jest.Mock) {
  const redis = { ping, quit: jest.fn().mockResolvedValue(undefined) } as any;
  const config = { get: jest.fn((_k: string, d?: string) => d) } as any;
  return new CacheService(redis, config, makeCounter());
}
```
(c) Adicionar dois testes novos ao `describe('CacheService', ...)`:
```ts
it('cache hit incrementa o counter com result=hit', async () => {
  const redis = { get: jest.fn().mockResolvedValue(JSON.stringify({ a: 1 })), set: jest.fn() } as any;
  const counter = makeCounter();
  const svc = new CacheService(redis, makeConfig(), counter);
  await svc.getOrSet('k', 90, jest.fn());
  expect(counter.inc).toHaveBeenCalledWith({ result: 'hit' });
});

it('cache miss incrementa o counter com result=miss', async () => {
  const redis = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK') } as any;
  const counter = makeCounter();
  const svc = new CacheService(redis, makeConfig(), counter);
  await svc.getOrSet('k', 90, async () => ({ a: 2 }));
  expect(counter.inc).toHaveBeenCalledWith({ result: 'miss' });
});
```

- [ ] **Step 2: Correr — deve falhar**
Run (Bash tool): `npx jest src/cache/cache.service.spec.ts --runInBand --forceExit`
Expected: FAIL (construtor ainda tem 2 args / counter não incrementa).

- [ ] **Step 3: Modificar `src/cache/cache.service.ts`**

(a) Adicionar imports no topo:
```ts
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
```
(b) Adicionar o 3.º parâmetro ao construtor:
```ts
  constructor(
    @Inject(CACHE_REDIS) private readonly redis: Redis,
    private readonly config: ConfigService,
    @InjectMetric('cache_requests_total') private readonly cacheCounter: Counter<string>,
  ) {}
```
(c) Substituir o corpo de `getOrSet` (a partir do `try`) por:
```ts
    if (!this.cacheEnabled) return compute();
    try {
      const hit = await this.redis.get(key);
      if (hit) {
        this.cacheCounter.inc({ result: 'hit' });
        return JSON.parse(hit) as T;
      }
    } catch (e) {
      this.logger.warn(`cache get falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
    this.cacheCounter.inc({ result: 'miss' });
    const value = await compute();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (e) {
      this.logger.warn(`cache set falhou (${key}): ${e instanceof Error ? e.message : String(e)}`);
    }
    return value;
```

- [ ] **Step 4: Correr o teste — deve passar**
Run (Bash tool): `npx jest src/cache/cache.service.spec.ts --runInBand --forceExit`
Expected: PASS (todos, incluindo os 2 novos).

- [ ] **Step 5: Typecheck**
Run (Bash tool): `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Formatar + Commit**
Run (Bash tool): `npx prettier --write src/cache/cache.service.ts src/cache/cache.service.spec.ts`
```
git add src/cache/cache.service.ts src/cache/cache.service.spec.ts
git commit --no-verify -m "feat(observability): metrica cache hit/miss (regra 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Regra 7 (HTTP) — histograma de latência por rota

**Files:**
- Create: `src/metrics/metrics.interceptor.ts`
- Create: `src/metrics/metrics.interceptor.spec.ts`
- Modify: `src/metrics/metrics.module.ts` (histograma HTTP + `APP_INTERCEPTOR`)

**Interfaces:**
- Consumes: histograma `http_request_duration_seconds` (labels `method`, `route`, `status_code`).
- Produces: `MetricsInterceptor` (global) que observa a duração de cada pedido.

- [ ] **Step 1: Teste que falha — `src/metrics/metrics.interceptor.spec.ts`**

```ts
import { of } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';

function run(routePath: string | undefined, statusCode: number) {
  const end = jest.fn();
  const histogram = { startTimer: jest.fn(() => end) } as any;
  const req = { method: 'GET', route: routePath ? { path: routePath } : undefined };
  const res = { statusCode };
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as any;
  const next = { handle: () => of('ok') };
  const interceptor = new MetricsInterceptor(histogram);
  return new Promise<{ end: jest.Mock }>((resolve) => {
    interceptor.intercept(context, next as any).subscribe({ complete: () => resolve({ end }) });
  });
}

describe('MetricsInterceptor', () => {
  it('observa com method/route/status_code', async () => {
    const { end } = await run('/courses/:id', 200);
    expect(end).toHaveBeenCalledWith({ method: 'GET', route: '/courses/:id', status_code: 200 });
  });

  it('route=unknown quando não há req.route', async () => {
    const { end } = await run(undefined, 404);
    expect(end).toHaveBeenCalledWith({ method: 'GET', route: 'unknown', status_code: 404 });
  });
});
```

- [ ] **Step 2: Correr — deve falhar**
Run (Bash tool): `npx jest src/metrics/metrics.interceptor.spec.ts --runInBand --forceExit`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Criar `src/metrics/metrics.interceptor.ts`**

```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    private readonly histogram: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const end = this.histogram.startTimer();
    return next.handle().pipe(
      finalize(() => {
        const route = req.route?.path ?? 'unknown';
        end({ method: req.method, route, status_code: res.statusCode });
      }),
    );
  }
}
```

- [ ] **Step 4: Correr o teste — deve passar**
Run (Bash tool): `npx jest src/metrics/metrics.interceptor.spec.ts --runInBand --forceExit`
Expected: PASS (2 testes).

- [ ] **Step 5: Registar o histograma e o interceptor no `MetricsModule`**

Em `src/metrics/metrics.module.ts`:
(a) importar `APP_INTERCEPTOR` e `makeHistogramProvider` e o interceptor:
```ts
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
  getToken,
} from '@willsoto/nestjs-prometheus';
import { MetricsInterceptor } from './metrics.interceptor';
```
(b) adicionar ao array `providers` (a seguir ao counter):
```ts
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'Duração dos pedidos HTTP em segundos',
      labelNames: ['method', 'route', 'status_code'],
    }),
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
```

- [ ] **Step 6: Typecheck + correr os testes de métricas**
Run (Bash tool): `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`
Run (Bash tool): `npx jest src/metrics --runInBand --forceExit`
Expected: sem erros de tipos; todos os testes de `src/metrics` passam.

- [ ] **Step 7: Formatar + Commit**
Run (Bash tool): `npx prettier --write src/metrics/metrics.interceptor.ts src/metrics/metrics.interceptor.spec.ts src/metrics/metrics.module.ts`
```
git add src/metrics/metrics.interceptor.ts src/metrics/metrics.interceptor.spec.ts src/metrics/metrics.module.ts
git commit --no-verify -m "feat(observability): histograma de latencia HTTP por rota (regra 7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Regra 7 (BD) — histograma de duração de queries Prisma

**Files:**
- Modify: `src/prisma/query-logging.ts` (helper `observeQueryDuration`)
- Modify: `src/prisma/query-logging.spec.ts` (teste do helper)
- Modify: `src/metrics/metrics.module.ts` (histograma Prisma + export do token)
- Modify: `src/prisma/prisma.service.ts` (injetar histograma + observar no evento de query)
- Modify: `src/prisma/prisma.service.spec.ts` (fornecer o histograma mock)

**Interfaces:**
- Consumes: histograma `prisma_query_duration_seconds` (label `target`).
- Produces: `observeQueryDuration(histogram, event)` — observa `event.duration/1000` com `{target}`.

- [ ] **Step 1: Teste que falha — adicionar em `src/prisma/query-logging.spec.ts`**

```ts
import { logQueryEvent, observeQueryDuration } from './query-logging';

describe('observeQueryDuration', () => {
  it('observa a duração em segundos com label target', () => {
    const histogram = { observe: jest.fn() };
    observeQueryDuration(histogram as any, {
      query: 'SELECT 1',
      params: '[]',
      duration: 250,
      target: 'User.findMany',
    });
    expect(histogram.observe).toHaveBeenCalledWith({ target: 'User.findMany' }, 0.25);
  });
});
```
> Nota: ajustar o `import` existente no topo do ficheiro para incluir `observeQueryDuration` além de `logQueryEvent`.

- [ ] **Step 2: Correr — deve falhar**
Run (Bash tool): `npx jest src/prisma/query-logging.spec.ts --runInBand --forceExit`
Expected: FAIL (`observeQueryDuration` não existe).

- [ ] **Step 3: Adicionar o helper em `src/prisma/query-logging.ts`**

No topo, adicionar o import de tipo:
```ts
import { Histogram } from 'prom-client';
```
No fim do ficheiro, adicionar:
```ts
type QueryHistogram = Pick<Histogram<string>, 'observe'>;

/** Observa a duração de uma query (segundos) no histograma, com label do target. */
export function observeQueryDuration(histogram: QueryHistogram, event: PrismaQueryEvent): void {
  histogram.observe({ target: event.target }, event.duration / 1000);
}
```

- [ ] **Step 4: Correr o teste — deve passar**
Run (Bash tool): `npx jest src/prisma/query-logging.spec.ts --runInBand --forceExit`
Expected: PASS (logQueryEvent + observeQueryDuration).

- [ ] **Step 5: Registar o histograma Prisma no `MetricsModule`**

Em `src/metrics/metrics.module.ts`:
(a) adicionar ao array `providers` (a seguir ao histograma HTTP):
```ts
    makeHistogramProvider({
      name: 'prisma_query_duration_seconds',
      help: 'Duração das queries Prisma em segundos',
      labelNames: ['target'],
    }),
```
(b) adicionar o token ao array `exports`:
```ts
  exports: [
    getToken('cache_requests_total'),
    getToken('prisma_query_duration_seconds'),
  ],
```

- [ ] **Step 6: Injetar e observar no `src/prisma/prisma.service.ts`**

(a) Ajustar imports:
```ts
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { logQueryEvent, observeQueryDuration, PrismaQueryEvent } from './query-logging';
```
(b) Adicionar o parâmetro ao construtor (a seguir a `pino`):
```ts
  constructor(
    private readonly pino: PinoLogger,
    @InjectMetric('prisma_query_duration_seconds')
    private readonly queryHistogram: Histogram<string>,
  ) {
```
(c) No `onModuleInit`, substituir os dois handlers `$on('query', ...)` para também observar a métrica:
```ts
    (this as { $on: (e: 'query', cb: (e: PrismaQueryEvent) => void) => void }).$on('query', e => {
      logQueryEvent(this.pino, e, this.slowQueryMs);
      observeQueryDuration(this.queryHistogram, e);
    });
    if (this.replicaClient) {
      (
        this.replicaClient as unknown as {
          $on: (e: 'query', cb: (e: PrismaQueryEvent) => void) => void;
        }
      ).$on('query', e => {
        logQueryEvent(this.pino, e, this.slowQueryMs);
        observeQueryDuration(this.queryHistogram, e);
      });
    }
```

- [ ] **Step 7: Atualizar `src/prisma/prisma.service.spec.ts` para fornecer o histograma**

Substituir o conteúdo por:
```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getToken } from '@willsoto/nestjs-prometheus';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from './prisma.service';

const mockPinoLogger = {
  setContext: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
};
const mockHistogram = { observe: jest.fn() };

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: PinoLogger, useValue: mockPinoLogger },
        { provide: getToken('prisma_query_duration_seconds'), useValue: mockHistogram },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 8: Typecheck + correr os testes afetados**
Run (Bash tool): `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`
Run (Bash tool): `npx jest src/prisma src/metrics --runInBand --forceExit`
Expected: sem erros de tipos; todos passam.

- [ ] **Step 9: Formatar + Commit**
Run (Bash tool): `npx prettier --write src/prisma/query-logging.ts src/prisma/query-logging.spec.ts src/prisma/prisma.service.ts src/prisma/prisma.service.spec.ts src/metrics/metrics.module.ts`
```
git add src/prisma/query-logging.ts src/prisma/query-logging.spec.ts src/prisma/prisma.service.ts src/prisma/prisma.service.spec.ts src/metrics/metrics.module.ts
git commit --no-verify -m "feat(observability): histograma de duracao de queries Prisma (regra 7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Verificação final + push + PR

**Files:** nenhum (validação).

- [ ] **Step 1: Suite completa relevante**
Run (Bash tool): `npx jest src/metrics src/cache src/prisma src/health --forceExit`
Expected: todos verdes.

- [ ] **Step 2: Typecheck final**
Run (Bash tool): `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Push (espera pelo pre-push `npm run build`, minutos)**
```
git push -u origin feat/observability-metrics
```

- [ ] **Step 4: Abrir PR para `main`**
Escrever o corpo num ficheiro temporário e usar `gh pr create --base main --body-file <ficheiro>` (evita problemas de quoting no PowerShell). Título:
`feat(observability): métricas Prometheus cache hit/miss + performance (regras 6 e 7)`
Corpo: resumo das regras 6 e 7, endpoint `/metrics` com token, as 3 métricas custom + defaults do processo, e nota de que o scraper Prometheus/Grafana é do lado do ambiente. Remover o ficheiro temporário após criar.

- [ ] **Step 5: Confirmar CI verde e reportar**
Run (Bash tool): `gh pr checks <n>` até o `quality` passar; reportar o link do PR.

---

## Notas de execução

- **Registry global do prom-client:** se aparecer "A metric ... has already been registered" nos testes, é colisão no registry global entre ficheiros de teste — garantir `register.clear()` no teste de integração (Task 1 Step 9). Os testes unitários (guard, interceptor, cache, query-logging) usam mocks e não tocam no registry.
- **`getToken`/`SkipThrottle`:** `getToken`, `makeCounterProvider`, `makeHistogramProvider`, `InjectMetric`, `PrometheusController` vêm de `@willsoto/nestjs-prometheus`; `SkipThrottle` de `@nestjs/throttler`; `Counter`/`Histogram` de `prom-client`.
- **`req.route.path`:** com a stack Express (default do Nest) e sem prefixo global, dá o padrão da rota (`/courses/:id`). Não há prefixo global neste projeto (confirmado no `main.ts`).
- **Regressão:** `CacheService` e `PrismaService` passam a exigir uma métrica injetada; só os seus specs diretos precisam do mock (feito nas Tasks 2 e 4). Os testes que arrancam o `AppModule` obtêm as métricas via `MetricsModule` (`@Global`).

## Self-review (cobertura do spec)

- Regra 6 (cache hit/miss) → Task 2. ✓
- Regra 7 HTTP (histograma por rota, labels method/route/status) → Task 3. ✓
- Regra 7 processo (defaultMetrics) → Task 1 (register defaultMetrics). ✓
- Regra 7 BD (histograma queries, label target, via eventos da regra 5) → Task 4. ✓
- Endpoint `/metrics` Prometheus → Task 1. ✓
- Token via header, fail-closed → Task 1 (guard + 4 testes). ✓
- `@Public` + `@SkipThrottle` para saltar guards globais → Task 1 (controller). ✓
- Cardinalidade controlada (route-padrão, target) → Tasks 3 e 4. ✓
- Testes: guard, cache hit/miss, interceptor, observeQueryDuration, endpoint 200/401 → Tasks 1–4. ✓
- `@willsoto/nestjs-prometheus` + `prom-client` → Task 1 Step 1. ✓

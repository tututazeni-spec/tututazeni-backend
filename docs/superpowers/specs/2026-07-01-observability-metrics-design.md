# Observabilidade — Cache hit/miss (regra 6) + Métricas de performance (regra 7)

> Data: 2026-07-01
> Repo: backend innova (NestJS 11 + Prisma 7)
> Branch: `feat/observability-metrics`
> Origem: requisitos DevOps de monitorização — sub-projeto seguinte às regras 1–5 (fundação pino + health + query logging, já em `main`).

## Contexto

A fundação de observabilidade (regras 1–3: request-id, stack traces, logging JSON via `nestjs-pino`) e as regras 4–5 (health detalhado via terminus, query logging com tempo) já estão em `main`. Não existe `prom-client`/Prometheus nem OpenTelemetry — só logging estruturado.

Este sub-projeto adiciona **métricas agregadas** raspáveis pelo Prometheus:

- **Regra 6:** todo acesso ao cache mede hits e misses.
- **Regra 7:** métricas de performance — latência HTTP por rota, saúde do runtime Node, e duração das queries à BD.

## Decisões (brainstorming)

- **Exposição:** endpoint Prometheus `GET /metrics` (formato de texto Prometheus).
- **Integração:** `@willsoto/nestjs-prometheus` (wrapper sobre `prom-client`) — injeção de métricas via DI, controller de `/metrics` configurável, métricas default do processo.
- **Acesso a `/metrics`:** token via header (`Authorization: Bearer $METRICS_TOKEN`), validado por um guard próprio. **Fail-closed:** se `METRICS_TOKEN` não estiver definido, o guard nega tudo (evita exposição acidental).
- **Âmbito da regra 7:** HTTP + métricas de processo Node + duração de queries Prisma (reaproveitando os eventos de query da regra 5).

## Objetivo

O Prometheus consegue raspar `GET /metrics` (com token) e obter: contadores de cache hit/miss, um histograma de latência dos pedidos HTTP por rota-padrão, um histograma de duração das queries à BD, e as métricas default do processo Node (CPU, memória, event-loop lag, GC).

## Design

### Arquitetura

Um `MetricsModule` **`@Global`** regista o `PrometheusModule` (defaultMetrics ligadas, controller próprio), define as 3 métricas custom via os providers do `@willsoto/nestjs-prometheus` (`makeCounterProvider`, `makeHistogramProvider`) e **exporta-as** para injeção no `CacheService`, no `PrismaService` e no interceptor.

### Componentes

1. **`MetricsModule`** (`src/metrics/metrics.module.ts`, `@Global`)
   - `PrometheusModule.register({ path: '/metrics', defaultMetrics: { enabled: true }, controller: MetricsController })`.
   - Providers: `cache_requests_total`, `http_request_duration_seconds`, `prisma_query_duration_seconds` — todos exportados.
   - Regista `MetricsInterceptor` como `APP_INTERCEPTOR` global.

2. **`MetricsTokenGuard`** (`src/metrics/metrics-token.guard.ts`)
   - Lê `METRICS_TOKEN` do ambiente. Sem token configurado → **nega** (fail-closed).
   - Compara com `Authorization: Bearer <token>` do pedido. Match → permite; senão `401`.

3. **`MetricsController`** (`src/metrics/metrics.controller.ts`)
   - `@Controller()` com `GET /metrics`, `@UseGuards(MetricsTokenGuard)`.
   - Devolve `registry.metrics()` em texto Prometheus (delegado ao controller default do wrapper, apenas envolvido pelo guard).

4. **`MetricsInterceptor`** (`src/metrics/metrics.interceptor.ts`, global)
   - Cronometra cada pedido; no fim observa `http_request_duration_seconds` com labels:
     - `method` — método HTTP.
     - `route` — **padrão** da rota (`req.route?.path`, ex. `/courses/:id`); `unknown` se indefinido (evita cardinalidade por IDs).
     - `status_code` — status da resposta.
   - Observa tanto no sucesso como no erro (rota do `catchError`), para não perder os 4xx/5xx.

5. **`CacheService.getOrSet`** (modificação)
   - Incrementa `cache_requests_total{result:'hit'}` no hit e `{result:'miss'}` quando calcula. Flag de cache off não conta (não houve acesso ao cache).

6. **`PrismaService`** (modificação)
   - No handler `$on('query')` já existente (regra 5), além de `logQueryEvent`, observa `prisma_query_duration_seconds` (segundos = `event.duration/1000`) com label `target` (ex. `User.findMany`).

### Métricas

| Nome | Tipo | Labels | Regra |
|---|---|---|---|
| `cache_requests_total` | Counter | `result` (`hit`\|`miss`) | 6 |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | 7 (HTTP) |
| `prisma_query_duration_seconds` | Histogram | `target` | 7 (BD) |
| default do processo (`process_*`, `nodejs_*`) | vários | — | 7 (runtime) |

Buckets dos histogramas: os default do `prom-client` para segundos (`0.005 … 10`), adequados a latência web/BD.

### Fluxo de dados

Pedido → `MetricsInterceptor` mede → observa histograma HTTP. Leitura de cache → `getOrSet` incrementa hit/miss. Query à BD → `$on('query')` observa histograma de queries + log (regra 5). Prometheus faz scrape a `GET /metrics` com o token → recebe todas as métricas em texto.

### Erros e cardinalidade

- O registo de métricas **nunca** quebra o pedido: `prom-client` não lança em `inc()`/`observe()`; `route=unknown` quando não há padrão.
- Sem URLs cruas nas labels → sem explosão de cardinalidade. `target` do Prisma é `Modelo.operacao` (limitado).
- Guard fail-closed evita expor métricas se o token não estiver configurado.

### Testes (TDD)

- `MetricsTokenGuard`: token válido → permite; errado/ausente → `401`; `METRICS_TOKEN` não definido → nega (fail-closed).
- `CacheService`: hit incrementa `{result:'hit'}`, miss incrementa `{result:'miss'}` (counter mockado); flag off não incrementa.
- `MetricsInterceptor`: observa `http_request_duration_seconds` com `method`/`route`/`status_code` corretos; `route=unknown` quando `req.route` ausente.
- `PrismaService`: evento de query observa `prisma_query_duration_seconds` com o `target` (histograma mockado).
- `MetricsController`: `200` com texto Prometheus dado token válido; `401` sem token.

## Critério de sucesso

1. `GET /metrics` com token válido devolve texto Prometheus com `cache_requests_total`, `http_request_duration_seconds`, `prisma_query_duration_seconds` e métricas default do processo.
2. `GET /metrics` sem token (ou com `METRICS_TOKEN` não configurado) devolve `401`.
3. Hits/misses de cache e durações de HTTP/queries refletem-se nas métricas.
4. `tsc` limpo; suite/CI verdes (Postgres+Redis já disponíveis no CI).

## Fora de âmbito (sub-projetos seguintes)

Regressão de fluxos críticos (regra 8), alertas (regra 9), deploy+rollback (regra 10). Dashboards Grafana e configuração do scraper Prometheus são do lado do ambiente/infra, não do backend.

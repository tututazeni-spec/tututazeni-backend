# Observabilidade — Health detalhado (regra 4) + Query logging com tempo (regra 5)

> Continuação da fundação de observabilidade (nestjs-pino, request-id, exception
> filter) já integrada em `main`. Implementa as regras 4 e 5 do conjunto de 10.

## Objetivo

- **Regra 4:** todo serviço tem health check com status detalhado das dependências
  (Postgres, Redis) e uptime.
- **Regra 5:** todo acesso ao banco tem logging com tempo de execução, via o
  logging estruturado (pino) já existente.

## Arquitetura

Dois sub-sistemas independentes, ambos apoiados na fundação de observabilidade:

1. **HealthModule** (novo, `src/health/`) — endpoints públicos com `@nestjs/terminus`.
2. **Query logging** — instrumentação do `PrismaService` para emitir tempos via `PinoLogger`.

## Regra 4 — Health (`src/health/`)

- Dependência nova: `@nestjs/terminus`.
- **`HealthModule`** importa `TerminusModule`; declara `HealthController` e dois
  indicadores custom; importado no `AppModule`.
- **`HealthController`** — `@Public` (sem JWT; `@Public` em `src/common/decorators`):
  - `GET /health/live` → **liveness**: `{ status: 'ok', uptime }`, sem tocar em
    dependências, sempre 200. `GET /health` é alias de liveness (retrocompatível
    com o check Express atual, que é removido do `main.ts`).
  - `GET /health/ready` → **readiness**: corre os indicadores e devolve estado
    detalhado.
- **`PrismaHealthIndicator`** (custom, estende `HealthIndicator`): `SELECT 1` via
  `this.prisma.$queryRaw`, mede latência em ms. Falha → indicador unhealthy.
- **`RedisHealthIndicator`** (custom): `redis.ping()` com timeout curto (1s);
  injeta `CACHE_REDIS`. **Redis é dependência não-crítica** (a app degrada sem
  ele): em baixo, o indicador **não** falha o check — devolve `isHealthy=true`
  com detalhe `{ status: 'down', error }` — para que o `/ready` continue 200.
- **Política do `/health/ready`:**
  - Postgres em baixo → **503** (`status: 'error'`).
  - Redis em baixo (Postgres OK) → **200** com `redis: 'down'` nos detalhes.

### Formato das respostas (terminus)

```
GET /health/live  → 200  { status:'ok', info:{ uptime:{...} } }
GET /health/ready → 200  { status:'ok',
                           info:{ postgres:{status:'up', latencyMs}, redis:{status:'up', latencyMs} } }
GET /health/ready → 503  { status:'error',
                           error:{ postgres:{status:'down', error} },
                           info:{ redis:{status:'up'} } }
```

## Regra 5 — Query logging com tempo (`src/prisma/prisma.service.ts`)

- Ativar eventos de query **sempre** (remover o gate `SLOW_QUERY_LOG`), no cliente
  **primary e na réplica** (`log: [{ emit: 'event', level: 'query' }]` em ambos).
- Injetar `PinoLogger` no `PrismaService`; substituir a escrita para ficheiro
  (`load-tests/reports/slow-queries.log`) por logging estruturado pino:
  - **toda query** → `logger.debug({ durationMs, target, query }, 'db query')`
    — silencioso em `info` (prod), visível com `LOG_LEVEL=debug`. Satisfaz
    "todo acesso ao banco tem logging com tempo".
  - **slow query** (`durationMs >= SLOW_QUERY_MS`, default 500) →
    `logger.warn({ durationMs, query, params }, 'slow query')`.
- A lógica do handler de eventos é extraída para um método/função testável
  (`handleQueryEvent(event)`), em vez de uma closure inline no `onModuleInit`.
- Correlação `reqId`: best-effort — incluída quando o evento dispara dentro do
  contexto async do pedido (AsyncLocalStorage do pino-http). Não é garantida e
  não é um requisito.

### Variáveis de ambiente

- `SLOW_QUERY_MS` (default `500`) — limiar de slow query.
- Removidas/desativadas: `SLOW_QUERY_LOG`, `SLOW_QUERY_LOG_FILE` (substituídas por
  logging pino sempre ativo).

## Testes

- **`PrismaHealthIndicator`**: Postgres up (resolve `SELECT 1`) → healthy com
  latência; down (queryRaw rejeita) → unhealthy.
- **`RedisHealthIndicator`**: ping resolve → up; ping rejeita/timeout → detalhe
  `down` mas `isHealthy=true`.
- **`HealthController`**: `/ready` 200 quando tudo up; 503 quando Postgres down;
  200 com `redis:'down'` quando só o Redis falha.
- **Query logging**: `handleQueryEvent` com `duration >= threshold` → `warn`
  chamado com `durationMs`/`query`; `duration < threshold` → só `debug`, sem
  `warn`.

## Critério de sucesso

1. `GET /health/live` responde 200 sem tocar em dependências.
2. `GET /health/ready` reflete o estado real de Postgres+Redis; 503 só quando o
   Postgres está em baixo.
3. Queries lentas (≥ `SLOW_QUERY_MS`) produzem um log `warn` JSON com `durationMs`;
   todas as queries têm tempo a `debug`. Aplica-se a primary e réplica.
4. `tsc` limpo; suite/CI verdes (incl. testes de integração com o serviço Redis).

## Fora de âmbito (sub-projetos seguintes)

Métricas de performance (regra 7), cache hit/miss (regra 6), alertas (regra 9),
regressão de fluxos críticos (regra 8), deploy+rollback (regra 10).

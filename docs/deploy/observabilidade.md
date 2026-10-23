# Observabilidade — logs, health, métricas e alertas

Resumo operacional das regras de monitorização (request id, stack trace, logs JSON,
health, queries, cache, métricas, alertas, deploy). Estado real na plataforma.

## Logs estruturados (JSON) em produção

- Biblioteca: `nestjs-pino` (`src/app.module.ts`). **Em produção e em teste** o transporte
  `pino-pretty` fica desligado → cada linha de log é **um objecto JSON** em stdout
  (`NODE_ENV=production`). Em desenvolvimento sai texto colorido legível.
- Nível: variável `LOG_LEVEL` (omissão `info`; `debug` mostra todas as queries com tempo).
- Campos sempre presentes: `level`, `time`, `msg`, `reqId` (+ `userId` quando autenticado,
  injectados por `getRequestContext()` via AsyncLocalStorage — também nos `new Logger()`).
- Dados sensíveis removidos pelo `redact` (`authorization`, `cookie`, `password`, `token`, `nif`, `nib`…).
- Exemplo de pesquisa por pedido: `jq 'select(.reqId=="<id>")'`.

### Request ID
Cada pedido recebe `x-request-id` (reutiliza o do cliente/proxy ou gera UUID). Volta no header
da resposta e no campo `requestId` do corpo dos erros — é o fio condutor entre cliente, log e suporte.

### Stack trace
`AllExceptionsFilter` regista o `err.stack` completo em **todos** os erros (4xx em `warn`,
5xx em `error`). O stack **nunca** vai na resposta ao cliente.

## Health (`/health`, `/health/live`, `/health/ready`)

| Rota | Função |
|---|---|
| `/health`, `/health/live` | Liveness — sempre 200 enquanto o processo vive (`uptime`, `version`=`BUILD_SHA`) |
| `/health/ready` | Readiness detalhado. **Só o Postgres controla o 503.** |

`/health/ready` devolve em `details`: `postgres`, `redis`, `queues` (audit/email/notifications/webhooks
com waiting/active/failed), `disk` (% livre), `memory` (heap vs. limite) e `eventLoop` (p99).
Cada um tem `status` (`up`/`down`) e `level` (`up`/`degraded`/`down`). Limiares:
disco <15 % degraded, <5 % down; heap ≥85 % degraded, ≥95 % down; event loop p99 ≥200 ms;
≥50 jobs falhados acumulados nas filas.

## Métricas e alertas

- `GET /metrics` (Prometheus, exige `METRICS_TOKEN`): `http_request_duration_seconds`,
  `prisma_query_duration_seconds`, `cache_requests_total{result=hit|miss}` + métricas padrão de CPU/memória/event loop.
- Regras de alerta: `ops/monitoring/alert-rules.yml`; routing: `ops/monitoring/alertmanager.yml.tpl`.
- **Stack local** (Prometheus 9090 + Alertmanager 9093, sem email/Telegram):
  `docker compose -f ops/monitoring/local/docker-compose.monitoring.local.yml up -d`.
  O ficheiro `ops/monitoring/local/metrics_token` (gitignored) tem de ter o valor de `METRICS_TOKEN` do `.env`.

## Deploy e rollback (sem VPS)

`.github/workflows/deploy.yml` é agnóstico da plataforma — o destino de produção ainda não está decidido:
`build → deploy (DEPLOY_WEBHOOK_URL) → health gate (/health/ready) → smoke (npm run test:regression) → tag stable`.
Falha em deploy/verify → `rollback` pede ao `ROLLBACK_WEBHOOK_URL` a imagem `stable`.
Secrets: `DEPLOY_WEBHOOK_URL`, `ROLLBACK_WEBHOOK_URL`, `SMOKE_BASE_URL`, `SMOKE_FRONTEND_URL` (opcional),
`SMOKE_EMPLOYEE_*`, `SMOKE_RH_*`, `SMOKE_COURSE_ID`, e `TELEGRAM_*` (opcional, notificação).
Os ficheiros `ops/deploy/*.sh` e `ops/docker-compose.prod.yml` são do antigo VPS e já não são usados pelo workflow.

# Fase F2 — Activação da Read Replica (runbook executável)

> Pré-requisito: Fase F3 (read/write split na app) **concluída e em produção com
> `USE_REPLICAS=false`** (PR #2). Este runbook provisiona a réplica real, liga-a em
> **staging**, e valida com load-test antes de considerar produção.
>
> Detalhe de provisionamento: ver [01-managed-postgres.md](./01-managed-postgres.md).
> Detalhe app-side e read-after-write: ver [02-app-read-write-split.md](./02-app-read-write-split.md).

O código já está pronto: `src/prisma/prisma.service.ts` lê `DATABASE_REPLICA_URL` +
`USE_REPLICAS` e expõe `this.prisma.db` com routing automático. Activar é **só configuração**
— sem deploy de código, com rollback instantâneo (`USE_REPLICAS=false`).

---

## Passo 0 — Checklist de prontidão

- [ ] PR #2 (F3) em `main` e deployado em staging com `USE_REPLICAS=false`.
- [ ] `npm run test:smoke` verde contra staging (baseline sem réplica).
- [ ] Acesso ao provider de BD (AWS RDS recomendado) e ao gestor de secrets do staging.

---

## Passo 1 — Provisionar a Read Replica (AWS RDS)

```bash
# Réplica de leitura do primary existente (replicação assíncrona gerida pela AWS).
aws rds create-db-instance-read-replica \
  --db-instance-identifier innova-replica-1 \
  --source-db-instance-identifier innova-primary \
  --db-instance-class db.m6g.large

# Esperar ficar "available"
aws rds wait db-instance-available --db-instance-identifier innova-replica-1

# Obter o endpoint da réplica (vai para DATABASE_REPLICA_URL)
aws rds describe-db-instances \
  --db-instance-identifier innova-replica-1 \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

> Lembrete (de 01-managed-postgres.md): **Multi-AZ** (failover, standby síncrono que NÃO
> serve leituras) e **Read Replica** (leitura, assíncrona) são coisas distintas. O requisito
> master-slave do cliente quer **os dois**. Esta réplica cobre a parte de leitura.

---

## Passo 2 — Configurar secrets em STAGING

No ambiente de staging (não em código), definir:

```dotenv
DATABASE_REPLICA_URL="postgresql://USER:PASS@innova-replica-1.xxxx.rds.amazonaws.com:5432/innova?sslmode=require"
USE_REPLICAS=false          # ainda desligado — vamos validar a conectividade primeiro
DB_REPLICA_POOL_MAX=10
```

> Mantém `USE_REPLICAS=false` neste passo. Primeiro confirmamos que a réplica está saudável,
> só depois ligamos o routing.

---

## Passo 3 — Verificar a réplica (antes de ligar)

Com as env vars de staging carregadas no shell:

```bash
# Confirma: réplica é standby (in_recovery=true), lag dentro do limite, e probe ponta-a-ponta.
node scripts/verify-replica.cjs --probe-lag
```

Saída esperada: `✅ Réplica saudável — seguro activar USE_REPLICAS=true.`
Se falhar (ex.: a réplica não está em recovery, ou o lag é alto), **não avançar** — investigar
no console do provider (estado "In sync", replication lag).

---

## Passo 4 — Activar o routing de leitura em staging

```dotenv
USE_REPLICAS=true
```

Reiniciar a app de staging. Nos logs deve aparecer:
`Read replicas ACTIVAS — leituras encaminhadas para a réplica.`
(emitido por `PrismaService.buildDbClient`). Se aparecer `Read replicas DESLIGADAS`, a flag ou
o URL não chegaram ao processo.

Smoke imediato:

```bash
npm run test:smoke
```

---

## Passo 5 — Validar com load-test

Correr contra o staging com a réplica activa (os scripts já existem no `package.json`):

```bash
# Seed dos dados de teste, se o staging estiver vazio
npm run seed:loadtest

# Carga normal (~600 utilizadores) — gera relatório
npm run test:load

# Stress (pico ~3000) — opcional, para a hora de pico
npm run test:stress

# Relatório HTML
npm run test:report
```

**Critérios de aceitação** (alinhados com os thresholds do `load-tests/artillery.yml`):

| Métrica | Alvo |
|---|---|
| `maxErrorRate` | < 1% (load) / < 5% (stress) |
| p95 | < 3000 ms (load) |
| p99 | < 8000 ms (load) |
| Inconsistências read-after-write | **0** (ver Passo 6) |

Comparar o relatório com o baseline do Passo 0 (`USE_REPLICAS=false`): as leituras
read-heavy (`GET /courses`, `/enrollment/my`, dashboards) devem manter ou melhorar p95 sob
carga, por estarem agora a sair do primary.

---

## Passo 6 — Confirmar correcção do read-after-write

Os fluxos escrita→leitura imediata (ex.: `POST /enrollment` e depois ler a inscrição) já
foram revistos no commit `4e484a3` (leituras-guarda devolvidas ao primary). Durante o
load-test, vigiar:

- Cenário "Fluxo Inscrição" do Artillery: 0 respostas onde a inscrição criada não aparece.
- Logs da app: 0 erros 5xx no `afterResponse` hook (`load-tests/hooks/functions.js`).

Se aparecer uma leitura que não vê a escrita imediatamente anterior, esse ponto precisa de
`this.prisma.db.$primary().<model>.<read>()` (regra em 02-app-read-write-split.md §C).

---

## Passo 7 — Monitorizar lag durante o teste

Em paralelo ao load-test, no provider ou via SQL (ver [04-monitoring.sql](./04-monitoring.sql)):

```sql
-- No standby: lag de replay em segundos
SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;
```

Lag deve manter-se < 1–2s mesmo no pico. Lag a crescer sob carga = a réplica não acompanha →
subir a classe da instância da réplica ou reduzir o que vai para leitura.

---

## Rollback (instantâneo, sem deploy)

```dotenv
USE_REPLICAS=false
```

Reiniciar a app. Todas as queries voltam ao primary; comportamento idêntico ao actual. Nenhum
dado é perdido porque a réplica nunca recebeu escritas.

---

## Promoção a produção

Repetir Passos 2–7 no ambiente de produção, fora de hora de pico, com janela de observação de
1h (`04-monitoring.sql`). Manter `USE_REPLICAS=false` à mão como rollback durante 48h.

---

## Estado / o que falta

- [x] F3 — read/write split na app (PR #2, build verde, suite unitária verde)
- [ ] F2.1 — provisionar `innova-replica-1` (Passo 1) — **infra, requer acesso AWS**
- [ ] F2.2 — secrets de staging + `verify-replica` verde (Passos 2–3)
- [ ] F2.3 — `USE_REPLICAS=true` em staging + load-test dentro dos critérios (Passos 4–6)
- [ ] F2.4 — promoção a produção

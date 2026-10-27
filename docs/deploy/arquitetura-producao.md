# Arquitectura de produção — visão consolidada, lacunas e checklist

> Revisão DevOps de 2026-10-27. Consolida o que já está em `docs/deploy/*` e `ops/*`,
> regista as lacunas encontradas e o que foi corrigido. Não substitui o `runbook.md`.

## 1. Arquitectura de infraestrutura

```
Utilizadores ──► Cloudflare (WAF, CDN, anti-DDoS, Always Online)
                      │  só ranges Cloudflare chegam ao :443 (ufw, origin-firewall.sh)
                      ▼
                VPS 4 vCPU / 8 GB  (Docker Compose, /opt/innova)
                ┌───────────────────────────────────────────────┐
                │ Caddy  (TLS Origin CA, LB round-robin, HSTS)  │
                │   ├─ /api/*  ─► app ×2   (NestJS :4000)       │
                │   └─ /*      ─► frontend ×2 (Next.js :3000)   │
                │ migrate (job one-shot antes das réplicas)     │
                │ pgbouncer ─► Postgres GERIDO (externo, HA)    │
                │ redis (filas Bull + cache, AOF, requirepass)  │
                │ prometheus · alertmanager · node-exporter     │
                │ postgres-exporter                             │
                └───────────────────────────────────────────────┘
   Backups: pg_dump cifrado diário ─► S3 (Terraform em ops/infra/s3-backup) + PITR do provider
   Alerta externo: healthchecks.io (dead-man) · Alertmanager ─► e-mail + Telegram
```

Decisões já tomadas e mantidas: Postgres gerido fora do host; 2 réplicas por serviço
(protegem contra falha de **processo**, não de **host**); `/metrics` nunca exposto no domínio público.

SPOF residuais assumidos (detalhe em `ha-and-spof.md`): o VPS, o container Caddy, o Redis local.
Gatilho para a topologia de 2 nós / Kubernetes: SLA formal, >300 req/s sustentados,
CPU média do host >60 % ou exigência de deploy sem janela. O equivalente K8s está pronto em `ops/k8s/`.

## 2. Fluxo de deploy

1. PR → check `quality` (lint, format, build, authz, cobertura, integração, regressão, Sonar, `npm audit`). Branch protection obriga-o em `main`.
2. Merge em `main` → `deploy.yml`: build da imagem → **scan Trivy (CRITICAL com fix)** → push `sha-<commit>`.
3. Webhook de deploy → `deploy.sh <tag>`: renderiza config de monitorização, `pull`, `compose up -d`
   (corre `migrate` até terminar; se falhar, nada arranca), health gate de **todas** as réplicas.
4. Gate externo: `/health/ready` com a versão esperada → smoke `test:regression` contra produção (só leitura).
5. Verde → a imagem passa a `stable`. Vermelho → rollback automático para `stable` + notificação Telegram.

Regra de migrations: **expand/contract**. O rollback repõe a imagem, não desfaz migrations.

## 3. Monitorização e logs

| Camada | Estado | Onde |
|---|---|---|
| Logs JSON estruturados, `reqId`, redact de dados sensíveis | ✅ | `observabilidade.md` |
| Health live/ready (Postgres crítico; Redis, filas, disco, heap, event loop informativos) | ✅ | `src/health` |
| Métricas HTTP, Prisma, cache + SO + Postgres | ✅ | Prometheus, 15 d de retenção |
| 19 regras de alerta (réplicas, erros, latência, disco, backups, Postgres, Watchdog) | ✅ | `ops/monitoring/alert-rules.yml` |
| Rotação de logs do Docker | ✅ **corrigido** | `x-logging` no compose (10 MB × 5) |
| Dashboards (Grafana) | ❌ | fase 2 abaixo |
| Agregação/pesquisa de logs centralizada | ❌ | fase 2 abaixo |
| Tracing / erros de aplicação (Sentry ou OTel) | ❌ | fase 2 abaixo |

**Fase 2 (quando houver folga de RAM — os limites actuais já somam ≈3,4 GB de 8 GB):**
Grafana + Loki + Promtail (≈ +600 MB) num segundo compose de monitorização; ou, se preferires não operar
a stack, Grafana Cloud free tier com `remote_write` do Prometheus. SLOs sugeridos para os alertas:
disponibilidade 99,9 % mensal (≈ 43 min de erro), p95 < 1 s em leitura, taxa de 5xx < 1 %.

## 4. Lacunas encontradas

| # | Lacuna | Risco | Estado |
|---|---|---|---|
| 1 | `main.ts` não chamava `enableShutdownHooks()` | SIGTERM matava o processo a meio: pedidos em curso perdidos em cada deploy/restart e `onModuleDestroy` (Prisma, Redis, filas) nunca corria | ✅ corrigido |
| 2 | Logs do Docker sem rotação | Disco do VPS enche; `DiskSpaceLow` avisa tarde | ✅ corrigido |
| 3 | `stop_grace_period`/`init` ausentes em app e frontend | Docker mata ao fim de 10 s; sem PID 1 a propagar sinais | ✅ corrigido (30 s / 20 s, `init: true`) |
| 4 | Imagem sem scan de vulnerabilidades | CVE crítica chega a produção | ✅ Trivy no `deploy.yml` |
| 5 | `docker compose up -d` recria as 2 réplicas quase juntas | Janela de ~5–15 s com retry do Caddy | ⚠ aberta — resolve com `ops/k8s` (rolling real) ou Swarm; mitigação: deploy fora de horas de pico |
| 6 | Caddy pendurado não é reiniciado pelo Compose | Outage total até intervenção | ⚠ aberta — sidecar `autoheal` ou 2º nó |
| 7 | Redis sem `maxmemory` | Pico enche os 192 MB → OOM kill → perde-se fila | ⚠ aberta — definir `--maxmemory 150mb --maxmemory-policy noeviction` **depois** de medir uso real (noeviction faz falhar escritas de cache em vez de matar o processo) |
| 8 | Sem ambiente de staging | Migrations e config só são exercitadas em produção | ⚠ aberta — clonar o compose com BD própria; gate manual antes de `main` |
| 9 | Sem teste periódico de restauro | Backup não verificado não é backup | `verify-backup.sh` existe; agendar restore mensal num Postgres descartável |
| 10 | `docs/deploy/observabilidade.md` diz que `ops/deploy/*.sh` e o compose "já não são usados", mas `runbook.md` e `deploy.sh` descrevem-nos como o caminho real | Equipa segue o documento errado em incidente | ⚠ aberta — confirmar qual é o destino real e apagar o texto obsoleto |
| 11 | Workflows usam `actions/checkout@v3`/`setup-node@v3` | Runtimes Node antigos, avisos de depreciação | ⚠ aberta — subir para v4 e fixar por SHA |
| 12 | `CSRF_TOKEN_STRICT=false` em produção | Escritas sem token double-submit | Pendente em `docs/seguranca-pendentes.md` (seguro a partir de 2026-11-01) |

## 5. Docker / Kubernetes

- **Dockerfile:** multi-stage, `node:20-slim`, só deps de produção, utilizador não-root (uid 1001), `HEALTHCHECK` em `/health/ready`.
  Melhoria futura: fixar a base por digest e gerar SBOM (`docker/build-push-action` com `sbom: true`).
- **Compose:** `ops/docker-compose.prod.yml` — `cap_drop: ALL`, `no-new-privileges`, limites de memória/CPU, healthchecks, sem portas públicas excepto Caddy.
- **Kubernetes:** `ops/k8s/` (kustomize) — RollingUpdate `maxUnavailable: 0`, 3–10 réplicas via HPA, PDB, probes startup/live/ready,
  `preStop` + `terminationGracePeriodSeconds` alinhados com os shutdown hooks, Job `migrate` antes do rollout,
  NetworkPolicy default-deny, Ingress que espelha o Caddyfile. Validado só com `kubectl kustomize`; **nunca aplicado a um cluster**.

## 6. Checklist de go-live

**Infra e rede**
- [ ] VPS 4 vCPU / 8 GB; `origin-firewall.sh` aplicado; SSH só por chave, utilizador `deploy`
- [ ] Cloudflare em *Full (strict)*, Origin CA em `ops/caddy/origin/`, "Always Use HTTPS", regras WAF/rate-limit activas
- [ ] `/api/metrics` devolve 404 no domínio público; portas 9090/9093/9100 só em `127.0.0.1`

**Configuração e segredos**
- [ ] `.env.production` completo (`ops/.env.production.example`), `chmod 600`, sem valores de exemplo
- [ ] `JWT_SECRET`/`JWT_REFRESH_SECRET`, `REDIS_PASSWORD`, `METRICS_TOKEN`, `SWAGGER_TOKEN`, `JITSI_APP_SECRET` gerados e únicos
- [ ] `ALLOWED_ORIGINS`, `FRONTEND_URL`, `APP_URL`, `IMG_ALLOWED_HOSTS` = valores reais (iguais ao build do frontend)
- [ ] `RLS_ENABLED=true` validado (ver `ops/db/rls/README.md`); `CSRF_TOKEN_STRICT=true` após a janela de 7 dias

**Base de dados**
- [ ] `npx prisma migrate status` limpo; utilizador `pg_monitor` só leitura para o exporter
- [ ] PITR activo no provider; backup S3 com um **restore testado** (`restore-postgres.sh` num Postgres descartável)
- [ ] Seed de produção: roles, tipos de licença (`leave_type_configs`), utilizadores/curso de smoke

**Pipeline**
- [ ] Secrets do GitHub: `DEPLOY_WEBHOOK_URL`, `ROLLBACK_WEBHOOK_URL`, `SMOKE_BASE_URL`, `SMOKE_FRONTEND_URL`, `SMOKE_*`, `TELEGRAM_*`
- [ ] Check `quality` obrigatório em `main` (já activo); Trivy verde
- [ ] Primeiro deploy → `stable` existe; **rollback ensaiado uma vez** (`rollback.sh`)

**Observabilidade**
- [ ] Alerta `Watchdog` a chegar ao healthchecks.io; e-mail e Telegram testados com um alerta falso
- [ ] Alertas `AppReplicaDown`, `HighErrorRate`, `DiskSpaceLow`, `BackupTooOld` verificados em simulação
- [ ] Ninguém a olhar só para o Prometheus: há destinatário definido para cada alerta crítico

**Carga e fiabilidade**
- [ ] Artillery (smoke → load → stress → spike, ver `CLAUDE.md`) contra um ambiente equivalente; p95 < 3 s e erros < 1 %
- [ ] `docker stop` a uma réplica durante carga: sem 5xx visíveis (valida o `enableShutdownHooks`)
- [ ] Runbook de DR lido por quem está de piquete (`disaster-recovery.md`); RTO/RPO escritos e aceites

## 7. Ordem recomendada do que falta

1. Itens 5–8 da secção 4 (maior risco residual por esforço).
2. Staging e restore mensal automatizado.
3. Grafana + Loki (fase 2), SLOs nos alertas.
4. Decisão formal: ficar no VPS ou migrar para `ops/k8s` + Redis gerido, usando os gatilhos da secção 1.

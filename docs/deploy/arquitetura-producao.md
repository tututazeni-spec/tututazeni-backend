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
| Dashboards (Grafana) | ✅ opt-in | `ENABLE_OBSERVABILITY=true` |
| Agregação/pesquisa de logs centralizada (Loki) | ✅ opt-in | idem |
| Erros de aplicação (Sentry) | ✅ opt-in | `SENTRY_DSN`; tracing/OTel continua fora |

**Opt-in (já implementado):** com `ENABLE_OBSERVABILITY=true` sobem Grafana + Loki + Promtail (≈ +640 MB; só com o VPS de 8 GB — os limites actuais somam ≈ 3,9 GB com Redis a 256 MB).
`SENTRY_DSN` activa o envio de erros 5xx. SLOs sugeridos para os alertas: disponibilidade 99,9 % mensal (≈ 43 min de erro), p95 < 1 s em leitura, taxa de 5xx < 1 %.

## 4. Lacunas encontradas

| # | Lacuna | Risco | Estado |
|---|---|---|---|
| 1 | `main.ts` não chamava `enableShutdownHooks()` | SIGTERM matava o processo a meio: pedidos em curso perdidos em cada deploy/restart e `onModuleDestroy` (Prisma, Redis, filas) nunca corria | ✅ corrigido |
| 2 | Logs do Docker sem rotação | Disco do VPS enche; `DiskSpaceLow` avisa tarde | ✅ corrigido |
| 3 | `stop_grace_period`/`init` ausentes em app e frontend | Docker mata ao fim de 10 s; sem PID 1 a propagar sinais | ✅ corrigido (30 s / 20 s, `init: true`) |
| 4 | Imagem sem scan de vulnerabilidades | CVE crítica chega a produção | ✅ Trivy no `deploy.yml` |
| 5 | `docker compose up -d` recriava as 2 réplicas quase juntas | Janela de ~5–15 s | ✅ `deploy.sh` rolling (migrations → uma réplica de cada vez, só avança com a nova `healthy`). Testado com compose de ensaio: mínimo observado de 1 réplica saudável, nunca 0 |
| 6 | Caddy pendurado não é reiniciado pelo Compose | Outage total até intervenção | ✅ `ops/deploy/caddy-watchdog.sh` (cron por minuto, 2 leituras `unhealthy` → `docker restart` + Telegram). Sem `docker.sock` em containers |
| 7 | Redis sem `maxmemory` | OOM kill → perde-se a fila | ✅ `maxmemory 160mb` + `volatile-lru` (só despeja cache com TTL; chaves do Bull ficam), limite do container 256 MB |
| 8 | Sem ambiente de staging | Migrations e config só exercitadas em produção | ✅ job `staging` opcional no `deploy.yml` (2.º VPS, mesmo compose). **Falta provisionar o VPS e os secrets `STAGING_*`** |
| 9 | Sem teste periódico de restauro | Backup não verificado não é backup | ✅ `ops/backup/restore-drill.sh` (dia 1 de cada mês, Postgres descartável) + alerta `RestoreDrillTooOld` (>40 dias) |
| 10 | Docs contraditórios sobre o caminho de deploy | Equipa segue o documento errado | ✅ decidido: VPS + Compose via SSH; `observabilidade.md` corrigido; webhook mantido como alternativa |
| 11 | Workflows em `actions/checkout@v3`/`setup-node@v3` | Runtimes Node antigos | ✅ v4 (Dependabot mantém as versões, mensal) |
| 12 | `CSRF_TOKEN_STRICT=false` em produção | Escritas sem token double-submit | ⏳ por data, não por código: activar a partir de 2026-11-01 (`docs/seguranca-pendentes.md`) |
| 13 | Sem dashboards, logs centralizados nem erros de aplicação | Diagnóstico lento | ✅ opt-in: Grafana + Loki + Promtail (`ENABLE_OBSERVABILITY`) e Sentry (`SENTRY_DSN`) |

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
- [ ] Staging provisionado (secrets `STAGING_*`) ou decisão explícita de não o ter

**Observabilidade**
- [ ] Alerta `Watchdog` a chegar ao healthchecks.io; e-mail e Telegram testados com um alerta falso
- [ ] Alertas `AppReplicaDown`, `HighErrorRate`, `DiskSpaceLow`, `BackupTooOld` verificados em simulação
- [ ] Ninguém a olhar só para o Prometheus: há destinatário definido para cada alerta crítico

**Carga e fiabilidade**
- [ ] Artillery (smoke → load → stress → spike, ver `CLAUDE.md`) contra um ambiente equivalente; p95 < 3 s e erros < 1 %
- [ ] `docker stop` a uma réplica durante carga: sem 5xx visíveis (valida o `enableShutdownHooks`)
- [ ] Runbook de DR lido por quem está de piquete (`disaster-recovery.md`); RTO/RPO escritos e aceites

## 7. O que ainda depende de ti (não é código)

1. Provisionar o VPS de staging e criar os secrets `STAGING_*` (sem eles o job é ignorado).
2. Activar `ENABLE_OBSERVABILITY=true` e/ou criar o projecto Sentry e pôr o `SENTRY_DSN`.
3. Correr `ops/backup/install-cron.sh` no VPS para instalar o watchdog do Caddy e o restore drill, e executar `restore-drill.sh` uma vez à mão.
4. `CSRF_TOKEN_STRICT=true` a partir de 2026-11-01.
5. Decisão formal VPS vs `ops/k8s` + Redis gerido, pelos gatilhos da secção 1.

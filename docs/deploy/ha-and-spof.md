# Alta disponibilidade e pontos únicos de falha (pontos 2 e 9)

> Estado da topologia **"Leve — 1 VPS + Cloudflare"**. Descreve o que passou a
> ser redundante, o que **continua** a ser ponto único de falha (SPOF), e o
> gatilho para subir para a topologia "Médio — 2 VPS".

## O que mudou

| Antes | Agora |
|---|---|
| 1 container `app` (`container_name: innova-app`) | Serviço `app` com **2 réplicas** (`deploy.replicas: 2`), sem nome fixo |
| Caddy → `reverse_proxy app:4000` (upstream único) | Caddy → `dynamic a` sobre `app` → round-robin entre réplicas + failover passivo (`fail_duration`, `unhealthy_status 5xx`) |
| `prisma migrate deploy` no arranque de cada container | Job `migrate` one-shot que corre até terminar **antes** das réplicas (`depends_on: service_completed_successfully`) |
| Health gate do deploy por nome `innova-app` | Health gate espera **todas** as réplicas `healthy` |
| Sem borda WAF/CDN | Cloudflare à frente (WAF, CDN, anti-DDoS) + origin trancado aos ranges Cloudflare |
| Monitorização sem limites de recursos | `deploy.resources.limits` de memória em app/redis/caddy/prometheus/alertmanager/node-exporter |
| Sem alerta de redundância | `AppRunningDegraded` (só 1 réplica de pé), `AppAllReplicasDown` (outage) |
| `Sem frontend deployado` | Serviço `frontend` com **2 réplicas** no mesmo VPS, atrás do Caddy (`/` → `frontend`, `/api/*` → `app`) |
| `Caddy: 1 container, sem healthcheck, 128 MB` | `restart: always` (cobre crash/OOM) + healthcheck da admin API (expõe um Caddy *pendurado* como `unhealthy`, monitorável) + limite 256 MB + `stop_grace_period` |

## O que passou a ser redundante (deixou de ser SPOF)

- **Processo da app.** Uma réplica que crashe, entre em OOM (limite 768 MB) ou
  falhe o `/health/ready` sai da rotação do Caddy em segundos; a outra réplica
  continua a servir. O Docker (`restart: unless-stopped` + HEALTHCHECK da imagem)
  reinicia a réplica doente em paralelo.
- **Deploy.** Health gate por réplica + rollback automático (workflow `deploy.yml`)
  se qualquer réplica não ficar saudável ou o smoke pós-deploy falhar.
- **Borda / ataques volumétricos.** Absorvidos pela Cloudflare antes de chegarem
  ao VPS.
- **Corrida de migrations.** Eliminada — corre num único job antes das réplicas.
- **Processo do frontend.** Uma réplica `frontend` que crashe ou entre em OOM
  (limite 384 MB) sai da rotação do Caddy em segundos; a outra continua a
  servir. Mesmo mecanismo do `app`.

## O que CONTINUA a ser SPOF (aceite nesta topologia)

| SPOF | Risco | Mitigação actual | Só resolve com… |
|---|---|---|---|
| **O VPS (host físico)** | Kernel panic, falha de disco, o datacenter em baixo, VPS suspenso → **outage total** | Cloudflare *Always Online* serve GETs em cache; backups off-box (pg_dump diário + WAL-G PITR); DR runbook; alerta externo (healthchecks.io dead-man) | 2º VPS atrás de LB (topologia "Médio") |
| **Container Caddy** | Se o Caddy morre, não há borda → outage total (mesmo com as 2 réplicas vivas) | `restart: always` repõe o Caddy que **crashe ou seja morto por OOM**; **healthcheck** da admin API marca-o `unhealthy` (visível em `docker ps` / monitorização) mas o `docker compose` puro **não reinicia** por health — um Caddy *pendurado* (processo vivo, não serve) fica como risco residual até Swarm mode / sidecar autoheal / 2 VPS; config validada em CI; limite 256 MB isola de OOM do vizinho | Caddy replicado / LB gerido do provider |
| **Frontend (mesma caixa)** | Partilha os SPOF do host / Caddy / Redis | 2 réplicas (falha de processo), `restart: unless-stopped` | 2º VPS (topologia "Médio") |
| **Container Redis** | Filas Bull (webhooks, e-mail) e cache param; a app degrada mas **não perde dados de domínio** (Postgres é a fonte de verdade) | `--appendonly yes` (persiste entre restarts); `restart: unless-stopped`; readiness trata Redis como informativo (não derruba a app) | Redis gerido / Sentinel / cluster |
| **Postgres** | — | **Já mitigado**: Postgres gerido/externo com failover do provider (`docs/db-architecture/`) | — (já OK) |
| **Rede do VPS / IP** | Perda de conectividade do host | Cloudflare Always Online (leitura) | 2º VPS noutra rede/região |

### Nota sobre "2 réplicas no mesmo host"

As réplicas protegem contra **falha de processo** (crash, OOM, deadlock, bug que
mata um worker), não contra **falha de host**. Um `docker compose up -d` num
redeploy recria as duas réplicas quase em simultâneo → há uma janela de ~5–15 s
em que o Caddy faz retry (`lb_try_duration 5s`) e a Cloudflare pode servir
cache. Deploy verdadeiramente *rolling* (zero downtime) exige Docker Swarm mode
ou a topologia de 2 nós — ver abaixo.

## Dimensionamento do VPS

A topologia antiga assumia **2 vCPU / 4 GB**. Com 2 réplicas `app` + 2 réplicas
`frontend` + borda + monitorização, os limites de memória somam **≈ 3,4 GB**
(app 2×768, frontend 2×384, prometheus 400, caddy 256, redis 192,
alertmanager 128, node-exporter 96). **Recomendado 4 vCPU / 8 GB.** Num host de
4 GB fica sem folga para picos — subir para 8 GB antes de aumentar qualquer
`replicas`.

## Gatilho para subir a "Médio — 2 VPS + LB"

Passar à topologia de 2 nós quando **qualquer** destes for verdade:

- Um outage de host (mesmo curto) tem custo de negócio inaceitável (SLA formal).
- Tráfego sustentado > ~300 req/s ou CPU do host > 60 % em média.
- ✅ **Cumprido:** há frontend deployado no mesmo VPS (mais carga, mais superfície).
- Exigência de janela de deploy zero-downtime.

**O item "frontend no mesmo VPS" está agora cumprido** — a topologia "Médio"
passa de gatilho futuro a **recomendação activa**. Plano concreto:

- 2 VPS idênticos (`docker compose -f docker-compose.prod.yml` em cada);
- Redis gerido (ou Sentinel) — deixa de ser SPOF local;
- LB à frente dos dois: **Cloudflare Load Balancing** (add-on pago) sobre os
  dois IPs de origem com health checks activos, **ou** Caddy/HAProxy num 3º
  nó pequeno;
- o `Caddyfile` já usa `dynamic a` — passa a resolver um nome DNS que aponta
  aos dois nós; sem mudança estrutural na config.

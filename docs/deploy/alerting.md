# Alertas — Prometheus + Alertmanager (regra 9)

> Stack no mesmo compose de produção (`ops/docker-compose.prod.yml`):
> Prometheus faz scrape de `app:4000/metrics` (bearer token) a cada 15s e avalia
> `ops/monitoring/alert-rules.yml`; o Alertmanager entrega por severidade.
> Deploy/segredos: o `deploy.sh` renderiza `alertmanager.yml` e `metrics_token`
> a partir do `.env.production` — nada disto é commitado.

## Routing

| Severidade | Canal |
|---|---|
| critical (`AppDown`, `HighErrorRate`) | email + Telegram |
| warning (`HighLatencyP95`, `SlowDbQueries`, `EventLoopLag`, `HighMemory`) | Telegram |
| info (`LowCacheHitRate`) | só UI do Alertmanager |
| `Watchdog` (dead-man) | heartbeat → healthchecks.io |

`repeat_interval: 4h`; agrupamento por `alertname`.

## Mudar um threshold (sem redeploy da app)

1. Editar `ops/monitoring/alert-rules.yml` (expr/`for:`) num PR normal — o CI
   valida com `promtool`.
2. Merge → o próximo deploy copia o ficheiro e reinicia o Prometheus.
   Urgente/no VPS: editar `/opt/innova/monitoring/alert-rules.yml` e
   `docker compose -f /opt/innova/docker-compose.prod.yml restart prometheus`
   (alinhar o repo a seguir, senão o próximo deploy reverte).

## UIs (sem porta pública — túnel SSH)

```bash
ssh -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 deploy@<HOST>
# Prometheus: http://localhost:9090  |  Alertmanager: http://localhost:9093
```

## Dead-man's switch (healthchecks.io)

1. Criar conta grátis em https://healthchecks.io → novo check "innova-watchdog".
2. Configurar: Period = 5 min, Grace = 5 min; canais de notificação (email e/ou
   Telegram) do lado do healthchecks.io.
3. Copiar a URL de ping para `HEALTHCHECKS_PING_URL` no `/opt/innova/.env.production`.
4. Fluxo: o alerta `Watchdog` dispara sempre → o Alertmanager faz POST à URL a
   cada ~2m → se os pings pararem (VPS/stack morto), o healthchecks.io notifica
   de fora. Testar: suspender o Alertmanager (`docker pause innova-alertmanager`)
   → em ~10m chega a notificação externa → `docker unpause innova-alertmanager`.

## Silenciar um alerta

UI do Alertmanager (via túnel) → alerta → "Silence" (com comentário e duração),
ou por CLI:

```bash
docker exec innova-alertmanager amtool silence add alertname=HighLatencyP95 \
  --comment "deploy de migração pesada" --duration 2h --alertmanager.url http://localhost:9093
```

## Teste de ponta a ponta (critério de aceitação)

Local (sem segredos reais — verifica disparo + routing + heartbeat):

```bash
# 1. Stack local (ver runbook §7 para o ops/.env.production local); no .env local:
#    HEALTHCHECKS_PING_URL=http://host.docker.internal:9099/ping
node -e "require('http').createServer((q,s)=>{console.log(new Date().toISOString(),q.method,q.url);s.end('ok')}).listen(9099)" &
bash ops/deploy/deploy.sh local-v1

# 2. Heartbeat: em <2m aparecem POSTs /ping no listener (Watchdog → webhook OK)
# 3. AppDown: docker stop innova-app → ~1m30 depois:
curl -s http://localhost:9093/api/v2/alerts | grep -o '"alertname":"AppDown"'
# 4. Recuperar: docker start innova-app
```

Em produção (com segredos reais): repetir o passo 3 — o email e a mensagem
Telegram têm de chegar; e o teste de suspensão do dead-man (secção acima).

## Custos de RAM

Prometheus + Alertmanager ≈ 200–400 MB — já contemplado no sizing do runbook.

# SLA / SLO — compromisso de disponibilidade

## Compromisso

| Métrica | Alvo | Janela |
|---|---|---|
| Disponibilidade da API (SLO interno) | **99,5 %** | 30 dias móveis |
| Orçamento de erro | 0,5 % ≈ **3 h 36 min** de indisponibilidade por mês | 30 dias |
| Latência p95 (pedidos HTTP) | < 1 s | alerta `HighLatencyP95` |
| RPO (perda máxima de dados) | ver `disaster-recovery.md` | — |

**Porquê 99,5 % e não 99,9 %:** a topologia actual tem SPOF assumidos (um VPS, um Caddy, um Redis — ver `ha-and-spof.md`). 99,9 % (≈ 43 min/mês) exige a topologia de 2 nós / Kubernetes (`ops/k8s/`); até lá prometer mais do que a infraestrutura suporta seria falso. Ao migrar para 2 nós, rever para 99,9 %.

**SLA (contratual) vs SLO (interno):** o SLA comunicado a clientes deve ser **igual ou menos exigente** que o SLO interno (ex.: SLO 99,5 % → SLA contratual 99,0 %), para haver margem antes de haver penalizações. A definição final do SLA contratual é decisão de negócio/jurídica.

## Como se mede (SLI)

SLI = 1 − (respostas 5xx ÷ total de respostas), a partir do histograma `http_request_duration_seconds` já exportado pela app. Não conta: 4xx (erro do cliente), rotas `/health` e `/metrics`.

Manutenção planeada anunciada com antecedência na página de estado não conta para o orçamento.

## Alertas de consumo do orçamento (`ops/monitoring/alert-rules.yml`, grupo `innova-slo`)

| Alerta | Condição | Severidade | Significado |
|---|---|---|---|
| `SloBurnRateFast` | erro > 7,2 % em 1 h **e** 5 min (14,4×) | critical | orçamento mensal esgota em ~2 dias → incidente |
| `SloBurnRateSlow` | erro > 3 % em 6 h **e** 30 min (6×) | warning | orçamento esgota em ~5 dias → investigar |

Complementam os alertas instantâneos (`AppAllReplicasDown`, `HighErrorRate`, `HighLatencyP95`, `HighMemory`…) descritos em `alerting.md`.

Disponibilidade nos últimos 30 dias (PromQL, para o Grafana):

```
1 - (
  sum(increase(http_request_duration_seconds_count{status_code=~"5.."}[30d]))
  / sum(increase(http_request_duration_seconds_count[30d]))
)
```

## Política de orçamento de erro

- Orçamento > 50 % restante: deploys normais, incluindo funcionalidades novas.
- Orçamento < 50 %: deploys só com feature flag e a percentagem baixa (`deploys-graduais.md`).
- Orçamento esgotado: congelar funcionalidades novas; só correcções de fiabilidade e segurança até recuperar.
- Todo o incidente que consuma > 10 % do orçamento tem post-mortem curto (causa, impacto, acção preventiva).

## Revisão

Rever este documento trimestralmente e sempre que a topologia mudar.

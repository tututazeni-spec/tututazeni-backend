# SLA contratual — proposta para revisão jurídica

> Rascunho técnico. A redacção final, créditos e foro são decisão de negócio/jurídica.
> Relação com o objectivo interno: ver `sla-slo.md` (SLO 99,5 %).

## Compromisso proposto

| Item | Valor |
|---|---|
| Disponibilidade mensal | **99,0 %** (≈ 7 h 18 min de indisponibilidade tolerada por mês) |
| Medição | Sondas externas de 1 em 1 min a `/api/health/ready` e à aplicação web (página de estado) |
| Janela | Mês civil |
| Suporte a incidentes críticos | Resposta inicial em 1 h útil (08:00–18:00 dias úteis); comunicação na página de estado |

**Porquê 99,0 % e não 99,5 %:** o SLO interno é 99,5 %; o compromisso a clientes fica 0,5 pp abaixo para haver margem antes de qualquer penalização. Com a topologia actual (VPS único) não se recomenda comprometer mais. Passando para 2 nós / Kubernetes, rever para 99,5 % contratual.

## Exclusões (não contam como indisponibilidade)

- Manutenção planeada anunciada com ≥ 48 h na página de estado e fora do horário útil, até 4 h/mês.
- Falhas de fornecedores fora do nosso controlo (Cloudflare, DNS, fornecedor do Postgres gerido, e-mail/SMS, internet do cliente), sem prejuízo de reportarmos o incidente.
- Uso fora das condições acordadas, ataques DoS e força maior.
- Funcionalidades em *beta* atrás de feature flag.

## Compensação sugerida (créditos de serviço)

| Disponibilidade no mês | Crédito sobre a mensalidade |
|---|---|
| < 99,0 % e ≥ 98,0 % | 5 % |
| < 98,0 % e ≥ 95,0 % | 10 % |
| < 95,0 % | 25 % |

Crédito pedido pelo cliente em 30 dias, único remédio para indisponibilidade, aplicado na factura seguinte.

## Outros compromissos a definir com o jurídico

- RPO/RTO (valores técnicos em `disaster-recovery.md`).
- Notificação de incidentes de segurança/dados pessoais (LPDP).
- Relatório mensal de disponibilidade (gerado a partir de `status.json` e das métricas Prometheus).

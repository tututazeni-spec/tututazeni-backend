# Documentação técnica de operação — índice

Ponto de entrada para quem vai operar o INNOVA em produção. Cada documento tem um único assunto; nada aqui duplica o que está noutro sítio.

## Arquitectura e deploy

| Preciso de… | Ler |
|---|---|
| Visão geral da infraestrutura, fluxo de deploy, lacunas e **checklist de go-live** | [`arquitetura-producao.md`](arquitetura-producao.md) |
| Provisionar o VPS, secrets do GitHub, primeiro deploy, operação corrente | [`runbook.md`](runbook.md) |
| Todas as **variáveis de ambiente** (o que bloqueia o arranque, como gerar, o que acontece se faltar) | [`variaveis-de-ambiente.md`](variaveis-de-ambiente.md) |
| Deploys sem indisponibilidade e rollback | [`deploys-graduais.md`](deploys-graduais.md), [`staging-e-rollback.md`](staging-e-rollback.md) |
| Cloudflare, DNS, e-mail (SPF/DKIM/DMARC) | [`cloudflare.md`](cloudflare.md), [`dns-e-email.md`](dns-e-email.md) |
| Onde ficam os ficheiros enviados | [`ficheiros-e-persistencia.md`](ficheiros-e-persistencia.md) |
| Alta disponibilidade, pontos únicos de falha, escala | [`ha-and-spof.md`](ha-and-spof.md), [`multi-tenancy-e-escala.md`](multi-tenancy-e-escala.md) |
| Base de dados (Postgres gerido, réplicas, PgBouncer, RLS) | [`../db-architecture/`](../db-architecture/README.md), `../../ops/db/rls/README.md` |
| Ambientes e migrações | [`../engenharia/ambientes-e-migracoes.md`](../engenharia/ambientes-e-migracoes.md) |
| Segurança e checklist de go-live de segurança | [`../security/2026-10-27-checklist-go-live-seguranca.md`](../security/2026-10-27-checklist-go-live-seguranca.md) |

## Observabilidade e alertas

[`observabilidade.md`](observabilidade.md) · [`alerting.md`](alerting.md) · [`status-page.md`](status-page.md) · [`sla-slo.md`](sla-slo.md)

## Incidentes, continuidade e lançamento

| Preciso de… | Ler |
|---|---|
| Severidades, **quem faz o quê** num incidente, post-mortem | [`gestao-incidentes.md`](gestao-incidentes.md), [`postmortem-template.md`](postmortem-template.md) |
| **Escala e cobertura das primeiras 48–72 h** | [`primeiras-72h.md`](primeiras-72h.md) |
| Recuperação de desastres (RTO/RPO, restauro) | [`disaster-recovery.md`](disaster-recovery.md) |

## Cliente

| Preciso de… | Ler |
|---|---|
| Canais de suporte, tempos de resposta, base de conhecimento | [`../suporte/canais-e-base-de-conhecimento.md`](../suporte/canais-e-base-de-conhecimento.md) |
| Compromissos contratuais de disponibilidade e notificação | [`sla-contratual.md`](sla-contratual.md) |
| Faturação SaaS | [`faturacao-saas.md`](faturacao-saas.md) |

## Manter isto actualizado

- Mudou uma variável de ambiente → actualizar [`variaveis-de-ambiente.md`](variaveis-de-ambiente.md), o esquema Joi e os dois `.env*.example` **no mesmo PR**.
- Mudou a infraestrutura ou o fluxo de deploy → actualizar o diagrama e as secções 1–2 de [`arquitetura-producao.md`](arquitetura-producao.md).
- Cada incidente SEV1/SEV2 → post-mortem em `../postmortems/` e, se mudou o procedimento, [`gestao-incidentes.md`](gestao-incidentes.md).
- Rever este índice e a escala trimestralmente, junto com a revisão dos incidentes.

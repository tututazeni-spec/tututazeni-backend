# Post-mortem: <título curto do incidente>

> Sem culpas: descrever sistemas, decisões e informação disponível — não pessoas. Usar papéis (IC, operador), nunca nomes.
> Guardar como `docs/postmortems/AAAA-MM-DD-titulo.md`. Processo: `gestao-incidentes.md`.

| | |
|---|---|
| **Severidade** | SEV1 / SEV2 / SEV3 |
| **Data e hora (UTC)** | início – fim |
| **Duração** | |
| **Orçamento de erro consumido** | % do mês (`sla-slo.md`) |
| **Clientes afectados** | todos / parte / número |
| **Estado** | rascunho / revisto / acções em curso / fechado |

## Resumo (para clientes, 3–5 frases)

O que aconteceu, o que os utilizadores sentiram e o que mudámos para não se repetir.

## Impacto

O que deixou de funcionar, para quem, durante quanto tempo. Números (pedidos falhados, pedidos de suporte recebidos).

## Cronologia (UTC)

| Hora | Acontecimento |
|---|---|
| hh:mm | Alerta/relato que detectou o incidente |
| hh:mm | Incidente declarado, severidade atribuída |
| hh:mm | Mitigação aplicada |
| hh:mm | Resolvido e confirmado |

## Causa raiz e factores contribuintes

Usar "5 porquês" até chegar a algo que o sistema ou o processo pode corrigir. Distinguir **causa** (o que falhou), **gatilho** (o que o activou) e **o que agravou** (porque não foi apanhado antes / demorou a mitigar).

## O que correu bem

Alertas que funcionaram, decisões que reduziram o impacto, o que vale a pena manter.

## O que correu mal / onde tivemos sorte

Lacunas de deteção, de documentação, de ferramentas, de comunicação.

## Acções

| Acção | Tipo (prevenir / detectar / mitigar) | Dono (papel) | Data limite | Estado |
|---|---|---|---|---|
| | | | | |

## Lições

Uma ou duas frases que alguém novo na equipa devia ler.

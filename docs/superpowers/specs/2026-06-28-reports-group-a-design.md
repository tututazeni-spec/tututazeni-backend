# Spec — Item 5 Grupo A: remapear o engagement report para modelos reais

> Data: 2026-06-28
> Branch: `chore/code-review-improvements` (continua o PR #7)
> Origem: item 5 do code review — Grupo A (`recognition`, `feedback`, `moodCheckin`).

## Contexto e problema

O `engagementReport` em `src/reports/reports.service.ts` acede a 3 modelos via
`(this.prismaRead as any).<x>?.…catch(...)` que **não existem com esses nomes**:
`recognition`, `feedback`, `moodCheckin`. Por isso devolvem sempre os fallbacks
(0 / null).

**Descoberta:** os 3 conceitos JÁ existem no schema com outros nomes (padrão
INNOVA — nome lógico ≠ modelo Prisma), com os campos necessários:

| Fantasma (report) | Modelo real | Campos usados |
|---|---|---|
| `recognition` | **`Kudos`** | `createdAt` (count) |
| `feedback` | **`ContinuousFeedback`** | `createdAt` (count) |
| `moodCheckin` (`_avg.mood`) | **`LeadershipPulse`** | `createdAt`, `overallScore` (Int 1-5) |

Logo o Grupo A **não é construir features novas** — é um remapeamento cirúrgico,
como o Grupo B.

## Decisão de produto

`avgMood` passa a ser a **média do `overallScore` do `LeadershipPulse`** (pulso
de liderança 1-5) — o sinal de pulso/engagement mais próximo existente. O nome do
campo de saída mantém-se `avgMood` (não renomear; evita partir consumidores).

## Objetivo

O `engagementReport` passa a contar reconhecimentos/feedback reais e a média de
pulso a partir dos modelos existentes, sem acessos-fantasma nem fallbacks, e sem
mudar o formato da resposta (`recognitions`, `feedbackCount`, `avgMood`).

## Design

Em `src/reports/reports.service.ts`, no `engagementReport` (Promise.all):
```ts
// recognition → kudos
this.prismaRead.kudos.count({ where: { createdAt: { gte: range.gte, lte: range.lte } } }),
// feedback → continuousFeedback
this.prismaRead.continuousFeedback.count({ where: { createdAt: { gte: range.gte, lte: range.lte } } }),
// moodCheckin → leadershipPulse
this.prismaRead.leadershipPulse.aggregate({ _avg: { overallScore: true }, where: { createdAt: { gte: range.gte } } }),
```
E a leitura do resultado:
```ts
avgMood: avgMoodRecent?._avg?.overallScore ? +avgMoodRecent._avg.overallScore.toFixed(1) : null,
```
- Remover os `?.` e `.catch(...)` desses 3 acessos (são modelos reais).
- Atualizar o comentário do getter `prismaRead` para deixar de listar `recognition`,
  `feedback`, `moodCheckin` como fantasmas (o getter mantém-se `any` pelos outros
  motivos já documentados — `_count` em select, `where: any`).

## Testes (TDD)

- `src/reports/reports.service.spec.ts` mocka qualquer modelo via Proxy
  (`fallbackModel`), por isso o `engagementReport` continua a correr.
- Acrescentar/ajustar um teste que assere que `engagementReport` usa
  `kudos.count`, `continuousFeedback.count` e `leadershipPulse.aggregate` (em vez
  dos nomes fantasma) e que `avgMood` deriva de `_avg.overallScore`.
- Verificação: spec do reports verde + `tsc --noEmit` limpo.

## Critério de sucesso

1. `engagementReport` usa `kudos`/`continuousFeedback`/`leadershipPulse`; sem
   acessos `recognition`/`feedback`/`moodCheckin` nem `.catch` defensivos nesses 3.
2. `avgMood` deriva de `LeadershipPulse.overallScore`; formato da resposta igual.
3. Specs do reports verdes; `tsc --noEmit` limpo.

## Fora de âmbito

- Construir UI/endpoints (os modelos já têm os seus módulos).
- Renomear `avgMood` (decidido: manter).
- Outros usos de `any` no serviço (já documentados, fora deste item).

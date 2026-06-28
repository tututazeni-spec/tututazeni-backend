# Item 5 Grupo A — Remapear engagement report (Plano de Implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O `engagementReport` passa a usar os modelos reais (`Kudos`, `ContinuousFeedback`, `LeadershipPulse`) em vez dos acessos-fantasma `recognition`/`feedback`/`moodCheckin`, sem mudar o formato da resposta.

**Architecture:** Edição cirúrgica de um método em `reports.service.ts` (remapear 3 acessos no `Promise.all` + a leitura de `avgMood`), remover os `?.`/`.catch` defensivos, e atualizar o comentário do getter `prismaRead`. TDD via o spec existente.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Jest 30.

## Global Constraints

- Mapeamento: `recognition`→`kudos`, `feedback`→`continuousFeedback`, `moodCheckin`→`leadershipPulse` (campo `mood`→`overallScore`).
- `avgMood` mantém-se como chave de saída; deriva de `_avg.overallScore`.
- Não mudar o formato da resposta (`recognitions`, `feedbackCount`, `avgMood`).
- Jest 30: `--forceExit`, filtro `--testPathPatterns`; máquina sob carga → `--runInBand` por ficheiro; `npx` sem pipe (ou `cmd /c "npx ... > log 2>&1"`); `tsc` OOM → `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit`.
- Commits `--no-verify`, terminam com: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Remapear o engagement report

**Files:**
- Modify: `src/reports/reports.service.ts` (`engagementReport` ~L426-434 e ~L467; comentário do getter `prismaRead` ~L45-54)
- Test: `src/reports/reports.service.spec.ts`

**Interfaces:**
- Consumes: modelos Prisma `kudos`, `continuousFeedback`, `leadershipPulse` (já existem no schema).

- [ ] **Step 1: Estender o mock e escrever o teste (em `reports.service.spec.ts`)**

No objeto `mockPrisma`, adicionar (junto aos outros modelos, ex.: a seguir a `engagementSurvey`):
```ts
  kudos: { count: jest.fn().mockResolvedValue(3) },
  continuousFeedback: { count: jest.fn().mockResolvedValue(5) },
  leadershipPulse: { aggregate: jest.fn().mockResolvedValue({ _avg: { overallScore: 4.2 } }) },
```
Adicionar este teste dentro do `describe('engagementReport', ...)` existente (ou um novo `it` a seguir ao atual):
```ts
  it('usa kudos/continuousFeedback/leadershipPulse e avgMood do overallScore', async () => {
    const result = await service.engagementReport({});
    expect(mockPrisma.kudos.count).toHaveBeenCalled();
    expect(mockPrisma.continuousFeedback.count).toHaveBeenCalled();
    expect(mockPrisma.leadershipPulse.aggregate).toHaveBeenCalled();
    expect(result.summary.recognitions).toBe(3);
    expect(result.summary.feedbackCount).toBe(5);
    expect(result.avgMood).toBe(4.2);
  });
```

- [ ] **Step 2: Correr — deve falhar**

Run: `npx jest src/reports/reports.service.spec.ts --runInBand --forceExit`
Expected: FAIL — o código atual chama `recognition`/`feedback`/`moodCheckin` (não `kudos`/`continuousFeedback`/`leadershipPulse`), logo os mocks não são chamados e `recognitions`/`feedbackCount`/`avgMood` vêm dos fallbacks (0/0/null).

- [ ] **Step 3: Remapear os 3 acessos no `engagementReport`**

Em `src/reports/reports.service.ts`, substituir o bloco atual (L426-434):
```ts
        this.prismaRead.recognition
          ?.count({ where: { createdAt: { gte: range.gte, lte: range.lte } } })
          .catch(() => 0),
        this.prismaRead.feedback
          ?.count({ where: { createdAt: { gte: range.gte, lte: range.lte } } })
          .catch(() => 0),
        this.prismaRead.moodCheckin
          ?.aggregate({ _avg: { mood: true }, where: { createdAt: { gte: range.gte } } })
          .catch(() => null),
```
por:
```ts
        this.prismaRead.kudos.count({
          where: { createdAt: { gte: range.gte, lte: range.lte } },
        }),
        this.prismaRead.continuousFeedback.count({
          where: { createdAt: { gte: range.gte, lte: range.lte } },
        }),
        this.prismaRead.leadershipPulse.aggregate({
          _avg: { overallScore: true },
          where: { createdAt: { gte: range.gte } },
        }),
```

- [ ] **Step 4: Atualizar a leitura de `avgMood` (L467)**

Substituir:
```ts
      avgMood: avgMoodRecent?._avg?.mood ? +avgMoodRecent._avg.mood.toFixed(1) : null,
```
por:
```ts
      avgMood: avgMoodRecent?._avg?.overallScore
        ? +avgMoodRecent._avg.overallScore.toFixed(1)
        : null,
```

- [ ] **Step 5: Atualizar o comentário do getter `prismaRead`**

Localizar o JSDoc do getter `prismaRead` (~L45-54) que menciona `recognition, feedback, moodCheckin`. Substituí-lo por:
```ts
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   *
   * NOTA: mantém-se tipado `any` porque ainda usa `_count` em select e vários
   * `where: any` que só compilam com `any`. Os modelos do antigo "Grupo A"
   * (recognition→Kudos, feedback→ContinuousFeedback, moodCheckin→LeadershipPulse)
   * já estão remapeados para os modelos reais.
   */
```
(Se o texto atual diferir, preserva o corpo do getter — `return (this.prisma as any).db ?? this.prisma;` — e só troca o comentário.)

- [ ] **Step 6: Correr os testes — devem passar**

Run: `npx jest src/reports/reports.service.spec.ts --runInBand --forceExit`
Expected: PASS (incluindo o novo teste; recognitions=3, feedbackCount=5, avgMood=4.2).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 8: Commit**

```
git add src/reports/reports.service.ts src/reports/reports.service.spec.ts
git commit --no-verify -m "fix(reports): remapear engagement para Kudos/ContinuousFeedback/LeadershipPulse (item 5 grupo A)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Notas
- Só o `engagementReport` e o comentário do getter mudam; o resto do serviço fica intacto.
- Confirma que NÃO restam acessos a `recognition`/`feedback`/`moodCheckin` no ficheiro (grep).
- Os outros testes do `reports.service.spec.ts` devem continuar a passar.

# Grupo E — Scalability: Remoção de `(this.prisma as any)` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover os 51 `(this.prisma as any)` casts em `scalability.service.ts` e `scalability.events.ts`, substituindo por chamadas Prisma tipadas.

**Architecture:** Todos os modelos já existem no schema Prisma — não há migrações. A substituição é mecânica: `(this.prisma as any).modelName.` → `this.prisma.modelName.` por modelo, seguida de verificação TypeScript e correção cirúrgica de qualquer erro novo com `as any` no argumento específico (nunca em `this.prisma`).

**Tech Stack:** NestJS, Prisma ORM, TypeScript, Jest. Branch em git worktree isolado.

## Global Constraints

- Shell: PowerShell (Windows)
- Worktree: `git worktree add .claude/worktrees/fix+grupo-e-scalability -b fix/grupo-e-scalability`
- Todos os steps correm a partir do worktree
- `replace_all: true` em cada Edit para garantir que todos os casts do modelo são substituídos
- Commit messages: `refactor(scalability):` para service/events, `fix(test):` para specs
- CI corre lint + Jest — Prettier deve ser respeitado

---

## File Map

| Ficheiro | Acção | Nº de casts |
|---|---|---|
| `src/scalability/scalability.service.ts` | Modificar | 44 |
| `src/scalability/scalability.events.ts` | Modificar | 7 |
| `src/scalability/scalability.service.spec.ts` | Verificar/corrigir mocks | — |
| `src/scalability/scalability.service.additional.spec.ts` | Verificar/corrigir mocks | — |
| `src/scalability/scalability.events.spec.ts` | Verificar/corrigir mocks | — |

---

## Task 1: Criar worktree + verificar baseline

**Files:**
- Nenhum ficheiro alterado nesta task

- [ ] **Step 1: Criar worktree**

```powershell
git worktree add .claude/worktrees/fix+grupo-e-scalability -b fix/grupo-e-scalability
Set-Location "C:\Users\Placido Costa\innova\.claude\worktrees\fix+grupo-e-scalability"
```

Todos os steps seguintes correm neste diretório.

- [ ] **Step 2: Confirmar contagem de casts baseline**

```powershell
(Select-String -Path "src\scalability\scalability.service.ts" -Pattern "\(this\.prisma as any\)").Count
(Select-String -Path "src\scalability\scalability.events.ts" -Pattern "\(this\.prisma as any\)").Count
```

Esperado: `44` e `7`

- [ ] **Step 3: Confirmar zero erros TypeScript baseline**

```powershell
$out = npx tsc --noEmit 2>&1; if ($out) { $out | Select-Object -First 10 } else { "Zero errors" }
```

Esperado: `Zero errors`

---

## Task 2: Substituir casts em `scalability.service.ts` — modelos tenantConfig, integrationConfig, integrationSyncLog

**Files:**
- Modify: `src/scalability/scalability.service.ts`

- [ ] **Step 1: Substituir tenantConfig**

No ficheiro `src/scalability/scalability.service.ts`, substituir TODAS as ocorrências (replace_all):
- `(this.prisma as any).tenantConfig.` → `this.prisma.tenantConfig.`

- [ ] **Step 2: Substituir integrationConfig**

- `(this.prisma as any).integrationConfig.` → `this.prisma.integrationConfig.`

- [ ] **Step 3: Substituir integrationSyncLog**

- `(this.prisma as any).integrationSyncLog.` → `this.prisma.integrationSyncLog.`

- [ ] **Step 4: Verificar contagem parcial**

```powershell
(Select-String -Path "src\scalability\scalability.service.ts" -Pattern "\(this\.prisma as any\)").Count
```

Esperado: `30` (44 − 14 substituídos)

- [ ] **Step 5: Verificar erros TypeScript neste ficheiro**

```powershell
$out = npx tsc --noEmit 2>&1; $out | Where-Object { $_ -match "scalability.service.ts" } | Select-Object -First 20
```

Se zero linhas: continua. Se houver erros: aplica `as any` no argumento problemático (ex: `data: dto as any`) — nunca em `this.prisma`.

---

## Task 3: Substituir casts em `scalability.service.ts` — modelos automationRule, automationExecution, enrollment

**Files:**
- Modify: `src/scalability/scalability.service.ts`

- [ ] **Step 1: Substituir automationRule**

- `(this.prisma as any).automationRule.` → `this.prisma.automationRule.`

- [ ] **Step 2: Substituir automationExecution**

- `(this.prisma as any).automationExecution.` → `this.prisma.automationExecution.`

- [ ] **Step 3: Substituir enrollment**

- `(this.prisma as any).enrollment.` → `this.prisma.enrollment.`

- [ ] **Step 4: Verificar contagem parcial**

```powershell
(Select-String -Path "src\scalability\scalability.service.ts" -Pattern "\(this\.prisma as any\)").Count
```

Esperado: `16` (30 − 14)

- [ ] **Step 5: Verificar erros TypeScript**

```powershell
$out = npx tsc --noEmit 2>&1; $out | Where-Object { $_ -match "scalability.service.ts" } | Select-Object -First 20
```

Esperado: zero linhas. Se houver erros, corrigir com `as any` no argumento específico.

---

## Task 4: Substituir casts em `scalability.service.ts` — modelos slaConfig, contentDeliveryConfig, scalabilityMetric, systemAlert

**Files:**
- Modify: `src/scalability/scalability.service.ts`

- [ ] **Step 1: Substituir slaConfig**

- `(this.prisma as any).slaConfig.` → `this.prisma.slaConfig.`

- [ ] **Step 2: Substituir contentDeliveryConfig**

- `(this.prisma as any).contentDeliveryConfig.` → `this.prisma.contentDeliveryConfig.`

- [ ] **Step 3: Substituir scalabilityMetric**

- `(this.prisma as any).scalabilityMetric.` → `this.prisma.scalabilityMetric.`

- [ ] **Step 4: Substituir systemAlert**

- `(this.prisma as any).systemAlert.` → `this.prisma.systemAlert.`

- [ ] **Step 5: Verificar zero casts restantes no service**

```powershell
Select-String -Path "src\scalability\scalability.service.ts" -Pattern "\(this\.prisma as any\)"
```

Esperado: sem output.

- [ ] **Step 6: TypeScript check completo no service**

```powershell
$out = npx tsc --noEmit 2>&1; $out | Where-Object { $_ -match "scalability.service.ts" } | Select-Object -First 20
```

Esperado: zero linhas. Se houver erros do tipo:
- `Type 'X' is not assignable to type 'Y'` em `data:` → adicionar `as any` no argumento: `data: dto as any`
- `groupBy` com `by:` → `by: [...fields] as any`
- `where:` com campos opcionais → normalmente não precisa de cast

- [ ] **Step 7: Commit**

```powershell
git add src/scalability/scalability.service.ts
git commit -m "refactor(scalability): substituir 44 as any no service — tenantConfig, integrationConfig, automationRule, slaConfig, systemAlert, scalabilityMetric (Grupo E)"
```

---

## Task 5: Substituir casts em `scalability.events.ts`

**Files:**
- Modify: `src/scalability/scalability.events.ts`

**Context:** O ficheiro tem 7 casts em 3 modelos: `integrationSyncLog` (3×), `integrationConfig` (2×), `automationExecution` (2×).

- [ ] **Step 1: Substituir integrationSyncLog**

- `(this.prisma as any).integrationSyncLog.` → `this.prisma.integrationSyncLog.`

- [ ] **Step 2: Substituir integrationConfig**

- `(this.prisma as any).integrationConfig.` → `this.prisma.integrationConfig.`

- [ ] **Step 3: Substituir automationExecution**

- `(this.prisma as any).automationExecution.` → `this.prisma.automationExecution.`

- [ ] **Step 4: Verificar zero casts restantes**

```powershell
Select-String -Path "src\scalability\scalability.events.ts" -Pattern "\(this\.prisma as any\)"
```

Esperado: sem output.

- [ ] **Step 5: TypeScript check**

```powershell
$out = npx tsc --noEmit 2>&1; $out | Where-Object { $_ -match "scalability.events.ts" } | Select-Object -First 10
```

Esperado: zero linhas.

- [ ] **Step 6: Commit**

```powershell
git add src/scalability/scalability.events.ts
git commit -m "refactor(scalability): substituir 7 as any no events — integrationSyncLog, integrationConfig, automationExecution (Grupo E)"
```

---

## Task 6: Verificar testes e spec mocks + PR

**Files:**
- Verify: `src/scalability/scalability.service.spec.ts`
- Verify: `src/scalability/scalability.service.additional.spec.ts`
- Verify: `src/scalability/scalability.events.spec.ts`
- Verify: `src/scalability/scalability.controller.spec.ts`

**Context — estado atual dos mocks:**
O `scalability.service.spec.ts` usa um Proxy que já lida com `tenantConfig`, `integrationConfig`, `automationRule` como mocks nomeados, e todos os outros modelos via fallback genérico. Não são esperadas alterações nos mocks porque o Proxy genérico suporta qualquer nome de modelo.

- [ ] **Step 1: Correr testes da suite scalability**

```powershell
$result = npx jest scalability --passWithNoTests --no-coverage --forceExit 2>&1
$result | Select-Object -Last 30
```

Esperado: todos os suites passam, zero falhas.

Se algum teste falhar com "X is not a function" ou "Cannot read properties of undefined":
- O mock Proxy não está a interceptar o modelo correcto
- Verificar se o spec usa um nome de modelo antigo (ex: se houvesse rename)
- Adicionar intercepção explícita no Proxy para o modelo em falta

- [ ] **Step 2: TypeScript check global**

```powershell
$out = npx tsc --noEmit 2>&1; if ($out) { $out | Where-Object { $_ -match "scalability" } | Select-Object -First 20 } else { "Zero TypeScript errors" }
```

Esperado: `Zero TypeScript errors`

- [ ] **Step 3: Push**

```powershell
git push -u origin fix/grupo-e-scalability
```

- [ ] **Step 4: Criar PR**

```powershell
gh pr create `
  --title "refactor(scalability): Grupo E — 51 as-any removidos em scalability.service e events" `
  --body "$(cat <<'EOF'
## Summary

- Remove **44** ocorrências de `(this.prisma as any)` em `scalability.service.ts`
- Remove **7** ocorrências de `(this.prisma as any)` em `scalability.events.ts`
- Modelos tipados: `tenantConfig`, `integrationConfig`, `integrationSyncLog`, `automationRule`, `automationExecution`, `contentDeliveryConfig`, `slaConfig`, `systemAlert`, `scalabilityMetric`, `enrollment`
- Sem alterações ao schema, DTOs, controllers ou outros módulos

## Test plan

- [x] `Select-String "(this.prisma as any)"` — zero resultados em ambos os ficheiros
- [x] `npx tsc --noEmit` — zero erros TypeScript
- [x] `npx jest scalability` — todos os testes passam
- [ ] CI quality check

🤖 Generated with Claude Code
EOF
)"
```

- [ ] **Step 5: Auto-merge**

```powershell
gh pr merge --auto --squash --delete-branch
```

---

## Self-Review

**Spec coverage:**
| Requisito da spec | Task |
|---|---|
| 44 casts removidos em scalability.service.ts | Tasks 2–4 ✓ |
| 7 casts removidos em scalability.events.ts | Task 5 ✓ |
| Zero erros TypeScript | Tasks 2, 3, 4, 5, 6 ✓ |
| Testes passam | Task 6 ✓ |
| Sem alterações ao schema | verificado — nenhuma task toca no schema ✓ |

**Placeholder scan:** Todos os steps têm conteúdo concreto. Sem TBD.

**Type consistency:** Nomes de modelos usados nos replace steps são consistentes com os nomes no schema Prisma (camelCase da forma como Prisma gera o client).

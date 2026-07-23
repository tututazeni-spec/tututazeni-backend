# Grupo G — Quick Wins: remoção de (this.prisma as any) em 17 ficheiros

## Contexto

Continuação da campanha de remoção de `(this.prisma as any)` iniciada nos Grupos A–F.
O Grupo G cobre ficheiros com 1–4 casts onde os modelos Prisma JÁ EXISTEM no schema —
nenhuma migração é necessária para a grande maioria.

BASE commit: `2eb65aa` (main pós-merge Grupo F)  
Branch: `fix/grupo-g-quick-wins`  
Worktree: `.claude/worktrees/fix+grupo-g-quick-wins`

### Ficheiros alvo e modelos

| Ficheiro (src/) | Casts | Modelos acedidos via as any |
|---|:---:|---|
| competencies/competencies.service.ts | 1 | positionCompetency |
| declarations/document-declarations.service.ts | 1 | declarationTemplate |
| notifications/notifications.service.ts | 1 | automationRule |
| leadership/leadership.service.ts | 1 | continuousFeedback |
| history/history.service.ts | 1 | avatarSession |
| development-plans/development-plans.service.ts | 1 | pdiEvidence |
| leader/leader.service.ts | 2 | user, developmentPlan |
| succession/succession.service.ts | 2 | successionPlan |
| talent-development/talent-development.service.ts | 2 | pdiEvidence, course |
| performance/performance.service.ts | 2 | continuousFeedback, user |
| dashboard-rh/dashboard-rh.service.ts | 2 | position, userCompetency |
| api-integration/api-integration.service.ts | 3 | apiIntegrationLog |
| career-plans/career-plans.service.ts | 3–4 | careerPath, user |
| roi-impact/roi-impact.service.ts | 4 | assessmentAttempt, lessonProgress |
| departments/departments.service.ts | 4 | unit, permission, rolePermission, careerPosition |
| roles-permissions/roles-permissions.service.ts | 3 | roleTemplate (**investigar — modelo não confirmado**) |
| attendance/attendance.service.spec.ts | 1 | attendanceRecord |
| performance/performance.service.progress.spec.ts | 1–2 | continuousFeedback |

### Modelos excluídos do Grupo G (deferred)
- `(this.prisma as any).db` em `reports/reports.service.ts` e `prisma/prisma.service.ts` — padrão incomum, requer investigação separada.

---

## Global Constraints

1. **Nunca usar `name` no modelo `User`** — sempre `fullName`.
2. **`role` é uma relação** — nunca filtrar com `where: { role: 'X' }`; usar `roleCode`.
3. **Padrão de substituição**: `(this.prisma as any).X.method(args)` → `this.prisma.X.method(args)`.
4. **Erros TS pré-existentes** que surgem ao remover o cast devem ser resolvidos com `as any` cirúrgico nos **argumentos** (ex: `arg as any`) — **nunca** em `this.prisma`.
5. **Sem migrações de schema** para ficheiros com modelos existentes — apenas substituição de casts.
6. **`roleTemplate`** — investigar se o modelo existe no schema antes de criar; só criar schema se o modelo for genuinamente necessário.
7. **Prettier**: todas as linhas devem caber em 100 chars (usar multi-linha quando necessário).
8. **Zero `(this.prisma as any)` no final** em todos os ficheiros alvo.

---

## Tarefas

### Task 1 — Setup do worktree e baseline

**Objectivo**: Verificar que o worktree está limpo e os testes base passam.

```bash
# No worktree fix+grupo-g-quick-wins:
cd .claude/worktrees/fix+grupo-g-quick-wins

# Verificar estado
git status
git log --oneline -3

# Baseline das suites relevantes (deve passar sem erros)
npx jest --testPathPattern="competencies|declarations|notifications|leadership|history|development-plans|leader\.service|succession|talent-development|performance\.service|dashboard-rh|api-integration|career-plans|roi-impact|departments|roles-permissions|attendance\.service\.spec|performance\.service\.progress" --passWithNoTests 2>&1 | tail -10
```

Commita o ficheiro de plano se ainda não estiver commitado.

### Task 2 — Ficheiros com 1 cast (6 ficheiros, modelos existentes)

**Objectivo**: Remover `(this.prisma as any)` nos 6 ficheiros de 1 cast.

Ficheiros e linhas exactas:

| Ficheiro | Linha | Modelo |
|---|---|---|
| `src/competencies/competencies.service.ts` | ~369 | `positionCompetency` |
| `src/declarations/document-declarations.service.ts` | ~86 | `declarationTemplate` |
| `src/notifications/notifications.service.ts` | ~418 | `automationRule` |
| `src/leadership/leadership.service.ts` | ~270 | `continuousFeedback` |
| `src/history/history.service.ts` | ~309 | `avatarSession` |
| `src/development-plans/development-plans.service.ts` | ~387 | `pdiEvidence` |

**Processo por ficheiro**:
1. Ler o ficheiro na zona do cast
2. Substituir `(this.prisma as any).X` por `this.prisma.X`
3. Se surgirem erros TS, resolver com `as any` cirúrgico nos argumentos
4. Verificar que `npx tsc --noEmit` não introduz novos erros

**Verificação**: `grep -r "(this.prisma as any)" src/competencies src/declarations src/notifications src/leadership src/history src/development-plans` deve retornar vazio.

Commit único: `refactor(grupo-g): remover (this.prisma as any) em 6 ficheiros de 1 cast`

### Task 3 — Ficheiros com 2 casts (5 ficheiros, modelos existentes)

**Objectivo**: Remover `(this.prisma as any)` nos 5 ficheiros de 2 casts.

Ficheiros e linhas:

| Ficheiro | Linhas | Modelos |
|---|---|---|
| `src/leader/leader.service.ts` | ~301, ~537 | `user`, `developmentPlan` |
| `src/succession/succession.service.ts` | ~268, ~537 | `successionPlan` (×2) |
| `src/talent-development/talent-development.service.ts` | ~713, ~1404 | `pdiEvidence`, `course` |
| `src/performance/performance.service.ts` | ~389, ~502 | `continuousFeedback`, `user` |
| `src/dashboard-rh/dashboard-rh.service.ts` | ~225, ~542 | `position`, `userCompetency` |

**Atenção**: `performance.service.ts:502` usa `(this.prisma as any).user` — pode ser `this.prisma.user` directamente. Se surgir erro de tipo no resultado, usar `result as any` ou ajuste cirúrgico.

Commit único: `refactor(grupo-g): remover (this.prisma as any) em 5 ficheiros de 2 casts`

### Task 4 — Ficheiros com 3–4 casts (4 ficheiros, modelos existentes)

**Objectivo**: Remover `(this.prisma as any)` nos 4 ficheiros de 3–4 casts.

Ficheiros e linhas:

| Ficheiro | Linhas | Modelos |
|---|---|---|
| `src/api-integration/api-integration.service.ts` | ~193, ~211, ~581 | `apiIntegrationLog` (×3) |
| `src/career-plans/career-plans.service.ts` | ~114, ~128, ~514 + possivelmente outra | `careerPath`, `user` |
| `src/roi-impact/roi-impact.service.ts` | ~99, ~105, ~260, ~266 | `assessmentAttempt` (×2), `lessonProgress` (×2) |
| `src/departments/departments.service.ts` | ~419, ~478, ~487, ~586 | `unit`, `permission`, `rolePermission`, `careerPosition` |

**Verificação**: `grep -r "(this.prisma as any)" src/api-integration src/career-plans src/roi-impact src/departments` deve retornar vazio.

Commit único: `refactor(grupo-g): remover (this.prisma as any) em 4 ficheiros de 3-4 casts`

### Task 5 — roles-permissions.service.ts (roleTemplate — investigar)

**Objectivo**: Resolver os 3 casts em `src/roles-permissions/roles-permissions.service.ts`.

**Passos**:
1. Ler `src/roles-permissions/roles-permissions.service.ts` nas linhas ~395–430
2. Verificar o schema (`prisma/schema.prisma`) — procurar `RoleTemplate`
3. Se `RoleTemplate` **não existir no schema**:
   - Ler o que o código faz com `roleTemplate` (fields usados em create/findMany/etc.)
   - Se o modelo faz sentido, criar em `prisma/schema.prisma` e gerar migração com `npx prisma migrate dev --name "add-role-template"`
   - Alternativa: se o código parece dead/incompleto, resolver com `as any` cirúrgico nos argumentos (não em `this.prisma`)
4. Remover os 3 casts e ajustar o código

Commit: `refactor(grupo-g): remover (this.prisma as any).roleTemplate em roles-permissions`

### Task 6 — Spec files + TS fixes + validação geral

**Objectivo**: Limpar spec files e garantir que todos os testes passam.

**Spec files**:

1. `src/attendance/attendance.service.spec.ts:62`:
   ```typescript
   // Antes:
   (this.prisma as any).attendanceRecord.method(...)
   // Depois:
   this.prisma.attendanceRecord.method(...)
   ```
   Note: Em spec files, `prisma` é um mock. Verificar se o mock tem `attendanceRecord` tipado — se não, pode ser necessário `(prisma as any).attendanceRecord` (cast no mock, não em `this.prisma`).

2. `src/performance/performance.service.progress.spec.ts:42` (e outras ocorrências):
   Mesma abordagem — cast no mock se necessário.

**Validação final**:
```bash
npx jest --testPathPattern="competencies|declarations|notifications|leadership|history|development-plans|leader\.service|succession|talent-development|performance\.service|dashboard-rh|api-integration|career-plans|roi-impact|departments|roles-permissions|attendance\.service\.spec|performance\.service\.progress" --passWithNoTests 2>&1 | tail -20
```

Deve mostrar 0 failures.

Commit: `refactor(grupo-g): limpar spec files e resolver erros TS pós-remoção`

### Task 7 — PR

**Objectivo**: Push e criação do PR.

```bash
git push -u origin fix/grupo-g-quick-wins

gh pr create \
  --title "refactor(quick-wins): Grupo G — remover (this.prisma as any) em 17 ficheiros" \
  --body "$(cat <<'EOF'
## Summary

- Remove todas as ocorrências de \`(this.prisma as any)\` em 17 ficheiros com 1–4 casts cada
- Todos os modelos Prisma já existiam no schema — nenhuma migração adicional
- Ficheiros cobertos: competencies, declarations, notifications, leadership, history, development-plans, leader, succession, talent-development, performance, dashboard-rh, api-integration, career-plans, roi-impact, departments, roles-permissions, attendance spec, performance spec

## Test plan
- [ ] All affected test suites pass (0 failures)
- [ ] Zero \`(this.prisma as any)\` nos ficheiros alvo
- [ ] CI verde (lint, formatação, build, testes, regressão)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

gh pr merge --auto --squash --delete-branch
```

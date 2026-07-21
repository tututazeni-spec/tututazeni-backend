# Grupo F — RH: Remoção de `(this.prisma as any)` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover os 68 `(this.prisma as any)` casts em `attendance.service.ts`, `work-declaration.service.ts` e `leave-management.service.ts`, substituindo por chamadas Prisma tipadas.

**Architecture:** Todos os modelos já existem no schema Prisma — não há migrações. A substituição é mecânica: `(this.prisma as any).modelName.` → `this.prisma.modelName.` por modelo, seguida de verificação TypeScript e correção cirúrgica de qualquer erro novo com `as any` no argumento específico (nunca em `this.prisma`).

**Tech Stack:** NestJS, Prisma ORM, TypeScript, Jest. Branch em git worktree isolado.

## Global Constraints

- Shell: PowerShell (Windows) — usar Bash tool quando necessário
- Worktree: `git worktree add .claude/worktrees/fix+grupo-f-rh -b fix/grupo-f-rh`
- Todos os steps correm a partir do worktree
- `replace_all: true` em cada Edit para garantir que todos os casts do modelo são substituídos
- Commit messages: `refactor(attendance|work-declaration|leave-management):` conforme o ficheiro
- TypeScript: após cada substituição, verificar erros apenas nos ficheiros alterados

---

## File Map

| Ficheiro | Acção | Nº de casts |
|---|---|---|
| `src/attendance/attendance.service.ts` | Modificar | 20 |
| `src/work-declaration/work-declaration.service.ts` | Modificar | 32 |
| `src/leave-management/leave-management.service.ts` | Modificar | 16 |
| `src/attendance/attendance.service.spec.ts` | Verificar mocks | — |
| `src/attendance/attendance.service.progress.spec.ts` | Verificar mocks | — |
| `src/work-declaration/work-declaration.service.spec.ts` | Verificar mocks | — |
| `src/work-declaration/work-declaration.service.additional.spec.ts` | Verificar mocks | — |
| `src/leave-management/leave-management.service.spec.ts` | Verificar mocks | — |
| `src/leave-management/leave-management.service.progress.spec.ts` | Verificar mocks | — |

---

## Task 1: Criar worktree + verificar baseline

**Files:**
- Nenhum ficheiro alterado nesta task

- [ ] **Step 1: Criar worktree**

```bash
git worktree add .claude/worktrees/fix+grupo-f-rh -b fix/grupo-f-rh
```

Todos os steps seguintes correm neste diretório: `C:\Users\Placido Costa\innova\.claude\worktrees\fix+grupo-f-rh`

- [ ] **Step 2: Confirmar contagem de casts baseline**

```bash
cd "C:\Users\Placido Costa\innova\.claude\worktrees\fix+grupo-f-rh"
grep -c "(this\.prisma as any)" src/attendance/attendance.service.ts
grep -c "(this\.prisma as any)" src/work-declaration/work-declaration.service.ts
grep -c "(this\.prisma as any)" src/leave-management/leave-management.service.ts
```

Esperado: `20`, `32`, `16`

- [ ] **Step 3: Confirmar zero erros TypeScript baseline nos ficheiros alvo**

```bash
npx tsc --noEmit 2>&1 | grep -E "attendance\.service|work-declaration\.service|leave-management\.service" | head -10
echo "Exit: $?"
```

Esperado: zero linhas de erro (erros noutros módulos são pré-existentes e ignorados).

---

## Task 2: Substituir casts em `attendance.service.ts` — modelo attendanceRecord (20 casts)

**Files:**
- Modify: `src/attendance/attendance.service.ts`

**Context:** Todo o ficheiro usa apenas `attendanceRecord`. Substituição total com `replace_all: true`.

- [ ] **Step 1: Substituir attendanceRecord**

No ficheiro `src/attendance/attendance.service.ts`, substituir TODAS as ocorrências (replace_all: true):
- `(this.prisma as any).attendanceRecord.` → `this.prisma.attendanceRecord.`

- [ ] **Step 2: Verificar zero casts restantes**

```bash
grep -c "(this\.prisma as any)" src/attendance/attendance.service.ts
```

Esperado: `0`

- [ ] **Step 3: Verificar erros TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "attendance\.service\.ts" | head -20
```

Esperado: zero linhas. Se houver erros:
- `Type 'string' is not assignable to type 'number'` em `where: { id }` → `where: { id } as any`
- `data: dto` com XOR violation → `data: dto as any`
- Aplicar cirurgicamente no argumento específico, nunca em `this.prisma`

- [ ] **Step 4: Commit**

```bash
git add src/attendance/attendance.service.ts
git commit -m "refactor(attendance): substituir 20 as any — attendanceRecord (Grupo F)"
```

---

## Task 3: Substituir casts em `work-declaration.service.ts` — modelos declaration e declarationTemplate (23 casts)

**Files:**
- Modify: `src/work-declaration/work-declaration.service.ts`

**Context:** `declaration` tem 15 casts, `declarationTemplate` tem 8 casts. Total: 23.

- [ ] **Step 1: Substituir declaration**

No ficheiro `src/work-declaration/work-declaration.service.ts`, substituir TODAS as ocorrências (replace_all: true):
- `(this.prisma as any).declaration.` → `this.prisma.declaration.`

- [ ] **Step 2: Substituir declarationTemplate**

- `(this.prisma as any).declarationTemplate.` → `this.prisma.declarationTemplate.`

- [ ] **Step 3: Verificar contagem parcial**

```bash
grep -c "(this\.prisma as any)" src/work-declaration/work-declaration.service.ts
```

Esperado: `9` (32 − 23 substituídos)

- [ ] **Step 4: Verificar erros TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "work-declaration\.service\.ts" | head -20
```

Esperado: zero linhas. Corrigir com `as any` no argumento se necessário.

---

## Task 4: Substituir casts em `work-declaration.service.ts` — modelos restantes (9 casts)

**Files:**
- Modify: `src/work-declaration/work-declaration.service.ts`

**Context:** Restam 9 casts: `declarationSignature` (2×), `declarationAuditLog` (2×), `declarationTenantConfig` (2×), `declarationAccessLog` (2×), `user` (1×).

- [ ] **Step 1: Substituir declarationSignature**

- `(this.prisma as any).declarationSignature.` → `this.prisma.declarationSignature.`

- [ ] **Step 2: Substituir declarationAuditLog**

- `(this.prisma as any).declarationAuditLog.` → `this.prisma.declarationAuditLog.`

- [ ] **Step 3: Substituir declarationTenantConfig**

- `(this.prisma as any).declarationTenantConfig.` → `this.prisma.declarationTenantConfig.`

- [ ] **Step 4: Substituir declarationAccessLog**

- `(this.prisma as any).declarationAccessLog.` → `this.prisma.declarationAccessLog.`

- [ ] **Step 5: Substituir user (1 cast)**

- `(this.prisma as any).user.` → `this.prisma.user.`

- [ ] **Step 6: Verificar zero casts restantes**

```bash
grep -c "(this\.prisma as any)" src/work-declaration/work-declaration.service.ts
```

Esperado: `0`

- [ ] **Step 7: TypeScript check completo**

```bash
npx tsc --noEmit 2>&1 | grep "work-declaration\.service\.ts" | head -20
```

Esperado: zero linhas. Corrigir argumentos problemáticos com `as any` se necessário.

- [ ] **Step 8: Commit**

```bash
git add src/work-declaration/work-declaration.service.ts
git commit -m "refactor(work-declaration): substituir 32 as any — declaration, declarationTemplate, declarationSignature, declarationAuditLog, declarationTenantConfig, declarationAccessLog (Grupo F)"
```

---

## Task 5: Substituir casts em `leave-management.service.ts` (16 casts)

**Files:**
- Modify: `src/leave-management/leave-management.service.ts`

**Context:** `leaveTypeConfig` (9×), `leavePolicy` (3×), `enrollment` (2× com optional chaining `?.updateMany?.`), `eventParticipant` (1× com optional chaining). Para `enrollment` e `eventParticipant` com optional chaining, substituir apenas `(this.prisma as any).` por `this.prisma.` mantendo o `?.` existente.

- [ ] **Step 1: Substituir leaveTypeConfig**

- `(this.prisma as any).leaveTypeConfig.` → `this.prisma.leaveTypeConfig.`

- [ ] **Step 2: Substituir leavePolicy**

- `(this.prisma as any).leavePolicy.` → `this.prisma.leavePolicy.`

- [ ] **Step 3: Substituir enrollment**

- `(this.prisma as any).enrollment` → `this.prisma.enrollment`

(Manter o `?.updateMany?.` que segue após — apenas remover o `as any` cast)

- [ ] **Step 4: Substituir eventParticipant**

- `(this.prisma as any).eventParticipant` → `this.prisma.eventParticipant`

- [ ] **Step 5: Verificar zero casts restantes**

```bash
grep -c "(this\.prisma as any)" src/leave-management/leave-management.service.ts
```

Esperado: `0`

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | grep "leave-management\.service\.ts" | head -20
```

Esperado: zero linhas. Padrões esperados se houver erro:
- `leaveTypeConfig.create({ data: dto as any })` — `leaveTypeConfig` já tem `data: dto as any` em alguns casts originais, manter
- `leavePolicy.create` com campos extra → `data: dto as any`
- `enrollment?.updateMany?.` — pode precisar de `data: ... as any`

- [ ] **Step 7: Commit**

```bash
git add src/leave-management/leave-management.service.ts
git commit -m "refactor(leave-management): substituir 16 as any — leaveTypeConfig, leavePolicy, enrollment, eventParticipant (Grupo F)"
```

---

## Task 6: Verificar testes e spec mocks + PR

**Files:**
- Verify: `src/attendance/attendance.service.spec.ts`
- Verify: `src/attendance/attendance.service.progress.spec.ts`
- Verify: `src/work-declaration/work-declaration.service.spec.ts`
- Verify: `src/work-declaration/work-declaration.service.additional.spec.ts`
- Verify: `src/leave-management/leave-management.service.spec.ts`
- Verify: `src/leave-management/leave-management.service.progress.spec.ts`

**Context — estado atual dos mocks:**
- `attendance.service.spec.ts`: usa `mockPrismaProxy` com intercepção explícita de `attendanceRecord` — funcionará após remoção do `as any`
- `work-declaration.service.spec.ts`: usa Proxy genérico com `declarationTemplate` e `declaration` explícitos + fallback genérico — funcionará
- `leave-management`: a verificar durante execução

Se algum spec usar nome de modelo antigo (ex: `(this.prisma as any).leaveTypeConfig` no mock vs `this.prisma.leaveTypeConfig` na implementação), renomear o mock para corresponder.

- [ ] **Step 1: Correr testes das suites**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx jest --testPathPatterns="attendance|work-declaration|leave-management" --passWithNoTests --no-coverage --forceExit 2>&1 | tail -40
```

Esperado: todos os suites passam, zero falhas.

Se algum teste falhar com "X is not a function":
- O mock não está a interceptar o modelo correto
- Verificar o spec e adicionar intercepção explícita no Proxy

- [ ] **Step 2: TypeScript check global nos ficheiros alvo**

```bash
npx tsc --noEmit 2>&1 | grep -E "attendance\.service|work-declaration\.service|leave-management\.service" | head -20
echo "---done---"
```

Esperado: zero linhas antes de `---done---`.

- [ ] **Step 3: Push**

```bash
git push -u origin fix/grupo-f-rh
```

- [ ] **Step 4: Criar PR**

```bash
gh pr create \
  --title "refactor(rh): Grupo F — 68 as-any removidos em attendance, work-declaration e leave-management" \
  --body "$(cat <<'EOF'
## Summary

- Remove **20** ocorrências de \`(this.prisma as any)\` em \`attendance.service.ts\`
- Remove **32** ocorrências de \`(this.prisma as any)\` em \`work-declaration.service.ts\`
- Remove **16** ocorrências de \`(this.prisma as any)\` em \`leave-management.service.ts\`
- Modelos tipados: \`attendanceRecord\`, \`declaration\`, \`declarationTemplate\`, \`declarationSignature\`, \`declarationAuditLog\`, \`declarationTenantConfig\`, \`declarationAccessLog\`, \`leaveTypeConfig\`, \`leavePolicy\`, \`enrollment\`, \`eventParticipant\`
- Sem alterações ao schema, DTOs, controllers ou outros módulos

## Test plan

- [x] \`grep "(this.prisma as any)"\` — zero resultados nos três ficheiros
- [x] \`npx tsc --noEmit\` — zero erros TypeScript nos ficheiros alvo
- [x] \`npx jest attendance work-declaration leave-management\` — todos os testes passam
- [ ] CI quality check

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Auto-merge após CI verde**

```bash
gh pr merge --auto --squash --delete-branch
```

---

## Self-Review

**Spec coverage:**
| Requisito da spec | Task |
|---|---|
| 20 casts removidos em attendance.service.ts | Task 2 ✓ |
| 32 casts removidos em work-declaration.service.ts | Tasks 3–4 ✓ |
| 16 casts removidos em leave-management.service.ts | Task 5 ✓ |
| Zero erros TypeScript | Tasks 2, 3, 4, 5, 6 ✓ |
| Testes passam | Task 6 ✓ |
| Sem alterações ao schema | verificado — nenhuma task toca no schema ✓ |

**Placeholder scan:** Todos os steps têm conteúdo concreto. Sem TBD.

**Type consistency:** Nomes de modelos são camelCase conforme Prisma gera o client: `attendanceRecord`, `declarationTemplate`, `declaration`, `leaveTypeConfig`, `leavePolicy`, `enrollment`, `eventParticipant`.

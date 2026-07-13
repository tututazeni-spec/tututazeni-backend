# A4-PR2 — Substituir $queryRawUnsafe por $queryRaw+::regclass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar `$queryRawUnsafe` do gerador de código de financiador, substituindo por `$queryRaw` com tagged template e cast `::regclass` (SQLi A4-PR2, 🟡 Médio).

**Architecture:** Alteração cirúrgica em `generateCode()` no serviço backend. O PostgreSQL aceita o nome da sequência como parâmetro de texto e resolve o OID via `::regclass` — comportamento idêntico, sem concatenação de string SQL. O teste mock e a asserção são actualizados para reflectir a nova API.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest

## Global Constraints

- Comportamento em runtime idêntico — `nextval()` deve continuar a devolver o próximo valor da sequência
- Sem alterações ao schema, DTOs, controllers ou outros módulos
- `$queryRawUnsafe` deve desaparecer de `crm-funders.service.ts`
- Os testes do módulo devem passar: `npx jest crm-funders --testPathPattern=crm-funders.service.spec`
- tsc sem erros após a alteração

---

### Task 1: Actualizar teste e implementação de generateCode

**Files:**
- Modify: `src/crm-funders/crm-funders.service.ts:44-46`
- Modify: `src/crm-funders/crm-funders.service.spec.ts:79` (mock)
- Modify: `src/crm-funders/crm-funders.service.spec.ts:129-131` (asserção)

**Interfaces:**
- Consumes: `this.prisma.$queryRaw` (Prisma tagged template — devolve `Promise<T[]>`)
- Produces: mesmo tipo de retorno `{ nextval: bigint }[]` — sem alteração de interface pública

- [ ] **Step 1: Actualizar o mock no spec (RED — garantir que o teste falha com o mock errado)**

Em `src/crm-funders/crm-funders.service.spec.ts`, linha 79, substituir:

```typescript
// Antes (linha 79)
$queryRawUnsafe: jest.fn().mockResolvedValue([{ nextval: 1n }]),

// Depois (linha 79)
$queryRaw: jest.fn().mockResolvedValue([{ nextval: 1n }]),
```

- [ ] **Step 2: Correr o teste para confirmar que falha (ainda usa $queryRawUnsafe na implementação)**

```powershell
cd "C:\Users\Placido Costa\innova"
npx jest crm-funders --testPathPattern=crm-funders.service.spec --no-coverage 2>&1 | Select-String -Pattern "PASS|FAIL|$queryRaw|nextval|●"
```

Expected: FAIL — o teste tenta chamar `$queryRawUnsafe` mas o mock já não o tem.

- [ ] **Step 3: Actualizar a asserção no spec**

Em `src/crm-funders/crm-funders.service.spec.ts`, substituir as linhas 129-131:

```typescript
// Antes (linhas 129-131)
expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
  expect.stringContaining("nextval('funder_code_seq')"),
);

// Depois (linhas 129-131)
expect(mockPrisma.$queryRaw).toHaveBeenCalled();
```

- [ ] **Step 4: Actualizar a implementação em crm-funders.service.ts**

Em `src/crm-funders/crm-funders.service.ts`, substituir as linhas 44-46:

```typescript
// Antes (linhas 43-47)
  private async generateCode(prefix: string, model: 'funder' | 'fundingGrant'): Promise<string> {
    const sequence = CrmFundersService.CODE_SEQUENCES[model];
    // Escrita (avança o contador) → tem de ir ao primary, nunca à réplica.
    const rows = await this.prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
      `SELECT nextval('${sequence}') AS nextval`,
    );
    return `${prefix}-${String(Number(rows[0].nextval)).padStart(5, '0')}`;
  }

// Depois (linhas 43-47)
  private async generateCode(prefix: string, model: 'funder' | 'fundingGrant'): Promise<string> {
    const sequence = CrmFundersService.CODE_SEQUENCES[model];
    // Escrita (avança o contador) → tem de ir ao primary, nunca à réplica.
    const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval(${sequence}::regclass) AS nextval
    `;
    return `${prefix}-${String(Number(rows[0].nextval)).padStart(5, '0')}`;
  }
```

- [ ] **Step 5: Correr os testes para confirmar que passam (GREEN)**

```powershell
cd "C:\Users\Placido Costa\innova"
npx jest crm-funders --testPathPattern=crm-funders.service.spec --no-coverage 2>&1 | Select-String -Pattern "PASS|FAIL|Tests:|●"
```

Expected: `PASS src/crm-funders/crm-funders.service.spec.ts` e todos os testes a verde.

- [ ] **Step 6: Verificar ausência de $queryRawUnsafe no ficheiro de serviço**

```powershell
Select-String -Path "src\crm-funders\crm-funders.service.ts" -Pattern "queryRawUnsafe"
```

Expected: zero resultados.

- [ ] **Step 7: Verificar tsc**

```powershell
cd "C:\Users\Placido Costa\innova"
npx tsc --noEmit --project tsconfig.build.json 2>&1 | Select-String -Pattern "error TS|crm-funders"
```

Expected: sem erros em `crm-funders`.

- [ ] **Step 8: Commit**

```powershell
git add src/crm-funders/crm-funders.service.ts src/crm-funders/crm-funders.service.spec.ts
git commit -m "fix(security): substituir queryRawUnsafe por queryRaw+::regclass em crm-funders (A4-PR2)"
```

Expected: commit criado com sucesso.

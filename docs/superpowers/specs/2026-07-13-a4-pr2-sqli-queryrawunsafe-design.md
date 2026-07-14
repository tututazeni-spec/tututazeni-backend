# Design: A4-PR2 — Substituir $queryRawUnsafe por $queryRaw em crm-funders

**Data:** 2026-07-13
**Faixa de auditoria:** A-4 (SQLi)
**Severidade:** 🟡 Médio

## Problema

`src/crm-funders/crm-funders.service.ts:44` usa `$queryRawUnsafe` com interpolação
de string para invocar `nextval()` numa sequência PostgreSQL. Embora `sequence` venha
de um mapa hardcoded (`CODE_SEQUENCES`) e não seja exploitável hoje, `$queryRawUnsafe`
desactiva completamente a parameterização do Prisma — qualquer refactoring futuro que
introduza input externo tornaria isto num SQLi imediato.

## Solução (Opção A)

Substituir por `$queryRaw` com tagged template literal e cast `::regclass`.
O PostgreSQL aceita o nome da sequência como parâmetro de texto e resolve o OID
internamente — sem concatenação, sem `$queryRawUnsafe`.

**Ficheiro principal:** `src/crm-funders/crm-funders.service.ts:44`

```typescript
// Antes
const rows = await this.prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
  `SELECT nextval('${sequence}') AS nextval`,
);

// Depois
const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
  SELECT nextval(${sequence}::regclass) AS nextval
`;
```

**Ficheiro de teste:** `src/crm-funders/crm-funders.service.spec.ts`

Mock na linha ~79:
```typescript
// Antes
$queryRawUnsafe: jest.fn().mockResolvedValue([{ nextval: 1n }]),
// Depois
$queryRaw: jest.fn().mockResolvedValue([{ nextval: 1n }]),
```

Asserção na linha ~129:
```typescript
// Antes
expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(...)
// Depois
expect(mockPrisma.$queryRaw).toHaveBeenCalled()
```

## Scope

- 2 ficheiros alterados: `crm-funders.service.ts` e `crm-funders.service.spec.ts`
- ~4 linhas no total
- Sem alterações ao schema, API, DTOs ou outros módulos
- Comportamento em runtime idêntico

## Critério de sucesso

- Zero ocorrências de `$queryRawUnsafe` em `crm-funders.service.ts`
- Testes do módulo passam (`npx jest crm-funders`)
- tsc sem erros

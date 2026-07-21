# Grupo E — Scalability: Remoção de `(this.prisma as any)` casts

## Contexto

Continuação da série de remoção de casts `(this.prisma as any)` iniciada nos Grupos A–D. O Grupo E abrange o módulo `scalability`, que contém os dois ficheiros com mais casts após o Grupo D.

## Âmbito

| Ficheiro | Casts |
|---|---|
| `src/scalability/scalability.service.ts` | 44 |
| `src/scalability/scalability.events.ts` | 7 |
| **Total** | **51** |

## Modelos Prisma Envolvidos

Todos os modelos já existem no schema — **não são necessárias migrações**:

| Modelo (camelCase no serviço) | Operações usadas |
|---|---|
| `tenantConfig` | findUnique, create, update, findMany, count |
| `integrationConfig` | findUnique, create, update |
| `integrationSyncLog` | create, findMany, findFirst, update |
| `automationRule` | findUnique, create, update |
| `automationExecution` | create, update, count |
| `contentDeliveryConfig` | create, findUnique, upsert |
| `slaConfig` | create, findUnique, update, findMany |
| `systemAlert` | create, findUnique, update, findMany, count, groupBy |
| `scalabilityMetric` | create, findMany, findFirst |
| `enrollment` | upsert (já tipado noutros módulos) |

## Abordagem Técnica

**Regra geral:** substituir `(this.prisma as any).modelName.method(args)` por `this.prisma.modelName.method(args)`.

**Quando TypeScript rejeitar:** aplicar `as any` apenas no argumento problemático (ex: `data: dto as any`), nunca em `this.prisma` inteiro.

**Padrões esperados de erro pós-substituição:**
- `data: dto` onde o DTO tem campos extra não presentes no `CreateInput` → `data: dto as any`
- `where` com campos opcionais — normalmente compatível sem cast
- `groupBy` com `by` como array de strings — pode precisar de `by: [...] as any`

## Verificações

1. `Select-String "(this.prisma as any)" scalability.service.ts` → zero resultados
2. `Select-String "(this.prisma as any)" scalability.events.ts` → zero resultados
3. `npx tsc --noEmit 2>&1 | Select-String "scalability"` → zero erros
4. `npx jest scalability --passWithNoTests --no-coverage --forceExit` → pass

## O que NÃO muda

- Schema Prisma (sem migrações)
- DTOs e controllers
- Qualquer outro módulo fora de `scalability`

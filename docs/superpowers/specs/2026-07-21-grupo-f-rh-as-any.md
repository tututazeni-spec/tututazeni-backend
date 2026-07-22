# Grupo F — RH (attendance, work-declaration, leave-management): Remoção de `(this.prisma as any)` casts

## Contexto

Continuação da série de remoção de casts `(this.prisma as any)` iniciada nos Grupos A–E. O Grupo F abrange três módulos RH com o maior número de casts remanescentes.

## Âmbito

| Ficheiro | Casts |
|---|---|
| `src/work-declaration/work-declaration.service.ts` | 32 |
| `src/attendance/attendance.service.ts` | 20 |
| `src/leave-management/leave-management.service.ts` | 16 |
| **Total** | **68** |

## Spec Files a Verificar

| Spec | Padrão de mock atual |
|---|---|
| `src/attendance/attendance.service.spec.ts` | `mockPrismaProxy` com intercepção explícita de `attendanceRecord` + Proxy genérico |
| `src/attendance/attendance.service.progress.spec.ts` | a verificar |
| `src/work-declaration/work-declaration.service.spec.ts` | Proxy genérico com `declarationTemplate` e `declaration` explícitos |
| `src/work-declaration/work-declaration.service.additional.spec.ts` | a verificar |
| `src/leave-management/leave-management.service.spec.ts` | a verificar |
| `src/leave-management/leave-management.service.progress.spec.ts` | a verificar |

## Modelos Prisma Envolvidos

Todos os modelos já existem no schema — **não são necessárias migrações**:

| Módulo | Modelo (camelCase) | Operações usadas | Casts |
|---|---|---|---|
| attendance | `attendanceRecord` | findMany, findUnique, findFirst, create, update, delete, count, createMany, updateMany | 20 |
| work-declaration | `declaration` | create, update, findUnique, findFirst, findMany, count, groupBy | 15 |
| work-declaration | `declarationTemplate` | create, update, updateMany, findUnique, findFirst, findMany, delete, count | 8 |
| work-declaration | `declarationSignature` | findMany, upsert | 2 |
| work-declaration | `declarationAuditLog` | create, findMany | 2 |
| work-declaration | `declarationTenantConfig` | findUnique, upsert | 2 |
| work-declaration | `declarationAccessLog` | create (×2) | 2 |
| work-declaration | `user` | findFirst | 1 |
| leave-management | `leaveTypeConfig` | findUnique, findMany, create, update | 9 |
| leave-management | `leavePolicy` | findFirst, findMany, create | 3 |
| leave-management | `enrollment` | (via optional chaining `?.updateMany?.`) | 2 |
| leave-management | `eventParticipant` | (acesso via optional chaining) | 1 |

## Abordagem Técnica

**Regra geral:** substituir `(this.prisma as any).modelName.method(args)` por `this.prisma.modelName.method(args)`.

**Quando TypeScript rejeitar:** aplicar `as any` apenas no argumento problemático (ex: `data: dto as any`, `where: { id } as any`), nunca em `this.prisma` inteiro.

**Padrões esperados de erro pós-substituição:**
- `data: dto` onde o DTO tem campos que violam o XOR Prisma (`UncheckedCreateInput` vs `CreateInput`) → `data: dto as any`
- `where` com IDs inteiros recebendo strings → `where: { id } as any`
- `groupBy` com `by` como array de strings → `by: [...] as any`
- `enrollment?.updateMany?.` com optional chaining — manter `as any` no `data` se necessário

## Verificações

1. `Select-String "(this.prisma as any)"` em cada ficheiro → zero resultados
2. `npx tsc --noEmit 2>&1 | Select-String "attendance|work-declaration|leave-management"` → zero erros
3. `npx jest attendance work-declaration leave-management --passWithNoTests --no-coverage --forceExit` → pass

## O que NÃO muda

- Schema Prisma (sem migrações)
- DTOs, controllers, outros módulos
- Qualquer outro módulo fora dos três serviços do Grupo F

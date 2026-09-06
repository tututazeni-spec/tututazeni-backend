import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolve o tenant a usar em escritas/filtros de modelos multi-tenant.
 *
 * O JWT/auth flow real nunca popula `tenantId` (ver `src/auth/`) — chega sempre
 * `undefined`. Sem isto, todo o `create()` de modelos com `tenantId` obrigatório
 * (Declaration, DeclarationTemplate, IntegrationConfig, AutomationRule, ...)
 * rebenta com `PrismaClientValidationError`, e todo o filtro `where: { tenantId }`
 * em leituras é silenciosamente ignorado pelo Prisma (undefined não filtra).
 *
 * Antes desta função, este bloco exacto estava copiado em 5 serviços
 * (`api-integration`, `automation`, `notifications`, `declarations/document-declarations`,
 * `work-declaration` como `resolveTenantId`). Ver
 * `docs/superpowers/plans/2026-09-05-fase-e-declarations-merge.md` (Task 2).
 *
 * @param prisma   instância de `PrismaService` (escreve no primário).
 * @param tenantId se fornecido (truthy), devolvido tal-e-qual sem tocar na BD.
 * @returns id do primeiro `TenantConfig`, criando `{ tenantCode: 'DEFAULT' }` se não existir nenhum.
 */
export async function resolveDefaultTenantId(
  prisma: PrismaService,
  tenantId?: string,
): Promise<string> {
  if (tenantId) return tenantId;
  const existing = await prisma.tenantConfig.findFirst();
  if (existing) return existing.id;
  const created = await prisma.tenantConfig.create({
    data: { tenantCode: 'DEFAULT', tenantName: 'Default Tenant' },
  });
  return created.id;
}

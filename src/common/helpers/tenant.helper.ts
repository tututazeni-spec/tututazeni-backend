import type { PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../rls/rls-context';

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
  // Chamado por ~15 serviços de Definições, vários deles em caminho quente (o interceptor de
  // sistema lê as definições em CADA pedido): o id do tenant por omissão praticamente não muda,
  // por isso memoriza-se com TTL curto. A promise (e não o valor) fica em cache, o que também
  // deduplica chamadas concorrentes. Falhas não ficam em cache.
  const hit = defaultTenantCache.get(prisma);
  if (hit && hit.expiresAt > Date.now()) return hit.id;

  const id = lookupOrCreateDefaultTenant(prisma);
  defaultTenantCache.set(prisma, { id, expiresAt: Date.now() + DEFAULT_TENANT_TTL_MS });
  id.catch(() => {
    if (defaultTenantCache.get(prisma)?.id === id) defaultTenantCache.delete(prisma);
  });
  return id;
}

const DEFAULT_TENANT_TTL_MS = 60_000;
let defaultTenantCache = new WeakMap<object, { id: Promise<string>; expiresAt: number }>();

/** Só para testes: specs que reutilizam o mesmo mock de Prisma entre casos herdariam a cache. */
export function resetDefaultTenantCache(): void {
  defaultTenantCache = new WeakMap();
}

function lookupOrCreateDefaultTenant(prisma: PrismaService): Promise<string> {
  // Config global do tenant (guarda segredos de SSO/webhook): fora do RLS de utilizador.
  return runAsSystem(async () => {
    const existing = await prisma.tenantConfig.findFirst();
    if (existing) return existing.id;
    const created = await prisma.tenantConfig.create({
      data: { tenantCode: 'DEFAULT', tenantName: 'Default Tenant' },
    });
    return created.id;
  });
}

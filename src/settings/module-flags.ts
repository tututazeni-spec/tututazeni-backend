// src/settings/module-flags.ts
// Módulos ativos/inativos — docs/modulo_settings.md §9. Guardados em
// TenantConfig.moduleFlagsJson. Lógica pura: sem acesso à BD.
//
// Reutiliza PermissionSubject (já é a taxonomia de módulos usada em todo o
// RBAC — ver Permission/RolePermission) em vez de inventar uma segunda lista
// de nomes de módulos divergente.

import { PermissionSubject } from '@prisma/client';

export const MODULE_FLAG_KEYS = Object.values(PermissionSubject);

export type ModuleFlags = Record<PermissionSubject, boolean>;

export const DEFAULT_MODULE_FLAGS: ModuleFlags = Object.fromEntries(
  MODULE_FLAG_KEYS.map(k => [k, true]),
) as ModuleFlags;

export function parseModuleFlags(raw: string | null | undefined): ModuleFlags {
  const d = DEFAULT_MODULE_FLAGS;
  if (!raw) return { ...d };
  try {
    const p = JSON.parse(raw) as Partial<Record<string, boolean>>;
    const next = { ...d };
    for (const key of MODULE_FLAG_KEYS) {
      if (typeof p[key] === 'boolean') next[key] = p[key] as boolean;
    }
    return next;
  } catch {
    return { ...d };
  }
}

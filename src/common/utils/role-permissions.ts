// src/common/utils/role-permissions.ts
// Ver memory project-innova-acl-permission-ownership: Role<->Permission é
// M2M via RolePermission (join table), nunca mais um `Role.permissions`
// directo. Todo o código que precisa da lista de permissões de um role
// busca `rolePermissions: { include: { permission: ... } } }` e usa este
// helper para achatar para a forma que a API já devolvia antes (um array
// de Permission, não de RolePermission).

export function flattenRolePermissions<P>(rolePermissions: Array<{ permission: P }>): P[] {
  return rolePermissions.map(rp => rp.permission);
}

// Para respostas que embutem um único role (login/me/JwtStrategy) — mantém a
// forma que a API já devolvia antes desta migração (`role.permissions`),
// sem expor o RolePermission intermédio.
export function withFlatPermissions<T extends { rolePermissions: Array<{ permission: unknown }> }>(
  role: T | null,
):
  | (Omit<T, 'rolePermissions'> & { permissions: T['rolePermissions'][number]['permission'][] })
  | null {
  if (!role) return null;
  const { rolePermissions, ...rest } = role;
  return { ...rest, permissions: flattenRolePermissions(rolePermissions) };
}

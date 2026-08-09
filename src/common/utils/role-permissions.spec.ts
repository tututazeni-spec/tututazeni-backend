// src/common/utils/role-permissions.spec.ts
import { flattenRolePermissions, withFlatPermissions } from './role-permissions';

describe('flattenRolePermissions', () => {
  it('extrai o objecto permission de cada RolePermission', () => {
    const rolePermissions = [
      { permission: { id: 1, name: 'dashboard:view' } },
      { permission: { id: 2, name: 'users:view' } },
    ];
    expect(flattenRolePermissions(rolePermissions)).toEqual([
      { id: 1, name: 'dashboard:view' },
      { id: 2, name: 'users:view' },
    ]);
  });

  it('devolve array vazio quando não há RolePermission', () => {
    expect(flattenRolePermissions([])).toEqual([]);
  });
});

describe('withFlatPermissions', () => {
  it('substitui rolePermissions por permissions no objecto role', () => {
    const role = {
      id: 1,
      name: 'ADMIN',
      rolePermissions: [{ permission: { id: 1, name: 'dashboard:view' } }],
    };
    expect(withFlatPermissions(role)).toEqual({
      id: 1,
      name: 'ADMIN',
      permissions: [{ id: 1, name: 'dashboard:view' }],
    });
  });

  it('devolve null quando o role é null', () => {
    expect(withFlatPermissions(null)).toBeNull();
  });
});

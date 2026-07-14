import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CloneRoleDto, PermissionIdsDto } from './roles-permissions.dto';

describe('CloneRoleDto', () => {
  it('newName válido passa', async () => {
    const errors = await validate(plainToInstance(CloneRoleDto, { newName: 'MANAGER_V2' }));
    expect(errors).toHaveLength(0);
  });

  it('newName em falta falha', async () => {
    const errors = await validate(plainToInstance(CloneRoleDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('newName acima de 100 chars falha', async () => {
    const errors = await validate(plainToInstance(CloneRoleDto, { newName: 'a'.repeat(101) }));
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('PermissionIdsDto', () => {
  it('array de ids válido passa', async () => {
    const errors = await validate(plainToInstance(PermissionIdsDto, { permissionIds: [1, 2, 3] }));
    expect(errors).toHaveLength(0);
  });

  it('permissionIds em falta falha', async () => {
    const errors = await validate(plainToInstance(PermissionIdsDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('string no array falha', async () => {
    const errors = await validate(plainToInstance(PermissionIdsDto, { permissionIds: ['abc'] }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('array com 201 elementos falha (ArrayMaxSize 200)', async () => {
    const errors = await validate(
      plainToInstance(PermissionIdsDto, {
        permissionIds: Array.from({ length: 201 }, (_, i) => i + 1),
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

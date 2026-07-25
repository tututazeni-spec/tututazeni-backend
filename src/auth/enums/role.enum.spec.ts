import { Role, AUTHENTICATED_ROLES } from './role.enum';

describe('AUTHENTICATED_ROLES', () => {
  it('contém todos os valores únicos do enum Role', () => {
    const uniqueValues = [...new Set(Object.values(Role))];
    expect(Array.from(AUTHENTICATED_ROLES)).toHaveLength(uniqueValues.length);
    for (const value of uniqueValues) {
      expect(AUTHENTICATED_ROLES).toContain(value);
    }
  });
});

describe('Roles metadata — DepartmentsController (Grupo B)', () => {
  it('findOne exige GESTOR, RH, ADMIN ou DIRECTOR', () => {
    const { DepartmentsController } = require('../../departments/departments.controller');
    const { ROLES_KEY } = require('../../common/decorators/roles.decorator');
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.findOne,
    );
    expect(meta).toBeDefined();
    expect(meta).toEqual(expect.arrayContaining([Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR]));
    expect(meta).not.toContain(Role.COLABORADOR);
  });

  it('findAll permite qualquer autenticado (contém COLABORADOR)', () => {
    const { DepartmentsController } = require('../../departments/departments.controller');
    const { ROLES_KEY } = require('../../common/decorators/roles.decorator');
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.findAll,
    );
    expect(meta).toBeDefined();
    expect(meta).toContain(Role.COLABORADOR);
  });
});

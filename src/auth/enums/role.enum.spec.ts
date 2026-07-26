import { Role, AUTHENTICATED_ROLES } from './role.enum';
import { DepartmentsController } from '../../departments/departments.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

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
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.findOne,
    );
    expect(meta).toBeDefined();
    expect(meta).toEqual(expect.arrayContaining([Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR]));
    expect(meta).not.toContain(Role.COLABORADOR);
  });

  it('findAll permite qualquer autenticado (contém COLABORADOR)', () => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.findAll,
    );
    expect(meta).toBeDefined();
    expect(meta).toContain(Role.COLABORADOR);
  });
});

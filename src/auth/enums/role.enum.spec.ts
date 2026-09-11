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
  // findOne/metrics alinham com findAll/getTree: visíveis a qualquer
  // autenticado NÃO-COLABORADOR (DEPARTMENTS_VIEW_ROLES). O módulo está
  // oculto na sidebar para COLABORADOR (ver frontend/components/Sidebar.tsx)
  // e isso é espelhado no backend — ver departments.controller.ts. Escrita
  // (create/update/(de)activate/transfer) continua restrita à parte.
  it('findOne permite qualquer autenticado excepto COLABORADOR', () => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.findOne,
    );
    expect(meta).toBeDefined();
    expect(meta).not.toContain(Role.COLABORADOR);
    expect(meta).toEqual(expect.arrayContaining([Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR]));
  });

  it('metrics permite qualquer autenticado excepto COLABORADOR', () => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.metrics,
    );
    expect(meta).toBeDefined();
    expect(meta).not.toContain(Role.COLABORADOR);
  });

  it('findAll permite qualquer autenticado excepto COLABORADOR', () => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.findAll,
    );
    expect(meta).toBeDefined();
    expect(meta).not.toContain(Role.COLABORADOR);
  });
});

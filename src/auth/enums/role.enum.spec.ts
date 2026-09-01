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
  // findOne/metrics são leitura e alinham com findAll/getTree: a lista e a
  // árvore já são visíveis a qualquer autenticado (e o item de nav não tem
  // restrição), por isso o detalhe não pode ser mais restrito — senão um
  // COLABORADOR/LIDER/INSTRUCTOR/AUDITOR que clicasse num nó do organograma
  // levava 403. A escrita continua restrita (ver testes de create/update).
  it('findOne permite qualquer autenticado (contém COLABORADOR)', () => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.findOne,
    );
    expect(meta).toBeDefined();
    expect(meta).toContain(Role.COLABORADOR);
    expect(meta).toEqual(
      expect.arrayContaining([Role.GESTOR, Role.RH, Role.ADMIN, Role.DIRECTOR]),
    );
  });

  it('metrics permite qualquer autenticado (contém COLABORADOR)', () => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      DepartmentsController.prototype.metrics,
    );
    expect(meta).toBeDefined();
    expect(meta).toContain(Role.COLABORADOR);
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

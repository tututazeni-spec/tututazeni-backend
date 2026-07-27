import { CrmPartnersController } from './crm-partners.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

// A10-13: findAll/findOne/addInteraction/getInteractions/completeMilestone
// não tinham @Roles() — qualquer autenticado lia detalhes de contrato de
// parceiros e podia marcar milestones como concluídos, apesar de create/
// update/delete já serem ADMIN/RH/GESTOR.
describe('CrmPartnersController — @Roles nas rotas antes desprotegidas (A10-13)', () => {
  const handlers: [string, string][] = [
    ['findAll', 'GET /crm/partners'],
    ['findOne', 'GET /crm/partners/:id'],
    ['addInteraction', 'POST /crm/partners/:id/interactions'],
    ['getInteractions', 'GET /crm/partners/:id/interactions'],
    ['completeMilestone', 'PUT /crm/partners/milestones/:milestoneId/complete'],
  ];

  it.each(handlers)('%s (%s) exige ADMIN, RH ou GESTOR', methodName => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      (CrmPartnersController.prototype as any)[methodName],
    );
    expect(meta).toBeDefined();
    expect(meta).toEqual(expect.arrayContaining([Role.ADMIN, Role.RH, Role.GESTOR]));
    expect(meta).not.toContain(Role.COLABORADOR);
  });
});

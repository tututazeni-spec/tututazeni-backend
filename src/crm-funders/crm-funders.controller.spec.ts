import { CrmFundersController } from './crm-funders.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

// A10-10: findAll/findOne/findGrants/getDisbursements/addInteraction não
// tinham @Roles() — qualquer autenticado lia montantes de subsídios e
// histórico de desembolsos, e podia injectar interacções com financiadores.
// Regressão: nenhuma destas rotas pode voltar a ficar aberta a qualquer
// autenticado.
describe('CrmFundersController — @Roles nas rotas antes desprotegidas (A10-10)', () => {
  const handlers: [string, string][] = [
    ['findAll', 'GET /crm/funders'],
    ['findOne', 'GET /crm/funders/:id'],
    ['findGrants', 'GET /crm/funders/:id/grants'],
    ['getDisbursements', 'GET /crm/funders/grants/:grantId/disbursements'],
    ['addInteraction', 'POST /crm/funders/:id/interactions'],
  ];

  it.each(handlers)('%s (%s) exige ADMIN, RH ou GESTOR', methodName => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      (CrmFundersController.prototype as any)[methodName],
    );
    expect(meta).toBeDefined();
    expect(meta).toEqual(expect.arrayContaining([Role.ADMIN, Role.RH, Role.GESTOR]));
    expect(meta).not.toContain(Role.COLABORADOR);
  });
});

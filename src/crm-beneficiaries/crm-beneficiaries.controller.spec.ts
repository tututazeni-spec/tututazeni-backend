import { CrmBeneficiariesController } from './crm-beneficiaries.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

// A10-9: findAll/findOne/getInteractions/addInteraction/addNeed/resolveNeed
// não tinham @Roles() — qualquer autenticado lia/escrevia dados de
// beneficiários (nif, telefone, email, notas de caso) apesar de create/
// update/delete já serem ADMIN/RH/GESTOR. Regressão: nenhuma destas rotas
// pode voltar a ficar aberta a qualquer autenticado.
describe('CrmBeneficiariesController — @Roles nas rotas antes desprotegidas (A10-9)', () => {
  const handlers: [string, string][] = [
    ['findAll', 'GET /crm/beneficiaries'],
    ['findOne', 'GET /crm/beneficiaries/:id'],
    ['getInteractions', 'GET /crm/beneficiaries/:id/interactions'],
    ['addInteraction', 'POST /crm/beneficiaries/:id/interactions'],
    ['addNeed', 'POST /crm/beneficiaries/:id/needs'],
    ['resolveNeed', 'PUT /crm/beneficiaries/needs/:needId/resolve'],
  ];

  it.each(handlers)('%s (%s) exige ADMIN, RH ou GESTOR', methodName => {
    const meta: string[] | undefined = Reflect.getMetadata(
      ROLES_KEY,
      (CrmBeneficiariesController.prototype as any)[methodName],
    );
    expect(meta).toBeDefined();
    expect(meta).toEqual(expect.arrayContaining([Role.ADMIN, Role.RH, Role.GESTOR]));
    expect(meta).not.toContain(Role.COLABORADOR);
  });
});

import { join } from 'path';
import { readFileSync } from 'fs';
import { collectAuthzInventory, externalReach } from '../../src/common/guards/authz-inventory';

// Barreira do instrutor externo (fase 3): a lista de handlers a que ele chega está CONGELADA em
// external-reach.snapshot.json. Qualquer endpoint novo que o admita (um @Roles(INSTRUCTOR_EXTERNO)
// ou um @AllowExternal) falha aqui até a lista ser atualizada DE PROPÓSITO, com revisão humana.
describe('alcance do instrutor externo', () => {
  const inv = collectAuthzInventory(join(__dirname, '..', '..', 'src'));
  const reach = externalReach(inv);
  const snapshot: string[] = JSON.parse(
    readFileSync(join(__dirname, 'external-reach.snapshot.json'), 'utf8'),
  );

  it('os handlers acessíveis ao externo são exatamente os do snapshot revisto', () => {
    expect(reach).toEqual(snapshot);
  }, 300_000);

  it('nenhum handler @AnyAuthenticated sem @AllowExternal é acessível ao externo', () => {
    const leaked = inv
      .filter(h => h.policy === 'authenticated' && !h.allowExternal)
      .map(h => `${h.file}#${h.handler}`)
      .filter(id => reach.includes(id));
    expect(leaked).toEqual([]);
  }, 300_000);

  it('o externo nunca alcança endpoints de administração (utilizadores, definições, auditoria, pagamentos)', () => {
    const sensitive =
      /^(users\/(?!users\.controller\.ts#(me|updateMyProfile|setMyAvatar|removeMyAvatar|changePassword)$)|settings\/|audit\/|payroll\/|roles-permissions\/|acl\/|billing\/|leave-management\/|career\/|development-plans\/|evaluation360\/|crm-)/;
    expect(reach.filter(id => sensitive.test(id))).toEqual([]);
  }, 300_000);
});

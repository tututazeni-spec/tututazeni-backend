import { join } from 'path';
import { collectAuthzInventory } from '../../src/common/guards/authz-inventory';

// Gate de CI: todo o handler HTTP declara uma política (@Roles, @RequirePermission,
// @AnyAuthenticated ou @Public). Um endpoint novo sem política falha aqui, e o RolesGuard
// global também o recusaria em runtime (deny-by-default).
describe('cobertura de autorização', () => {
  it('nenhum handler HTTP fica sem política', () => {
    const inv = collectAuthzInventory(join(__dirname, '..', '..', 'src'));
    const offenders = inv.filter(h => h.policy === 'none').map(h => `${h.file}#${h.handler}`);
    expect(inv.length).toBeGreaterThan(1500);
    expect(offenders).toEqual([]);
  }, 300_000);
});

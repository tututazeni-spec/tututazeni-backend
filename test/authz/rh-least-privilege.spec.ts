import { join } from 'path';
import { collectAuthzInventory } from '../../src/common/guards/authz-inventory';

// Operações sem justificação em RH (credenciais de longa duração e canais de saída de dados):
// só ADMIN. As leituras e o resto do módulo continuam abertos a RH por desenho do produto.
const ADMIN_ONLY = [
  'api-integration/api-integration.controller.ts#createApiKey',
  'api-integration/api-integration.controller.ts#revokeApiKey',
  'api-integration/api-integration.controller.ts#rotateApiKey',
  'api-integration/api-integration.controller.ts#createWebhook',
  'api-integration/api-integration.controller.ts#toggleWebhook',
  'api-integration/api-integration.controller.ts#deleteWebhook',
  'api-integration/api-integration.controller.ts#triggerWebhook',
];

describe('menor privilégio do papel RH', () => {
  const inv = collectAuthzInventory(join(__dirname, '..', '..', 'src'));

  it.each(ADMIN_ONLY)('%s é só ADMIN', key => {
    const h = inv.find(x => `${x.file}#${x.handler}` === key);
    expect(h).toBeDefined();
    expect(h!.policy).toBe('roles');
    expect(h!.roles).toEqual(['ADMIN']);
  });
});

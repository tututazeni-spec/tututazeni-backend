import { join } from 'path';
import { collectAuthzInventory } from '../../src/common/guards/authz-inventory';

// Superfície administrativa: controllers cujo propósito é configurar/auditar a plataforma.
const ADMIN_CONTROLLER_FILES = [
  'settings/settings.controller.ts',
  'audit/',
  'scalability/',
  'monitoring/',
  'api-integration',
  'roles-permissions/',
];
// Papéis que podem tocar na superfície administrativa. COLABORADOR/LIDER/GESTOR/INSTRUCTOR nunca.
const ALLOWED_ADMIN_ROLES = new Set(['ADMIN', 'RH', 'AUDITOR', 'DIRECTOR']);
// Handlers admin deliberadamente abertos a qualquer autenticado (self-service ou telemetria).
const OPEN_ALLOWLIST = new Set([
  'settings/settings.controller.ts#branding',
  'settings/settings.controller.ts#my2fa',
  'settings/settings.controller.ts#setup2fa',
  'settings/settings.controller.ts#enable2fa',
  'settings/settings.controller.ts#disable2fa',
  'settings/settings.controller.ts#mySessions',
  'settings/settings.controller.ts#revokeMySession',
  'settings/settings.controller.ts#myLoginHistory',
  // LPDP: o titular exporta/pede os seus próprios dados (o serviço restringe ao próprio user.id).
  'settings/settings.controller.ts#exportMyData',
  'settings/settings.controller.ts#createMyDataRequest',
  'scalability/scalability-infra.controller.ts#recordFrontendPerf',
]);

// Handlers admin REVISTOS com @Roles mais largo que ADMIN/RH/AUDITOR/DIRECTOR. Cada entrada tem a
// salvaguarda no serviço; adicionar aqui exige essa revisão (e mexer neste ficheiro mostra-se no PR).
const BROADER_ROLES_REVIEWED = (key: string): string | null => {
  // audit.controller: GESTOR vê só o seu âmbito (AuditService aplica o filtro por papel — Audit §16-18).
  if (key.startsWith('audit/audit.controller.ts#')) return 'GESTOR';
  // monitoring: GESTOR vê painéis operacionais de leitura (sem mutações neste ficheiro). REVER em T9.
  if (key.startsWith('monitoring/monitoring.controller.ts#')) return 'GESTOR';
  // scalability reports/settings: lista de perfis configurável; SettingsService.assertCanAccess(user).
  if (key.startsWith('scalability/scalability-infra.controller.ts#')) return '*';
  return null;
};

describe('isolamento da superfície administrativa', () => {
  const inv = collectAuthzInventory(join(__dirname, '..', '..', 'src')).filter(h =>
    ADMIN_CONTROLLER_FILES.some(f => h.file.startsWith(f) || h.file.includes(f)),
  );

  it('encontra handlers administrativos', () => {
    expect(inv.length).toBeGreaterThan(50);
  });

  it('nenhum handler admin é @AnyAuthenticated fora da allow-list', () => {
    const open = inv
      .filter(h => h.policy === 'authenticated')
      .map(h => `${h.file}#${h.handler}`)
      .filter(k => !OPEN_ALLOWLIST.has(k));
    expect(open).toEqual([]);
  });

  it('nenhum handler admin com @Roles aceita papéis fora de ADMIN/RH/AUDITOR/DIRECTOR', () => {
    const bad = inv
      .filter(h => h.policy === 'roles')
      .filter(h =>
        h.roles.some(r => {
          if (ALLOWED_ADMIN_ROLES.has(r)) return false;
          const reviewed = BROADER_ROLES_REVIEWED(`${h.file}#${h.handler}`);
          return !(reviewed === '*' || reviewed === r);
        }),
      )
      .map(h => `${h.file}#${h.handler}: ${h.roles.join(',')}`);
    expect(bad).toEqual([]);
  });
});

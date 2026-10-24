import { LicenseSettingsService } from './license-settings.service';
import { MODULE_FLAG_KEYS, DEFAULT_MODULE_FLAGS, parseModuleFlags } from './module-flags';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../common/helpers/tenant.helper', () => ({
  resolveDefaultTenantId: jest.fn().mockResolvedValue(1),
}));

const audit = writeChainedAuditLog as jest.Mock;
const [A, B] = MODULE_FLAG_KEYS;

describe('module-flags', () => {
  it('há módulos configuráveis e todos nascem activos', () => {
    expect(MODULE_FLAG_KEYS.length).toBeGreaterThan(5);
    expect(Object.values(DEFAULT_MODULE_FLAGS).every(v => v === true)).toBe(true);
  });

  it.each([null, undefined, ''])('defaults para %p', raw => {
    expect(parseModuleFlags(raw)).toEqual(DEFAULT_MODULE_FLAGS);
  });

  it('JSON inválido cai nos defaults', () => {
    expect(parseModuleFlags('{x')).toEqual(DEFAULT_MODULE_FLAGS);
  });

  it('respeita booleanos guardados e ignora chaves desconhecidas e valores não booleanos', () => {
    const s = parseModuleFlags(
      JSON.stringify({ [A]: false, [B]: 'false', MODULO_FANTASMA: false }),
    );
    expect(s[A]).toBe(false);
    expect(s[B]).toBe(true);
    expect(s).not.toHaveProperty('MODULO_FANTASMA');
  });

  it('devolve cópia (não contamina os defaults)', () => {
    parseModuleFlags(null)[A] = false;
    expect(DEFAULT_MODULE_FLAGS[A]).toBe(true);
  });
});

describe('LicenseSettingsService', () => {
  let prisma: any;
  let service: LicenseSettingsService;
  const day = 86_400_000;

  const withTenant = (over: object = {}) =>
    prisma.tenantConfig.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      plan: 'GROWTH',
      isActive: true,
      maxUsers: 100,
      trialEndsAt: null,
      contractStartDate: null,
      contractEndDate: null,
      moduleFlagsJson: null,
      ...over,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      tenantConfig: { findUniqueOrThrow: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      user: { count: jest.fn().mockResolvedValue(42) },
    };
    prisma.read = prisma;
    withTenant();
    service = new LicenseSettingsService(prisma);
  });

  describe('get', () => {
    it('resumo da licença com utilizadores actuais e módulos', async () => {
      const v = await service.get();
      expect(v).toMatchObject({
        plan: 'GROWTH',
        maxUsers: 100,
        currentUsers: 42,
        trialStatus: 'NONE',
      });
      expect(v.moduleOptions).toEqual(MODULE_FLAG_KEYS);
      expect(v.modules).toEqual(DEFAULT_MODULE_FLAGS);
    });

    it.each([
      ['sem trial', null, 'NONE'],
      ['trial no futuro', new Date(Date.now() + day), 'ACTIVE'],
      ['trial terminado', new Date(Date.now() - day), 'EXPIRED'],
    ])('%s → %s', async (_n, trialEndsAt, expected) => {
      withTenant({ trialEndsAt });
      expect((await service.get()).trialStatus).toBe(expected);
    });
  });

  describe('updateModules', () => {
    const saved = () =>
      JSON.parse(prisma.tenantConfig.update.mock.calls[0][0].data.moduleFlagsJson);

    it('aplica só booleanos; ignora chaves desconhecidas e valores não booleanos', async () => {
      await service.updateModules(
        { modules: { [A]: false, [B]: 'false', FANTASMA: false } } as never,
        4,
      );
      expect(saved()[A]).toBe(false);
      expect(saved()[B]).toBe(true);
      expect(saved()).not.toHaveProperty('FANTASMA');
    });

    it('mantém os módulos não mencionados como estavam', async () => {
      withTenant({ moduleFlagsJson: JSON.stringify({ [B]: false }) });
      await service.updateModules({ modules: { [A]: false } } as never);
      expect(saved()).toMatchObject({ [A]: false, [B]: false });
    });

    it('audita antes e depois com severidade HIGH', async () => {
      await service.updateModules({ modules: { [A]: false } } as never, 4);
      expect(audit.mock.calls[0][1]).toMatchObject({
        userId: 4,
        action: 'SETTINGS_LICENSE_MODULES_UPDATE',
        severity: 'HIGH',
      });
      const meta = JSON.parse(audit.mock.calls[0][1].metadata);
      expect(meta.before[A]).toBe(true);
      expect(meta.after[A]).toBe(false);
    });

    it('falha a auditar não impede a gravação', async () => {
      audit.mockRejectedValueOnce(new Error('x'));
      await expect(
        service.updateModules({ modules: { [A]: false } } as never),
      ).resolves.toBeDefined();
      expect(prisma.tenantConfig.update).toHaveBeenCalled();
    });
  });

  describe('isModuleEnabled', () => {
    it('activo por omissão e inactivo quando desligado', async () => {
      await expect(service.isModuleEnabled(A)).resolves.toBe(true);
      withTenant({ moduleFlagsJson: JSON.stringify({ [A]: false }) });
      await expect(service.isModuleEnabled(A)).resolves.toBe(false);
    });
  });
});

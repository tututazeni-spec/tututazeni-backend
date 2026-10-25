import { AuditDataSettingsService } from './audit-data-settings.service';

describe('AuditDataSettingsService', () => {
  const status = {
    health: 'HEALTHY',
    serviceEnabled: true,
    lastEventAt: new Date('2026-10-24T10:00:00Z'),
    events24h: 120,
    failedOperations24h: 3,
    deniedOperations24h: 1,
    backup: { lastAt: null },
    exports: { total: 2 },
  };
  const policy = {
    coveredModules: ['USERS'],
    requiredEvents: ['LOGIN'],
    viewRoles: ['ADMIN', 'AUDITOR'],
    exportRoles: ['ADMIN'],
    retentionDays: 365,
    archivePolicy: 'ARCHIVE',
    maskSensitive: true,
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    // campo interno que NÃO deve vazar para a vista de definições
    internalNote: 'não expor',
  };

  let audit: { getOverview: jest.Mock };
  let policySvc: { getStatus: jest.Mock; getPolicy: jest.Mock };
  let service: AuditDataSettingsService;

  beforeEach(() => {
    audit = { getOverview: jest.fn().mockResolvedValue({ totals: { events: 900 } }) };
    policySvc = {
      getStatus: jest.fn().mockResolvedValue(status),
      getPolicy: jest.fn().mockResolvedValue(policy),
    };
    service = new AuditDataSettingsService(audit as never, policySvc as never);
  });

  it('agrega saúde, volumes de 24h, total de 7 dias e backup/exportações', async () => {
    const o = await service.overview();
    expect(o).toMatchObject({
      health: 'HEALTHY',
      serviceEnabled: true,
      events24h: 120,
      failedOperations24h: 3,
      deniedOperations24h: 1,
      totalEvents7d: 900,
      backup: status.backup,
      exports: status.exports,
    });
    expect(audit.getOverview).toHaveBeenCalledWith(7);
  });

  it('expõe só os campos escolhidos da política (nada de campos internos)', async () => {
    const o = await service.overview();
    expect(Object.keys(o.policy).sort()).toEqual(
      [
        'archivePolicy',
        'coveredModules',
        'exportRoles',
        'maskSensitive',
        'requiredEvents',
        'retentionDays',
        'updatedAt',
        'viewRoles',
      ].sort(),
    );
    expect(JSON.stringify(o)).not.toContain('não expor');
  });

  it('totalEvents7d é null quando a auditoria não devolve totais', async () => {
    audit.getOverview.mockResolvedValue({});
    expect((await service.overview()).totalEvents7d).toBeNull();
  });

  it('as ligações apontam para as vistas do módulo de Auditoria', async () => {
    expect((await service.overview()).links).toEqual({
      logs: '/audit?view=logs',
      exports: '/audit?view=exports',
      policy: '/audit?view=policies',
    });
  });

  it('se uma das fontes falha, o erro chega ao chamador (não devolve vista parcial)', async () => {
    policySvc.getStatus.mockRejectedValue(new Error('audit down'));
    await expect(service.overview()).rejects.toThrow('audit down');
  });
});

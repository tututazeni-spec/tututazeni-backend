import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExecutiveReportsGenerationService } from './executive-reports.generation.service';
import { ExecutiveReportsService } from './executive-reports.service';

const user = (id: number, role: string): any => ({ id, role: { name: role } });

describe('ExecutiveReportsGenerationService — permissões, contexto e falhas', () => {
  const prisma: any = {
    executiveReport: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    executiveReportSchedule: { count: jest.fn() },
    executiveReportTemplate: { findUnique: jest.fn(), delete: jest.fn(), update: jest.fn() },
    reportAccessLog: { create: jest.fn().mockResolvedValue({}) },
    reportLog: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn().mockResolvedValue({ fullName: 'Autor' }) },
  };
  prisma.read = prisma;
  const executive: any = { scopeFilters: jest.fn(), contextOf: jest.fn().mockReturnValue({}) };
  const builder: any = { build: jest.fn() };
  const exporter: any = { export: jest.fn() };
  const audit: any = { record: jest.fn().mockResolvedValue(undefined) };

  const svc = new ExecutiveReportsGenerationService(prisma, executive, builder, exporter, audit);

  const section = (key: string) => ({
    key,
    title: key,
    sourceModules: [],
    columns: [],
    rows: [],
  });
  const stored = (over: Record<string, unknown> = {}) => ({
    id: 7,
    title: 'Relatório Setembro',
    generatedById: 1,
    confidentiality: 'CONFIDENTIAL',
    createdAt: new Date(2026, 9, 1),
    metrics: [],
    generatedBy: { fullName: 'Autor' },
    content: {
      meta: { templateCode: 'MONTHLY', templateVersion: 3, formulaVersion: '1', filters: {} },
      sections: [section('kpis'), section('costs')],
      omitted: [],
    },
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    audit.record.mockResolvedValue(undefined);
    prisma.reportAccessLog.create.mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Autor' });
    executive.contextOf.mockReturnValue({});
  });

  describe('permissões na consulta do conteúdo', () => {
    it('relatório inexistente → 404', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(null);
      await expect(svc.getContent(1, user(1, 'ADMIN'))).rejects.toThrow(NotFoundException);
    });

    it('GESTOR só abre relatórios que ele próprio gerou', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(stored({ generatedById: 1 }));
      await expect(svc.getContent(7, user(2, 'GESTOR'))).rejects.toThrow(ForbiddenException);
      expect(prisma.reportAccessLog.create).not.toHaveBeenCalled();
    });

    it('relatório RESTRICTED é vedado a RH mesmo sendo FULL', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(
        stored({ confidentiality: 'RESTRICTED' }),
      );
      await expect(svc.getContent(7, user(2, 'RH'))).rejects.toThrow(ForbiddenException);
    });

    it('RH vê o relatório mas sem as secções restritas (re-filtradas à consulta)', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(stored());
      const content = await svc.getContent(7, user(2, 'RH'));
      expect(content.sections.map(s => s.key)).toEqual(['kpis']);
      expect(content.omitted).toEqual([expect.objectContaining({ key: 'costs' })]);
    });

    it('ADMIN vê todas as secções e a consulta fica registada', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(stored());
      const content = await svc.getContent(7, user(2, 'ADMIN'));
      expect(content.sections.map(s => s.key)).toEqual(['kpis', 'costs']);
      expect(prisma.reportAccessLog.create).toHaveBeenCalledWith({
        data: { reportId: 7, userId: 2 },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPORT_VIEW', reportId: 7 }),
      );
    });
  });

  describe('exportação — permissões revalidadas no backend', () => {
    beforeEach(() => {
      exporter.export.mockResolvedValue({
        buffer: Buffer.from('x'),
        contentType: 'application/pdf',
        extension: 'pdf',
      });
    });

    it('utilizador sem permissão não exporta nem deixa rasto de exportação', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(stored({ generatedById: 1 }));
      await expect(svc.exportReport(7, user(2, 'LIDER'), 'PDF')).rejects.toThrow(
        ForbiddenException,
      );
      expect(exporter.export).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('a exportação de RH não inclui as secções restritas', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(stored());
      await svc.exportReport(7, user(2, 'RH'), 'XLSX');
      const exported = exporter.export.mock.calls[0][0];
      expect(exported.sections.map((s: any) => s.key)).toEqual(['kpis']);
      expect(exporter.export.mock.calls[0][1]).toBe('XLSX');
    });

    it('gera nome de ficheiro seguro com a extensão do formato', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(
        stored({ title: 'Relatório / Set: 2026?' }),
      );
      const file = await svc.exportReport(7, user(2, 'ADMIN'), 'PDF');
      expect(file.filename).toMatch(/^[\p{L}\p{N}_]+\.pdf$/u);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPORT_EXPORT', filters: { format: 'PDF' } }),
      );
    });

    it('falha ao exportar fica auditada como FAILED e volta a ser lançada', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(stored());
      exporter.export.mockRejectedValue(new Error('pdf engine crashed'));
      await expect(svc.exportReport(7, user(2, 'ADMIN'), 'PDF')).rejects.toThrow(
        'pdf engine crashed',
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REPORT_EXPORT',
          status: 'FAILED',
          errorMessage: 'pdf engine crashed',
        }),
      );
    });
  });

  describe('relatórios antigos preservam o contexto da geração', () => {
    it('conteúdo guardado devolve modelo, versão do modelo e das fórmulas originais', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(stored());
      const content = await svc.getContent(7, user(2, 'ADMIN'));
      expect(content.meta).toMatchObject({
        templateCode: 'MONTHLY',
        templateVersion: 3,
        formulaVersion: '1',
      });
    });

    it('relatório anterior ao módulo (sem content) é reconstruído a partir das métricas', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(
        stored({
          content: null,
          templateCode: null,
          templateVersion: null,
          formulaVersion: null,
          period: '2025-Q4',
          narrative: 'Resumo antigo',
          metrics: [{ label: 'Activos', value: 90, unit: '%', previousValue: 88, target: 95 }],
        }),
      );
      const content = await svc.getContent(7, user(2, 'ADMIN'));
      expect(content.meta).toMatchObject({
        templateCode: 'LEGACY',
        formulaVersion: 'n/d',
        periodLabel: '2025-Q4',
      });
      expect(content.sections[0].rows[0]).toMatchObject({ indicator: 'Activos', value: 90 });
      expect(content.sections[0].note).toBe('Resumo antigo');
    });

    it('run() persiste filtros aplicados, modelo+versão e versão das fórmulas', async () => {
      const f = { current: { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) } };
      executive.scopeFilters.mockResolvedValue(f);
      executive.contextOf.mockReturnValue({ period: 'custom', departmentId: null });
      builder.build.mockResolvedValue({
        sections: [section('kpis')],
        omitted: [],
        sourceModules: [],
      });
      prisma.executiveReport.create.mockResolvedValue({ id: 50, title: 'T' });
      prisma.executiveReport.update.mockResolvedValue({});

      await svc.run(
        user(1, 'ADMIN'),
        { code: 'MONTHLY', name: 'Mensal', version: 4, reportType: 'MONTHLY', sections: ['kpis'] },
        { filters: {} },
      );

      const data = prisma.executiveReport.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        templateCode: 'MONTHLY',
        templateVersion: 4,
        formulaVersion: expect.any(String),
        status: 'DRAFT',
        confidentiality: 'CONFIDENTIAL',
      });
      expect(data.filters.applied).toEqual({ period: 'custom', departmentId: null });
      expect(data.content.meta.templateVersion).toBe(4);
    });

    it('secção restrita marca o relatório gerado como RESTRICTED', async () => {
      executive.scopeFilters.mockResolvedValue({
        current: { start: new Date(), end: new Date() },
      });
      builder.build.mockResolvedValue({
        sections: [section('costs')],
        omitted: [],
        sourceModules: [],
      });
      prisma.executiveReport.create.mockResolvedValue({ id: 51, title: 'T' });
      prisma.executiveReport.update.mockResolvedValue({});
      await svc.run(
        user(1, 'ADMIN'),
        { code: 'C', name: 'C', version: 1, reportType: 'CUSTOM', sections: ['costs'] },
        { filters: {} },
      );
      expect(prisma.executiveReport.create.mock.calls[0][0].data.confidentiality).toBe(
        'RESTRICTED',
      );
    });
  });

  describe('falhas de integração na geração', () => {
    it('falha de um módulo de origem fica auditada como FAILED e é relançada', async () => {
      executive.scopeFilters.mockResolvedValue({
        current: { start: new Date(), end: new Date() },
      });
      builder.build.mockRejectedValue(new Error('enrollments indisponível'));
      await expect(
        svc.run(
          user(1, 'ADMIN'),
          { code: 'M', name: 'M', version: 1, reportType: 'MONTHLY', sections: ['training'] },
          { filters: {}, scheduleId: 3 },
        ),
      ).rejects.toThrow('enrollments indisponível');
      expect(prisma.executiveReport.create).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REPORT_GENERATE',
          status: 'FAILED',
          errorMessage: 'enrollments indisponível',
          filters: expect.objectContaining({ templateCode: 'M', scheduleId: 3 }),
        }),
      );
    });

    it('falha ao escrever o ReportLog não impede a geração', async () => {
      executive.scopeFilters.mockResolvedValue({
        current: { start: new Date(), end: new Date() },
      });
      builder.build.mockResolvedValue({
        sections: [section('kpis')],
        omitted: [],
        sourceModules: [],
      });
      prisma.executiveReport.create.mockResolvedValue({ id: 52, title: 'T' });
      prisma.executiveReport.update.mockResolvedValue({});
      prisma.reportLog.create.mockRejectedValue(new Error('db'));
      await expect(
        svc.run(
          user(1, 'ADMIN'),
          { code: 'M', name: 'M', version: 1, reportType: 'MONTHLY', sections: ['kpis'] },
          { filters: {} },
        ),
      ).resolves.toMatchObject({ id: 52 });
    });

    it('falha ao registar o acesso não impede a consulta', async () => {
      prisma.executiveReport.findUnique.mockResolvedValue(stored());
      prisma.reportAccessLog.create.mockRejectedValue(new Error('db'));
      await expect(svc.getContent(7, user(2, 'ADMIN'))).resolves.toBeDefined();
    });
  });

  describe('geração a partir de modelos', () => {
    it('modelo desconhecido → 404', async () => {
      await expect(
        svc.generate(user(1, 'ADMIN'), { templateCode: 'NAO_EXISTE' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('listTemplates: modelos personalizados só aparecem a ADMIN/RH/DIRECTOR', async () => {
      prisma.executiveReportTemplate.findMany = jest.fn().mockResolvedValue([
        {
          id: 1,
          name: 'Meu',
          version: 2,
          config: {},
          createdBy: { id: 1 },
          updatedAt: new Date(),
        },
      ]);
      const gestor = await svc.listTemplates(user(3, 'GESTOR'));
      expect(gestor.some(t => !t.predefined)).toBe(false);
      const rh = await svc.listTemplates(user(4, 'RH'));
      expect(rh.some(t => !t.predefined)).toBe(true);
    });

    it('construtor: secções restritas só no catálogo de ADMIN/DIRECTOR', () => {
      const rh = svc.getBuilderCatalog(user(1, 'RH')).map(s => s.key);
      const admin = svc.getBuilderCatalog(user(1, 'ADMIN')).map(s => s.key);
      expect(rh).not.toContain('costs');
      expect(admin).toContain('costs');
    });
  });

  describe('modelos personalizados', () => {
    it('só o autor ou ADMIN/DIRECTOR actualizam', async () => {
      prisma.executiveReportTemplate.findUnique.mockResolvedValue({ id: 1, createdById: 1 });
      await expect(svc.updateTemplate(1, user(2, 'RH'), { name: 'x' } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('alterar a configuração incrementa a versão; alterar só o nome não', async () => {
      prisma.executiveReportTemplate.findUnique.mockResolvedValue({ id: 1, createdById: 1 });
      prisma.executiveReportTemplate.update.mockResolvedValue({});
      await svc.updateTemplate(1, user(1, 'RH'), { config: { sections: ['kpis'] } } as any);
      expect(prisma.executiveReportTemplate.update.mock.calls[0][0].data.version).toEqual({
        increment: 1,
      });
      await svc.updateTemplate(1, user(1, 'RH'), { name: 'novo' } as any);
      expect(prisma.executiveReportTemplate.update.mock.calls[1][0].data.version).toBeUndefined();
    });

    it('não elimina um modelo usado por agendamentos activos', async () => {
      prisma.executiveReportTemplate.findUnique.mockResolvedValue({ id: 1, createdById: 1 });
      prisma.executiveReportSchedule.count.mockResolvedValue(2);
      await expect(svc.deleteTemplate(1, user(1, 'RH'))).rejects.toThrow(BadRequestException);
      expect(prisma.executiveReportTemplate.delete).not.toHaveBeenCalled();
    });
  });
});

describe('ExecutiveReportsService — filtros e âmbito', () => {
  const prisma: any = {
    user: { findUnique: jest.fn(), count: jest.fn() },
    executiveReport: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    executiveKPIDefinition: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
  };
  prisma.read = prisma;
  const resolved = () => ({
    period: 'year',
    compareWith: 'previous',
    unitId: 9,
    departmentId: undefined as number | undefined,
    current: { start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) },
    comparison: null,
    kpiState: undefined as string | undefined,
  });
  const metrics: any = {
    resolveFilters: jest.fn(),
    computeKpis: jest.fn(),
    effectiveDefinitions: jest.fn(),
    invalidateDefinitions: jest.fn(),
  };
  const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new ExecutiveReportsService(prisma, metrics, {} as any, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    metrics.resolveFilters.mockImplementation(resolved);
  });

  it('GESTOR é forçado ao seu departamento e perde o filtro de unidade', async () => {
    prisma.user.findUnique.mockResolvedValue({ departmentId: 4 });
    const f = await svc.scopeFilters(user(2, 'GESTOR'), { departmentId: 99 } as any);
    expect(f.departmentId).toBe(4);
    expect(f.unitId).toBeUndefined();
  });

  it('LIDER sem departamento não consulta nada → 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ departmentId: null });
    await expect(svc.scopeFilters(user(2, 'LIDER'), {} as any)).rejects.toThrow(ForbiddenException);
  });

  it.each(['ADMIN', 'RH', 'DIRECTOR'])('%s mantém os filtros pedidos', async role => {
    const f = await svc.scopeFilters(user(1, role), {} as any);
    expect(f.unitId).toBe(9);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('getKpis aplica o filtro de estado e devolve o contexto', async () => {
    metrics.resolveFilters.mockImplementation(() => ({ ...resolved(), kpiState: 'CRITICAL' }));
    metrics.computeKpis.mockResolvedValue([
      { code: 'A', state: 'CRITICAL' },
      { code: 'B', state: 'ON_TARGET' },
    ]);
    const res = await svc.getKpis(user(1, 'ADMIN'), {} as any);
    expect(res.kpis).toEqual([{ code: 'A', state: 'CRITICAL' }]);
    expect(res.context.kpiState).toBe('CRITICAL');
  });

  it('getTabs: GESTOR não vê Custos nem Relatórios Agendados; ADMIN vê todos', () => {
    const gestor = svc.getTabs(user(1, 'GESTOR')).map(t => t.id);
    expect(gestor).not.toContain('costs');
    expect(gestor).not.toContain('scheduled');
    expect(svc.getTabs(user(1, 'ADMIN'))).toHaveLength(13);
    expect(svc.getTabs(user(1, 'COLABORADOR'))).toHaveLength(0);
  });

  it('listagem esconde relatórios RESTRICTED a quem não é ADMIN/DIRECTOR', async () => {
    await svc.findAll({}, 'RH');
    expect(prisma.executiveReport.findMany.mock.calls[0][0].where.confidentiality).toEqual({
      not: 'RESTRICTED',
    });
    await svc.findAll({}, 'ADMIN');
    expect(prisma.executiveReport.findMany.mock.calls[1][0].where.confidentiality).toBeUndefined();
  });

  describe('updateKpiDefinition', () => {
    const defs = (over: Record<string, unknown> = {}) => ({
      TRAINING_COMPLETION: {
        code: 'TRAINING_COMPLETION',
        target: 70,
        warningThreshold: 60,
        criticalThreshold: 30,
        ...over,
      },
    });

    it('KPI inexistente → 404', async () => {
      await expect(svc.updateKpiDefinition('NOPE', {} as any, user(1, 'ADMIN'))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('KPI neutro não aceita meta', async () => {
      await expect(
        svc.updateKpiDefinition('HEADCOUNT', { target: 10 } as any, user(1, 'ADMIN')),
      ).rejects.toThrow(/neutro/);
    });

    it('rejeita limiares incoerentes (crítico > alerta num KPI "quanto maior melhor")', async () => {
      metrics.effectiveDefinitions.mockResolvedValue(defs());
      await expect(
        svc.updateKpiDefinition(
          'TRAINING_COMPLETION',
          { criticalThreshold: 65 } as any,
          user(1, 'ADMIN'),
        ),
      ).rejects.toThrow(/incoerentes/);
      expect(prisma.executiveKPIDefinition.upsert).not.toHaveBeenCalled();
    });

    it('rejeita responsável inexistente', async () => {
      metrics.effectiveDefinitions.mockResolvedValue(defs());
      prisma.user.count.mockResolvedValue(0);
      await expect(
        svc.updateKpiDefinition('TRAINING_COMPLETION', { ownerId: 99 } as any, user(1, 'ADMIN')),
      ).rejects.toThrow(/Responsável/);
    });

    it('guarda, invalida a cache de definições e audita a alteração', async () => {
      metrics.effectiveDefinitions.mockResolvedValue(defs());
      prisma.executiveKPIDefinition.upsert.mockResolvedValue({});
      await svc.updateKpiDefinition('TRAINING_COMPLETION', { target: 75 } as any, user(1, 'ADMIN'));
      expect(prisma.executiveKPIDefinition.upsert.mock.calls[0][0].update).toMatchObject({
        target: 75,
        warningThreshold: 60,
        criticalThreshold: 30,
      });
      expect(metrics.invalidateDefinitions).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KPI_DEFINITION_UPDATE', userId: 1 }),
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ExecutiveReportsService } from './executive-reports.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  executiveReport: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  reportMetric: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  reportApproval: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  reportAccessLog: { create: jest.fn().mockResolvedValue({}) },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  enrollment: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
  performanceReview: {
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: 0 } }),
  },
  course: { count: jest.fn().mockResolvedValue(0) },
  certificate: { count: jest.fn().mockResolvedValue(0) },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  department: { findMany: jest.fn().mockResolvedValue([]) },
};

const baseReport = {
  id: 1,
  title: 'Relatório Q1 2026',
  type: 'LMS_OVERVIEW',
  status: 'DRAFT',
  period: '2026-Q1',
  generatedById: 1,
  generatedBy: { id: 1, fullName: 'Admin', avatarUrl: null },
  department: null,
  metrics: [],
  approvals: [],
  accessLogs: [],
  _count: { accessLogs: 0 },
};

describe('ExecutiveReportsService (additional)', () => {
  let service: ExecutiveReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExecutiveReportsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ExecutiveReportsService>(ExecutiveReportsService);
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar lista paginada de relatórios', async () => {
      mockPrisma.executiveReport.findMany.mockResolvedValue([baseReport]);
      mockPrisma.executiveReport.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('deve filtrar por type, status, departmentId, period', async () => {
      mockPrisma.executiveReport.findMany.mockResolvedValue([]);
      mockPrisma.executiveReport.count.mockResolvedValue(0);
      await service.findAll({
        type: 'LMS_OVERVIEW' as any,
        status: 'PUBLISHED' as any,
        departmentId: 1,
        period: '2026-Q1',
      });
      expect(mockPrisma.executiveReport.findMany).toHaveBeenCalled();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar relatório por id', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue(baseReport);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve registar acesso quando userId fornecido', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue(baseReport);
      await service.findOne(1, 2);
      expect(mockPrisma.reportAccessLog.create).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se relatório não existe', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar relatório executivo', async () => {
      mockPrisma.executiveReport.create.mockResolvedValue(baseReport);
      mockPrisma.reportLog = { create: jest.fn().mockResolvedValue({}) };
      // Real signature: create(generatedById, dto) — userId first, dto second
      const result = await service.create(1, {
        title: 'Relatório Q1',
        type: 'LMS_OVERVIEW' as any,
        period: '2026-Q1',
        metrics: [],
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar relatório em DRAFT', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({ ...baseReport, generatedById: 1 });
      mockPrisma.executiveReport.update.mockResolvedValue({ ...baseReport, title: 'Actualizado' });
      mockPrisma.executiveMetric = {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      };
      // Real signature: update(id, dto) — 2 args only
      const result = await service.update(1, { title: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se relatório não existe', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publishReport (real method name) ─────────────────────────

  describe('publishReport', () => {
    it('deve publicar relatório aprovado', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({
        ...baseReport,
        generatedById: 1,
        status: 'APPROVED',
      });
      mockPrisma.executiveReport.update.mockResolvedValue({ ...baseReport, status: 'PUBLISHED' });
      // Real method: publishReport(id) — 1 arg
      const result = await service.publishReport(1);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se não aprovado', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({
        ...baseReport,
        generatedById: 1,
        status: 'DRAFT',
      });
      await expect(service.publishReport(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── archiveReport (real method name) ─────────────────────────

  describe('archiveReport', () => {
    it('deve arquivar relatório', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({ ...baseReport, generatedById: 1 });
      mockPrisma.executiveReport.update.mockResolvedValue({ ...baseReport, status: 'ARCHIVED' });
      // Real method: archiveReport(id) — 1 arg
      const result = await service.archiveReport(1);
      expect(result).toBeDefined();
    });
  });

  // ─── addMetric — method doesn't exist, skip ───────────────────

  describe('addMetric', () => {
    it.skip('deve adicionar métrica ao relatório (método não existe na service)', async () => {
      // addMetric is not a public method on ExecutiveReportsService
      // metrics are created inline during create/update
    });
  });

  // ─── updateMetric — method doesn't exist, skip ────────────────

  describe('updateMetric', () => {
    it.skip('deve actualizar métrica (método não existe na service)', async () => {
      // No standalone updateMetric method exists
    });
  });

  // ─── removeMetric — method doesn't exist, skip ────────────────

  describe('removeMetric', () => {
    it.skip('deve remover métrica (método não existe na service)', async () => {
      // No standalone removeMetric method exists
    });
  });

  // ─── generateAutoReport (replaces generateFromData) ───────────

  describe('generateAutoReport', () => {
    it('deve gerar relatório automático com métricas', async () => {
      mockPrisma.executiveReport.create.mockResolvedValue(baseReport);
      mockPrisma.enrollment.count.mockResolvedValue(150);
      mockPrisma.certificate.count.mockResolvedValue(30);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count = jest.fn().mockResolvedValue(100);
      mockPrisma.developmentPlan = {
        count: jest.fn().mockResolvedValue(10),
      };
      mockPrisma.developmentPlanAction = {
        count: jest.fn().mockResolvedValue(2),
      };
      mockPrisma.userPoints = {
        aggregate: jest.fn().mockResolvedValue({ _sum: { points: 5000 } }),
      };
      mockPrisma.reportLog = { create: jest.fn().mockResolvedValue({}) };
      // Real method: generateAutoReport(generatedById, type?, departmentId?)
      const result = await service.generateAutoReport(1);
      expect(result).toBeDefined();
    });
  });

  // ─── submitForReview (replaces requestApproval) ───────────────

  describe('submitForReview', () => {
    it('deve submeter relatório para revisão', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({
        ...baseReport,
        generatedById: 1,
        status: 'DRAFT',
      });
      mockPrisma.executiveReport.update.mockResolvedValue({
        ...baseReport,
        status: 'IN_REVIEW',
      });
      // Real method: submitForReview(id) — 1 arg
      const result = await service.submitForReview(1);
      expect(result).toBeDefined();
    });
  });

  // ─── approveReport (replaces approve) ────────────────────────

  describe('approveReport', () => {
    it('deve aprovar relatório', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({
        ...baseReport,
        status: 'IN_REVIEW',
      });
      mockPrisma.reportApproval.create.mockResolvedValue({ id: 1 });
      mockPrisma.executiveReport.update.mockResolvedValue({ ...baseReport, status: 'APPROVED' });
      // Real method: approveReport(dto, approverId)
      const result = await service.approveReport(
        { reportId: 1, decision: 'approve', comment: 'OK' } as any,
        2,
      );
      expect(result).toBeDefined();
    });
  });
});

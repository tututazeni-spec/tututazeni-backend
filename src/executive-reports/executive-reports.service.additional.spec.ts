import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
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
      const result = await service.create(
        { title: 'Relatório Q1', type: 'LMS_OVERVIEW' as any, period: '2026-Q1' } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar relatório em DRAFT', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({ ...baseReport, generatedById: 1 });
      mockPrisma.executiveReport.update.mockResolvedValue({ ...baseReport, title: 'Actualizado' });
      const result = await service.update(1, { title: 'Actualizado' } as any, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se relatório não existe', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue(null);
      await expect(service.update(99, {} as any, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publish ──────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar relatório DRAFT', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({
        ...baseReport,
        generatedById: 1,
        status: 'DRAFT',
      });
      mockPrisma.executiveReport.update.mockResolvedValue({ ...baseReport, status: 'PUBLISHED' });
      const result = await service.publish(1, 1);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se já publicado', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({
        ...baseReport,
        generatedById: 1,
        status: 'PUBLISHED',
      });
      await expect(service.publish(1, 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── archive ──────────────────────────────────────────────────

  describe('archive', () => {
    it('deve arquivar relatório', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({ ...baseReport, generatedById: 1 });
      mockPrisma.executiveReport.update.mockResolvedValue({ ...baseReport, status: 'ARCHIVED' });
      const result = await service.archive(1, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── addMetric ────────────────────────────────────────────────

  describe('addMetric', () => {
    it('deve adicionar métrica ao relatório', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue(baseReport);
      mockPrisma.reportMetric.create.mockResolvedValue({
        id: 1,
        reportId: 1,
        name: 'Total Utilizadores',
      });
      const result = await service.addMetric(
        1,
        { name: 'Total Utilizadores', value: 100, unit: 'users' } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── updateMetric ─────────────────────────────────────────────

  describe('updateMetric', () => {
    it('deve actualizar métrica', async () => {
      mockPrisma.reportMetric.update.mockResolvedValue({ id: 1, value: 200 });
      const result = await service.updateMetric(1, { value: 200 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── removeMetric ─────────────────────────────────────────────

  describe('removeMetric', () => {
    it('deve remover métrica', async () => {
      mockPrisma.reportMetric.delete = jest.fn().mockResolvedValue({});
      await service.removeMetric(1);
      expect(mockPrisma.reportMetric.delete).toHaveBeenCalled();
    });
  });

  // ─── generateFromData ─────────────────────────────────────────

  describe('generateFromData', () => {
    it('deve gerar relatório com métricas automáticas', async () => {
      mockPrisma.executiveReport.create.mockResolvedValue(baseReport);
      mockPrisma.reportMetric.createMany.mockResolvedValue({ count: 5 });
      mockPrisma.enrollment.count.mockResolvedValue(150);
      mockPrisma.course.count.mockResolvedValue(50);
      mockPrisma.certificate.count.mockResolvedValue(30);
      const result = await service.generateFromData(
        { type: 'LMS_OVERVIEW' as any, period: '2026-Q1' } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── requestApproval ─────────────────────────────────────────

  describe('requestApproval', () => {
    it('deve solicitar aprovação do relatório', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({
        ...baseReport,
        generatedById: 1,
        status: 'DRAFT',
      });
      mockPrisma.executiveReport.update.mockResolvedValue({
        ...baseReport,
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      const result = await service.requestApproval(1, 2, 1);
      expect(result).toBeDefined();
    });
  });

  // ─── approve ──────────────────────────────────────────────────

  describe('approve', () => {
    it('deve aprovar relatório', async () => {
      mockPrisma.executiveReport.findUnique.mockResolvedValue({
        ...baseReport,
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.reportApproval.create.mockResolvedValue({ id: 1 });
      mockPrisma.executiveReport.update.mockResolvedValue({ ...baseReport, status: 'PUBLISHED' });
      mockPrisma.notificationLog.create.mockResolvedValue({});
      const result = await service.approve(1, { approved: true, comments: 'OK' }, 2);
      expect(result).toBeDefined();
    });
  });
});

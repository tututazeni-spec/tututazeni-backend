import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RoiAnalysisService } from './roi-analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoiAnalysisStatus, RoiInitiativeType, RoiBenefitType } from './roi-impact.dto';

const makeFind = (data: any = null) => jest.fn().mockResolvedValue(data);

function buildPrismaMock() {
  const prisma: any = {
    roiAnalysis: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: makeFind(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    course: { findUnique: makeFind(null), findMany: jest.fn().mockResolvedValue([]) },
    enrollment: { count: jest.fn().mockResolvedValue(0) },
    training: { findUnique: makeFind(null), findMany: jest.fn().mockResolvedValue([]) },
    trainingParticipant: { count: jest.fn().mockResolvedValue(0) },
    learningPath: { findUnique: makeFind(null), findMany: jest.fn().mockResolvedValue([]) },
    learningPathEnrollment: { count: jest.fn().mockResolvedValue(0) },
    legacyPdi: { findUnique: makeFind(null), findMany: jest.fn().mockResolvedValue([]) },
    mentoring: { findUnique: makeFind(null), findMany: jest.fn().mockResolvedValue([]) },
    event: { findUnique: makeFind(null), findMany: jest.fn().mockResolvedValue([]) },
    eventParticipant: { count: jest.fn().mockResolvedValue(0) },
  };
  Object.defineProperty(prisma, 'read', {
    get() {
      return prisma;
    },
    configurable: true,
  });
  return prisma;
}

describe('RoiAnalysisService', () => {
  let service: RoiAnalysisService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoiAnalysisService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<RoiAnalysisService>(RoiAnalysisService);
  });

  describe('create', () => {
    it('creates an analysis in EM_PREPARACAO with the identification fields', async () => {
      prisma.roiAnalysis.create.mockResolvedValue({
        id: 1,
        status: RoiAnalysisStatus.EM_PREPARACAO,
      });
      const result = await service.create(
        { name: 'Formação Vendas Q3', initiativeType: RoiInitiativeType.CURSO, initiativeId: 5 },
        42,
      );
      expect(prisma.roiAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Formação Vendas Q3',
            initiativeType: RoiInitiativeType.CURSO,
            initiativeId: 5,
            createdById: 42,
            status: RoiAnalysisStatus.EM_PREPARACAO,
          }),
        }),
      );
      expect(result).toEqual({ id: 1, status: RoiAnalysisStatus.EM_PREPARACAO });
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the analysis does not exist', async () => {
      prisma.roiAnalysis.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { costDirect: 100 })).rejects.toThrow(NotFoundException);
    });

    it('merges etapa 2/3/4 fields onto the existing analysis', async () => {
      prisma.roiAnalysis.findUnique.mockResolvedValue({ id: 1 });
      prisma.roiAnalysis.update.mockResolvedValue({ id: 1, costDirect: 1000 });
      await service.update(1, { costDirect: 1000, benefitType: RoiBenefitType.PRODUTIVIDADE });
      expect(prisma.roiAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            costDirect: 1000,
            benefitType: RoiBenefitType.PRODUTIVIDADE,
          }),
        }),
      );
    });
  });

  describe('computeResult', () => {
    it('marks DADOS_INSUFICIENTES when cost or monetary benefit is missing', async () => {
      prisma.roiAnalysis.findUnique.mockResolvedValue({
        id: 1,
        costDirect: null,
        costIndirect: null,
        costOpportunity: null,
        measurementPeriodDays: 90,
        hasControlGroup: false,
        isolationFactor: null,
        dataSource: null,
      });
      prisma.roiAnalysis.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result = await service.computeResult(1, {});

      expect(result.status).toBe(RoiAnalysisStatus.DADOS_INSUFICIENTES);
      expect(result.roiPercent).toBeNull();
      expect(result.confidenceLevel).toBeNull();
    });

    it('computes ROI/BCR/payback and CALCULADO status when cost + benefit are known', async () => {
      prisma.roiAnalysis.findUnique.mockResolvedValue({
        id: 1,
        costDirect: 6000,
        costIndirect: 2000,
        costOpportunity: 2000, // total cost = 10000
        measurementPeriodDays: 180, // 6 months
        hasControlGroup: true,
        isolationFactor: 0.6,
        dataSource: 'Evaluation 360',
      });
      prisma.roiAnalysis.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result = await service.computeResult(1, { monetaryBenefitOverride: 25000 });

      expect(result.computedCost).toBe(10000);
      expect(result.computedBenefit).toBe(25000);
      expect(result.roiPercent).toBe(150); // (25000-10000)/10000 * 100
      expect(result.bcr).toBe(2.5);
      expect(result.paybackMonths).toBeCloseTo(2.4, 1); // 10000 / (25000/6)
      expect(result.status).toBe(RoiAnalysisStatus.CALCULADO);
      expect(result.confidenceLevel).toBe('HIGH');
    });

    it('throws NotFoundException for an unknown id', async () => {
      prisma.roiAnalysis.findUnique.mockResolvedValue(null);
      await expect(service.computeResult(999, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve', () => {
    it('sets status, approvedById and approvedAt', async () => {
      prisma.roiAnalysis.findUnique.mockResolvedValue({
        id: 1,
        status: RoiAnalysisStatus.CALCULADO,
      });
      prisma.roiAnalysis.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const result = await service.approve(1, {
        status: RoiAnalysisStatus.VALIDADO,
        approvedById: 7,
        observations: 'Confirmado com Finanças',
      });

      expect(result.status).toBe(RoiAnalysisStatus.VALIDADO);
      expect(result.approvedById).toBe(7);
      expect(result.approvedAt).toBeInstanceOf(Date);
      expect(result.observations).toBe('Confirmado com Finanças');
    });
  });

  describe('resolveInitiative', () => {
    it('resolves a CURSO by joining Course + Enrollment count', async () => {
      prisma.course.findUnique.mockResolvedValue({
        id: 5,
        title: 'Excelência no Atendimento',
        departmentId: 3,
      });
      prisma.enrollment.count.mockResolvedValue(40);
      const info = await service.resolveInitiative(RoiInitiativeType.CURSO, 5);
      expect(info).toEqual({
        label: 'Excelência no Atendimento',
        participants: 40,
        departmentId: 3,
      });
    });

    it('resolves a PDI by joining LegacyPdi + Employee name, participants always 1', async () => {
      prisma.legacyPdi.findUnique.mockResolvedValue({ id: 9, employee: { name: 'Ana Silva' } });
      const info = await service.resolveInitiative(RoiInitiativeType.PDI, 9);
      expect(info).toEqual({ label: 'PDI: Ana Silva', participants: 1, departmentId: null });
    });

    it('resolves a MENTORIA combining mentor/mentee names, participants = 2', async () => {
      prisma.mentoring.findUnique.mockResolvedValue({
        id: 3,
        mentor: { fullName: 'Carlos Neto' },
        mentee: { fullName: 'Beatriz Costa' },
      });
      const info = await service.resolveInitiative(RoiInitiativeType.MENTORIA, 3);
      expect(info).toEqual({
        label: 'Mentoria: Carlos Neto → Beatriz Costa',
        participants: 2,
        departmentId: null,
      });
    });

    it('returns null when the source record is gone', async () => {
      prisma.course.findUnique.mockResolvedValue(null);
      const info = await service.resolveInitiative(RoiInitiativeType.CURSO, 999);
      expect(info).toBeNull();
    });

    it('returns null when initiativeId is not set', async () => {
      const info = await service.resolveInitiative(RoiInitiativeType.CURSO, null);
      expect(info).toBeNull();
    });
  });

  describe('listInitiativeOptions', () => {
    it('lists Courses as {id, label} options for CURSO', async () => {
      prisma.course.findMany.mockResolvedValue([
        { id: 1, title: 'Curso A' },
        { id: 2, title: 'Curso B' },
      ]);
      const options = await service.listInitiativeOptions(RoiInitiativeType.CURSO);
      expect(options).toEqual([
        { id: 1, label: 'Curso A' },
        { id: 2, label: 'Curso B' },
      ]);
    });
  });
});

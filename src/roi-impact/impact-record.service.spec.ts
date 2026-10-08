import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ImpactRecordService } from './impact-record.service';
import { RoiAnalysisService } from './roi-analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImpactSubjectType, ImpactCategory, RoiInitiativeType } from './roi-impact.dto';

const makeFind = (data: any = null) => jest.fn().mockResolvedValue(data);

function buildPrismaMock() {
  const prisma: any = {
    impactRecord: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: makeFind(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  Object.defineProperty(prisma, 'read', {
    get() {
      return prisma;
    },
    configurable: true,
  });
  return prisma;
}

describe('ImpactRecordService', () => {
  let service: ImpactRecordService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let resolveInitiative: jest.Mock;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    resolveInitiative = jest.fn().mockResolvedValue(null);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpactRecordService,
        { provide: PrismaService, useValue: prisma },
        { provide: RoiAnalysisService, useValue: { resolveInitiative } },
      ],
    }).compile();
    service = module.get<ImpactRecordService>(ImpactRecordService);
  });

  describe('create', () => {
    it('creates a record with the subject/initiative/category fields', async () => {
      prisma.impactRecord.create.mockResolvedValue({ id: 1 });
      await service.create(
        {
          subjectType: ImpactSubjectType.DEPARTAMENTO,
          departmentId: 3,
          initiativeType: RoiInitiativeType.FORMACAO,
          initiativeId: 8,
          category: ImpactCategory.SATISFACAO_CLIENTE,
          indicatorName: 'NPS',
          valueBefore: 62,
          valueAfter: 74,
          attributionPercent: 60,
        },
        42,
      );
      expect(prisma.impactRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subjectType: ImpactSubjectType.DEPARTAMENTO,
            departmentId: 3,
            initiativeType: RoiInitiativeType.FORMACAO,
            initiativeId: 8,
            category: ImpactCategory.SATISFACAO_CLIENTE,
            indicatorName: 'NPS',
            valueBefore: 62,
            valueAfter: 74,
            attributionPercent: 60,
            createdById: 42,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the record does not exist', async () => {
      prisma.impactRecord.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { valueAfter: 10 })).rejects.toThrow(NotFoundException);
    });
  });

  describe('validate', () => {
    it('sets validatedById and validatedAt', async () => {
      prisma.impactRecord.findUnique.mockResolvedValue({ id: 1 });
      prisma.impactRecord.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );
      const result = await service.validate(1, { validatedById: 7 });
      expect(result.validatedById).toBe(7);
      expect(result.validatedAt).toBeInstanceOf(Date);
    });
  });

  describe('findAll', () => {
    it('computes variation and attributed impact from before/after/attribution%', async () => {
      resolveInitiative.mockResolvedValue({
        label: 'Excelência no Atendimento',
        participants: 12,
        departmentId: 3,
      });
      prisma.impactRecord.findMany.mockResolvedValue([
        {
          id: 1,
          subjectType: ImpactSubjectType.DEPARTAMENTO,
          initiativeType: RoiInitiativeType.FORMACAO,
          initiativeId: 8,
          category: ImpactCategory.SATISFACAO_CLIENTE,
          indicatorName: 'NPS',
          valueBefore: 62,
          valueAfter: 74,
          observationPeriodStart: null,
          observationPeriodEnd: null,
          attributionPercent: 60,
          dataSource: null,
          validatedById: null,
          validatedAt: null,
          team: null,
          user: null,
          department: { name: 'Loja Benguela Centro' },
        },
      ]);

      const { records, total } = await service.findAll();

      expect(total).toBe(1);
      expect(records[0]).toMatchObject({
        subjectLabel: 'Loja Benguela Centro',
        initiative: 'Excelência no Atendimento',
        variation: 12,
        attributedImpact: 7.2,
      });
    });

    it('leaves variation/attributedImpact null when before or after is missing', async () => {
      prisma.impactRecord.findMany.mockResolvedValue([
        {
          id: 2,
          subjectType: ImpactSubjectType.EQUIPA,
          initiativeType: RoiInitiativeType.CURSO,
          initiativeId: null,
          category: ImpactCategory.PRODUTIVIDADE,
          indicatorName: 'Output/hora',
          valueBefore: null,
          valueAfter: 20,
          observationPeriodStart: null,
          observationPeriodEnd: null,
          attributionPercent: 50,
          dataSource: null,
          validatedById: null,
          validatedAt: null,
          team: 'Equipa Vendas',
          user: null,
          department: null,
        },
      ]);

      const { records } = await service.findAll();
      expect(records[0].subjectLabel).toBe('Equipa Vendas');
      expect(records[0].variation).toBeNull();
      expect(records[0].attributedImpact).toBeNull();
    });
  });

  describe('getCategorySummary', () => {
    it('aggregates count/avg attribution/attributed total per category', async () => {
      prisma.impactRecord.findMany.mockResolvedValue([
        {
          id: 1,
          subjectType: ImpactSubjectType.DEPARTAMENTO,
          initiativeType: RoiInitiativeType.FORMACAO,
          initiativeId: null,
          category: ImpactCategory.SATISFACAO_CLIENTE,
          indicatorName: 'NPS',
          valueBefore: 60,
          valueAfter: 80,
          observationPeriodStart: null,
          observationPeriodEnd: null,
          attributionPercent: 50,
          dataSource: null,
          validatedById: null,
          validatedAt: null,
          team: null,
          user: null,
          department: null,
        },
        {
          id: 2,
          subjectType: ImpactSubjectType.DEPARTAMENTO,
          initiativeType: RoiInitiativeType.FORMACAO,
          initiativeId: null,
          category: ImpactCategory.SATISFACAO_CLIENTE,
          indicatorName: 'NPS',
          valueBefore: 70,
          valueAfter: 90,
          observationPeriodStart: null,
          observationPeriodEnd: null,
          attributionPercent: 100,
          dataSource: null,
          validatedById: null,
          validatedAt: null,
          team: null,
          user: null,
          department: null,
        },
      ]);

      const summary = await service.getCategorySummary();
      expect(summary).toEqual([
        {
          category: ImpactCategory.SATISFACAO_CLIENTE,
          count: 2,
          avgAttributionPercent: 75,
          attributedTotal: 30, // (20*0.5) + (20*1.0)
        },
      ]);
    });
  });
});

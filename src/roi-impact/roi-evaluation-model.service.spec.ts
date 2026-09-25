import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RoiEvaluationModelService } from './roi-evaluation-model.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoiModelStatus } from './roi-impact.dto';

const makeFind = (data: any = null) => jest.fn().mockResolvedValue(data);

function buildPrismaMock() {
  const prisma: any = {
    roiEvaluationModel: {
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

const KIRKPATRICK_LEVELS = [
  { level: 1, name: 'Reação', mandatory: true, weight: 10 },
  { level: 2, name: 'Aprendizagem', mandatory: true, weight: 20 },
  { level: 3, name: 'Comportamento', mandatory: true, weight: 25 },
  { level: 4, name: 'Resultados', mandatory: false, weight: 25 },
  { level: 5, name: 'ROI', mandatory: false, weight: 20 },
];

describe('RoiEvaluationModelService', () => {
  let service: RoiEvaluationModelService;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(async () => {
    prisma = buildPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoiEvaluationModelService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<RoiEvaluationModelService>(RoiEvaluationModelService);
  });

  describe('create', () => {
    it('creates a model with name/description/levels/applicability', async () => {
      prisma.roiEvaluationModel.create.mockResolvedValue({ id: 1 });
      await service.create(
        {
          name: 'Kirkpatrick + Phillips (padrão)',
          description: 'Modelo de 5 níveis',
          levels: KIRKPATRICK_LEVELS,
          applicability: { initiativeTypes: ['CURSO', 'FORMACAO'], minCost: 500000 },
        },
        42,
      );
      expect(prisma.roiEvaluationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Kirkpatrick + Phillips (padrão)',
            levels: KIRKPATRICK_LEVELS,
            applicability: { initiativeTypes: ['CURSO', 'FORMACAO'], minCost: 500000 },
            createdById: 42,
          }),
        }),
      );
    });

    it('omits applicability when not provided', async () => {
      prisma.roiEvaluationModel.create.mockResolvedValue({ id: 2 });
      await service.create({ name: 'Modelo simples', levels: KIRKPATRICK_LEVELS }, 1);
      const call = prisma.roiEvaluationModel.create.mock.calls[0][0];
      expect(call.data.applicability).toBeUndefined();
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the model does not exist', async () => {
      prisma.roiEvaluationModel.findUnique.mockResolvedValue(null);
      await expect(service.update(999, { status: RoiModelStatus.INACTIVO })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('only sends the fields provided', async () => {
      prisma.roiEvaluationModel.findUnique.mockResolvedValue({ id: 1 });
      prisma.roiEvaluationModel.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data }),
      );
      const result = await service.update(1, { status: RoiModelStatus.INACTIVO });
      expect(prisma.roiEvaluationModel.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: RoiModelStatus.INACTIVO },
      });
      expect(result.status).toBe(RoiModelStatus.INACTIVO);
    });
  });

  describe('findAll', () => {
    it('filters by status when provided', async () => {
      await service.findAll(RoiModelStatus.ACTIVO);
      expect(prisma.roiEvaluationModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: RoiModelStatus.ACTIVO } }),
      );
    });

    it('lists all models when no status filter is given', async () => {
      await service.findAll();
      expect(prisma.roiEvaluationModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for an unknown id', async () => {
      prisma.roiEvaluationModel.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });
});

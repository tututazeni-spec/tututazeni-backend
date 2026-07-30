import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CompetenciesService } from './competencies.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  competency: { findUnique: jest.fn(), delete: jest.fn().mockResolvedValue({}) },
  proficiencyLevel: {
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  },
};

describe('CompetenciesService — remove / createProficiencyLevel (erros)', () => {
  let service: CompetenciesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompetenciesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CompetenciesService>(CompetenciesService);
  });

  it('remove recusa eliminar competência com utilizadores associados (deve arquivar)', async () => {
    mockPrisma.competency.findUnique.mockResolvedValue({
      id: 1,
      _count: { userCompetencies: 4 },
    });
    await expect(service.remove(1)).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.competency.delete).not.toHaveBeenCalled();
  });

  it('remove elimina competência sem utilizadores associados', async () => {
    mockPrisma.competency.findUnique.mockResolvedValue({
      id: 1,
      _count: { userCompetencies: 0 },
    });
    const result = await service.remove(1);
    expect(mockPrisma.competency.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result).toHaveProperty('message');
  });

  it('remove de competência inexistente → NotFoundException', async () => {
    mockPrisma.competency.findUnique.mockResolvedValue(null);
    await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createProficiencyLevel recusa valor duplicado para a mesma competência', async () => {
    mockPrisma.competency.findUnique.mockResolvedValue({ id: 1, _count: {} });
    mockPrisma.proficiencyLevel.findFirst.mockResolvedValue({ id: 5, value: 3 });
    await expect(
      service.createProficiencyLevel({ competencyId: 1, value: 3 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.proficiencyLevel.create).not.toHaveBeenCalled();
  });

  it('createProficiencyLevel aceita valor inédito', async () => {
    mockPrisma.competency.findUnique.mockResolvedValue({ id: 1, _count: {} });
    mockPrisma.proficiencyLevel.findFirst.mockResolvedValue(null);
    mockPrisma.proficiencyLevel.create.mockResolvedValue({ id: 6, value: 4 });
    await expect(
      service.createProficiencyLevel({ competencyId: 1, value: 4 } as any),
    ).resolves.toBeDefined();
  });
});

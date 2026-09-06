import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SuccessionService } from './succession.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  criticalPosition: { findUnique: jest.fn() },
  user: { findUnique: jest.fn() },
  successionPlan: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn().mockResolvedValue({}),
  },
  talentPool: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn().mockResolvedValue({}),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('SuccessionService.create — validações e cálculo automático de match', () => {
  let service: SuccessionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [SuccessionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SuccessionService>(SuccessionService);
  });

  it('cargo crítico inexistente → NotFoundException', async () => {
    mockPrisma.criticalPosition.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ criticalPositionId: 1, candidateId: 7 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('candidato inexistente → NotFoundException', async () => {
    mockPrisma.criticalPosition.findUnique.mockResolvedValue({ id: 1 });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.create({ criticalPositionId: 1, candidateId: 999 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('candidato já num plano para o mesmo cargo → ConflictException', async () => {
    mockPrisma.criticalPosition.findUnique.mockResolvedValue({ id: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 7 });
    mockPrisma.successionPlan.findFirst.mockResolvedValue({ id: 5 });
    await expect(
      service.create({ criticalPositionId: 1, candidateId: 7 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.successionPlan.create).not.toHaveBeenCalled();
  });

  it('sem matchScore fornecido, calcula automaticamente a partir de competências/performance/antiguidade', async () => {
    mockPrisma.criticalPosition.findUnique
      .mockResolvedValueOnce({ id: 1 }) // validação inicial
      .mockResolvedValueOnce({
        id: 1,
        position: {
          competencies: [{ competencyId: 10, requiredLevel: 3 }],
        },
      }); // dentro de calculateMatchScoreForCandidate
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ id: 7 }) // validação inicial
      .mockResolvedValueOnce({
        id: 7,
        hireDate: new Date(Date.now() - 5 * 365.25 * 24 * 3600 * 1000), // 5 anos de casa
        userCompetencies: [{ competencyId: 10, currentLevel: 3 }], // cumpre o requisito
        performanceReviews: [{ score: 4 }], // 4/5 → 80%
      });
    mockPrisma.successionPlan.findFirst.mockResolvedValue(null);
    mockPrisma.successionPlan.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 1, ...data }),
    );

    const result = await service.create({ criticalPositionId: 1, candidateId: 7 } as any);

    // compScore=100 (cumpre o único requisito), perfScore=80, expScore=50 (5 anos = 50%)
    // final = 100*0.4 + 80*0.4 + 50*0.2 = 40+32+10 = 82
    expect(result.matchScore).toBe(82);
  });

  it('matchScore explícito no dto não é recalculado', async () => {
    mockPrisma.criticalPosition.findUnique.mockResolvedValue({ id: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 7 });
    mockPrisma.successionPlan.findFirst.mockResolvedValue(null);
    mockPrisma.successionPlan.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 1, ...data }),
    );

    const result = await service.create({
      criticalPositionId: 1,
      candidateId: 7,
      matchScore: 95,
    } as any);

    expect(result.matchScore).toBe(95);
    // Não deve ter sido chamado outra vez para calcular (apenas a 1ª validação)
    expect(mockPrisma.criticalPosition.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('SuccessionService — update / remove', () => {
  let service: SuccessionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [SuccessionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SuccessionService>(SuccessionService);
  });

  it('update de plano inexistente → NotFoundException', async () => {
    mockPrisma.successionPlan.findUnique.mockResolvedValue(null);
    await expect(service.update(1, {} as any)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.successionPlan.update).not.toHaveBeenCalled();
  });

  it('remove de plano inexistente → NotFoundException', async () => {
    mockPrisma.successionPlan.findUnique.mockResolvedValue(null);
    await expect(service.remove(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.successionPlan.delete).not.toHaveBeenCalled();
  });
});

describe('SuccessionService — Talent Pool', () => {
  let service: SuccessionService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [SuccessionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<SuccessionService>(SuccessionService);
  });

  it('addToTalentPool recusa duplicar colaborador já no pool', async () => {
    mockPrisma.talentPool.findUnique.mockResolvedValue({ userId: 7 });
    await expect(service.addToTalentPool({ userId: 7 } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mockPrisma.talentPool.create).not.toHaveBeenCalled();
  });

  it('removeFromTalentPool de colaborador que não está no pool → NotFoundException', async () => {
    mockPrisma.talentPool.findUnique.mockResolvedValue(null);
    await expect(service.removeFromTalentPool(7)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.talentPool.delete).not.toHaveBeenCalled();
  });

  it('removeFromTalentPool remove com sucesso quando existe', async () => {
    mockPrisma.talentPool.findUnique.mockResolvedValue({ userId: 7 });
    const result = await service.removeFromTalentPool(7);
    expect(mockPrisma.talentPool.delete).toHaveBeenCalledWith({ where: { userId: 7 } });
    expect(result).toHaveProperty('message');
  });
});

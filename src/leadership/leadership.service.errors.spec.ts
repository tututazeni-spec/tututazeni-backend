import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  oneOnOne: { findFirst: jest.fn(), update: jest.fn() },
  leadershipFeedback360: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const self = { id: 5, role: { name: 'LIDER' } } as any;
const other = { id: 6, role: { name: 'LIDER' } } as any;
const rh = { id: 1, role: { name: 'RH' } } as any;

describe('LeadershipService — completeOneOnOne (ownership por gestor)', () => {
  let service: LeadershipService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadershipService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LeadershipService>(LeadershipService);
  });

  it('1:1 não encontrado ou não pertence ao gestor → NotFoundException', async () => {
    mockPrisma.oneOnOne.findFirst.mockResolvedValue(null);
    await expect(service.completeOneOnOne(999, { oneOnOneId: 1 } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockPrisma.oneOnOne.update).not.toHaveBeenCalled();
  });

  it('gestor dono do 1:1 pode concluí-lo', async () => {
    mockPrisma.oneOnOne.findFirst.mockResolvedValue({ id: 1, managerId: 10 });
    mockPrisma.oneOnOne.update.mockResolvedValue({ id: 1, status: 'COMPLETED' });
    const result = await service.completeOneOnOne(10, { oneOnOneId: 1, minutes: 'ok' } as any);
    expect(result.status).toBe('COMPLETED');
  });
});

describe('LeadershipService.get360Summary — ownership (A3)', () => {
  let service: LeadershipService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadershipService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LeadershipService>(LeadershipService);
  });

  it('o próprio líder vê o seu sumário 360°', async () => {
    await expect(service.get360Summary(5, self)).resolves.toHaveProperty('leaderId', 5);
  });

  it('outro líder não pode ver o sumário 360° alheio → NotFoundException', async () => {
    await expect(service.get360Summary(5, other)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('RH (privilegiado) pode ver qualquer sumário 360°', async () => {
    await expect(service.get360Summary(5, rh)).resolves.toHaveProperty('leaderId', 5);
  });

  it('chamada interna sem user não filtra por ownership', async () => {
    await expect(service.get360Summary(5)).resolves.toHaveProperty('leaderId', 5);
  });

  it('sem feedbacks devolve estrutura vazia consistente', async () => {
    mockPrisma.leadershipFeedback360.findMany.mockResolvedValue([]);
    const result = await service.get360Summary(5, self);
    expect(result).toEqual({ leaderId: 5, totalResponses: 0, byCompetency: [], avgScore: 0 });
  });

  it('agrega scores por competência e calcula a média geral', async () => {
    mockPrisma.leadershipFeedback360.findMany.mockResolvedValue([
      {
        responses: [
          { competency: 'Comunicação', score: 4 },
          { competency: 'Comunicação', score: 2 },
        ],
        qualitativeFeedback: 'Bom líder',
      },
    ]);
    const result = await service.get360Summary(5, self);
    expect(result.byCompetency).toEqual([
      { competency: 'Comunicação', avgScore: 3, count: 2, insight: '⚠ 50% indicam lacuna' },
    ]);
    expect(result.avgScore).toBe(3);
  });
});

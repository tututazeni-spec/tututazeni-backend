import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { LeadershipService } from './leadership.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  leadershipProgram: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  leadershipParticipant: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  leadershipScore: { create: jest.fn(), findMany: jest.fn() },
  leadershipFeedback360: { create: jest.fn(), findMany: jest.fn() },
  leadershipPulse: { create: jest.fn(), findMany: jest.fn() },
  mentoring: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  mentoringSession: { create: jest.fn(), findMany: jest.fn() },
  oneOnOne: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  teamHealth: { create: jest.fn(), findMany: jest.fn() },
  kudos: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  performanceReview: { findMany: jest.fn().mockResolvedValue([]) },
  certificate: { create: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
  user: { findUnique: jest.fn() },
};

const baseProgram = {
  id: 1,
  name: 'Programa de Liderança',
  description: 'Desenvolvimento de líderes',
  status: 'ACTIVE',
  participants: [],
  _count: { participants: 5 },
};

describe('LeadershipService', () => {
  let service: LeadershipService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadershipService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LeadershipService>(LeadershipService);
  });

  describe('findAll', () => {
    it('deve retornar programas paginados', async () => {
      mockPrisma.leadershipProgram.findMany.mockResolvedValue([baseProgram]);
      mockPrisma.leadershipProgram.count.mockResolvedValue(1);

      const result = await service.findAll({});
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('deve retornar programa por id', async () => {
      mockPrisma.leadershipProgram.findUnique.mockResolvedValue(baseProgram);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.leadershipProgram.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('deve criar programa', async () => {
      mockPrisma.leadershipProgram.create.mockResolvedValue(baseProgram);
      const result = await service.create({
        title: 'Programa de Liderança',
        description: 'Desc',
      } as any);
      expect(result).toBeDefined();
    });
  });

  describe('enroll', () => {
    it('deve inscrever utilizador no programa', async () => {
      mockPrisma.leadershipParticipant.findUnique.mockResolvedValue(null);
      mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
        ...baseProgram,
        status: 'ACTIVE',
      });
      mockPrisma.leadershipParticipant.create.mockResolvedValue({
        id: 1,
        userId: 1,
        programId: 1,
        program: { name: 'Programa de Liderança' },
      });

      const result = await service.enroll({ userId: 1, programId: 1 });
      expect(result).toBeDefined();
    });

    it('deve lançar ConflictException se já inscrito', async () => {
      mockPrisma.leadershipParticipant.findUnique.mockResolvedValue({ id: 1 });
      await expect(service.enroll({ userId: 1, programId: 1 })).rejects.toThrow(ConflictException);
    });
  });

  describe('get360Summary', () => {
    const leaderA = { id: 1, email: 'leaderA@innova.com', role: { name: 'GESTOR' } };
    const leaderB = { id: 2, email: 'leaderB@innova.com', role: { name: 'GESTOR' } };
    const adminUser = { id: 99, email: 'admin@innova.com', role: { name: 'ADMIN' } };

    it('permite ao próprio líder ver o seu sumário 360°', async () => {
      mockPrisma.leadershipFeedback360.findMany.mockResolvedValue([]);
      const result = await service.get360Summary(1, leaderA as any);
      expect(result).toBeDefined();
    });

    it('não permite líder B ver o sumário 360° de líder A', async () => {
      mockPrisma.leadershipFeedback360.findMany.mockResolvedValue([]);
      await expect(service.get360Summary(1, leaderB as any)).rejects.toThrow(NotFoundException);
    });

    it('permite ADMIN ver o sumário 360° de qualquer líder', async () => {
      mockPrisma.leadershipFeedback360.findMany.mockResolvedValue([]);
      const result = await service.get360Summary(1, adminUser as any);
      expect(result).toBeDefined();
    });

    it('sem user (chamada interna) não filtra por ownership', async () => {
      mockPrisma.leadershipFeedback360.findMany.mockResolvedValue([]);
      const result = await service.get360Summary(1);
      expect(result).toBeDefined();
    });
  });
});

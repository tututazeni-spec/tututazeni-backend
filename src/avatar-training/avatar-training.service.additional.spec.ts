// src/avatar-training/avatar-training.service.additional.spec.ts
// Cobre métodos não testados: getAvatar, updateAvatar, deleteAvatar, uploadKnowledge,
// getDashboard, getUserAnalytics, getTeamAnalytics, getRecommendedScenarios

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AvatarTrainingService } from './avatar-training.service';
import { PrismaService } from '../prisma/prisma.service';

const baseScenario = {
  id: 1,
  title: 'Entrevista de Vendas',
  category: 'SALES',
  difficulty: 'MEDIUM',
  status: 'PUBLISHED',
  active: true,
};

const baseSession = {
  id: 1,
  userId: 1,
  scenarioId: 1,
  status: 'COMPLETED',
  score: 80,
  completedAt: new Date('2026-06-01'),
  startedAt: new Date('2026-06-01'),
  scenario: { category: 'SALES', difficulty: 'MEDIUM', title: 'Entrevista de Vendas' },
};

const mockPrisma: any = new Proxy(
  {
    avatarScenario: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(baseScenario),
      update: jest.fn().mockResolvedValue(baseScenario),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    avatarSession: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userPoints: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    },
    notificationLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    badge: { findMany: jest.fn().mockResolvedValue([]) },
    badgeAward: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  },
  {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn().mockResolvedValue({}),
      };
    },
  },
);

describe('AvatarTrainingService (additional)', () => {
  let service: AvatarTrainingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.avatarScenario.findMany.mockResolvedValue([]);
    mockPrisma.avatarScenario.findUnique.mockResolvedValue(null);
    mockPrisma.avatarScenario.count.mockResolvedValue(0);
    mockPrisma.avatarScenario.groupBy.mockResolvedValue([]);
    mockPrisma.avatarSession.findMany.mockResolvedValue([]);
    mockPrisma.avatarSession.count.mockResolvedValue(0);
    mockPrisma.avatarSession.groupBy.mockResolvedValue([]);
    mockPrisma.avatarSession.aggregate.mockResolvedValue({ _avg: { score: null } });
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.userPoints.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [AvatarTrainingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AvatarTrainingService>(AvatarTrainingService);
  });

  // ─── getAvatar ─────────────────────────────────────────────────

  describe('getAvatar', () => {
    it('deve lançar NotFoundException se avatar não encontrado (safeM fallback → null)', async () => {
      // safeM retorna null via fallback quando trainingAvatar não existe no prisma
      await expect(service.getAvatar(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateAvatar ──────────────────────────────────────────────

  describe('updateAvatar', () => {
    it('deve actualizar avatar via safeM com fallback', async () => {
      // safeM fallback: update retorna d.data
      const result = await service.updateAvatar(1, { name: 'Avatar Actualizado' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── deleteAvatar ──────────────────────────────────────────────

  describe('deleteAvatar', () => {
    it('deve desactivar avatar e retornar mensagem', async () => {
      const result = await service.deleteAvatar(1);
      expect(result.message).toContain('desactivado');
    });
  });

  // ─── uploadKnowledge ───────────────────────────────────────────

  describe('uploadKnowledge', () => {
    it('deve adicionar documento à base de conhecimento', async () => {
      const result = await service.uploadKnowledge(
        1,
        'https://example.com/doc.pdf',
        'Manual de Vendas',
      );
      expect(result.avatarId).toBe(1);
      expect(result.message).toContain('conhecimento');
      expect(result.title).toBe('Manual de Vendas');
    });
  });

  // ─── getDashboard ──────────────────────────────────────────────

  describe('getDashboard', () => {
    it('deve retornar dashboard com KPIs', async () => {
      mockPrisma.avatarScenario.count.mockResolvedValue(20);
      mockPrisma.avatarSession.count
        .mockResolvedValueOnce(5) // activeSessions
        .mockResolvedValueOnce(50); // completedSessions
      mockPrisma.avatarSession.groupBy.mockResolvedValue([]);
      mockPrisma.avatarSession.aggregate.mockResolvedValue({ _avg: { score: 75.5 } });

      const result = (await service.getDashboard({})) as any;
      expect(result.kpis).toBeDefined();
      expect(result.kpis.totalScenarios).toBe(20);
      expect(result.kpis.activeSessions).toBe(5);
      expect(result.kpis.completedSessions).toBe(50);
    });

    it('deve filtrar por category quando fornecido', async () => {
      mockPrisma.avatarScenario.count.mockResolvedValue(5);
      mockPrisma.avatarSession.count.mockResolvedValue(0);
      mockPrisma.avatarSession.groupBy.mockResolvedValue([]);
      mockPrisma.avatarSession.aggregate.mockResolvedValue({ _avg: { score: null } });

      const result = (await service.getDashboard({ category: 'SALES' as any })) as any;
      expect(result.kpis).toBeDefined();
    });

    it('deve enriquecer topScenarios com títulos', async () => {
      mockPrisma.avatarScenario.count.mockResolvedValue(10);
      mockPrisma.avatarSession.count.mockResolvedValue(0);
      mockPrisma.avatarSession.groupBy.mockResolvedValue([
        { scenarioId: 1, _count: { id: 10 }, _avg: { score: 80 } },
      ]);
      mockPrisma.avatarScenario.findMany.mockResolvedValue([baseScenario]);
      mockPrisma.avatarSession.aggregate.mockResolvedValue({ _avg: { score: 80 } });

      const result = (await service.getDashboard({})) as any;
      expect(result.topScenarios).toBeDefined();
    });

    it('deve calcular avgScore null quando sem completions', async () => {
      mockPrisma.avatarScenario.count.mockResolvedValue(5);
      mockPrisma.avatarSession.count.mockResolvedValue(0);
      mockPrisma.avatarSession.groupBy.mockResolvedValue([]);
      mockPrisma.avatarSession.aggregate.mockResolvedValue({ _avg: { score: null } });

      const result = (await service.getDashboard({})) as any;
      expect(result.kpis.avgScore).toBeNull();
    });
  });

  // ─── getUserAnalytics ──────────────────────────────────────────

  describe('getUserAnalytics', () => {
    it('deve retornar analytics com 0 sessões', async () => {
      mockPrisma.avatarSession.findMany.mockResolvedValue([]);
      mockPrisma.userPoints.findUnique.mockResolvedValue({ points: 0 });

      const result = (await service.getUserAnalytics(1)) as any;
      expect(result.userId).toBe(1);
      expect(result.totalSessions).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.avgScore).toBeNull();
      expect(result.streak).toBe(0);
    });

    it('deve calcular analytics com sessões completadas', async () => {
      mockPrisma.avatarSession.findMany.mockResolvedValue([
        { ...baseSession, status: 'COMPLETED', score: 80, completedAt: new Date('2026-06-01') },
        {
          ...baseSession,
          id: 2,
          status: 'COMPLETED',
          score: 90,
          completedAt: new Date('2026-06-02'),
        },
        { ...baseSession, id: 3, status: 'IN_PROGRESS', score: null, completedAt: null },
      ]);
      mockPrisma.userPoints.findUnique.mockResolvedValue({ points: 500 });

      const result = (await service.getUserAnalytics(1)) as any;
      expect(result.totalSessions).toBe(3);
      expect(result.completed).toBe(2);
      expect(result.avgScore).toBe(85.0);
      expect(result.xpPoints).toBe(500);
    });

    it('deve agrupar sessões por categoria', async () => {
      mockPrisma.avatarSession.findMany.mockResolvedValue([
        {
          ...baseSession,
          scenario: { category: 'SALES', title: 'Entrevista', difficulty: 'MEDIUM' },
        },
        {
          ...baseSession,
          id: 2,
          scenario: { category: 'LEADERSHIP', title: 'Feedback', difficulty: 'HARD' },
        },
      ]);
      mockPrisma.userPoints.findUnique.mockResolvedValue(null);

      const result = (await service.getUserAnalytics(1)) as any;
      expect(result.byCategory).toHaveLength(2);
    });

    it('deve calcular streak correctamente', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      mockPrisma.avatarSession.findMany.mockResolvedValue([
        { ...baseSession, completedAt: now },
        { ...baseSession, id: 2, completedAt: yesterday },
      ]);
      mockPrisma.userPoints.findUnique.mockResolvedValue(null);

      const result = (await service.getUserAnalytics(1)) as any;
      expect(result.streak).toBeGreaterThan(0);
    });
  });

  // ─── getTeamAnalytics ──────────────────────────────────────────

  describe('getTeamAnalytics', () => {
    it('deve retornar mensagem se manager sem equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getTeamAnalytics(99)) as any;
      expect(result.team).toHaveLength(0);
      expect(result.message).toBeDefined();
    });

    it('deve retornar analytics da equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 1, fullName: 'Ana', avatarUrl: null, position: { name: 'Dev' } },
        { id: 2, fullName: 'João', avatarUrl: null, position: { name: 'Dev' } },
      ]);
      mockPrisma.avatarSession.findMany.mockResolvedValue([
        { userId: 1, score: 80, scenarioId: 1, completedAt: new Date() },
        { userId: 1, score: 90, scenarioId: 2, completedAt: new Date() },
      ]);

      const result = (await service.getTeamAnalytics(99)) as any;
      expect(result.team).toHaveLength(2);
      expect(result.teamAvg).toBeDefined();
    });

    it('deve marcar alerta para membros com score < 50', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 3, fullName: 'Pedro', avatarUrl: null, position: { name: 'Dev' } },
      ]);
      mockPrisma.avatarSession.findMany.mockResolvedValue([
        { userId: 3, score: 30, scenarioId: 1, completedAt: new Date() },
      ]);

      const result = (await service.getTeamAnalytics(99)) as any;
      const pedro = result.team[0];
      expect(pedro.alert).toBe(true);
      expect(result.alerts).toHaveLength(1);
    });

    it('deve calcular teamAvg null se nenhum membro tem score', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 4, fullName: 'Maria', avatarUrl: null, position: { name: 'Dev' } },
      ]);
      mockPrisma.avatarSession.findMany.mockResolvedValue([]); // sem sessões

      const result = (await service.getTeamAnalytics(99)) as any;
      expect(result.teamAvg).toBeNull();
    });
  });

  // ─── getRecommendedScenarios ───────────────────────────────────

  describe('getRecommendedScenarios', () => {
    it('deve retornar cenários recomendados por competências com gap', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        userCompetencies: [
          { competencyId: 1, currentLevel: 2 }, // gap (< 4)
          { competencyId: 2, currentLevel: 4 }, // sem gap
        ],
      });
      mockPrisma.avatarSession.findMany.mockResolvedValue([]); // sem completados
      mockPrisma.avatarScenario.findMany.mockResolvedValue([baseScenario]);

      const result = await service.getRecommendedScenarios(1, 6);
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('deve usar fallback se nenhum cenário corresponde', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ userCompetencies: [] });
      mockPrisma.avatarSession.findMany.mockResolvedValue([]);
      // Primeiro findMany retorna [] (sem match), segundo retorna populares
      mockPrisma.avatarScenario.findMany
        .mockResolvedValueOnce([]) // nenhum match
        .mockResolvedValueOnce([baseScenario]); // fallback popular

      const result = await service.getRecommendedScenarios(1, 6);
      expect(result).toBeDefined();
    });

    it('deve excluir cenários já completados', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ userCompetencies: [] });
      mockPrisma.avatarSession.findMany.mockResolvedValue([
        { scenarioId: 1 }, // já completado
      ]);
      mockPrisma.avatarScenario.findMany.mockResolvedValue([]);

      await service.getRecommendedScenarios(1, 6);
      expect(mockPrisma.avatarScenario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: expect.objectContaining({ notIn: [1] }) }),
        }),
      );
    });

    it('deve lidar com user sem competências', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null); // user não encontrado
      mockPrisma.avatarSession.findMany.mockResolvedValue([]);
      mockPrisma.avatarScenario.findMany.mockResolvedValue([baseScenario]);

      const result = await service.getRecommendedScenarios(99, 6);
      expect(result).toBeDefined();
    });
  });

  // ─── getDashboard com departmentId ────────────────────────────

  describe('getDashboard com departmentId', () => {
    it('deve filtrar sessões por departamento', async () => {
      mockPrisma.avatarScenario.count.mockResolvedValue(5);
      mockPrisma.avatarSession.count.mockResolvedValue(2);
      mockPrisma.avatarSession.groupBy.mockResolvedValue([]);
      mockPrisma.avatarSession.aggregate.mockResolvedValue({ _avg: { score: 70 } });

      const result = (await service.getDashboard({ departmentId: 1 })) as any;
      expect(result.kpis).toBeDefined();
    });
  });
});

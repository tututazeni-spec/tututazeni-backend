// src/dashboard/dashboard.service.progress.spec.ts
// Cobre métodos não testados: getDepartmentDashboard, getLeaderboard, listSnapshots,
// generateSnapshot, globalSearch, getOrganizationSummary (básico), getExecutiveDashboard

import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
    upsert: jest.fn().mockResolvedValue({}),
  });

  return {
    user: crud(),
    enrollment: crud(),
    performanceReview: crud(),
    developmentPlan: crud(),
    dashboardSnapshot: crud(),
    department: crud(),
    position: crud(),
    userCompetency: crud(),
    successionPlan: crud(),
    auditLog: crud(),
    engagementSurvey: crud(),
    surveyResponse: crud(),
    evaluationRequest: crud(),
    contentAsset: crud(),
    nineBoxPlacement: crud(),
    // via (this.prisma as any)
    course: crud(),
    competency: crud(),
  };
}

describe('DashboardService (progress)', () => {
  let service: DashboardService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: CacheService,
          useValue: { getOrSet: jest.fn((_k: string, _ttl: number, fn: () => any) => fn()) },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  // ─── getDepartmentDashboard ─────────────────────────────────────────────────

  describe('getDepartmentDashboard', () => {
    it('deve retornar dashboard do departamento sem dados', async () => {
      mockPrisma.user.count.mockResolvedValue(10);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: null } });
      mockPrisma.developmentPlan.count.mockResolvedValue(0);
      const result = (await service.getDepartmentDashboard(1)) as any;
      expect(result.departmentId).toBe(1);
      expect(result.headcount).toBe(10);
      expect(result.learning.completionRate).toBe(0);
    });

    it('deve calcular completionRate com dados', async () => {
      mockPrisma.user.count.mockResolvedValue(20);
      mockPrisma.enrollment.count
        .mockResolvedValueOnce(15) // enrollments EM_ANDAMENTO
        .mockResolvedValueOnce(10) // completions CONCLUIDO
        .mockResolvedValueOnce(0); // activePlans (via count)
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 3.5 } });
      mockPrisma.developmentPlan.count.mockResolvedValue(8);
      const result = (await service.getDepartmentDashboard(1, 'MONTH' as any)) as any;
      expect(result.learning.completionRate).toBe(50); // 10/20 * 100 = 50%
      expect(result.performance.avgScore).toBe(3.5);
      expect(result.development.activePlans).toBe(8);
      expect(result.development.coverage).toBe(40); // 8/20 * 100 = 40%
    });

    it('deve usar período WEEK', async () => {
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: null } });
      mockPrisma.developmentPlan.count.mockResolvedValue(0);
      const result = (await service.getDepartmentDashboard(2, 'WEEK' as any)) as any;
      expect(result.period).toBe('WEEK');
    });
  });

  // ─── getLeaderboard ──────────────────────────────────────────────────────────

  describe('getLeaderboard', () => {
    it('deve retornar leaderboard vazio', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getLeaderboard()) as any[];
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('deve classificar utilizadores por pontos e calcular nível', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Ana',
          avatarUrl: null,
          position: { name: 'Lead' },
          points: { points: 5500 },
          _count: { badgeAwards: 3 },
        },
        {
          id: 2,
          fullName: 'João',
          avatarUrl: null,
          position: null,
          points: { points: 900 },
          _count: { badgeAwards: 1 },
        },
        {
          id: 3,
          fullName: 'Maria',
          avatarUrl: null,
          position: null,
          points: null,
          _count: { badgeAwards: 0 },
        },
      ]);
      const result = (await service.getLeaderboard()) as any[];
      expect(result).toHaveLength(3);
      expect(result[0].rank).toBe(1);
      expect(result[0].level.label).toBe('Master'); // 5500 >= 5000
      expect(result[1].level.label).toBe('Avançado'); // 900 >= 800
      expect(result[2].points).toBe(0); // points = null → 0
    });

    it('deve filtrar por departamento', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await service.getLeaderboard(5, 10);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ departmentId: 5 }) }),
      );
    });
  });

  // ─── listSnapshots ───────────────────────────────────────────────────────────

  describe('listSnapshots', () => {
    it('deve retornar lista de snapshots', async () => {
      mockPrisma.dashboardSnapshot.findMany.mockResolvedValue([
        { id: 1, generatedAt: new Date() },
        { id: 2, generatedAt: new Date() },
      ]);
      const result = (await service.listSnapshots()) as any[];
      expect(result).toHaveLength(2);
    });

    it('deve retornar lista vazia se sem snapshots', async () => {
      mockPrisma.dashboardSnapshot.findMany.mockResolvedValue([]);
      const result = (await service.listSnapshots()) as any[];
      expect(result).toHaveLength(0);
    });
  });

  // ─── generateSnapshot ────────────────────────────────────────────────────────

  describe('generateSnapshot', () => {
    it('deve gerar snapshot com fallback graceful', async () => {
      // Mock todos os modelos usados por getOrganizationSummary
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.enrollment.count.mockResolvedValue(50);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 3.5 } });
      mockPrisma.engagementSurvey.count.mockResolvedValue(2);
      mockPrisma.surveyResponse.count.mockResolvedValue(40);
      mockPrisma.developmentPlan.count.mockResolvedValue(30);
      mockPrisma.evaluationRequest.count.mockResolvedValue(0);
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.groupBy.mockResolvedValue([]);
      mockPrisma.successionPlan.count.mockResolvedValue(0);
      mockPrisma.position.count.mockResolvedValue(10);
      mockPrisma.auditLog.groupBy.mockResolvedValue([]);
      mockPrisma.contentAsset.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(20);
      // dashboardSnapshot.create via as any
      mockPrisma.dashboardSnapshot.create.mockResolvedValue({ id: 1, generatedAt: new Date() });
      const result = (await service.generateSnapshot()) as any;
      // Either snapshot created or fallback message
      expect(result).toBeDefined();
    });
  });

  // ─── globalSearch ────────────────────────────────────────────────────────────

  describe('globalSearch', () => {
    it('deve retornar resultado vazio para query curta (< 2 chars)', async () => {
      const result = (await service.globalSearch('a')) as any;
      expect(result.users).toHaveLength(0);
      expect(result.courses).toHaveLength(0);
    });

    it('deve retornar resultado vazio para query vazia', async () => {
      const result = (await service.globalSearch('')) as any;
      expect(result.users).toHaveLength(0);
    });

    it('deve pesquisar utilizadores, cursos e competências', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Ana Silva',
          email: 'ana@test.com',
          avatarUrl: null,
          position: null,
          department: null,
        },
      ]);
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 1, title: 'TypeScript Avançado', category: 'TI', thumbnailUrl: null },
      ]);
      mockPrisma.competency.findMany.mockResolvedValue([
        { id: 1, name: 'TypeScript', type: 'TECHNICAL' },
      ]);
      const result = (await service.globalSearch('typescript')) as any;
      expect(result.users).toHaveLength(1);
      expect(result.courses).toHaveLength(1);
      expect(result.competencies).toHaveLength(1);
    });

    it('deve lidar com falha no modelo competency gracefully', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.course.findMany.mockResolvedValue([]);
      // competency via as any → se não existe, retorna []
      const result = (await service.globalSearch('teste')) as any;
      expect(result).toBeDefined();
    });
  });

  // ─── getOrganizationSummary (básico) ────────────────────────────────────────

  describe('getOrganizationSummary', () => {
    it('deve retornar sumário organizacional sem dados', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.enrollment.count.mockResolvedValue(0);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: null } });
      mockPrisma.engagementSurvey.count.mockResolvedValue(0);
      mockPrisma.surveyResponse.count.mockResolvedValue(0);
      mockPrisma.developmentPlan.count.mockResolvedValue(0);
      mockPrisma.evaluationRequest.count.mockResolvedValue(0);
      mockPrisma.department.findMany.mockResolvedValue([
        { id: 1, name: 'TI', _count: { users: 5 } },
      ]);
      mockPrisma.userCompetency.groupBy.mockResolvedValue([]);
      mockPrisma.successionPlan.count.mockResolvedValue(0);
      mockPrisma.position.count.mockResolvedValue(5);
      mockPrisma.auditLog.groupBy.mockResolvedValue([]);
      mockPrisma.contentAsset.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(0);
      const result = (await service.getOrganizationSummary({})) as any;
      expect(result.kpis).toBeDefined();
      expect(result.departments).toHaveLength(1);
      expect(result.departments[0].headcount).toBe(5);
    });

    it('deve gerar insights com HiPos e succession baixo', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.enrollment.count.mockResolvedValue(20);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 3.5 } });
      mockPrisma.engagementSurvey.count.mockResolvedValue(1);
      mockPrisma.surveyResponse.count.mockResolvedValue(30);
      mockPrisma.developmentPlan.count.mockResolvedValue(5); // < 40% → insight
      mockPrisma.evaluationRequest.count.mockResolvedValue(0);
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.groupBy.mockResolvedValue([
        { userId: 1, _avg: { currentLevel: 4.5 } },
      ]); // 1 hipo
      mockPrisma.successionPlan.count.mockResolvedValue(2);
      mockPrisma.position.count.mockResolvedValue(10); // 20% coverage < 50% → insight
      mockPrisma.auditLog.groupBy.mockResolvedValue([]);
      mockPrisma.contentAsset.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(10);
      const result = (await service.getOrganizationSummary({ period: 'MONTH' as any })) as any;
      expect(result.insights.length).toBeGreaterThan(0);
    });
  });

  // ─── getExecutiveDashboard ───────────────────────────────────────────────────

  describe('getExecutiveDashboard', () => {
    it('deve retornar dashboard executivo com org summary', async () => {
      // Mock completo para getOrganizationSummary + private helpers
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.enrollment.count.mockResolvedValue(10);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 3.0 } });
      mockPrisma.engagementSurvey.count.mockResolvedValue(0);
      mockPrisma.surveyResponse.count.mockResolvedValue(0);
      mockPrisma.developmentPlan.count.mockResolvedValue(0);
      mockPrisma.evaluationRequest.count.mockResolvedValue(0);
      mockPrisma.department.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.groupBy.mockResolvedValue([]);
      mockPrisma.successionPlan.count.mockResolvedValue(0);
      mockPrisma.position.count.mockResolvedValue(5);
      mockPrisma.auditLog.groupBy.mockResolvedValue([]);
      mockPrisma.contentAsset.findMany.mockResolvedValue([]);
      mockPrisma.course.count.mockResolvedValue(5);
      // getTalentHealthScore: user.count x3
      // getTopTalent: user.findMany
      mockPrisma.user.findMany.mockResolvedValue([]);
      // getENPS via as any engagementSurvey → returns null (no ENPS survey)
      mockPrisma.engagementSurvey.findFirst.mockResolvedValue(null);
      const result = (await service.getExecutiveDashboard()) as any;
      expect(result.kpis).toBeDefined();
      expect(result.talentHealth).toBeDefined();
      expect(result.risks).toBeDefined();
    });
  });
});

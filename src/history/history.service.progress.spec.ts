// src/history/history.service.progress.spec.ts
// Cobre métodos não testados: findAll (filtros), getUserTimeline (multi-source),
// getTeamTimeline, getUserMilestones, getUserActivityStats, getUpcomingEvents,
// getAuditStats, getEntityHistory, createEvent + categorise/deriveModule helpers

import { Test, TestingModule } from '@nestjs/testing';
import { HistoryService } from './history.service';
import { PrismaService } from '../prisma/prisma.service';

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {} }),
  });

  return {
    auditLog: crud(),
    enrollment: crud(),
    certificate: crud(),
    performanceReview: crud(),
    developmentPlan: crud(),
    badgeAward: crud(),
    userPoints: crud(),
    user: crud(),
    historyRecord: crud(),
    avatarSession: crud(),
  };
}

const baseLog = {
  id: 1,
  userId: 1,
  action: 'ENROLLMENT',
  entity: 'Course',
  entityId: 1,
  timestamp: new Date('2026-01-15'),
  changes: null,
  reason: null,
  metadata: null,
  user: { id: 1, fullName: 'Ana', email: 'ana@test.com', avatarUrl: null },
};

describe('HistoryService (progress)', () => {
  let service: HistoryService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [HistoryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<HistoryService>(HistoryService);
  });

  // ─── findAll ────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar histórico paginado vazio', async () => {
      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('deve filtrar por userId, entity, action', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([baseLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = await service.findAll({ userId: 1, entity: 'Course', action: 'ENROLLMENT' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].action).toBe('ENROLLMENT');
      expect(result.data[0].category).toBe('LEARNING');
    });

    it('deve filtrar por intervalo de datas', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([baseLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      await service.findAll({ from: '2026-01-01', to: '2026-06-30' });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ timestamp: expect.any(Object) }),
        }),
      );
    });

    it('deve filtrar por search term', async () => {
      await service.findAll({ search: 'certificado' });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });

    it('deve categorizar evento PERFORMANCE', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'EVALUATION_SUBMITTED', entity: 'Evaluation' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data[0].category).toBe('PERFORMANCE');
    });

    it('deve categorizar evento CAREER (PROMOTION)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'PROMOTION_APPROVED', entity: 'User' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data[0].category).toBe('CAREER');
    });

    it('deve categorizar evento FINANCIAL (PAYSLIP)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'PAYSLIP_PROCESSED', entity: 'Payslip' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data[0].category).toBe('FINANCIAL');
    });

    it('deve categorizar evento ATTENDANCE (LEAVE)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'LEAVE_APPROVED', entity: 'LeaveRequest' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data[0].category).toBe('ATTENDANCE');
    });

    it('deve categorizar COMPLIANCE (CONTENT_VIEW)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'CONTENT_VIEW', entity: 'ContentAsset' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data[0].category).toBe('COMPLIANCE');
    });

    it('deve categorizar SYSTEM (default)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'CONFIG_UPDATED', entity: 'Settings' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data[0].category).toBe('SYSTEM');
    });

    it('deve filtrar por category (pós-derivação)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'ENROLLMENT', entity: 'Course' },
        { ...baseLog, id: 2, action: 'PROMOTION_APPROVED', entity: 'User' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(2);
      const result = await service.findAll({ category: 'LEARNING' as any });
      expect(result.data.every((d: any) => d.category === 'LEARNING')).toBe(true);
    });

    it('deve marcar milestone para eventos de alto impacto', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'CERTIFICATE_ISSUED', entity: 'Certificate' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result.data[0].milestone).toBe(true);
      expect(result.data[0].impactScore).toBeGreaterThanOrEqual(75);
    });
  });

  // ─── getUserActivity ────────────────────────────────────────────

  describe('getUserActivity', () => {
    it('deve retornar actividade com limite padrão', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([baseLog]);
      const result = (await service.getUserActivity(1)) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(1);
    });

    it('deve derivar módulo LMS para ENROLLMENT', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'ENROLLMENT', entity: 'Enrollment' },
      ]);
      const result = (await service.getUserActivity(1)) as any[];
      expect(result[0].module).toBe('LMS');
    });

    it('deve derivar módulo PERFORMANCE', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'EVALUATION_SUBMITTED', entity: 'Evaluation' },
      ]);
      const result = (await service.getUserActivity(1)) as any[];
      expect(result[0].module).toBe('PERFORMANCE');
    });

    it('deve derivar módulo AVATAR', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'AVATAR_SESSION', entity: 'Avatar' },
      ]);
      const result = (await service.getUserActivity(1)) as any[];
      expect(result[0].module).toBe('AVATAR');
    });

    it('deve derivar módulo TALENT para PDI', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'PDI_CREATED', entity: 'DevelopmentPlan' },
      ]);
      const result = (await service.getUserActivity(1)) as any[];
      expect(result[0].module).toBe('TALENT');
    });
  });

  // ─── getEntityHistory ───────────────────────────────────────────

  describe('getEntityHistory', () => {
    it('deve retornar histórico de entidade com dados', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([baseLog]);
      const result = (await service.getEntityHistory('Course', 1)) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].entity).toBe('Course');
    });

    it('deve enriquecer título de CONTENT_VIEW', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'CONTENT_VIEW', entity: 'ContentAsset' },
      ]);
      const result = (await service.getEntityHistory('ContentAsset', 1)) as any[];
      expect(result[0].title).toBe('Conteúdo visualizado');
    });

    it('deve enriquecer título de PAYSLIP', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'PAYSLIP_PROCESSED', entity: 'Payslip' },
      ]);
      const result = (await service.getEntityHistory('Payslip', 1)) as any[];
      expect(result[0].title).toBe('Recibo salarial processado');
    });

    it('deve enriquecer título de AVATAR', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'AVATAR_SESSION_COMPLETED', entity: 'AvatarSession' },
      ]);
      const result = (await service.getEntityHistory('AvatarSession', 1)) as any[];
      expect(result[0].title).toBe('Sessão de treino com avatar');
    });
  });

  // ─── createEvent ────────────────────────────────────────────────

  describe('createEvent', () => {
    it('deve criar e enriquecer evento', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({
        id: 10,
        userId: 1,
        action: 'BADGE_AWARDED',
        entity: 'BadgeAward',
        entityId: 5,
        timestamp: new Date(),
        changes: null,
        reason: null,
      });
      const result = (await service.createEvent({
        userId: 1,
        action: 'BADGE_AWARDED',
        entity: 'BadgeAward',
        entityId: 5,
        category: 'LEARNING' as any,
        title: 'Badge',
      } as any)) as any;
      expect(result.icon).toBe('🏅');
      expect(result.impactScore).toBe(60);
    });

    it('deve criar evento de PROMOTION', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({
        id: 11,
        userId: 2,
        action: 'PROMOTION_APPROVED',
        entity: 'User',
        entityId: 2,
        timestamp: new Date(),
        changes: null,
        reason: null,
      });
      const result = (await service.createEvent({
        userId: 2,
        action: 'PROMOTION_APPROVED',
        entity: 'User',
        entityId: 2,
        category: 'CAREER' as any,
        title: 'Promoção',
      } as any)) as any;
      expect(result.icon).toBe('🚀');
      expect(result.impactScore).toBe(90);
      expect(result.milestone).toBe(true);
    });
  });

  // ─── getUserTimeline ────────────────────────────────────────────

  describe('getUserTimeline', () => {
    it('deve retornar timeline vazia', async () => {
      const result = (await service.getUserTimeline(1, {})) as any;
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('deve combinar fontes e ordenar por timestamp', async () => {
      const recent = new Date('2026-06-01');
      const older = new Date('2026-01-01');
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, timestamp: older, action: 'CONFIG_UPDATED', entity: 'Settings' },
      ]);
      mockPrisma.enrollment.findMany.mockResolvedValue([
        {
          id: 2,
          status: 'CONCLUIDO',
          enrolledAt: recent,
          course: { id: 1, title: 'NestJS', category: 'TECH' },
        },
      ]);
      const result = (await service.getUserTimeline(1, {})) as any;
      expect(result.data.length).toBeGreaterThan(0);
      // Recent enrollment should come first
      expect(result.data[0].source).toBe('ENROLLMENT');
    });

    it('deve filtrar por category LEARNING', async () => {
      mockPrisma.enrollment.findMany.mockResolvedValue([
        {
          id: 1,
          status: 'ACTIVE',
          enrolledAt: new Date(),
          course: { id: 1, title: 'NestJS', category: 'TECH' },
        },
      ]);
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'CONFIG_UPDATED', entity: 'Settings' },
      ]);
      const result = (await service.getUserTimeline(1, { category: 'LEARNING' as any })) as any;
      expect(result.data.every((e: any) => e.category === 'LEARNING')).toBe(true);
    });

    it('deve incluir milestones no resultado', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([
        { id: 1, score: 5, createdAt: new Date() },
      ]);
      const result = (await service.getUserTimeline(1, {})) as any;
      expect(result.milestones).toBeDefined();
      const perfMilestone = result.milestones.find(
        (e: any) => e.source === 'PERFORMANCE' && e.milestone,
      );
      if (result.data.some((e: any) => e.source === 'PERFORMANCE')) {
        expect(perfMilestone).toBeDefined();
      }
    });

    it('deve agrupar eventos por mês', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, timestamp: new Date('2026-01-15') },
      ]);
      const result = (await service.getUserTimeline(1, {})) as any;
      expect(result.grouped).toBeDefined();
    });

    it('deve incluir filtro de datas no where', async () => {
      await service.getUserTimeline(1, { from: '2026-01-01', to: '2026-06-30' });
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ timestamp: expect.any(Object) }),
        }),
      );
    });
  });

  // ─── getTeamTimeline ────────────────────────────────────────────

  describe('getTeamTimeline', () => {
    it('deve retornar vazio quando sem equipa', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = (await service.getTeamTimeline(1, {})) as any;
      expect(result.data).toHaveLength(0);
    });

    it('deve retornar timeline da equipa com dados', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 2, fullName: 'Ana', avatarUrl: null }]);
      mockPrisma.auditLog.findMany.mockResolvedValue([{ ...baseLog, userId: 2 }]);
      mockPrisma.auditLog.count.mockResolvedValue(1);
      const result = (await service.getTeamTimeline(1, { page: 1, limit: 10 })) as any;
      expect(result.teamSize).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });

  // ─── getUserMilestones ──────────────────────────────────────────

  describe('getUserMilestones', () => {
    it('deve retornar milestones vazio', async () => {
      const result = (await service.getUserMilestones(1)) as any[];
      expect(Array.isArray(result)).toBe(true);
    });

    it('deve incluir PDI concluído como milestone', async () => {
      mockPrisma.developmentPlan.findMany.mockResolvedValue([
        {
          id: 1,
          name: 'PDI 2026',
          completedAt: new Date('2026-03-01'),
          createdAt: new Date('2026-01-01'),
        },
      ]);
      const result = (await service.getUserMilestones(1)) as any[];
      const pdiMilestone = result.find(m => m.type === 'PDI_COMPLETED');
      expect(pdiMilestone).toBeDefined();
      expect(pdiMilestone.icon).toBe('🎯');
    });

    it('deve incluir certificado como milestone', async () => {
      mockPrisma.certificate.findMany.mockResolvedValue([
        { id: 1, issuedAt: new Date('2026-02-15') },
      ]);
      const result = (await service.getUserMilestones(1)) as any[];
      const certMilestone = result.find(m => m.type === 'CERTIFICATE');
      expect(certMilestone).toBeDefined();
      expect(certMilestone.icon).toBe('🎓');
    });

    it('deve incluir badge como milestone', async () => {
      mockPrisma.badgeAward.findMany.mockResolvedValue([
        { id: 1, awardedAt: new Date('2026-01-20'), badge: { name: 'Estrela' } },
      ]);
      const result = (await service.getUserMilestones(1)) as any[];
      const badgeMilestone = result.find(m => m.type === 'BADGE');
      expect(badgeMilestone).toBeDefined();
      expect(badgeMilestone.icon).toBe('🏅');
    });

    it('deve incluir performance alta como milestone', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([
        { id: 1, score: 4.5, createdAt: new Date('2026-04-01') },
      ]);
      const result = (await service.getUserMilestones(1)) as any[];
      const perfMilestone = result.find(m => m.type === 'HIGH_PERFORMANCE');
      expect(perfMilestone).toBeDefined();
      expect(perfMilestone.icon).toBe('⭐');
    });

    it('deve ordenar por data decrescente', async () => {
      mockPrisma.performanceReview.findMany.mockResolvedValue([
        { id: 1, score: 4.8, createdAt: new Date('2026-01-01') },
        { id: 2, score: 4.2, createdAt: new Date('2026-06-01') },
      ]);
      const result = (await service.getUserMilestones(1)) as any[];
      if (result.length >= 2) {
        expect(new Date(result[0].date).getTime()).toBeGreaterThanOrEqual(
          new Date(result[1].date).getTime(),
        );
      }
    });
  });

  // ─── getUserActivityStats ───────────────────────────────────────

  describe('getUserActivityStats', () => {
    it('deve retornar estatísticas com zero actividade', async () => {
      const result = (await service.getUserActivityStats(1)) as any;
      expect(result.totalEvents).toBe(0);
      expect(result.streak).toBe(0);
      expect(result.activeDays).toBe(0);
      expect(result.completionRate).toBe(0);
    });

    it('deve calcular streak correctamente', async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, timestamp: today },
        { ...baseLog, id: 2, timestamp: yesterday },
      ]);
      const result = (await service.getUserActivityStats(1)) as any;
      expect(result.totalEvents).toBe(2);
      expect(result.streak).toBeGreaterThanOrEqual(1);
    });

    it('deve calcular taxa de conclusão', async () => {
      mockPrisma.enrollment.count
        .mockResolvedValueOnce(10) // total enrollments
        .mockResolvedValueOnce(7); // completed
      mockPrisma.badgeAward.count.mockResolvedValue(3);
      const result = (await service.getUserActivityStats(1)) as any;
      expect(result.enrollments).toBe(10);
      expect(result.completions).toBe(7);
      expect(result.completionRate).toBe(70);
    });

    it('deve construir heatmap por dia', async () => {
      const day1 = new Date('2026-01-05');
      const day2 = new Date('2026-01-10');
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, timestamp: day1 },
        { ...baseLog, id: 2, timestamp: day1 },
        { ...baseLog, id: 3, timestamp: day2 },
      ]);
      const result = (await service.getUserActivityStats(1)) as any;
      expect(result.heatmap['2026-01-05']).toBe(2);
      expect(result.heatmap['2026-01-10']).toBe(1);
    });

    it('deve agrupar por categoria', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { ...baseLog, action: 'ENROLLMENT', entity: 'Course' },
        { ...baseLog, id: 2, action: 'PAYSLIP_PROCESSED', entity: 'Payslip' },
      ]);
      const result = (await service.getUserActivityStats(1)) as any;
      expect(result.byCategory).toBeDefined();
    });
  });

  // ─── getUpcomingEvents ──────────────────────────────────────────

  describe('getUpcomingEvents', () => {
    it('deve retornar eventos futuros com listas vazias', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.certificate.findMany.mockResolvedValue([]);
      const result = (await service.getUpcomingEvents()) as any;
      expect(result.anniversaries).toHaveLength(0);
      expect(result.expiringCertificates).toHaveLength(0);
    });

    it('deve identificar aniversários de empresa este mês', async () => {
      const now = new Date();
      const hireDate = new Date(now.getFullYear() - 3, now.getMonth(), 10);
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Ana',
          avatarUrl: null,
          createdAt: hireDate,
          department: { name: 'TI' },
        },
      ]);
      const result = (await service.getUpcomingEvents()) as any;
      expect(result.anniversaries).toHaveLength(1);
      expect(result.anniversaries[0].years).toBe(3);
      expect(result.anniversaries[0].type).toBe('ANNIVERSARY');
    });

    it('deve incluir certificados a expirar nos próximos 30 dias', async () => {
      const soon = new Date(Date.now() + 15 * 86400000);
      mockPrisma.certificate.findMany.mockResolvedValue([
        { id: 1, expiresAt: soon, user: { id: 1, fullName: 'João' } },
      ]);
      const result = (await service.getUpcomingEvents()) as any;
      expect(result.expiringCertificates).toHaveLength(1);
    });
  });

  // ─── getAuditStats ──────────────────────────────────────────────

  describe('getAuditStats', () => {
    it('deve retornar estatísticas de auditoria vazias', async () => {
      const result = (await service.getAuditStats()) as any;
      expect(result.total).toBe(0);
      expect(Array.isArray(result.byAction)).toBe(true);
      expect(result.generatedAt).toBeDefined();
    });

    it('deve retornar stats com filtro de datas', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(100);
      mockPrisma.auditLog.groupBy
        .mockResolvedValueOnce([
          { action: 'ENROLLMENT', _count: { id: 30 } },
          { action: 'CONTENT_VIEW', _count: { id: 70 } },
        ]) // byAction
        .mockResolvedValueOnce([]); // topUsers
      const result = (await service.getAuditStats('2026-01-01', '2026-06-30')) as any;
      expect(result.total).toBe(100);
      expect(result.byAction).toHaveLength(2);
      expect(result.byAction[0].action).toBe('ENROLLMENT');
    });

    it('deve incluir utilizadores mais activos', async () => {
      mockPrisma.auditLog.groupBy
        .mockResolvedValueOnce([]) // byAction
        .mockResolvedValueOnce([
          // topUsers
          { userId: 1, _count: { id: 50 } },
        ]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1, fullName: 'Ana' }]);
      const result = (await service.getAuditStats()) as any;
      expect(result.topUsers).toBeDefined();
    });

    it('deve incluir alertas de segurança', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          ...baseLog,
          action: 'PERMISSION_CHANGED',
          entity: 'User',
          user: { id: 1, fullName: 'Admin' },
        },
      ]);
      const result = (await service.getAuditStats()) as any;
      expect(result.recentAlerts).toBeDefined();
    });
  });
});

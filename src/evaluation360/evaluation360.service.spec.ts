import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Evaluation360Service } from './evaluation360.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CompetenciesService } from '../competencies/competencies.service';

const competencyMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};

const mockCompetencies = {
  create: jest.fn(),
  update: jest.fn(),
  listCatalogue: jest.fn().mockResolvedValue([]),
};
const cycleMock = {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
};
const questionMock = {
  create: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  delete: jest.fn(),
};
const requestMock = {
  create: jest.fn(),
  createMany: jest.fn().mockResolvedValue({ count: 0 }),
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn(),
  update: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
};

// Fontes reais do Nine-Box calculado (getNineBox) — mocks dedicados para os
// testes poderem controlar o retorno em vez de depender do crud() genérico.
const userMock = {
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn().mockResolvedValue(null),
};
const performanceReviewMock = { findMany: jest.fn().mockResolvedValue([]) };
const objectiveMock = { findMany: jest.fn().mockResolvedValue([]) };
const competencyEvaluationMock = { findMany: jest.fn().mockResolvedValue([]) };

const crud = () => ({
  create: jest.fn().mockResolvedValue({ id: 'id-1' }),
  findMany: jest.fn().mockResolvedValue([]),
  findUnique: jest.fn().mockResolvedValue(null),
  findFirst: jest.fn().mockResolvedValue(null),
  update: jest.fn().mockResolvedValue({ id: 'id-1' }),
  updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  upsert: jest.fn().mockResolvedValue({ id: 'id-1' }),
  count: jest.fn().mockResolvedValue(0),
  delete: jest.fn().mockResolvedValue({ id: 'id-1' }),
});

// evaluationResult precisa do CRUD completo (findUnique/upsert/updateMany já
// usados por outros métodos deste serviço), não só findMany — por isso é um
// crud() estável, não um objecto findMany-only como os outros mocks acima.
const evaluationResultMock = crud();

const mockPrisma = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'competency') return competencyMock;
      if (prop === 'eval360Cycle') return cycleMock;
      if (prop === 'eval360Question') return questionMock;
      if (prop === 'evaluationRequest') return requestMock;
      if (prop === 'user') return userMock;
      if (prop === 'performanceReview') return performanceReviewMock;
      if (prop === 'objective') return objectiveMock;
      if (prop === 'competencyEvaluation') return competencyEvaluationMock;
      // New models from Grupo D
      if (prop === 'eval360Feedback') return crud();
      if (prop === 'evaluatorAssignment') return crud();
      if (prop === 'cycleParticipant') return crud();
      if (prop === 'evaluationResponse') return crud();
      if (prop === 'evaluationAnswer') return crud();
      if (prop === 'evaluationResult') return evaluationResultMock;
      if (prop === 'pulseSurvey') return crud();
      if (prop === 'pulseSurveyResponse') return crud();
      if (prop === 'competencyIndicator') return crud();
      return crud();
    },
  },
);

const mockAudit = {
  log: jest.fn().mockResolvedValue({}),
  logEntity: jest.fn().mockResolvedValue(undefined),
};
const mockEvents = { emit: jest.fn() };

const baseCompetency = { id: 'comp-1', name: 'Comunicação', type: 'BEHAVIORAL', indicators: [] };

describe('Evaluation360Service', () => {
  let service: Evaluation360Service;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Evaluation360Service,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: { send: jest.fn().mockResolvedValue({}) } },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: CompetenciesService, useValue: mockCompetencies },
      ],
    }).compile();
    service = module.get<Evaluation360Service>(Evaluation360Service);
  });

  describe('createCompetency', () => {
    it('delega em CompetenciesService.create (mapeando os campos do catálogo 360) e audita', async () => {
      mockCompetencies.create.mockResolvedValue({ id: 7, name: 'Comunicação' });
      const result = await service.createCompetency(
        { name: 'Comunicação', type: 'BEHAVIORAL', scaleMax: 7 } as any,
        'user-1',
      );
      expect(mockCompetencies.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Comunicação', type: 'BEHAVIORAL', scaleMax: 7 }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'Competency', action: 'CREATE', entityId: 7 }),
      );
      expect(result.name).toBe('Comunicação');
    });
  });

  describe('listCompetencies', () => {
    it('delega em CompetenciesService.listCatalogue com tenantId + paginação', async () => {
      mockCompetencies.listCatalogue.mockResolvedValue([baseCompetency]);
      const result = await service.listCompetencies('t1', {
        search: 'com',
        offset: 5,
        limit: 10,
      } as any);
      expect(mockCompetencies.listCatalogue).toHaveBeenCalledWith({
        tenantId: 't1',
        search: 'com',
        offset: 5,
        limit: 10,
      });
      expect(result).toEqual([baseCompetency]);
    });
  });

  describe('updateCompetency', () => {
    it('converte id string→number, delega em CompetenciesService.update e audita', async () => {
      mockCompetencies.update.mockResolvedValue({ id: 3, name: 'Actualizado' });
      const result = await service.updateCompetency('3', { name: 'Actualizado' } as any, 'user-1');
      expect(mockCompetencies.update).toHaveBeenCalledWith(
        3,
        expect.objectContaining({ name: 'Actualizado' }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'Competency', action: 'UPDATE', entityId: '3' }),
      );
      expect(result.name).toBe('Actualizado');
    });

    it('propaga NotFoundException do serviço canónico', async () => {
      mockCompetencies.update.mockRejectedValue(
        new NotFoundException('Competência não encontrada'),
      );
      await expect(service.updateCompetency('99', {}, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createCycle ──────────────────────────────────────────────────────────

  describe('createCycle', () => {
    it('deve criar ciclo 360', async () => {
      cycleMock.create.mockResolvedValue({
        id: 'cycle-1',
        name: 'Ciclo 360 2024',
        status: 'DRAFT',
      });
      const result = await service.createCycle(
        {
          name: 'Ciclo 360 2024',
          tenantId: 'tenant-1',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 86400000).toISOString(),
          weightSelf: 10,
          weightManager: 40,
          weightPeer: 30,
          weightSubordinate: 20,
          weightExternal: 0,
        } as any,
        'user-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── listCycles ───────────────────────────────────────────────────────────

  describe('listCycles', () => {
    it('deve listar ciclos por tenant', async () => {
      cycleMock.findMany.mockResolvedValue([]);
      cycleMock.count.mockResolvedValue(0);
      const result = await service.listCycles('tenant-1', { offset: 0, limit: 20 });
      expect(result).toBeDefined();
    });
  });

  // ─── getCycleDetail ───────────────────────────────────────────────────────

  describe('getCycleDetail', () => {
    it('deve retornar detalhe do ciclo', async () => {
      cycleMock.findUnique.mockResolvedValue({
        id: 'cycle-1',
        name: 'Ciclo 360 2024',
        status: 'DRAFT',
        participants: [],
        questions: [],
      });
      const result = await service.getCycleDetail('cycle-1');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      cycleMock.findUnique.mockResolvedValue(null);
      await expect(service.getCycleDetail('invalid')).rejects.toThrow(NotFoundException);
    });

    it('deve tratar um ciclo eliminado (soft delete) como não encontrado', async () => {
      cycleMock.findUnique.mockResolvedValue({
        id: 'cycle-1',
        name: 'Ciclo 360 2024',
        status: 'DRAFT',
        deletedAt: new Date(),
        participants: [],
        questions: [],
      });
      await expect(service.getCycleDetail('cycle-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteCycle / restoreCycle / listDeletedCycles (soft delete) ─────────

  const deletableCycle = {
    id: 'cycle-1',
    tenantId: 'tenant-1',
    name: 'Ciclo 360 2024',
    description: null,
    model: 'DEG_360',
    type: 'SEMESTRAL',
    status: 'PUBLISHED',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-06-30'),
    anonymityMode: 'ANONYMOUS',
    quorumMinimum: 3,
    weightSelf: 10,
    weightManager: 30,
    weightPeer: 20,
    weightSubordinate: 40,
    weightExternal: 0,
    cutoffPromotion: null,
    cutoffBonus: null,
    cutoffProgram: null,
    linkedToPdi: true,
    linkedToBonus: false,
    linkedToOkrs: false,
    createdBy: '9',
    createdAt: new Date('2023-12-01'),
    deletedAt: null as Date | null,
    competencies: [
      { competencyId: 'comp-1', competency: { name: 'Comunicação', category: 'BEHAVIORAL' } },
    ],
    _count: { participants: 5, assignments: 5, responses: 3 },
  };

  describe('deleteCycle', () => {
    it('soft-deleta o ciclo e regista snapshot completo via audit.logEntity', async () => {
      cycleMock.findUnique.mockResolvedValue(deletableCycle);
      cycleMock.update.mockResolvedValue({ ...deletableCycle, deletedAt: new Date() });

      const result = await service.deleteCycle('cycle-1', '1');

      expect(cycleMock.update).toHaveBeenCalledWith({
        where: { id: 'cycle-1' },
        data: { deletedAt: expect.any(Date), deletedById: '1' },
      });
      expect(mockAudit.logEntity).toHaveBeenCalledWith(
        1,
        'DELETE',
        'EvaluationCycle',
        'cycle-1',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            id: 'cycle-1',
            name: 'Ciclo 360 2024',
            competencies: [{ id: 'comp-1', name: 'Comunicação', category: 'BEHAVIORAL' }],
            counts: deletableCycle._count,
          }),
        }),
      );
      expect(result).toEqual({ id: 'cycle-1', deletedAt: expect.any(Date) });
    });

    it('deve lançar NotFoundException se o ciclo não existir', async () => {
      cycleMock.findUnique.mockResolvedValue(null);
      await expect(service.deleteCycle('invalid', '1')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se o ciclo já estiver eliminado', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...deletableCycle, deletedAt: new Date() });
      await expect(service.deleteCycle('cycle-1', '1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('restoreCycle', () => {
    it('limpa deletedAt/deletedById e regista RESTORE', async () => {
      const deleted = { ...deletableCycle, deletedAt: new Date(), deletedById: '1' };
      cycleMock.findUnique.mockResolvedValue(deleted);
      cycleMock.update.mockResolvedValue({ ...deleted, deletedAt: null, deletedById: null });

      const result = await service.restoreCycle('cycle-1', '2');

      expect(cycleMock.update).toHaveBeenCalledWith({
        where: { id: 'cycle-1' },
        data: { deletedAt: null, deletedById: null },
      });
      expect(mockAudit.logEntity).toHaveBeenCalledWith(
        2,
        'RESTORE',
        'EvaluationCycle',
        'cycle-1',
        { name: 'Ciclo 360 2024' },
      );
      expect(result.deletedAt).toBeNull();
    });

    it('deve lançar NotFoundException se o ciclo não existir', async () => {
      cycleMock.findUnique.mockResolvedValue(null);
      await expect(service.restoreCycle('invalid', '1')).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se o ciclo não estiver eliminado', async () => {
      cycleMock.findUnique.mockResolvedValue({ ...deletableCycle, deletedAt: null });
      await expect(service.restoreCycle('cycle-1', '1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('listDeletedCycles', () => {
    it('lista só ciclos com deletedAt preenchido, opcionalmente filtrando por tenant', async () => {
      cycleMock.findMany.mockResolvedValue([{ ...deletableCycle, deletedAt: new Date() }]);
      const result = await service.listDeletedCycles('tenant-1');
      expect(cycleMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: { not: null }, tenantId: 'tenant-1' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ─── createQuestion ───────────────────────────────────────────────────────

  describe('createQuestion', () => {
    it('deve criar questão para o ciclo', async () => {
      questionMock.create.mockResolvedValue({ id: 'q-1', text: 'Como avalia a comunicação?' });
      const result = await service.createQuestion(
        { cycleId: 'cycle-1', text: 'Como avalia a comunicação?', type: 'RATING' } as any,
        'user-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── listQuestions ────────────────────────────────────────────────────────

  describe('listQuestions', () => {
    it('deve listar questões', async () => {
      questionMock.findMany.mockResolvedValue([]);
      const result = await service.listQuestions('cycle-1');
      expect(result).toBeDefined();
    });
  });

  // ─── addParticipants ──────────────────────────────────────────────────────

  describe('addParticipants', () => {
    it('deve adicionar participantes ao ciclo', async () => {
      cycleMock.findUnique.mockResolvedValue({ id: 'cycle-1', status: 'DRAFT' });
      requestMock.createMany.mockResolvedValue({ count: 2 });
      const result = await service.addParticipants(
        'cycle-1',
        { userIds: ['user-1', 'user-2'] } as any,
        'admin-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getParticipantProgress ───────────────────────────────────────────────

  describe('getParticipantProgress', () => {
    it('deve retornar progresso do participante', async () => {
      requestMock.findMany.mockResolvedValue([]);
      requestMock.count.mockResolvedValue(0);
      const result = await service.getParticipantProgress('cycle-1', 'user-1');
      expect(result).toBeDefined();
    });
  });

  // ─── getParticipantResult ─────────────────────────────────────────────────

  describe('getParticipantResult', () => {
    it('deve lançar NotFoundException se resultado não existe', async () => {
      await expect(service.getParticipantResult('cycle-1', 'user-1', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getTeamAnalytics ─────────────────────────────────────────────────────

  describe('getTeamAnalytics', () => {
    it('deve retornar analytics da equipa', async () => {
      cycleMock.findUnique.mockResolvedValue({
        id: 'cycle-1',
        status: 'COMPLETED',
        participants: [],
      });
      const result = await service.getTeamAnalytics('cycle-1', 'manager-1');
      expect(result).toBeDefined();
    });
  });

  // ─── getOrganizationalAnalytics ───────────────────────────────────────────

  describe('getOrganizationalAnalytics', () => {
    it('deve retornar analytics organizacionais', async () => {
      cycleMock.findMany.mockResolvedValue([]);
      const result = await service.getOrganizationalAnalytics({ page: 1, limit: 20 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getNineBox ───────────────────────────────────────────────────────────

  describe('getNineBox', () => {
    it('deve retornar nine-box grid', async () => {
      cycleMock.findMany.mockResolvedValue([]);
      const result = await service.getNineBox({ tenantId: 'tenant-1' } as any);
      expect(result).toBeDefined();
    });

    it('calcula performance/potencial a partir das fontes reais (review, objectivos, competências) e cai no proxy antigo quando não há review', async () => {
      evaluationResultMock.findMany.mockResolvedValueOnce([
        {
          participantId: '10',
          weightedScore: 4.5,
          selfScore: null,
          scoresByCompetency: JSON.stringify({
            '1': { name: 'Trabalho em Equipa', category: 'HARD_SKILL', score: 4 },
            '2': { name: 'Liderança', category: 'LEADERSHIP', score: 5 },
          }),
        },
        {
          // Sem review de performance, sem objectivos, sem competências —
          // deve cair no proxy antigo (selfScore ?? weightedScore) e não rebentar.
          participantId: '20',
          weightedScore: 1.5,
          selfScore: 1.0,
          scoresByCompetency: '{}',
        },
      ]);
      performanceReviewMock.findMany.mockResolvedValueOnce([
        { id: 500, userId: 10, score: 4.5, potentialScore: 5, cycle: { scoreScale: 5 } },
      ]);
      objectiveMock.findMany.mockResolvedValueOnce([{ ownerId: 10, progress: 90, weight: 1 }]);
      competencyEvaluationMock.findMany.mockResolvedValueOnce([
        { reviewId: 500, competencyId: 100, evaluatedLevel: 5 },
      ]);
      competencyMock.findMany.mockResolvedValueOnce([{ id: 100 }]); // 100 = competência de categoria LEADERSHIP

      const result = await service.getNineBox({ cycleId: 'cycle-9box' } as any);

      expect(result.find(e => e.box === 'HIGH_HIGH')?.count).toBe(1); // participante 10
      expect(result.find(e => e.box === 'LOW_LOW')?.count).toBe(1); // participante 20
      const totalCount = result.reduce((s, e) => s + e.count, 0);
      expect(totalCount).toBe(2);
      // nunca identifica ninguém — só contagens por quadrante
      expect(result.every(e => typeof e.count === 'number')).toBe(true);
    });

    it('usa a média dos 6 sub-fatores de potencial (learningAgility, adaptability, ambition, responsibilityReadiness, mobilityFlexibility, futureRoleReadiness) quando não há potentialScore nem competência de liderança', async () => {
      evaluationResultMock.findMany.mockResolvedValueOnce([
        { participantId: '30', weightedScore: null, selfScore: null, scoresByCompetency: '{}' },
      ]);
      performanceReviewMock.findMany.mockResolvedValueOnce([
        {
          id: 700,
          userId: 30,
          score: null,
          potentialScore: null,
          learningAgilityScore: 5,
          adaptabilityScore: 5,
          ambitionScore: 5,
          responsibilityReadinessScore: 5,
          mobilityFlexibilityScore: 5,
          futureRoleReadinessScore: 5,
          cycle: { scoreScale: 5 },
        },
      ]);

      const result = await service.getNineBox({ cycleId: 'cycle-9box' } as any);

      // Sem performance nenhuma fonte (perf cai para 0 = LOW) mas potencial
      // máximo pelos 6 sub-fatores (5/5 cada) → LOW_HIGH.
      expect(result.find(e => e.box === 'LOW_HIGH')?.count).toBe(1);
      expect(result.reduce((s, e) => s + e.count, 0)).toBe(1);
    });

    it('filtra por departmentId através de user.findMany', async () => {
      userMock.findMany.mockResolvedValueOnce([{ id: 10 }]);
      evaluationResultMock.findMany.mockResolvedValueOnce([]);
      await service.getNineBox({ cycleId: 'cycle-9box', departmentId: '3' } as any);
      expect(userMock.findMany).toHaveBeenCalledWith({
        where: { departmentId: 3 },
        select: { id: true },
      });
      expect(evaluationResultMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ participantId: { in: ['10'] } }),
        }),
      );
    });
  });

  // ─── createContinuousFeedback ─────────────────────────────────────────────

  describe('createContinuousFeedback', () => {
    it('deve criar feedback contínuo', async () => {
      const result = await service.createContinuousFeedback(
        { toUserId: 'user-2', message: 'Bom trabalho', type: 'POSITIVE' } as any,
        'user-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ─── createPulseSurvey ────────────────────────────────────────────────────

  describe('createPulseSurvey', () => {
    it('deve criar pulse survey', async () => {
      const result = await service.createPulseSurvey(
        { title: 'Pulse Semanal', questions: [] } as any,
        'admin-1',
      );
      expect(result).toBeDefined();
    });
  });
});

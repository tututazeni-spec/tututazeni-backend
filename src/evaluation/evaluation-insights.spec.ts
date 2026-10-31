import { NotFoundException, Logger, ConflictException } from '@nestjs/common';
import {
  compareEvaluations,
  EvaluationInsightsService,
  HistoryEntry,
  isEvalType,
} from './evaluation-insights';
import { EvaluationStructuredService, effectiveRecommendationState } from './evaluation-structured';

jest.mock('../common/helpers/audit-chain', () => ({
  writeChainedAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  evaluationId: 1,
  period: '2025',
  type: 'MANAGER',
  cycleId: 1,
  cycleName: 'C1',
  formId: 10,
  overallScore: 3,
  ratingLabel: 'Bom',
  submittedAt: new Date('2025-12-01'),
  strengths: [],
  improvements: [],
  recommendations: { total: 0, done: 0, open: 0, overdue: 0 },
  ...over,
});

describe('compareEvaluations', () => {
  it('calcula variação global e por competência (ignora acentos/maiúsculas)', () => {
    const prev = entry({
      overallScore: 3,
      strengths: [{ competency: 'Comunicação', score: 4 }],
      improvements: [{ competency: 'Prazos', score: 2 }],
    });
    const curr = entry({
      evaluationId: 2,
      period: '2026',
      overallScore: 3.6,
      strengths: [{ competency: 'comunicacao', score: 5 }],
      improvements: [{ competency: 'Prazos', score: 3 }],
    });
    const c = compareEvaluations(prev, curr);
    expect(c.comparable).toBe(true);
    expect(c.limitation).toBeNull();
    expect(c.overallDelta).toBe(0.6);
    expect(c.competencies).toEqual([
      { competency: 'comunicacao', previous: 4, current: 5, delta: 1 },
      { competency: 'Prazos', previous: 2, current: 3, delta: 1 },
    ]);
    expect(c.strengthsMaintained).toEqual(['Comunicação']);
    expect(c.improvementsPending).toEqual(['Prazos']);
  });

  it('separa pontos fortes novos e áreas resolvidas / novas', () => {
    const c = compareEvaluations(
      entry({
        strengths: [{ competency: 'A', score: 4 }],
        improvements: [
          { competency: 'X', score: 2 },
          { competency: 'Y', score: 2 },
        ],
      }),
      entry({
        strengths: [{ competency: 'B', score: 4 }],
        improvements: [
          { competency: 'Y', score: 2 },
          { competency: 'Z', score: 1 },
        ],
      }),
    );
    expect(c.strengthsNew).toEqual(['B']);
    expect(c.strengthsMaintained).toEqual([]);
    expect(c.improvementsResolved).toEqual(['X']);
    expect(c.improvementsPending).toEqual(['Y']);
    expect(c.improvementsNew).toEqual(['Z']);
  });

  it('avisa quando critérios/pesos (formulário) mudaram entre ciclos', () => {
    const c = compareEvaluations(entry({ formId: 10 }), entry({ formId: 11 }));
    expect(c.comparable).toBe(false);
    expect(c.limitation).toMatch(/critérios ou pesos/);
  });

  it('sem formulário conhecido não afirma comparabilidade', () => {
    expect(compareEvaluations(entry({ formId: null }), entry({ formId: null })).comparable).toBe(
      false,
    );
  });

  it('classificação em falta não gera variação', () => {
    expect(
      compareEvaluations(entry({ overallScore: null }), entry({ overallScore: 4 })).overallDelta,
    ).toBeNull();
  });
});

describe('effectiveRecommendationState', () => {
  const now = new Date('2026-06-01');
  const past = new Date('2026-01-01');
  it('sem PDI usa o registo da própria recomendação', () => {
    expect(
      effectiveRecommendationState(
        { status: 'EM_CURSO', dueDate: past, progressPct: 30 },
        null,
        now,
      ),
    ).toMatchObject({ status: 'EM_CURSO', progressPct: 30, overdue: true, source: 'RECOMENDACAO' });
  });
  it('com PDI o estado e progresso vêm do PDI (fonte única)', () => {
    expect(
      effectiveRecommendationState(
        { status: 'PENDENTE', dueDate: past },
        { status: 'COMPLETED', progress: 100, completedAt: now },
        now,
      ),
    ).toMatchObject({ status: 'CONCLUIDA', progressPct: 100, overdue: false, source: 'PDI' });
    expect(
      effectiveRecommendationState(
        { status: 'PENDENTE', dueDate: null },
        { status: 'BLOCKED', progress: 20, completedAt: null },
        now,
      ).status,
    ).toBe('EM_CURSO');
  });
  it('fechadas ou sem prazo nunca estão em atraso', () => {
    expect(
      effectiveRecommendationState({ status: 'CANCELADA', dueDate: past }, null, now).overdue,
    ).toBe(false);
    expect(
      effectiveRecommendationState({ status: 'PENDENTE', dueDate: null }, null, now).overdue,
    ).toBe(false);
  });
});

describe('isEvalType', () => {
  it('valida tipos', () => {
    expect(isEvalType('MANAGER')).toBe(true);
    expect(isEvalType('xpto')).toBe(false);
  });
});

describe('EvaluationInsightsService.getHistory (permissões)', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    performanceEvaluation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const svc = new EvaluationInsightsService(prisma as never);
  beforeEach(() => jest.clearAllMocks());

  it('permite o próprio, o gestor directo e RH; nega os restantes com 404', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 5, managerId: 9 });
    await expect(svc.getHistory(5, { id: 5 })).resolves.toBeDefined();
    await expect(svc.getHistory(5, { id: 9 })).resolves.toBeDefined();
    await expect(svc.getHistory(5, { id: 1, role: { name: 'RH' } })).resolves.toBeDefined();
    await expect(svc.getHistory(5, { id: 77, role: { name: 'COLABORADOR' } })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('só consulta avaliações submetidas do tipo pedido', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 5, managerId: null });
    await svc.getHistory(5, { id: 5 }, 'SELF');
    expect(prisma.performanceEvaluation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { evaluatedId: 5, isDraft: false, type: 'SELF' } }),
    );
  });

  it('com uma só avaliação não há comparação', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 5, managerId: null });
    prisma.performanceEvaluation.findMany.mockResolvedValue([
      {
        id: 1,
        period: '2026',
        type: 'MANAGER',
        cycleId: 1,
        cycle: { id: 1, name: 'C', formId: 3 },
        overallScore: 3.6,
        ratingLabel: 'Muito bom',
        createdAt: new Date(),
        strengthItems: [],
        improvementItems: [],
        recommendationItems: [],
      },
    ]);
    const r = await svc.getHistory(5, { id: 5 });
    expect(r.entries).toHaveLength(1);
    expect(r.comparison).toBeNull();
  });
});

describe('EvaluationStructuredService.generatePdi', () => {
  const prisma = {
    performanceEvaluation: { findUnique: jest.fn(), update: jest.fn() },
    evaluationRecommendation: { update: jest.fn() },
  };
  const plans = {
    create: jest.fn().mockResolvedValue({ id: 50 }),
    addAction: jest.fn(),
  };
  let svc: EvaluationStructuredService;
  const manager = { id: 10, role: { name: 'GESTOR' } } as never;

  const evaluation = (over: object = {}) => ({
    id: 1,
    evaluatorId: 10,
    evaluatedId: 5,
    isDraft: false,
    period: '2026',
    pdiPlanId: null,
    evaluated: { id: 5, fullName: 'Rui' },
    strengthItems: [{ competency: 'Equipa' }],
    improvementItems: [{ competency: 'Prazos', description: 'x' }],
    recommendationItems: [
      {
        id: 100,
        action: 'Curso de gestão do tempo',
        objective: 'Cumprir prazos',
        successIndicator: '90%',
        actionType: 'FORMACAO',
        dueDate: new Date('2026-12-01'),
        training: { title: 'Gestão do tempo' },
      },
      {
        id: 101,
        action: 'Mentoria',
        objective: 'Planear',
        successIndicator: 'Plano mensal',
        actionType: 'MENTORIA',
        dueDate: null,
        training: null,
      },
    ],
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    plans.create.mockResolvedValue({ id: 50 });
    plans.addAction.mockImplementation(async (dto: { seq: number }) => ({ id: 900 + dto.seq }));
    svc = new EvaluationStructuredService(prisma as never, new Logger('t'), plans as never);
  });

  it('cria o plano pelo dono do PDI, uma ação por recomendação, e liga-as', async () => {
    prisma.performanceEvaluation.findUnique.mockResolvedValue(evaluation());
    const r = await svc.generatePdi(1, manager);
    expect(r).toEqual({ planId: 50, actionsCreated: 2 });
    expect(plans.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, origin: 'PERFORMANCE_REVIEW', period: '2026' }),
    );
    expect(plans.addAction).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 50, type: 'COURSE', title: 'Curso de gestão do tempo' }),
      manager,
    );
    expect(plans.addAction.mock.calls[1][0].type).toBe('MENTORING');
    expect(prisma.performanceEvaluation.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { pdiPlanId: 50 },
    });
    expect(prisma.evaluationRecommendation.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { pdiActionId: 900, updatedById: 10 },
    });
  });

  it('segunda chamada completa o plano existente sem criar outro', async () => {
    prisma.performanceEvaluation.findUnique.mockResolvedValue(evaluation({ pdiPlanId: 50 }));
    await svc.generatePdi(1, manager);
    expect(plans.create).not.toHaveBeenCalled();
    expect(plans.addAction.mock.calls[0][0].planId).toBe(50);
  });

  it('rascunho, sem recomendações pendentes e terceiros são recusados', async () => {
    prisma.performanceEvaluation.findUnique.mockResolvedValue(evaluation({ isDraft: true }));
    await expect(svc.generatePdi(1, manager)).rejects.toThrow(ConflictException);
    prisma.performanceEvaluation.findUnique.mockResolvedValue(
      evaluation({ recommendationItems: [], pdiPlanId: 50 }),
    );
    await expect(svc.generatePdi(1, manager)).rejects.toThrow(/já estão no PDI/);
    prisma.performanceEvaluation.findUnique.mockResolvedValue(evaluation());
    await expect(
      svc.generatePdi(1, { id: 77, role: { name: 'COLABORADOR' } } as never),
    ).rejects.toThrow(NotFoundException);
    expect(plans.create).not.toHaveBeenCalled();
  });
});

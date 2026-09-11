import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeadershipEligibilityService } from './leadership-eligibility.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../auth/enums/role.enum';

const actor = (role: Role, id = 7) =>
  ({ id, email: `u${id}@innova.com`, role: { name: role } }) as any;

describe('LeadershipEligibilityService', () => {
  let service: LeadershipEligibilityService;

  const mockPrisma: any = {
    leadershipSelectionCriterion: { findMany: jest.fn() },
    performanceReview: { findMany: jest.fn() },
    leadershipScore: { findUnique: jest.fn() },
    leadershipFeedback360: { findMany: jest.fn() },
    userCompetency: { findUnique: jest.fn(), findMany: jest.fn() },
    competencyEvaluation: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    userCareerPlan: { count: jest.fn() },
    developmentPlan: { count: jest.fn() },
    enrollment: { count: jest.fn() },
    certificate: { count: jest.fn() },
    leadershipProgramParticipant: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockProgramsSvc: any = {
    assertCanManageProgram: jest.fn().mockResolvedValue({ id: 5 }),
  };

  const resetDefaults = () => {
    mockPrisma.leadershipSelectionCriterion.findMany.mockResolvedValue([]);
    mockPrisma.performanceReview.findMany.mockResolvedValue([]);
    mockPrisma.leadershipScore.findUnique.mockResolvedValue(null);
    mockPrisma.leadershipFeedback360.findMany.mockResolvedValue([]);
    mockPrisma.userCompetency.findUnique.mockResolvedValue(null);
    mockPrisma.userCompetency.findMany.mockResolvedValue([]);
    mockPrisma.competencyEvaluation.findFirst.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue({ hireDate: null });
    mockPrisma.userCareerPlan.count.mockResolvedValue(0);
    mockPrisma.developmentPlan.count.mockResolvedValue(0);
    mockPrisma.enrollment.count.mockResolvedValue(0);
    mockPrisma.certificate.count.mockResolvedValue(0);
    mockPrisma.leadershipProgramParticipant.upsert.mockResolvedValue({});
    mockPrisma.leadershipProgramParticipant.update.mockImplementation(async ({ data }: any) => ({
      userId: 3,
      programId: 5,
      ...data,
    }));
    mockPrisma.leadershipProgramParticipant.create.mockResolvedValue({
      userId: 3,
      programId: 5,
      status: 'CANDIDATE',
    });
    mockProgramsSvc.assertCanManageProgram.mockResolvedValue({ id: 5 });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    resetDefaults();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadershipEligibilityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LeadershipProgramsService, useValue: mockProgramsSvc },
      ],
    }).compile();
    service = module.get(LeadershipEligibilityService);
  });

  // ─── Step 1: helper puro calculateFromFactors ────────────────────────────

  it('calculateFromFactors — média ponderada (exemplo do brief) → 87', () => {
    expect(
      service.calculateFromFactors([
        { source: 'PERFORMANCE', weight: 30, value: 80 },
        { source: 'POTENTIAL', weight: 70, value: 90 },
      ]).score,
    ).toBe(87);
  });

  it('calculateFromFactors — peso único 100 devolve o próprio valor', () => {
    expect(service.calculateFromFactors([{ source: 'X', weight: 100, value: 50 }]).score).toBe(50);
  });

  it('calculateFromFactors — sem factores → 0', () => {
    expect(service.calculateFromFactors([]).score).toBe(0);
  });

  // ─── Step 1: helper puro validateWeights ─────────────────────────────────

  it('validateWeights — total ≠ 100 lança BadRequestException', () => {
    expect(() => service.validateWeights([{ weight: 60 }, { weight: 30 }])).toThrow(
      BadRequestException,
    );
  });

  it('validateWeights — total = 100 não lança', () => {
    expect(() => service.validateWeights([{ weight: 60 }, { weight: 40 }])).not.toThrow();
  });

  it('validateWeights — tolerância ±0.01 para arredondamento Decimal', () => {
    expect(() =>
      service.validateWeights([{ weight: 33.33 }, { weight: 33.33 }, { weight: 33.34 }]),
    ).not.toThrow();
  });

  // ─── Step 2: calculate() determinístico + persistência ───────────────────

  it('calculate — combina fontes reais e persiste o snapshot no participante', async () => {
    mockPrisma.leadershipSelectionCriterion.findMany.mockResolvedValue([
      {
        name: 'Desempenho',
        source: 'PERFORMANCE_REVIEW',
        weight: 60,
        minScore: null,
        required: false,
      },
      {
        name: 'Liderança',
        source: 'LEADERSHIP_SCORE',
        weight: 40,
        minScore: null,
        required: false,
      },
    ]);
    mockPrisma.performanceReview.findMany.mockResolvedValue([
      { score: 4, potentialScore: null, createdAt: new Date(), cycle: { scoreScale: 5 } },
    ]);
    mockPrisma.leadershipScore.findUnique.mockResolvedValue({ score: 800 });

    const res = await service.calculate(5, 3);

    // (60*80 + 40*80) / 100 = 80
    expect(res.score).toBe(80);
    expect(res.eligible).toBe(true);
    expect(res.breakdown).toHaveLength(2);
    expect(res.missingData).toEqual([]);

    expect(mockPrisma.leadershipProgramParticipant.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.leadershipProgramParticipant.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId_programId: { userId: 3, programId: 5 } });
    expect(call.create.status).toBe('CANDIDATE');
    expect(Number(call.update.eligibilityScore)).toBe(80);
    expect(typeof call.update.eligibilityBreakdown).toBe('string');
    expect(JSON.parse(call.update.eligibilityBreakdown)).toHaveLength(2);
    expect(call.update.eligibilityComputedAt).toBeInstanceOf(Date);
  });

  it('calculate — dado ausente entra em missingData e no breakdown com contribuição zero', async () => {
    mockPrisma.leadershipSelectionCriterion.findMany.mockResolvedValue([
      {
        name: 'Desempenho',
        source: 'PERFORMANCE_REVIEW',
        weight: 50,
        minScore: null,
        required: false,
      },
      { name: '360', source: 'FEEDBACK_360', weight: 50, minScore: null, required: false },
    ]);
    mockPrisma.performanceReview.findMany.mockResolvedValue([
      { score: 5, potentialScore: null, createdAt: new Date(), cycle: { scoreScale: 5 } },
    ]);
    // sem feedback 360°

    const res = await service.calculate(5, 3);

    // (50*100 + 50*0) / 100 = 50
    expect(res.score).toBe(50);
    expect(res.missingData).toContain('FEEDBACK_360');
    const f360 = res.breakdown.find(b => b.source === 'FEEDBACK_360')!;
    expect(f360.missing).toBe(true);
    expect(f360.normalizedValue).toBe(0);
    expect(f360.weightedContribution).toBe(0);
  });

  it('calculate — critério obrigatório em falta torna o candidato inelegível', async () => {
    mockPrisma.leadershipSelectionCriterion.findMany.mockResolvedValue([
      {
        name: 'Liderança',
        source: 'LEADERSHIP_SCORE',
        weight: 100,
        minScore: null,
        required: true,
      },
    ]);
    mockPrisma.leadershipScore.findUnique.mockResolvedValue(null);

    const res = await service.calculate(5, 3);
    expect(res.score).toBe(0);
    expect(res.eligible).toBe(false);
    expect(res.missingData).toContain('LEADERSHIP_SCORE');
  });

  it('calculate — sem critérios activos → score 0, inelegível, missingData marca SELECTION_CRITERIA', async () => {
    mockPrisma.leadershipSelectionCriterion.findMany.mockResolvedValue([]);
    const res = await service.calculate(5, 3);
    expect(res).toMatchObject({ score: 0, eligible: false, breakdown: [] });
    expect(res.missingData).toContain('SELECTION_CRITERIA');
  });

  it('calculate — MANUAL usa o valor manual fornecido no pedido', async () => {
    mockPrisma.leadershipSelectionCriterion.findMany.mockResolvedValue([
      { name: 'Entrevista', source: 'MANUAL', weight: 100, minScore: null, required: false },
    ]);
    const res = await service.calculate(5, 3, { manualValues: { Entrevista: 90 } });
    expect(res.score).toBe(90);
    expect(res.missingData).toEqual([]);
  });

  it('calculate — é determinístico (mesmos dados → mesmo score)', async () => {
    mockPrisma.leadershipSelectionCriterion.findMany.mockResolvedValue([
      {
        name: 'Liderança',
        source: 'LEADERSHIP_SCORE',
        weight: 100,
        minScore: null,
        required: false,
      },
    ]);
    mockPrisma.leadershipScore.findUnique.mockResolvedValue({ score: 730 });
    const a = await service.calculate(5, 3);
    const b = await service.calculate(5, 3);
    expect(a.score).toBe(b.score);
    expect(a.score).toBe(73);
  });

  // ─── Step 3: máquina de estados do participante ──────────────────────────

  it('advanceSelection — transição válida CANDIDATE → SELECTED carimba selectedById/selectedAt', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue({
      userId: 3,
      programId: 5,
      status: 'CANDIDATE',
    });
    const res = await service.advanceSelection(actor(Role.ADMIN, 9), 5, 3, 'SELECTED' as any);
    expect(res.status).toBe('SELECTED');
    const data = mockPrisma.leadershipProgramParticipant.update.mock.calls[0][0].data;
    expect(data.selectedById).toBe(9);
    expect(data.selectedAt).toBeInstanceOf(Date);
  });

  it('advanceSelection — transição ilegal CANDIDATE → COMPLETED lança BadRequestException nomeando ambos', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue({
      userId: 3,
      programId: 5,
      status: 'CANDIDATE',
    });
    await expect(
      service.advanceSelection(actor(Role.ADMIN, 9), 5, 3, 'COMPLETED' as any),
    ).rejects.toThrow(/CANDIDATE.*COMPLETED/);
    await expect(
      service.advanceSelection(actor(Role.ADMIN, 9), 5, 3, 'COMPLETED' as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('advanceSelection — estado terminal REJECTED não tem saídas', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue({
      userId: 3,
      programId: 5,
      status: 'REJECTED',
    });
    await expect(
      service.advanceSelection(actor(Role.ADMIN, 9), 5, 3, 'SELECTED' as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('advanceSelection — CANCELLED é fuga administrativa de qualquer estado não-terminal', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue({
      userId: 3,
      programId: 5,
      status: 'ENROLLED',
    });
    const res = await service.advanceSelection(actor(Role.ADMIN, 9), 5, 3, 'CANCELLED' as any);
    expect(res.status).toBe('CANCELLED');
  });

  it('advanceSelection — participante inexistente → NotFoundException', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue(null);
    await expect(
      service.advanceSelection(actor(Role.ADMIN, 9), 5, 404, 'SELECTED' as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('selectCandidate — cria a linha do participante como CANDIDATE quando não existe e depois SELECTED', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique
      .mockResolvedValueOnce(null) // não existe
      .mockResolvedValueOnce({ userId: 3, programId: 5, status: 'CANDIDATE' }); // após create
    const res = await service.selectCandidate(actor(Role.RH, 9), 5, 3);
    expect(mockPrisma.leadershipProgramParticipant.create).toHaveBeenCalledWith({
      data: { userId: 3, programId: 5, status: 'CANDIDATE' },
    });
    expect(res.status).toBe('SELECTED');
  });

  // ─── Ownership: reutiliza LeadershipProgramsService ──────────────────────

  it('todas as operações delegam o ownership em LeadershipProgramsService.assertCanManageProgram', async () => {
    mockProgramsSvc.assertCanManageProgram.mockRejectedValue(new ForbiddenException());
    await expect(service.recalculate(actor(Role.GESTOR, 7), 5, 3)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.listCandidates(actor(Role.GESTOR, 7), 5)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.selectCandidate(actor(Role.GESTOR, 7), 5, 3)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.advanceSelection(actor(Role.GESTOR, 7), 5, 3, 'SELECTED' as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('listCandidates — devolve candidatos com o snapshot persistido e calcula os que faltam', async () => {
    mockPrisma.leadershipSelectionCriterion.findMany.mockResolvedValue([
      {
        name: 'Liderança',
        source: 'LEADERSHIP_SCORE',
        weight: 100,
        minScore: null,
        required: false,
      },
    ]);
    mockPrisma.leadershipScore.findUnique.mockResolvedValue({ score: 500 });
    mockPrisma.leadershipProgramParticipant.findMany
      .mockResolvedValueOnce([
        {
          userId: 3,
          programId: 5,
          status: 'CANDIDATE',
          eligibilityComputedAt: null,
          eligibilityBreakdown: null,
          eligibilityMissingData: null,
          user: { id: 3, fullName: 'Cand', email: 'c@i.com' },
        },
      ])
      .mockResolvedValueOnce([
        {
          userId: 3,
          programId: 5,
          status: 'CANDIDATE',
          eligibilityScore: 50,
          eligibilityComputedAt: new Date(),
          eligibilityBreakdown: '[]',
          eligibilityMissingData: '[]',
          user: { id: 3, fullName: 'Cand', email: 'c@i.com' },
        },
      ]);

    const res = await service.listCandidates(actor(Role.ADMIN, 9), 5);
    expect(mockPrisma.leadershipProgramParticipant.upsert).toHaveBeenCalled();
    expect(res).toHaveLength(1);
    expect(Number(res[0].eligibilityScore)).toBe(50);
  });
});

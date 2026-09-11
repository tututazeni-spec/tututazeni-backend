import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LeadershipAnalyticsService } from './leadership-analytics.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { PrismaService } from '../prisma/prisma.service';

const actor = (id = 7) => ({ id, email: `u${id}@innova.com`, role: { name: 'ADMIN' } }) as any;

const baseProgram = {
  id: 1,
  code: 'LDR-2026',
  name: 'Programa X',
  certificationEnabled: true,
  certificateTitle: null,
  certificateValidityDays: null,
  minAttendanceRate: null,
  minFinalScore: null,
  minLeadershipScore: null,
  requireFinalProject: false,
};

const readyParticipant = (overrides: Record<string, unknown> = {}) => ({
  id: 100,
  userId: 3,
  programId: 1,
  status: 'IN_PROGRESS',
  attendanceRate: 90,
  finalScore: 82,
  readinessLevel: null,
  successionPlanId: null,
  assessments: [
    { stage: 'FINAL', status: 'COMPLETED', score: 82, maxScore: 100, readinessLevel: 'READY_NOW' },
  ],
  projects: [],
  ...overrides,
});

describe('LeadershipAnalyticsService', () => {
  let service: LeadershipAnalyticsService;

  const mockPrograms = { assertCanManageProgram: jest.fn() };

  const mockPrisma: any = {
    leadershipProgram: { findUnique: jest.fn() },
    leadershipProgramParticipant: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    leadershipParticipantAssessment: { findMany: jest.fn() },
    leadershipProgramCost: { findMany: jest.fn() },
    certificate: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
    successionPlan: { update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });

    mockPrograms.assertCanManageProgram.mockResolvedValue({ id: 1 });
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({ ...baseProgram });
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue(readyParticipant());
    mockPrisma.leadershipProgramParticipant.update.mockImplementation(async ({ data }: any) => ({
      id: 100,
      ...data,
    }));
    mockPrisma.certificate.findFirst.mockResolvedValue(null);
    mockPrisma.certificate.create.mockImplementation(async ({ data }: any) => ({
      id: 55,
      ...data,
    }));
    mockPrisma.certificate.count.mockResolvedValue(0);
    mockPrisma.successionPlan.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadershipAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LeadershipProgramsService, useValue: mockPrograms },
      ],
    }).compile();
    service = module.get(LeadershipAnalyticsService);
  });

  // ─── Conclusão ────────────────────────────────────────────────────────

  it('participante sem avaliação FINAL concluída → BadRequestException', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue(
      readyParticipant({ assessments: [] }),
    );
    await expect(service.completeParticipant(actor(), 1, 3)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
  });

  it('nota final abaixo do mínimo configurado → BadRequestException', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      ...baseProgram,
      minFinalScore: 90,
    });
    await expect(service.completeParticipant(actor(), 1, 3)).rejects.toThrow(/nota final/);
  });

  it('presença abaixo do mínimo configurado → BadRequestException', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      ...baseProgram,
      minAttendanceRate: 95,
    });
    await expect(service.completeParticipant(actor(), 1, 3)).rejects.toThrow(/presença/);
  });

  it('projecto final obrigatório e não avaliado → BadRequestException', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      ...baseProgram,
      requireFinalProject: true,
    });
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue(
      readyParticipant({ projects: [{ status: 'IN_PROGRESS', score: null }] }),
    );
    await expect(service.completeParticipant(actor(), 1, 3)).rejects.toThrow(/projecto/i);
  });

  it('conclusão válida → COMPLETED + certificado LEADERSHIP com programId/userId + snapshot readiness', async () => {
    const res = await service.completeParticipant(actor(7), 1, 3);

    const statusUpdate = mockPrisma.leadershipProgramParticipant.update.mock.calls[0][0].data;
    expect(statusUpdate.status).toBe('COMPLETED');
    expect(statusUpdate.readinessLevel).toBe('READY_NOW');

    expect(mockPrisma.certificate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'LEADERSHIP', programId: 1, userId: 3 }),
      }),
    );
    expect(res.certificate).toMatchObject({ id: 55, type: 'LEADERSHIP' });
  });

  it('certificado idempotente: se já existe um LEADERSHIP não revogado, não cria outro', async () => {
    mockPrisma.certificate.findFirst.mockResolvedValue({ id: 9, type: 'LEADERSHIP' });
    const res = await service.completeParticipant(actor(), 1, 3);
    expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
    expect(res.certificate).toMatchObject({ id: 9 });
  });

  it('participante já COMPLETED → idempotente, devolve estado + certificado existente', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue(
      readyParticipant({ status: 'COMPLETED' }),
    );
    mockPrisma.certificate.findFirst.mockResolvedValue({ id: 9 });
    const res = await service.completeParticipant(actor(), 1, 3);
    expect(res.alreadyCompleted).toBe(true);
    expect(mockPrisma.leadershipProgramParticipant.update).not.toHaveBeenCalled();
  });

  it('certificationEnabled=false → conclui sem emitir certificado', async () => {
    mockPrisma.leadershipProgram.findUnique.mockResolvedValue({
      ...baseProgram,
      certificationEnabled: false,
    });
    const res = await service.completeParticipant(actor(), 1, 3);
    expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
    expect(res.certificate).toBeNull();
  });

  it('SuccessionPlan ligado → actualiza a readiness na conclusão', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue(
      readyParticipant({ successionPlanId: 42 }),
    );
    await service.completeParticipant(actor(), 1, 3);
    expect(mockPrisma.successionPlan.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: { readinessLevel: 'READY_NOW' },
    });
  });

  // ─── KPIs ─────────────────────────────────────────────────────────────

  it('getProgramOutcomes agrega conclusão/abandono, readiness e custo', async () => {
    mockPrisma.leadershipProgramParticipant.findMany.mockResolvedValue([
      {
        status: 'COMPLETED',
        attendanceRate: 95,
        finalScore: 88,
        readinessLevel: 'READY_NOW',
        successionPlanId: 1,
        projects: [{ status: 'COMPLETED', score: 90 }],
      },
      {
        status: 'COMPLETED',
        attendanceRate: 80,
        finalScore: 70,
        readinessLevel: 'READY_SOON',
        successionPlanId: null,
        projects: [],
      },
      {
        status: 'WITHDRAWN',
        attendanceRate: null,
        finalScore: null,
        readinessLevel: null,
        successionPlanId: null,
        projects: [],
      },
      {
        status: 'IN_PROGRESS',
        attendanceRate: 60,
        finalScore: null,
        readinessLevel: null,
        successionPlanId: null,
        projects: [],
      },
    ]);
    mockPrisma.leadershipParticipantAssessment.findMany.mockResolvedValue([]);
    mockPrisma.leadershipProgramCost.findMany.mockResolvedValue([
      { plannedAmount: 1000, actualAmount: 900, currency: 'AOA' },
    ]);
    mockPrisma.certificate.count.mockResolvedValue(2);

    const o = await service.getProgramOutcomes(actor(), 1);
    expect(o.participants.total).toBe(4);
    expect(o.participants.completionRate).toBe(50);
    expect(o.participants.dropoutRate).toBe(25);
    expect(o.readiness.byLevel).toEqual({ READY_NOW: 1, READY_SOON: 1 });
    expect(o.readiness.readyNow).toBe(1);
    expect(o.succession.linked).toBe(1);
    expect(o.cost).toMatchObject({ totalPlanned: 1000, totalActual: 900 });
    expect(o.certificates.issued).toBe(2);
    expect(o.projects).toMatchObject({ total: 1, completed: 1, averageScore: 90 });
    // Sem fonte de dados → null explícito.
    expect(o.roi).toBeNull();
    expect(o.satisfaction).toBeNull();
  });

  it('getProgramOutcomes propaga 403 da guarda de gestão', async () => {
    mockPrograms.assertCanManageProgram.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.getProgramOutcomes(actor(2), 1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

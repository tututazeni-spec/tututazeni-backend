import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeadershipParticipantsService } from './leadership-participants.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { PrismaService } from '../prisma/prisma.service';

const actor = (id = 7) => ({ id, email: `u${id}@innova.com`, role: { name: 'ADMIN' } }) as any;

describe('LeadershipParticipantsService', () => {
  let service: LeadershipParticipantsService;

  const mockPrograms = { assertCanManageProgram: jest.fn() };

  const mockPrisma: any = {
    leadershipProgramParticipant: { findUnique: jest.fn(), update: jest.fn() },
    leadershipParticipantPlan: { upsert: jest.fn(), findUnique: jest.fn() },
    leadershipParticipantPlanAction: { deleteMany: jest.fn(), createMany: jest.fn() },
    user: { findMany: jest.fn() },
    mentoring: { findUnique: jest.fn() },
    developmentPlan: { findUnique: jest.fn() },
    developmentPlanAction: { findMany: jest.fn() },
    course: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });

    mockPrograms.assertCanManageProgram.mockResolvedValue({ id: 1 });
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue({
      id: 100,
      userId: 3,
      programId: 1,
    });
    mockPrisma.leadershipProgramParticipant.update.mockImplementation(async ({ data }: any) => ({
      id: 100,
      ...data,
    }));
    mockPrisma.user.findMany.mockImplementation(async ({ where }: any) =>
      (where?.id?.in ?? []).map((id: number) => ({ id })),
    );
    mockPrisma.course.findMany.mockImplementation(async ({ where }: any) =>
      (where?.id?.in ?? []).map((id: number) => ({ id })),
    );
    mockPrisma.developmentPlanAction.findMany.mockImplementation(async ({ where }: any) =>
      (where?.id?.in ?? []).map((id: number) => ({ id })),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadershipParticipantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LeadershipProgramsService, useValue: mockPrograms },
      ],
    }).compile();
    service = module.get(LeadershipParticipantsService);
  });

  // ─── Leitura self-only ─────────────────────────────────────────────────

  it('getMyParticipation devolve o registo do próprio (query por actor.id)', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue({ id: 100, userId: 7 });
    await service.getMyParticipation(actor(7), 1);
    expect(mockPrisma.leadershipProgramParticipant.findUnique.mock.calls[0][0].where).toEqual({
      userId_programId: { userId: 7, programId: 1 },
    });
    // Nunca chama a guarda de gestão — é leitura do próprio.
    expect(mockPrograms.assertCanManageProgram).not.toHaveBeenCalled();
  });

  it('getMyParticipation → 404 quando não é participante', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue(null);
    await expect(service.getMyParticipation(actor(7), 1)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getParticipant exige gestão do programa', async () => {
    mockPrograms.assertCanManageProgram.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.getParticipant(actor(7), 1, 3)).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ─── Baseline ─────────────────────────────────────────────────────────

  it('setBaseline grava campos e carimba baselineCapturedAt', async () => {
    const res = await service.setBaseline(actor(), 1, 3, {
      baselineScore: 55,
      readinessLevel: 'NEEDS_DEVELOPMENT' as any,
    });
    expect(mockPrograms.assertCanManageProgram).toHaveBeenCalledWith(actor(), 1);
    expect(res.baselineScore).toBe(55);
    expect(res.baselineCapturedAt).toBeInstanceOf(Date);
  });

  it('setBaseline → 404 se o participante não existe', async () => {
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue(null);
    await expect(service.setBaseline(actor(), 1, 999, {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ─── Mentor / coach / mentoring ───────────────────────────────────────

  it('assignAdvisors → 404 quando o mentor não existe', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([]);
    await expect(service.assignAdvisors(actor(), 1, 3, { mentorId: 9999 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('assignAdvisors → 404 quando o mentoring não existe', async () => {
    mockPrisma.mentoring.findUnique.mockResolvedValue(null);
    await expect(service.assignAdvisors(actor(), 1, 3, { mentoringId: 50 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('assignAdvisors → 400 quando o mentoring não pertence ao participante', async () => {
    mockPrisma.mentoring.findUnique.mockResolvedValue({ id: 50, menteeId: 999 });
    await expect(service.assignAdvisors(actor(), 1, 3, { mentoringId: 50 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('assignAdvisors aceita mentoring cujo mentee é o participante', async () => {
    mockPrisma.mentoring.findUnique.mockResolvedValue({ id: 50, menteeId: 3 });
    const res = await service.assignAdvisors(actor(), 1, 3, { mentorId: 8, mentoringId: 50 });
    expect(res.mentorId).toBe(8);
    expect(res.mentoringId).toBe(50);
  });

  it('assignAdvisors com null limpa a FK (undefined não toca)', async () => {
    await service.assignAdvisors(actor(), 1, 3, { mentorId: null, coachId: undefined });
    const data = mockPrisma.leadershipProgramParticipant.update.mock.calls[0][0].data;
    expect(data.mentorId).toBeNull();
    expect(data.coachId).toBeUndefined();
  });

  // ─── PDI ──────────────────────────────────────────────────────────────

  it('linkDevelopmentPlan → 404 se o PDI não existe', async () => {
    mockPrisma.developmentPlan.findUnique.mockResolvedValue(null);
    await expect(
      service.linkDevelopmentPlan(actor(), 1, 3, { developmentPlanId: 77 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('linkDevelopmentPlan → 400 se o PDI é de outro utilizador', async () => {
    mockPrisma.developmentPlan.findUnique.mockResolvedValue({ id: 77, userId: 999 });
    await expect(
      service.linkDevelopmentPlan(actor(), 1, 3, { developmentPlanId: 77 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('linkDevelopmentPlan faz upsert do percurso individual', async () => {
    mockPrisma.developmentPlan.findUnique.mockResolvedValue({ id: 77, userId: 3 });
    mockPrisma.leadershipParticipantPlan.upsert.mockResolvedValue({ id: 5, developmentPlanId: 77 });
    const res = await service.linkDevelopmentPlan(actor(), 1, 3, {
      developmentPlanId: 77,
      title: 'Percurso',
    });
    expect(mockPrisma.leadershipParticipantPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { participantId: 100 } }),
    );
    expect(res).toMatchObject({ developmentPlanId: 77 });
  });

  // ─── Acções do percurso ───────────────────────────────────────────────

  it('replacePlanActions → 404 quando ainda não há percurso', async () => {
    mockPrisma.leadershipParticipantPlan.findUnique.mockResolvedValue(null);
    await expect(service.replacePlanActions(actor(), 1, 3, { actions: [] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('replacePlanActions → 404 quando um curso referido não existe', async () => {
    mockPrisma.leadershipParticipantPlan.findUnique.mockResolvedValue({ id: 5 });
    mockPrisma.course.findMany.mockResolvedValueOnce([]);
    await expect(
      service.replacePlanActions(actor(), 1, 3, {
        actions: [{ title: 'A', courseId: 123 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replacePlanActions faz delete-all + recreate dentro da transacção', async () => {
    mockPrisma.leadershipParticipantPlan.findUnique.mockResolvedValue({ id: 5 });
    const tx: any = {
      leadershipParticipantPlanAction: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      leadershipParticipantPlan: {
        findUnique: jest.fn().mockResolvedValue({ id: 5, actions: [{ id: 1 }] }),
      },
    };
    mockPrisma.$transaction.mockImplementation((cb: any) => cb(tx));

    const res = await service.replacePlanActions(actor(), 1, 3, {
      actions: [{ title: 'Concluir curso', courseId: 10, developmentPlanActionId: 22 }],
    });
    expect(tx.leadershipParticipantPlanAction.deleteMany).toHaveBeenCalledWith({
      where: { planId: 5 },
    });
    const rows = tx.leadershipParticipantPlanAction.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({ planId: 5, courseId: 10, developmentPlanActionId: 22, seq: 0 });
    expect(res).toMatchObject({ id: 5 });
  });
});

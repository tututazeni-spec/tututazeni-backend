import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeadershipExecutionService } from './leadership-execution.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const actor = (id = 7) => ({ id, email: `u${id}@innova.com`, role: { name: 'ADMIN' } }) as any;

describe('LeadershipExecutionService', () => {
  let service: LeadershipExecutionService;

  const mockPrograms = { assertCanManageProgram: jest.fn() };
  const mockNotifications = { enqueueSend: jest.fn().mockResolvedValue(undefined) };

  const mockPrisma: any = {
    leadershipProgramParticipant: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    leadershipParticipantAssessment: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    leadershipProject: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    leadershipProgramDocument: { create: jest.fn() },
    leadershipProgramCost: { create: jest.fn(), findMany: jest.fn() },
    leadershipProgramCommunication: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    assessment: { findUnique: jest.fn() },
    document: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });

    mockPrograms.assertCanManageProgram.mockResolvedValue({ id: 1 });
    mockPrisma.leadershipProgramParticipant.findUnique.mockResolvedValue({ id: 100, userId: 3 });
    mockPrisma.user.findMany.mockImplementation(async ({ where }: any) =>
      (where?.id?.in ?? []).map((id: number) => ({ id })),
    );
    mockPrisma.leadershipParticipantAssessment.create.mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
    }));
    mockPrisma.leadershipParticipantAssessment.update.mockImplementation(async ({ data }: any) => ({
      id: 9,
      ...data,
    }));
    mockPrisma.leadershipProject.create.mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
    }));
    mockPrisma.leadershipProject.update.mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data,
    }));
    mockPrisma.leadershipProgramDocument.create.mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
    }));
    mockPrisma.leadershipProgramCost.create.mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
    }));
    mockPrisma.leadershipProgramCommunication.create.mockImplementation(async ({ data }: any) => ({
      id: 1,
      ...data,
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadershipExecutionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LeadershipProgramsService, useValue: mockPrograms },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(LeadershipExecutionService);
  });

  // ─── Avaliações ───────────────────────────────────────────────────────

  it('recordAssessment cria a linha quando não existe nenhuma para a etapa', async () => {
    mockPrisma.leadershipParticipantAssessment.findFirst.mockResolvedValue(null);
    const res = await service.recordAssessment(actor(), 1, 3, {
      stage: 'INITIAL' as any,
      score: 60,
    });
    expect(mockPrisma.leadershipParticipantAssessment.create).toHaveBeenCalled();
    expect(res).toMatchObject({ participantId: 100, stage: 'INITIAL', assessorId: 7 });
  });

  it('recordAssessment actualiza a linha existente da mesma etapa', async () => {
    mockPrisma.leadershipParticipantAssessment.findFirst.mockResolvedValue({
      id: 9,
      status: 'IN_PROGRESS',
    });
    await service.recordAssessment(actor(), 1, 3, {
      stage: 'INITIAL' as any,
      status: 'COMPLETED' as any,
    });
    expect(mockPrisma.leadershipParticipantAssessment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 } }),
    );
    const data = mockPrisma.leadershipParticipantAssessment.update.mock.calls[0][0].data;
    expect(data.assessedAt).toBeInstanceOf(Date);
  });

  it('recordAssessment com etapa FINAL COMPLETED espelha readiness no participante', async () => {
    mockPrisma.leadershipParticipantAssessment.findFirst.mockResolvedValue(null);
    await service.recordAssessment(actor(), 1, 3, {
      stage: 'FINAL' as any,
      status: 'COMPLETED' as any,
      readinessLevel: 'READY_NOW' as any,
    });
    expect(mockPrisma.leadershipProgramParticipant.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: { readinessLevel: 'READY_NOW' },
    });
  });

  it('recordAssessment → 404 quando o assessmentId canónico não existe', async () => {
    mockPrisma.assessment.findUnique.mockResolvedValue(null);
    await expect(
      service.recordAssessment(actor(), 1, 3, { stage: 'MIDPOINT' as any, assessmentId: 55 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Projecto ─────────────────────────────────────────────────────────

  it('upsertProject cria quando não vem projectId', async () => {
    const res = await service.upsertProject(actor(), 1, {
      title: 'Melhorar processo',
      sponsorId: 8,
    });
    expect(mockPrisma.leadershipProject.create).toHaveBeenCalled();
    expect(res).toMatchObject({ programId: 1, title: 'Melhorar processo' });
  });

  it('upsertProject → 404 ao actualizar projecto de outro programa', async () => {
    mockPrisma.leadershipProject.findUnique.mockResolvedValue({ id: 5, programId: 999 });
    await expect(
      service.upsertProject(actor(), 1, { projectId: 5, title: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upsertProject → 404 quando sponsor não existe', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([]);
    await expect(
      service.upsertProject(actor(), 1, { title: 'X', sponsorId: 4242 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('evaluateProject → 404 quando o projecto não existe', async () => {
    mockPrisma.leadershipProject.findUnique.mockResolvedValue(null);
    await expect(service.evaluateProject(actor(), 5, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('evaluateProject → 400 para estado de avaliação inválido', async () => {
    mockPrisma.leadershipProject.findUnique.mockResolvedValue({ id: 5, programId: 1 });
    await expect(
      service.evaluateProject(actor(), 5, { status: 'PROPOSED' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('evaluateProject sem estado → COMPLETED e regista o avaliador', async () => {
    mockPrisma.leadershipProject.findUnique.mockResolvedValue({ id: 5, programId: 1 });
    const res = await service.evaluateProject(actor(7), 5, { score: 88 });
    expect(res).toMatchObject({ status: 'COMPLETED', evaluatedById: 7 });
    expect(res.evaluatedAt).toBeInstanceOf(Date);
  });

  // ─── Documentos ───────────────────────────────────────────────────────

  it('attachDocument → 404 quando o documento não existe ou está eliminado', async () => {
    mockPrisma.document.findUnique.mockResolvedValueOnce(null);
    await expect(service.attachDocument(actor(), 1, { documentId: 9 })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    mockPrisma.document.findUnique.mockResolvedValueOnce({ id: 9, deletedAt: new Date() });
    await expect(service.attachDocument(actor(), 1, { documentId: 9 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('attachDocument cria a referência (nunca cria Document novo)', async () => {
    mockPrisma.document.findUnique.mockResolvedValue({ id: 9, deletedAt: null });
    const res = await service.attachDocument(actor(7), 1, {
      documentId: 9,
      kind: 'EVIDENCE' as any,
    });
    expect(res).toMatchObject({ programId: 1, documentId: 9, uploadedById: 7, kind: 'EVIDENCE' });
  });

  // ─── Custos ───────────────────────────────────────────────────────────

  it('getCostSummary agrega planeado/real, variação e por categoria', async () => {
    mockPrisma.leadershipProgramCost.findMany.mockResolvedValue([
      { category: 'INSTRUCTOR', plannedAmount: 1000, actualAmount: 900, currency: 'AOA' },
      { category: 'INSTRUCTOR', plannedAmount: 500, actualAmount: 600, currency: 'AOA' },
      { category: 'VENUE', plannedAmount: 300, actualAmount: 0, currency: 'AOA' },
    ]);
    const s = await service.getCostSummary(actor(), 1);
    expect(s.totalPlanned).toBe(1800);
    expect(s.totalActual).toBe(1500);
    expect(s.variance).toBe(300);
    expect(s.byCategory.INSTRUCTOR).toEqual({ planned: 1500, actual: 1500 });
    expect(s.byCategory.VENUE).toEqual({ planned: 300, actual: 0 });
  });

  // ─── Comunicações + idempotência ──────────────────────────────────────

  it('scheduleCommunication cria a linha SCHEDULED', async () => {
    const res = await service.scheduleCommunication(actor(), 1, {
      event: 'INVITATION' as any,
      subject: 'Bem-vindo',
    });
    expect(res).toMatchObject({ programId: 1, event: 'INVITATION', status: 'SCHEDULED' });
  });

  it('dispatchCommunication: claim ganho → envia a um participante e não reenvia', async () => {
    mockPrisma.leadershipProgramCommunication.findUnique.mockResolvedValue({
      id: 7,
      programId: 1,
      participantId: 100,
      event: 'SESSION_REMINDER',
      subject: 'Sessão amanhã',
      body: 'Não faltes',
    });
    mockPrisma.leadershipProgramCommunication.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.leadershipProgramParticipant.findUniqueOrThrow.mockResolvedValue({ userId: 3 });

    await service.dispatchCommunication(actor(), 7);

    expect(mockNotifications.enqueueSend).toHaveBeenCalledTimes(1);
    const dto = mockNotifications.enqueueSend.mock.calls[0][0];
    expect(dto).toMatchObject({ userId: 3, type: 'LEADERSHIP_SESSION_REMINDER' });
    expect(dto.metadata).toEqual({
      leadershipProgramId: 1,
      communicationId: 7,
      event: 'SESSION_REMINDER',
    });
  });

  it('dispatchCommunication: claim perdido (já SENT) → não envia nada (idempotente)', async () => {
    mockPrisma.leadershipProgramCommunication.findUnique.mockResolvedValue({
      id: 7,
      programId: 1,
      participantId: 100,
      event: 'COMPLETION',
    });
    mockPrisma.leadershipProgramCommunication.updateMany.mockResolvedValue({ count: 0 });

    await service.dispatchCommunication(actor(), 7);
    expect(mockNotifications.enqueueSend).not.toHaveBeenCalled();
  });

  it('dispatchCommunication sem participantId → fan-out a todos os participantes', async () => {
    mockPrisma.leadershipProgramCommunication.findUnique.mockResolvedValue({
      id: 8,
      programId: 1,
      participantId: null,
      event: 'DEADLINE_REMINDER',
    });
    mockPrisma.leadershipProgramCommunication.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.leadershipProgramParticipant.findMany.mockResolvedValue([
      { userId: 3 },
      { userId: 4 },
      { userId: 5 },
    ]);

    await service.dispatchCommunication(actor(), 8);
    expect(mockNotifications.enqueueSend).toHaveBeenCalledTimes(3);
  });

  it('dispatchCommunication → 404 quando a comunicação não existe', async () => {
    mockPrisma.leadershipProgramCommunication.findUnique.mockResolvedValue(null);
    await expect(service.dispatchCommunication(actor(), 999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('propaga o 403 da guarda de gestão do programa', async () => {
    mockPrograms.assertCanManageProgram.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.addCost(actor(2), 1, { category: 'OTHER' as any })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

// src/trainings/trainings.service.approvals.spec.ts
// Cobertura das funcionalidades novas do módulo completo de formações:
// aprovações de inscrição, comunicação/notificações, documentos
// administrativos, associação de avaliações existentes, resultados, e o
// scoping por ownership (GESTOR/INSTRUCTOR/DIRECTOR/LIDER só gerem as
// formações que criaram; ADMIN/RH gerem todas).
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TrainingService as TrainingsService } from './trainings.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  training: { findUnique: jest.fn(), update: jest.fn() },
  trainingParticipant: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
  trainingSession: { findUnique: jest.fn() },
  trainingDocument: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  trainingAssessment: { upsert: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
  assessment: { findUnique: jest.fn() },
  trainingRating: {
    aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4 }, _count: { rating: 0 } }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

const adminUser = { id: 1, email: 'admin@innova.com', role: { name: 'ADMIN' } } as any;
const ownerGestor = { id: 42, email: 'gestor@innova.com', role: { name: 'GESTOR' } } as any;
const otherGestor = { id: 99, email: 'outro@innova.com', role: { name: 'GESTOR' } } as any;

describe('TrainingsService — aprovações, comunicação, documentos, avaliações, resultados', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  // ─── Ownership ──────────────────────────────────────────────────────────

  describe('ownership (createdById)', () => {
    it('GESTOR que não criou a formação → NotFoundException ao tentar gerir', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 42 });
      await expect(service.archive(5, otherGestor)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GESTOR que criou a formação → consegue gerir', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 42 });
      mockPrisma.training.update.mockResolvedValue({ id: 5, status: 'ARCHIVED' });
      const result = await service.archive(5, ownerGestor);
      expect(result).toBeDefined();
    });

    it('ADMIN gere qualquer formação, mesmo de outro criador', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 42 });
      mockPrisma.training.update.mockResolvedValue({ id: 5, status: 'ARCHIVED' });
      const result = await service.archive(5, adminUser);
      expect(result).toBeDefined();
    });
  });

  // ─── Aprovações ─────────────────────────────────────────────────────────

  describe('approveParticipant', () => {
    it('aprova inscrição pendente com vaga disponível → REGISTERED', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        sessionId: 10,
        status: 'PENDING_APPROVAL',
        session: {
          id: 10,
          maxParticipants: 5,
          waitlistEnabled: true,
          _count: { participants: 1 },
        },
      });
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        id: 10,
        training: { createdById: 1 },
      });
      mockPrisma.trainingParticipant.update.mockResolvedValue({ id: 1, status: 'REGISTERED' });

      const result = await service.approveParticipant(1, adminUser);
      expect(result.status).toBe('REGISTERED');
    });

    it('aprova sem vaga mas com lista de espera → WAITLIST', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        sessionId: 10,
        status: 'PENDING_APPROVAL',
        session: {
          id: 10,
          maxParticipants: 1,
          waitlistEnabled: true,
          _count: { participants: 1 },
        },
      });
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        id: 10,
        training: { createdById: 1 },
      });
      mockPrisma.trainingParticipant.update.mockResolvedValue({ id: 1, status: 'WAITLIST' });

      const result = await service.approveParticipant(1, adminUser);
      expect(result.status).toBe('WAITLIST');
    });

    it('aprova sem vaga e sem lista de espera → BadRequestException', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        sessionId: 10,
        status: 'PENDING_APPROVAL',
        session: {
          id: 10,
          maxParticipants: 1,
          waitlistEnabled: false,
          _count: { participants: 1 },
        },
      });
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        id: 10,
        training: { createdById: 1 },
      });

      await expect(service.approveParticipant(1, adminUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('participante já não pendente → BadRequestException', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        sessionId: 10,
        status: 'REGISTERED',
        session: { id: 10, maxParticipants: 0, waitlistEnabled: true, _count: { participants: 0 } },
      });
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        id: 10,
        training: { createdById: 1 },
      });

      await expect(service.approveParticipant(1, adminUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('gestor de outra formação não pode aprovar → NotFoundException', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        sessionId: 10,
        status: 'PENDING_APPROVAL',
        session: { id: 10, maxParticipants: 0, waitlistEnabled: true, _count: { participants: 0 } },
      });
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        id: 10,
        training: { createdById: 42 },
      });

      await expect(service.approveParticipant(1, otherGestor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('rejectParticipant', () => {
    it('rejeita inscrição pendente', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        sessionId: 10,
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        id: 10,
        training: { createdById: 1 },
      });
      mockPrisma.trainingParticipant.update.mockResolvedValue({ id: 1, status: 'REJECTED' });

      const result = await service.rejectParticipant(1, { reason: 'Sem vagas' }, adminUser);
      expect(result.status).toBe('REJECTED');
    });

    it('participante já não pendente → BadRequestException', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        userId: 7,
        sessionId: 10,
        status: 'CANCELLED',
      });
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        id: 10,
        training: { createdById: 1 },
      });

      await expect(service.rejectParticipant(1, {}, adminUser)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  // ─── Comunicação / notificações ────────────────────────────────────────

  describe('notifyParticipants', () => {
    it('envia notificação a todos os participantes activos (distinct por utilizador)', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 1 });
      mockPrisma.trainingParticipant.findMany.mockResolvedValue([{ userId: 7 }, { userId: 8 }]);

      const result = await service.notifyParticipants(5, { message: 'Aviso' }, adminUser);
      expect(result.sent).toBe(2);
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Documentos administrativos ────────────────────────────────────────

  describe('documentos administrativos', () => {
    it('adiciona documento', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 1 });
      mockPrisma.trainingDocument.create.mockResolvedValue({ id: 1, name: 'Contrato' });

      const result = await service.addDocument(
        5,
        { name: 'Contrato', fileUrl: 'https://files.innova.test/x.pdf' },
        adminUser,
      );
      expect(result).toBeDefined();
    });

    it('remove documento (com ownership via training)', async () => {
      mockPrisma.trainingDocument.findUnique.mockResolvedValue({ id: 1, trainingId: 5 });
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 1 });

      const result = await service.removeDocument(1, adminUser);
      expect(result).toHaveProperty('message');
    });

    it('documento inexistente → NotFoundException', async () => {
      mockPrisma.trainingDocument.findUnique.mockResolvedValue(null);
      await expect(service.removeDocument(999, adminUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── Avaliação — associar avaliações existentes ────────────────────────

  describe('linkAssessment / unlinkAssessment', () => {
    it('associa um Assessment existente por papel', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 1 });
      mockPrisma.assessment.findUnique.mockResolvedValue({ id: 3, title: 'Quiz inicial' });
      mockPrisma.trainingAssessment.upsert.mockResolvedValue({ id: 1, role: 'INITIAL' });

      const result = await service.linkAssessment(
        5,
        { assessmentId: 3, role: 'INITIAL' as any },
        adminUser,
      );
      expect(result).toBeDefined();
    });

    it('Assessment inexistente → NotFoundException', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 1 });
      mockPrisma.assessment.findUnique.mockResolvedValue(null);

      await expect(
        service.linkAssessment(5, { assessmentId: 999, role: 'INITIAL' as any }, adminUser),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('desassocia avaliação existente', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 1 });
      mockPrisma.trainingAssessment.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.unlinkAssessment(5, 'INITIAL' as any, adminUser);
      expect(result).toHaveProperty('message');
    });

    it('desassociar papel não associado → NotFoundException', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 5, createdById: 1 });
      mockPrisma.trainingAssessment.findUnique.mockResolvedValue(null);

      await expect(service.unlinkAssessment(5, 'FINAL' as any, adminUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── Resultados ─────────────────────────────────────────────────────────

  describe('getResults', () => {
    it('calcula inscritos/concluídos/taxa/nota média/satisfação/custo por participante', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({
        id: 5,
        createdById: 1,
        title: 'Liderança',
        cost: null,
        instructorCost: 1000,
        materialCost: 200,
        transportCost: null,
        foodCost: null,
        lodgingCost: null,
        otherCosts: null,
      });
      mockPrisma.trainingParticipant.findMany.mockResolvedValue([
        { status: 'COMPLETED', finalScore: 90 },
        { status: 'COMPLETED', finalScore: 80 },
        { status: 'ATTENDED', finalScore: null },
        { status: 'REGISTERED', finalScore: null },
        { status: 'CANCELLED', finalScore: null },
        { status: 'WAITLIST', finalScore: null },
      ]);

      const result = await service.getResults(5);

      expect(result.enrolled).toBe(4); // COMPLETED×2 + ATTENDED + REGISTERED
      expect(result.completed).toBe(2);
      expect(result.participants).toBe(3); // ATTENDED + COMPLETED×2
      expect(result.completionRate).toBe(50);
      expect(result.avgScore).toBe(85);
      expect(result.totalCost).toBe(1200);
      expect(result.costPerParticipant).toBe(300);
      expect(result.satisfaction).toBe(4);
    });
  });
});

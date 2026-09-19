// docs/trainings-detalhado.md pts 5-6 — transferência de turma, inscrição
// em massa e exportação de participantes. Espelha o mockPrisma de
// trainings.service.spec.ts.
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TrainingService as TrainingsService } from './trainings.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  training: { findUnique: jest.fn() },
  trainingParticipant: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  trainingSession: { findUnique: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
};

describe('TrainingsService — Turmas & Participantes (pts 5-6)', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  describe('transferParticipant', () => {
    it('lança NotFoundException se a inscrição não existe', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(null);
      await expect(service.transferParticipant(1, { targetSessionId: 2 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lança ConflictException se a sessão de destino é a mesma', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        sessionId: 5,
        userId: 9,
      });
      await expect(service.transferParticipant(1, { targetSessionId: 5 })).rejects.toThrow(
        ConflictException,
      );
    });

    it('regista na sessão de destino e cancela na origem', async () => {
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
        id: 1,
        sessionId: 5,
        userId: 9,
      });
      // registerParticipant(): não inscrito ainda + sessão com vaga
      mockPrisma.trainingParticipant.findFirst
        .mockResolvedValueOnce(null) // existing na sessão de destino
        .mockResolvedValueOnce(null); // waitlist a promover na origem
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        maxParticipants: 0,
        waitlistEnabled: true,
        _count: { participants: 0 },
        training: { requiresApproval: false },
      });
      mockPrisma.trainingParticipant.upsert.mockResolvedValue({
        id: 2,
        status: 'REGISTERED',
        user: { id: 9, fullName: 'Colaborador' },
      });

      const result = await service.transferParticipant(1, { targetSessionId: 8 });

      expect(mockPrisma.trainingParticipant.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { sessionId_userId: { sessionId: 8, userId: 9 } } }),
      );
      expect(mockPrisma.trainingParticipant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'CANCELLED', cancellationReason: 'Transferido para outra turma/sessão' },
      });
      expect(result.status).toBe('REGISTERED');
    });
  });

  describe('bulkRegisterParticipants', () => {
    it('regista quem consegue e reporta falhas individualmente', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue({
        maxParticipants: 0,
        waitlistEnabled: true,
        _count: { participants: 0 },
        training: { requiresApproval: false },
      });
      mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
      mockPrisma.trainingParticipant.upsert
        .mockResolvedValueOnce({ status: 'REGISTERED' })
        .mockRejectedValueOnce(new Error('boom'));

      const result = await service.bulkRegisterParticipants({
        sessionId: 1,
        userIds: [10, 11],
      });

      expect(result.registered).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results).toHaveLength(2);
    });
  });

  describe('exportParticipantsCsv', () => {
    it('lança NotFoundException se a formação não existe', async () => {
      mockPrisma.training.findUnique.mockResolvedValue(null);
      await expect(service.exportParticipantsCsv(99)).rejects.toThrow(NotFoundException);
    });

    it('gera CSV com uma linha por participante', async () => {
      mockPrisma.training.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.trainingParticipant.findMany.mockResolvedValue([
        {
          status: 'REGISTERED',
          finalScore: null,
          attendedHours: null,
          user: { fullName: 'Ana Silva', email: 'ana@innova.com', department: { name: 'RH' } },
          session: { sessionDate: new Date('2027-01-01T09:00:00Z') },
        },
      ]);
      const csv = await service.exportParticipantsCsv(1);
      expect(csv).toContain('colaborador,email,departamento,sessao,estado,nota,horas');
      expect(csv).toContain('Ana Silva');
      expect(csv).toContain('RH');
    });
  });
});

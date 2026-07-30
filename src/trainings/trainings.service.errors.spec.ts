import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TrainingService as TrainingsService } from './trainings.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  trainingParticipant: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  trainingSession: { findUnique: jest.fn() },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { upsert: jest.fn().mockResolvedValue({}) },
  certificate: { create: jest.fn().mockResolvedValue({}) },
};

describe('TrainingsService — registerParticipant (capacidade / lista de espera)', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  it('utilizador já inscrito (não cancelado) → ConflictException', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue({ id: 1 });
    await expect(
      service.registerParticipant({ sessionId: 1, userId: 7 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.trainingParticipant.create).not.toHaveBeenCalled();
  });

  it('sessão inexistente → NotFoundException', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.trainingSession.findUnique.mockResolvedValue(null);
    await expect(
      service.registerParticipant({ sessionId: 999, userId: 7 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('sessão lotada sem lista de espera → BadRequestException', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 1,
      maxParticipants: 2,
      waitlistEnabled: false,
      _count: { participants: 2 },
    });
    await expect(
      service.registerParticipant({ sessionId: 1, userId: 7 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.trainingParticipant.create).not.toHaveBeenCalled();
  });

  it('sessão lotada com lista de espera → status WAITLIST', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 1,
      maxParticipants: 2,
      waitlistEnabled: true,
      _count: { participants: 2 },
    });
    mockPrisma.trainingParticipant.create.mockResolvedValue({ id: 5, status: 'WAITLIST' });

    await service.registerParticipant({ sessionId: 1, userId: 7 } as any);

    expect(mockPrisma.trainingParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WAITLIST' }) }),
    );
  });

  it('maxParticipants=0 significa vagas ilimitadas → REGISTERED mesmo com muitos participantes', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 1,
      maxParticipants: 0,
      waitlistEnabled: false,
      _count: { participants: 500 },
    });
    mockPrisma.trainingParticipant.create.mockResolvedValue({ id: 5, status: 'REGISTERED' });

    await service.registerParticipant({ sessionId: 1, userId: 7 } as any);

    expect(mockPrisma.trainingParticipant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REGISTERED' }) }),
    );
  });
});

describe('TrainingsService — cancelParticipant (ownership + promoção da lista de espera)', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  it('inscrição inexistente → NotFoundException', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue(null);
    await expect(service.cancelParticipant(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('outro utilizador não pode cancelar inscrição alheia → ForbiddenException', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({ id: 1, userId: 7 });
    await expect(service.cancelParticipant(1, 999)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.trainingParticipant.update).not.toHaveBeenCalled();
  });

  it('ao cancelar, promove o primeiro da lista de espera se existir', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue({ id: 20, userId: 30 });

    const result = await service.cancelParticipant(1, 7);

    expect(result.waitlistPromoted).toBe(true);
    expect(mockPrisma.trainingParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20 }, data: { status: 'REGISTERED' } }),
    );
  });

  it('sem ninguém na lista de espera, não promove nada', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);

    const result = await service.cancelParticipant(1, 7);

    expect(result.waitlistPromoted).toBe(false);
  });
});

describe('TrainingsService — updateParticipantStatus (emissão automática de certificado)', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  it('participante inexistente → NotFoundException', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue(null);
    await expect(
      service.updateParticipantStatus(1, { status: 'COMPLETED' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conclusão com nota abaixo do mínimo não emite certificado', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 10,
      training: { issueCertificate: true, passingScore: 70 },
    });

    await service.updateParticipantStatus(1, { status: 'COMPLETED', finalScore: 50 } as any);

    expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
  });

  it('conclusão com nota suficiente emite certificado automaticamente', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 10,
      training: { issueCertificate: true, passingScore: 70 },
    });

    await service.updateParticipantStatus(1, { status: 'COMPLETED', finalScore: 85 } as any);

    expect(mockPrisma.certificate.create).toHaveBeenCalled();
  });

  it('treinamento sem issueCertificate nunca emite, mesmo com nota alta', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 10,
      training: { issueCertificate: false, passingScore: 70 },
    });

    await service.updateParticipantStatus(1, { status: 'COMPLETED', finalScore: 100 } as any);

    expect(mockPrisma.certificate.create).not.toHaveBeenCalled();
  });
});

describe('TrainingsService — bulkAttendance', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [TrainingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  it('sessão inexistente → NotFoundException', async () => {
    mockPrisma.trainingSession.findUnique.mockResolvedValue(null);
    await expect(
      service.bulkAttendance({ sessionId: 1, presentUserIds: [] } as any, 1),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marca presentes e ausentes correctamente', async () => {
    mockPrisma.trainingSession.findUnique.mockResolvedValue({ id: 1 });
    mockPrisma.trainingParticipant.findMany.mockResolvedValue([
      { id: 1, userId: 10 },
      { id: 2, userId: 20 },
      { id: 3, userId: 30 },
    ]);

    const result = await service.bulkAttendance(
      { sessionId: 1, presentUserIds: [10, 30] } as any,
      1,
    );

    expect(result).toEqual({ sessionId: 1, attended: 2, absent: 1, total: 3 });
    expect(mockPrisma.trainingParticipant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 2 }, data: { status: 'ABSENT' } }),
    );
  });
});

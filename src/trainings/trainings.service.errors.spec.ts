import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TrainingService as TrainingsService } from './trainings.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CompetenciesService } from '../competencies/competencies.service';
import { CertificateIssuanceService } from '../certificates/certificate-issuance.service';
import { LearningPathCertificationService } from '../certificates/learning-path-certification.service';

const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
const mockCertificates = { issue: jest.fn().mockResolvedValue({ outcome: 'ISSUED' }) };
const mockLearningPaths = { onTrainingCompleted: jest.fn().mockResolvedValue([]) };
const mockCompetenciesService = { updateFromTraining: jest.fn().mockResolvedValue(undefined) };

const mockPrisma = {
  trainingParticipant: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  trainingSession: { findUnique: jest.fn() },
  training: { findUnique: jest.fn().mockResolvedValue(null) },
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
      providers: [
        TrainingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: CompetenciesService, useValue: mockCompetenciesService },
        { provide: CertificateIssuanceService, useValue: mockCertificates },
        { provide: LearningPathCertificationService, useValue: mockLearningPaths },
      ],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  it('utilizador já inscrito (não cancelado) → ConflictException', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue({ id: 1 });
    await expect(
      service.registerParticipant({ sessionId: 1, userId: 7 } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.trainingParticipant.upsert).not.toHaveBeenCalled();
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
      training: { requiresApproval: false },
    });
    await expect(
      service.registerParticipant({ sessionId: 1, userId: 7 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPrisma.trainingParticipant.upsert).not.toHaveBeenCalled();
  });

  it('sessão lotada com lista de espera → status WAITLIST', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 1,
      maxParticipants: 2,
      waitlistEnabled: true,
      _count: { participants: 2 },
      training: { requiresApproval: false },
    });
    mockPrisma.trainingParticipant.upsert.mockResolvedValue({ id: 5, status: 'WAITLIST' });

    await service.registerParticipant({ sessionId: 1, userId: 7 } as any);

    expect(mockPrisma.trainingParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'WAITLIST' }) }),
    );
  });

  it('maxParticipants=0 significa vagas ilimitadas → REGISTERED mesmo com muitos participantes', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 1,
      maxParticipants: 0,
      waitlistEnabled: false,
      _count: { participants: 500 },
      training: { requiresApproval: false },
    });
    mockPrisma.trainingParticipant.upsert.mockResolvedValue({ id: 5, status: 'REGISTERED' });

    await service.registerParticipant({ sessionId: 1, userId: 7 } as any);

    expect(mockPrisma.trainingParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'REGISTERED' }) }),
    );
  });

  it('formação com requiresApproval → inscrição fica PENDING_APPROVAL, ignora vagas', async () => {
    mockPrisma.trainingParticipant.findFirst.mockResolvedValue(null);
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 1,
      maxParticipants: 0,
      waitlistEnabled: false,
      _count: { participants: 0 },
      training: { requiresApproval: true },
    });
    mockPrisma.trainingParticipant.upsert.mockResolvedValue({ id: 5, status: 'PENDING_APPROVAL' });

    await service.registerParticipant({ sessionId: 1, userId: 7 } as any);

    expect(mockPrisma.trainingParticipant.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: 'PENDING_APPROVAL' }),
      }),
    );
  });
});

describe('TrainingsService — cancelParticipant (ownership + promoção da lista de espera)', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: CompetenciesService, useValue: mockCompetenciesService },
        { provide: CertificateIssuanceService, useValue: mockCertificates },
        { provide: LearningPathCertificationService, useValue: mockLearningPaths },
      ],
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
      session: { trainingId: 5 },
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
      session: { trainingId: 5 },
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
      providers: [
        TrainingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: CompetenciesService, useValue: mockCompetenciesService },
        { provide: CertificateIssuanceService, useValue: mockCertificates },
        { provide: LearningPathCertificationService, useValue: mockLearningPaths },
      ],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  it('participante inexistente → NotFoundException', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue(null);
    await expect(
      service.updateParticipantStatus(1, { status: 'COMPLETED' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conclusão pede sempre a emissão centralizada (a regra e a nota mínima são revalidadas lá)', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 10,
      training: { id: 10, issueCertificate: true, passingScore: 70 },
    });

    await service.updateParticipantStatus(1, { status: 'COMPLETED', finalScore: 50 } as any);

    expect(mockCertificates.issue).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, activityKind: 'TRAINING', trigger: 'AUTO' }),
    );
  });

  it('conclusão com nota suficiente emite o certificado da formação', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 10,
      training: { id: 10, issueCertificate: true, passingScore: 70 },
    });

    await service.updateParticipantStatus(1, { status: 'COMPLETED', finalScore: 85 } as any);

    expect(mockCertificates.issue).toHaveBeenCalledWith(
      expect.objectContaining({ activityKind: 'TRAINING', activityId: 10 }),
    );
  });

  it('falha na emissão não impede a conclusão do participante', async () => {
    mockCertificates.issue.mockRejectedValueOnce(new Error('boom'));
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 10,
      training: { id: 10, issueCertificate: true, passingScore: 70 },
    });

    await expect(
      service.updateParticipantStatus(1, { status: 'COMPLETED', finalScore: 85 } as any),
    ).resolves.toBeDefined();
  });

  it('estado diferente de COMPLETED não pede emissão', async () => {
    mockPrisma.trainingParticipant.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      sessionId: 10,
    });
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 10,
      training: { issueCertificate: true, completionMode: 'MANUAL', passingScore: 70 },
    });

    await service.updateParticipantStatus(1, { status: 'ATTENDED' } as any);

    expect(mockCertificates.issue).not.toHaveBeenCalled();
  });
});

describe('TrainingsService — bulkAttendance', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: CompetenciesService, useValue: mockCompetenciesService },
        { provide: CertificateIssuanceService, useValue: mockCertificates },
        { provide: LearningPathCertificationService, useValue: mockLearningPaths },
      ],
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
    mockPrisma.trainingSession.findUnique.mockResolvedValue({ id: 1, trainingId: 10 });
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

describe('TrainingsService — bulkComplete', () => {
  let service: TrainingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: CompetenciesService, useValue: mockCompetenciesService },
        { provide: CertificateIssuanceService, useValue: mockCertificates },
        { provide: LearningPathCertificationService, useValue: mockLearningPaths },
      ],
    }).compile();
    service = module.get<TrainingsService>(TrainingsService);
  });

  it('conclui cada participante à parte: um erro não perde os restantes', async () => {
    mockPrisma.trainingParticipant.findUnique
      .mockResolvedValueOnce({ id: 1, userId: 7, sessionId: 10 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 3, userId: 8, sessionId: 10 });
    mockPrisma.trainingSession.findUnique.mockResolvedValue({
      id: 10,
      training: { id: 10, issueCertificate: true, passingScore: 70 },
    });

    const r = await service.bulkComplete({ participantIds: [1, 2, 3] }, 99);

    expect(r).toMatchObject({ total: 3, completed: 2, failed: 1 });
    expect(r.results[1]).toMatchObject({ participantId: 2, ok: false });
    expect(mockCertificates.issue).toHaveBeenCalledTimes(2);
  });
});

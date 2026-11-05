import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TrainingService } from './trainings.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CompetenciesService } from '../competencies/competencies.service';
import { CertificateIssuanceService } from '../certificates/certificate-issuance.service';
import { LearningPathCertificationService } from '../certificates/learning-path-certification.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import {
  TRAINING_JOIN_EARLY_MINUTES,
  remainingSharePercent,
  sessionJoinWindow,
} from './training-join';

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockCertificates = { issue: jest.fn().mockResolvedValue({ outcome: 'ISSUED' }) };
const mockLearningPaths = { onTrainingCompleted: jest.fn().mockResolvedValue([]) };
const mockCompetencies = { updateFromTraining: jest.fn() };
const mockEnrollments = { enroll: jest.fn().mockResolvedValue({}) };

const mockPrisma: any = {
  trainingSession: { findUnique: jest.fn() },
  trainingParticipant: { findUnique: jest.fn(), updateMany: jest.fn() },
  course: { findUnique: jest.fn() },
  enrollment: { findUnique: jest.fn() },
};

const MIN = 60_000;
const user = { id: 7, email: 'colab@innova.com' } as any;

/** Sessão de 60 min que começou há `startedMinAgo` minutos (negativo = começa no futuro). */
function makeSession(startedMinAgo: number, over: Record<string, unknown> = {}, trainingOver = {}) {
  return {
    id: 10,
    trainingId: 1,
    sessionDate: new Date(Date.now() - startedMinAgo * MIN),
    durationMinutes: 60,
    modality: 'ONLINE',
    meetingUrl: 'https://meet.example.com/abc',
    training: {
      id: 1,
      courseId: null,
      completionMode: 'ATTENDANCE',
      minAttendancePercent: 75,
      issueCertificate: true,
      ...trainingOver,
    },
    ...over,
  };
}

function makeParticipant(over: Record<string, unknown> = {}) {
  return { id: 99, sessionId: 10, userId: 7, status: 'REGISTERED', joinedAt: null, ...over };
}

describe('TrainingService.joinSession', () => {
  let service: TrainingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    mockPrisma.trainingParticipant.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.course.findUnique.mockResolvedValue({ id: 5, status: 'PUBLISHED' });
    mockPrisma.enrollment.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrainingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: CompetenciesService, useValue: mockCompetencies },
        { provide: CertificateIssuanceService, useValue: mockCertificates },
        { provide: LearningPathCertificationService, useValue: mockLearningPaths },
        { provide: EnrollmentsService, useValue: mockEnrollments },
      ],
    }).compile();
    service = module.get(TrainingService);
  });

  describe('regras puras', () => {
    it('janela: abre 15 min antes e fecha no fim', () => {
      const start = new Date('2026-11-04T10:00:00Z');
      const w = sessionJoinWindow({ sessionDate: start, durationMinutes: 90 });
      expect(start.getTime() - w.opensAt.getTime()).toBe(TRAINING_JOIN_EARLY_MINUTES * MIN);
      expect(w.closesAt.getTime() - start.getTime()).toBe(90 * MIN);
    });
    it('atraso: entrar antes conta 100%, a meio conta 50%, no fim conta 0%', () => {
      const s = { sessionDate: new Date('2026-11-04T10:00:00Z'), durationMinutes: 60 };
      expect(remainingSharePercent(s, new Date('2026-11-04T09:50:00Z'))).toBe(100);
      expect(remainingSharePercent(s, new Date('2026-11-04T10:30:00Z'))).toBe(50);
      expect(remainingSharePercent(s, new Date('2026-11-04T11:00:00Z'))).toBe(0);
    });
  });

  describe('inscrição e ownership', () => {
    it('sessão inexistente → 404', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(null);
      await expect(service.joinSession(10, user)).rejects.toThrow(NotFoundException);
    });

    it('não inscrito → 404 e nada é escrito', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(null);
      await expect(service.joinSession(10, user)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.trainingParticipant.updateMany).not.toHaveBeenCalled();
    });

    it('procura a inscrição pelo utilizador do token (sessionId_userId)', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      await service.joinSession(10, user);
      expect(mockPrisma.trainingParticipant.findUnique).toHaveBeenCalledWith({
        where: { sessionId_userId: { sessionId: 10, userId: 7 } },
      });
    });

    it.each(['WAITLIST', 'PENDING_APPROVAL', 'CANCELLED', 'REJECTED', 'ABSENT'])(
      'estado %s → 403',
      async status => {
        mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5));
        mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant({ status }));
        await expect(service.joinSession(10, user)).rejects.toThrow(ForbiddenException);
        expect(mockPrisma.trainingParticipant.updateMany).not.toHaveBeenCalled();
      },
    );
  });

  describe('janela de entrada', () => {
    it('antes de abrir → 400 com opensAt e sem registar', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(-16));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const err = await service.joinSession(10, user).catch(e => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe('A entrada ainda não está aberta para esta sessão');
      expect(mockPrisma.trainingParticipant.updateMany).not.toHaveBeenCalled();
    });

    it('depois do fim → 400', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(61));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      await expect(service.joinSession(10, user)).rejects.toThrow('A sessão já terminou');
    });

    it('14 min antes do início já está dentro da janela', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(-14));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.status).toBe('ATTENDED');
      expect(r.late).toBe(false);
    });
  });

  describe('online com link', () => {
    it('devolve o link, grava joinedAt e marca ATTENDED', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.destination).toEqual({ type: 'MEETING', url: 'https://meet.example.com/abc' });
      expect(r.status).toBe('ATTENDED');
      expect(mockPrisma.trainingParticipant.updateMany).toHaveBeenCalledWith({
        where: { id: 99, joinedAt: null },
        data: { joinedAt: expect.any(Date) },
      });
      expect(mockPrisma.trainingParticipant.updateMany).toHaveBeenCalledWith({
        where: { id: 99, status: 'REGISTERED' },
        data: { status: 'ATTENDED' },
      });
      expect(mockCertificates.issue).toHaveBeenCalledTimes(1);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'Training', action: 'SESSION_JOIN', userId: 7 }),
      );
    });

    it('modo MANUAL: marca presença mas não emite certificado', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, {}, { completionMode: 'MANUAL' }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.status).toBe('ATTENDED');
      expect(mockCertificates.issue).not.toHaveBeenCalled();
    });
  });

  describe('entrada com atraso', () => {
    it('atraso pequeno (10 min de 60) → ATTENDED e late=true', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(10));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.late).toBe(true);
      expect(r.status).toBe('ATTENDED');
    });

    it('atraso que compromete minAttendancePercent (30 min de 60, mínimo 75%) → fica REGISTERED, com joinedAt e destino', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(30));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.late).toBe(true);
      expect(r.status).toBe('REGISTERED');
      expect(r.destination.type).toBe('MEETING');
      expect(mockPrisma.trainingParticipant.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ATTENDED' } }),
      );
      expect(mockCertificates.issue).not.toHaveBeenCalled();
    });
  });

  describe('idempotência', () => {
    it('segunda chamada: joinedAt preservado, sem novo update de estado, sem novo certificado nem auditoria', async () => {
      const joinedAt = new Date(Date.now() - 2 * MIN);
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(
        makeParticipant({ status: 'ATTENDED', joinedAt }),
      );
      const r = await service.joinSession(10, user);
      expect(r.joinedAt).toBe(joinedAt);
      expect(r.status).toBe('ATTENDED');
      expect(mockPrisma.trainingParticipant.updateMany).not.toHaveBeenCalled();
      expect(mockCertificates.issue).not.toHaveBeenCalled();
      expect(mockAudit.log).not.toHaveBeenCalled();
    });

    it('COMPLETED nunca retrocede', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(
        makeParticipant({ status: 'COMPLETED', joinedAt: new Date() }),
      );
      const r = await service.joinSession(10, user);
      expect(r.status).toBe('COMPLETED');
      expect(mockPrisma.trainingParticipant.updateMany).not.toHaveBeenCalled();
    });

    it('corrida: se outro pedido mudou o estado primeiro, não emite certificado duas vezes', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      mockPrisma.trainingParticipant.updateMany
        .mockResolvedValueOnce({ count: 1 }) // joinedAt
        .mockResolvedValueOnce({ count: 0 }); // estado já alterado por outro pedido
      await service.joinSession(10, user);
      expect(mockCertificates.issue).not.toHaveBeenCalled();
    });
  });

  describe('online sem link', () => {
    it('sem meetingUrl nem curso → 400 "Link ainda não disponível" e NÃO regista presença', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5, { meetingUrl: null }));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      await expect(service.joinSession(10, user)).rejects.toThrow('Link ainda não disponível');
      expect(mockPrisma.trainingParticipant.updateMany).not.toHaveBeenCalled();
    });

    it('meetingUrl só com espaços conta como vazio', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { meetingUrl: '   ' }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      await expect(service.joinSession(10, user)).rejects.toThrow('Link ainda não disponível');
    });
  });

  describe('com curso', () => {
    it('sem link: matricula (SELF_ENROLL) e devolve a rota do curso', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { meetingUrl: null }, { courseId: 5 }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.destination).toEqual({ type: 'COURSE', route: '/courses/5/learn' });
      expect(mockEnrollments.enroll).toHaveBeenCalledWith({
        userId: 7,
        courseId: 5,
        origin: 'SELF_ENROLL',
      });
      expect(r.status).toBe('ATTENDED');
    });

    it('matrícula já existente é reutilizada (sem nova matrícula)', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { meetingUrl: null }, { courseId: 5 }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      mockPrisma.enrollment.findUnique.mockResolvedValue({ status: 'IN_PROGRESS' });
      await service.joinSession(10, user);
      expect(mockPrisma.enrollment.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { courseId_userId: { courseId: 5, userId: 7 } } }),
      );
      expect(mockEnrollments.enroll).not.toHaveBeenCalled();
    });

    it('matrícula cancelada → 400 e não regista presença', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { meetingUrl: null }, { courseId: 5 }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      mockPrisma.enrollment.findUnique.mockResolvedValue({ status: 'CANCELLED' });
      await expect(service.joinSession(10, user)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.trainingParticipant.updateMany).not.toHaveBeenCalled();
    });

    it('curso não publicado → 400 quando o curso é o destino', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { meetingUrl: null }, { courseId: 5 }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      mockPrisma.course.findUnique.mockResolvedValue({ id: 5, status: 'DRAFT' });
      await expect(service.joinSession(10, user)).rejects.toThrow(BadRequestException);
    });

    it('corrida na matrícula (409) é tolerada', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { meetingUrl: null }, { courseId: 5 }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      mockEnrollments.enroll.mockRejectedValueOnce(new ConflictException('já matriculado'));
      const r = await service.joinSession(10, user);
      expect(r.destination.type).toBe('COURSE');
    });

    it('com link E curso: o link é o destino e o curso vem como rota secundária', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5, {}, { courseId: 5 }));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.destination.type).toBe('MEETING');
      expect(r.courseRoute).toBe('/courses/5/learn');
    });

    it('com link E curso não publicado: a reunião não fica bloqueada', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(makeSession(5, {}, { courseId: 5 }));
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      mockPrisma.course.findUnique.mockResolvedValue({ id: 5, status: 'DRAFT' });
      const r = await service.joinSession(10, user);
      expect(r.destination.type).toBe('MEETING');
      expect(r.courseRoute).toBeUndefined();
    });
  });

  describe('presencial e híbrida', () => {
    it('presencial: só check-in — grava joinedAt, NÃO marca ATTENDED nem emite certificado', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { modality: 'PRESENTIAL', meetingUrl: null }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.destination).toEqual({ type: 'CHECKIN' });
      expect(r.status).toBe('REGISTERED');
      expect(mockPrisma.trainingParticipant.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.trainingParticipant.updateMany).toHaveBeenCalledWith({
        where: { id: 99, joinedAt: null },
        data: { joinedAt: expect.any(Date) },
      });
      expect(mockCertificates.issue).not.toHaveBeenCalled();
    });

    it('presencial ignora meetingUrl e curso', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { modality: 'PRESENTIAL' }, { courseId: 5 }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.destination.type).toBe('CHECKIN');
      expect(mockEnrollments.enroll).not.toHaveBeenCalled();
    });

    it('híbrida sem link nem curso → check-in (não "Link ainda não disponível")', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { modality: 'HYBRID', meetingUrl: null }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.destination.type).toBe('CHECKIN');
    });

    it('híbrida com link → reunião', async () => {
      mockPrisma.trainingSession.findUnique.mockResolvedValue(
        makeSession(5, { modality: 'HYBRID' }),
      );
      mockPrisma.trainingParticipant.findUnique.mockResolvedValue(makeParticipant());
      const r = await service.joinSession(10, user);
      expect(r.destination.type).toBe('MEETING');
    });
  });
});

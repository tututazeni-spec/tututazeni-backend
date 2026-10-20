import { NotFoundException } from '@nestjs/common';
import { CertificateFactsService } from './certificate-facts.service';

describe('CertificateFactsService', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    enrollment: { findUnique: jest.fn(), count: jest.fn() },
    quizAttempt: { aggregate: jest.fn() },
    event: { findUnique: jest.fn() },
    eventParticipant: { findUnique: jest.fn() },
    training: { findUnique: jest.fn() },
    trainingParticipant: { findMany: jest.fn() },
    learningPath: { findUnique: jest.fn() },
  };
  const svc = new CertificateFactsService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  it('COURSE concluído com melhor tentativa 82', async () => {
    prisma.course.findUnique.mockResolvedValue({ title: 'Segurança', workloadHours: 8 });
    prisma.enrollment.findUnique.mockResolvedValue({ status: 'COMPLETED', progress: 100 });
    prisma.quizAttempt.aggregate.mockResolvedValue({ _max: { score: 82 } });
    const f = await svc.collect(1, 'COURSE', 10);
    expect(f).toMatchObject({ completionPct: 100, bestScore: 82, hours: 8, title: 'Segurança' });
    expect(prisma.enrollment.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { courseId_userId: { courseId: 10, userId: 1 } } }),
    );
  });

  it('COURSE sem matrícula → 0% e sem nota', async () => {
    prisma.course.findUnique.mockResolvedValue({ title: 'X', workloadHours: null });
    prisma.enrollment.findUnique.mockResolvedValue(null);
    prisma.quizAttempt.aggregate.mockResolvedValue({ _max: { score: null } });
    const f = await svc.collect(1, 'COURSE', 10);
    expect(f).toMatchObject({ completionPct: 0, bestScore: null, hours: null });
  });

  it('COURSE matrícula em curso: usa progress e não conta como concluído', async () => {
    prisma.course.findUnique.mockResolvedValue({ title: 'X', workloadHours: 2 });
    prisma.enrollment.findUnique.mockResolvedValue({ status: 'IN_PROGRESS', progress: 100 });
    prisma.quizAttempt.aggregate.mockResolvedValue({ _max: { score: null } });
    expect((await svc.collect(1, 'COURSE', 10)).completionPct).toBeLessThan(100);
  });

  it('COURSE inexistente → NotFound', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    await expect(svc.collect(1, 'COURSE', 10)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('EVENT com participante PRESENT → presença 100 e horas do evento', async () => {
    prisma.event.findUnique.mockResolvedValue({
      title: 'Workshop',
      startAt: new Date('2026-01-01T09:00:00Z'),
      endAt: new Date('2026-01-01T13:00:00Z'),
    });
    prisma.eventParticipant.findUnique.mockResolvedValue({ status: 'PRESENT' });
    expect(await svc.collect(1, 'EVENT', 5)).toMatchObject({
      attendancePct: 100,
      completionPct: 100,
      hours: 4,
    });
  });

  it('EVENT com participante ABSENT → presença 0', async () => {
    prisma.event.findUnique.mockResolvedValue({
      title: 'W',
      startAt: new Date(),
      endAt: new Date(),
    });
    prisma.eventParticipant.findUnique.mockResolvedValue({ status: 'ABSENT' });
    expect(await svc.collect(1, 'EVENT', 5)).toMatchObject({ attendancePct: 0, completionPct: 0 });
  });

  describe('TRAINING', () => {
    const training = {
      title: 'Liderança',
      workloadHours: 16,
      passingScore: 70,
      completionMode: 'MANUAL',
      minAttendancePercent: 75,
    };

    it('participante marcado COMPLETED sem nota conta como concluído', async () => {
      prisma.training.findUnique.mockResolvedValue(training);
      prisma.trainingParticipant.findMany.mockResolvedValue([
        { status: 'COMPLETED', finalScore: null, attendedHours: null },
      ]);
      expect(await svc.collect(1, 'TRAINING', 3)).toMatchObject({
        completionPct: 100,
        instructorApproved: true,
        attendancePct: 100,
        hours: 16,
        title: 'Liderança',
      });
    });

    it('COMPLETED com nota abaixo da mínima não conclui', async () => {
      prisma.training.findUnique.mockResolvedValue(training);
      prisma.trainingParticipant.findMany.mockResolvedValue([
        { status: 'COMPLETED', finalScore: 50, attendedHours: null },
      ]);
      expect(await svc.collect(1, 'TRAINING', 3)).toMatchObject({
        completionPct: 0,
        instructorApproved: false,
        bestScore: 50,
      });
    });

    it('presença = sessões com presença / sessões inscritas; horas somadas sem carga horária', async () => {
      prisma.training.findUnique.mockResolvedValue({ ...training, workloadHours: null });
      prisma.trainingParticipant.findMany.mockResolvedValue([
        { status: 'ATTENDED', finalScore: null, attendedHours: 2 },
        { status: 'ABSENT', finalScore: null, attendedHours: null },
        { status: 'ATTENDED', finalScore: null, attendedHours: 2 },
        { status: 'REGISTERED', finalScore: null, attendedHours: null },
      ]);
      expect(await svc.collect(1, 'TRAINING', 3)).toMatchObject({
        completionPct: 0,
        attendancePct: 50,
        hours: 4,
      });
    });

    it('sem inscrição → presença desconhecida e 0% concluído', async () => {
      prisma.training.findUnique.mockResolvedValue(training);
      prisma.trainingParticipant.findMany.mockResolvedValue([]);
      expect(await svc.collect(1, 'TRAINING', 3)).toMatchObject({
        completionPct: 0,
        attendancePct: null,
      });
    });

    describe('modos de conclusão', () => {
      const rows = (statuses: string[]) =>
        statuses.map(status => ({ status, finalScore: null, attendedHours: null }));

      it('ATTENDANCE: presença >= mínima conclui sem COMPLETED marcado', async () => {
        prisma.training.findUnique.mockResolvedValue({
          ...training,
          completionMode: 'ATTENDANCE',
          minAttendancePercent: 75,
        });
        prisma.trainingParticipant.findMany.mockResolvedValue(
          rows(['ATTENDED', 'ATTENDED', 'ATTENDED', 'ATTENDED']),
        );
        expect(await svc.collect(1, 'TRAINING', 3)).toMatchObject({
          completionPct: 100,
          attendancePct: 100,
        });
      });

      it('ATTENDANCE: presença abaixo da mínima não conclui, mesmo com COMPLETED', async () => {
        prisma.training.findUnique.mockResolvedValue({
          ...training,
          completionMode: 'ATTENDANCE',
          minAttendancePercent: 75,
        });
        prisma.trainingParticipant.findMany.mockResolvedValue(
          rows(['COMPLETED', 'ABSENT', 'ABSENT']),
        );
        expect((await svc.collect(1, 'TRAINING', 3)).completionPct).toBe(0);
      });

      it('HYBRID: exige presença mínima E COMPLETED marcado', async () => {
        prisma.training.findUnique.mockResolvedValue({
          ...training,
          completionMode: 'HYBRID',
          minAttendancePercent: 75,
        });
        prisma.trainingParticipant.findMany.mockResolvedValue(rows(['ATTENDED', 'ATTENDED']));
        expect((await svc.collect(1, 'TRAINING', 3)).completionPct).toBe(0);
        prisma.trainingParticipant.findMany.mockResolvedValue(rows(['ATTENDED', 'COMPLETED']));
        expect((await svc.collect(1, 'TRAINING', 3)).completionPct).toBe(100);
      });

      it('MANUAL ignora a presença', async () => {
        prisma.training.findUnique.mockResolvedValue(training);
        prisma.trainingParticipant.findMany.mockResolvedValue(rows(['ATTENDED', 'ATTENDED']));
        expect((await svc.collect(1, 'TRAINING', 3)).completionPct).toBe(0);
      });
    });

    it('formação inexistente → NotFound', async () => {
      prisma.training.findUnique.mockResolvedValue(null);
      await expect(svc.collect(1, 'TRAINING', 3)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('LEARNING_PATH', () => {
    it('100% quando todos os cursos obrigatórios estão concluídos', async () => {
      prisma.learningPath.findUnique.mockResolvedValue({
        title: 'Trilha',
        totalHours: 12,
        courses: [{ courseId: 1 }, { courseId: 2 }],
        trainings: [],
      });
      prisma.enrollment.count.mockResolvedValue(2);
      expect(await svc.collect(1, 'LEARNING_PATH', 5)).toMatchObject({
        completionPct: 100,
        hours: 12,
        title: 'Trilha',
      });
    });

    it('parcial → percentagem proporcional (nunca 100)', async () => {
      prisma.learningPath.findUnique.mockResolvedValue({
        title: 'Trilha',
        totalHours: 0,
        courses: [{ courseId: 1 }, { courseId: 2 }, { courseId: 3 }],
        trainings: [],
      });
      prisma.enrollment.count.mockResolvedValue(2);
      expect(await svc.collect(1, 'LEARNING_PATH', 5)).toMatchObject({
        completionPct: 67,
        hours: null,
      });
    });

    it('trilha sem cursos obrigatórios nunca conta como concluída', async () => {
      prisma.learningPath.findUnique.mockResolvedValue({
        title: 'Vazia',
        totalHours: 0,
        courses: [],
        trainings: [],
      });
      expect((await svc.collect(1, 'LEARNING_PATH', 5)).completionPct).toBe(0);
      expect(prisma.enrollment.count).not.toHaveBeenCalled();
    });

    it('conta formações obrigatórias segundo o modo de conclusão de cada uma', async () => {
      prisma.learningPath.findUnique.mockResolvedValue({
        title: 'Mista',
        totalHours: 0,
        courses: [{ courseId: 1 }],
        trainings: [{ trainingId: 3 }],
      });
      prisma.enrollment.count.mockResolvedValue(1);
      prisma.training.findUnique.mockResolvedValue({
        title: 'F',
        workloadHours: null,
        passingScore: 70,
        completionMode: 'MANUAL',
        minAttendancePercent: 75,
      });
      prisma.trainingParticipant.findMany.mockResolvedValue([
        { status: 'COMPLETED', finalScore: null, attendedHours: null },
      ]);
      expect((await svc.collect(1, 'LEARNING_PATH', 5)).completionPct).toBe(100);

      prisma.trainingParticipant.findMany.mockResolvedValue([]);
      expect((await svc.collect(1, 'LEARNING_PATH', 5)).completionPct).toBe(50);
    });

    it('trilha inexistente → NotFound', async () => {
      prisma.learningPath.findUnique.mockResolvedValue(null);
      await expect(svc.collect(1, 'LEARNING_PATH', 5)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

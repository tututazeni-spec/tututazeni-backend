import { NotFoundException, NotImplementedException } from '@nestjs/common';
import { CertificateFactsService } from './certificate-facts.service';

describe('CertificateFactsService', () => {
  const prisma = {
    course: { findUnique: jest.fn() },
    enrollment: { findUnique: jest.fn() },
    quizAttempt: { aggregate: jest.fn() },
    event: { findUnique: jest.fn() },
    eventParticipant: { findUnique: jest.fn() },
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

  it('TRAINING e LEARNING_PATH → NotImplemented (pendência documentada)', async () => {
    await expect(svc.collect(1, 'TRAINING', 1)).rejects.toBeInstanceOf(NotImplementedException);
    await expect(svc.collect(1, 'LEARNING_PATH', 1)).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });
});

import { ConflictException, NotFoundException } from '@nestjs/common';
import { CertificateRecyclingService } from './certificate-recycling.service';

const DAY = 86_400_000;

describe('CertificateRecyclingService', () => {
  const tx = {
    enrollment: { updateMany: jest.fn() },
    enrollmentRun: { updateMany: jest.fn(), create: jest.fn() },
    lessonProgress: { deleteMany: jest.fn() },
  };
  const prisma = {
    enrollment: { findUnique: jest.fn() },
    certificate: { findFirst: jest.fn(), findMany: jest.fn() },
    course: { findMany: jest.fn() },
    enrollmentRun: { findMany: jest.fn() },
    notificationLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const svc = new CertificateRecyclingService(prisma as never, audit as never);

  const enrollment = (over: Record<string, unknown> = {}) => ({
    id: 10,
    userId: 5,
    courseId: 2,
    cycle: 1,
    status: 'COMPLETED',
    progress: 100,
    course: { title: 'Segurança', recyclingMode: 'MANUAL' },
    ...over,
  });
  const auto = { title: 'x', recyclingMode: 'AUTOMATIC' };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
    tx.enrollment.updateMany.mockResolvedValue({ count: 1 });
    tx.enrollmentRun.updateMany.mockResolvedValue({ count: 1 });
    tx.enrollmentRun.create.mockResolvedValue({});
    tx.lessonProgress.deleteMany.mockResolvedValue({ count: 3 });
    prisma.certificate.findFirst.mockResolvedValue({ id: 99, expiresAt: null });
    prisma.notificationLog.create.mockResolvedValue({});
    audit.log.mockResolvedValue(undefined);
  });

  describe('recycle', () => {
    it('matrícula inexistente → 404', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(null);
      await expect(svc.recycle(10, { reason: 'MANUAL' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('curso com reciclagem OFF → 409 e nada é escrito', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(
        enrollment({ course: { title: 'x', recyclingMode: 'OFF' } }),
      );
      await expect(svc.recycle(10, { reason: 'MANUAL' })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reciclagem automática exige o modo AUTOMATIC', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(enrollment());
      await expect(svc.recycle(10, { reason: 'EXPIRY_AUTO' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('matrícula ainda em curso → 409', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(enrollment({ status: 'IN_PROGRESS' }));
      await expect(svc.recycle(10, { reason: 'MANUAL' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('abre a realização 2: reinicia a matrícula, fecha a 1 e limpa o progresso das aulas', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(enrollment());
      const r = await svc.recycle(10, { reason: 'MANUAL', actorId: 3 });
      expect(r).toEqual({ outcome: 'STARTED', enrollmentId: 10, cycle: 2 });
      expect(tx.enrollment.updateMany).toHaveBeenCalledWith({
        where: { id: 10, cycle: 1, status: 'COMPLETED' },
        data: expect.objectContaining({ cycle: 2, status: 'NOT_STARTED', progress: 0 }),
      });
      expect(tx.enrollmentRun.create.mock.calls[0][0].data).toMatchObject({
        enrollmentId: 10,
        cycle: 2,
        reason: 'MANUAL',
        triggeredById: 3,
        fromCertificateId: 99,
      });
      expect(tx.lessonProgress.deleteMany).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ENROLLMENT_RECYCLED' }),
      );
    });

    it('o prazo da nova realização é a validade do certificado anterior, se futura', async () => {
      const expiresAt = new Date(Date.now() + 10 * DAY);
      prisma.certificate.findFirst.mockResolvedValue({ id: 99, expiresAt });
      prisma.enrollment.findUnique.mockResolvedValue(enrollment());
      await svc.recycle(10, { reason: 'MANUAL' });
      expect(tx.enrollment.updateMany.mock.calls[0][0].data.deadline).toEqual(expiresAt);
    });

    it('perda do claim (outra chamada ganhou) → ALREADY_RECYCLED sem efeitos', async () => {
      prisma.enrollment.findUnique.mockResolvedValue(enrollment());
      tx.enrollment.updateMany.mockResolvedValue({ count: 0 });
      const r = await svc.recycle(10, { reason: 'MANUAL' });
      expect(r.outcome).toBe('ALREADY_RECYCLED');
      expect(tx.enrollmentRun.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });
  });

  describe('runAutomatic', () => {
    const now = new Date('2026-10-20T07:00:00Z');

    it('procura certificados a expirar dentro da antecedência de cada curso AUTOMATIC', async () => {
      prisma.course.findMany.mockResolvedValue([{ id: 2, recyclingLeadDays: 15 }]);
      prisma.certificate.findMany.mockResolvedValue([]);
      await svc.runAutomatic(now);
      expect(prisma.course.findMany.mock.calls[0][0].where).toEqual({ recyclingMode: 'AUTOMATIC' });
      expect(prisma.certificate.findMany.mock.calls[0][0].where).toMatchObject({
        courseId: 2,
        revoked: false,
        expiresAt: { not: null, lte: new Date(now.getTime() + 15 * DAY) },
        enrollment: { status: 'COMPLETED' },
      });
    });

    it('ignora certificados de realizações anteriores e conta só as reciclagens iniciadas', async () => {
      prisma.course.findMany.mockResolvedValue([{ id: 2, recyclingLeadDays: 30 }]);
      prisma.certificate.findMany.mockResolvedValue([
        { enrollmentId: 10, enrollmentCycle: 2, enrollment: { cycle: 2 } },
        { enrollmentId: 11, enrollmentCycle: 1, enrollment: { cycle: 2 } },
      ]);
      prisma.enrollment.findUnique.mockResolvedValue(enrollment({ cycle: 2, course: auto }));
      const r = await svc.runAutomatic(now);
      expect(r.started).toBe(1);
      expect(prisma.enrollment.findUnique).toHaveBeenCalledTimes(1);
    });

    it('uma falha numa matrícula não impede as seguintes', async () => {
      prisma.course.findMany.mockResolvedValue([{ id: 2, recyclingLeadDays: 30 }]);
      prisma.certificate.findMany.mockResolvedValue([
        { enrollmentId: 10, enrollmentCycle: 1, enrollment: { cycle: 1 } },
        { enrollmentId: 12, enrollmentCycle: 1, enrollment: { cycle: 1 } },
      ]);
      prisma.enrollment.findUnique
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(enrollment({ id: 12, course: auto }));
      const r = await svc.runAutomatic(now);
      expect(r.started).toBe(1);
    });
  });

  describe('listRuns', () => {
    it('só o certificado válido mais recente é o vigente; os anteriores ficam no histórico', async () => {
      const future = new Date(Date.now() + 30 * DAY);
      const past = new Date(Date.now() - DAY);
      prisma.enrollmentRun.findMany.mockResolvedValue([{ cycle: 1 }, { cycle: 2 }]);
      prisma.certificate.findMany.mockResolvedValue([
        { id: 1, enrollmentCycle: 1, status: 'ACTIVE', revoked: false, expiresAt: past },
        { id: 2, enrollmentCycle: 2, status: 'ACTIVE', revoked: false, expiresAt: future },
      ]);
      const runs = await svc.listRuns(10);
      expect(runs[0].certificates).toEqual([expect.objectContaining({ id: 1, current: false })]);
      expect(runs[1].certificates).toEqual([expect.objectContaining({ id: 2, current: true })]);
    });

    it('certificado expirado nunca é vigente, mesmo sendo o único', async () => {
      prisma.enrollmentRun.findMany.mockResolvedValue([{ cycle: 1 }]);
      prisma.certificate.findMany.mockResolvedValue([
        {
          id: 1,
          enrollmentCycle: 1,
          status: 'ACTIVE',
          revoked: false,
          expiresAt: new Date(Date.now() - DAY),
        },
      ]);
      const runs = await svc.listRuns(10);
      expect(runs[0].certificates[0].current).toBe(false);
    });
  });
});

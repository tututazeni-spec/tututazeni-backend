import { LearningPathCertificationService } from './learning-path-certification.service';

describe('LearningPathCertificationService', () => {
  const prisma = {
    learningPathCourse: { findMany: jest.fn() },
    learningPathTraining: { findMany: jest.fn() },
    certificate: { findFirst: jest.fn() },
    learningPathEnrollment: { updateMany: jest.fn(), findMany: jest.fn() },
  };
  const facts = { collect: jest.fn() };
  const issuance = { issue: jest.fn() };
  const svc = new LearningPathCertificationService(
    prisma as never,
    facts as never,
    issuance as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    issuance.issue.mockResolvedValue({ outcome: 'ISSUED' });
    prisma.learningPathEnrollment.updateMany.mockResolvedValue({ count: 1 });
  });

  it('última unidade (curso) concluída → marca a inscrição COMPLETED e emite', async () => {
    prisma.learningPathCourse.findMany.mockResolvedValue([{ learningPathId: 5 }]);
    facts.collect.mockResolvedValue({ completionPct: 100 });

    const r = await svc.onCourseCompleted(7, 2);

    expect(r).toEqual([{ outcome: 'ISSUED' }]);
    expect(facts.collect).toHaveBeenCalledWith(7, 'LEARNING_PATH', 5);
    expect(prisma.learningPathEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 7, learningPathId: 5, status: { not: 'COMPLETED' } },
      }),
    );
    expect(issuance.issue).toHaveBeenCalledWith({
      userId: 7,
      activityKind: 'LEARNING_PATH',
      activityId: 5,
      trigger: 'AUTO',
    });
  });

  it('última unidade (formação) concluída → emite o certificado da trilha', async () => {
    prisma.learningPathTraining.findMany.mockResolvedValue([{ learningPathId: 9 }]);
    facts.collect.mockResolvedValue({ completionPct: 100 });

    expect(await svc.onTrainingCompleted(7, 4)).toEqual([{ outcome: 'ISSUED' }]);
    expect(prisma.learningPathTraining.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { trainingId: 4, required: true } }),
    );
  });

  it('ainda faltam unidades obrigatórias → não emite nem conclui a trilha', async () => {
    prisma.learningPathCourse.findMany.mockResolvedValue([{ learningPathId: 5 }]);
    facts.collect.mockResolvedValue({ completionPct: 67 });

    expect(await svc.onCourseCompleted(7, 1)).toEqual([]);
    expect(issuance.issue).not.toHaveBeenCalled();
    expect(prisma.learningPathEnrollment.updateMany).not.toHaveBeenCalled();
  });

  it('unidade que não pertence a nenhuma trilha obrigatória → nada a fazer', async () => {
    prisma.learningPathCourse.findMany.mockResolvedValue([]);
    expect(await svc.onCourseCompleted(7, 99)).toEqual([]);
    expect(issuance.issue).not.toHaveBeenCalled();
  });

  it('erro numa trilha não propaga nem impede as restantes', async () => {
    prisma.learningPathCourse.findMany.mockResolvedValue([
      { learningPathId: 5 },
      { learningPathId: 6 },
    ]);
    facts.collect
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ completionPct: 100 });

    expect(await svc.onCourseCompleted(7, 1)).toEqual([{ outcome: 'ISSUED' }]);
    expect(issuance.issue).toHaveBeenCalledTimes(1);
  });

  describe('reconcile', () => {
    const enrollments = [
      { userId: 1, learningPathId: 5 },
      { userId: 2, learningPathId: 5 },
      { userId: 3, learningPathId: 5 },
    ];

    it('simulação (por defeito) relata elegíveis e ignora quem já tem certificado, sem emitir', async () => {
      prisma.learningPathEnrollment.findMany.mockResolvedValue(enrollments);
      facts.collect
        .mockResolvedValueOnce({ completionPct: 100 })
        .mockResolvedValueOnce({ completionPct: 50 })
        .mockResolvedValueOnce({ completionPct: 100 });
      prisma.certificate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 9 });

      expect(await svc.reconcile(5)).toEqual({
        dryRun: true,
        checked: 3,
        eligible: 1,
        issued: 0,
        items: [
          { userId: 1, learningPathId: 5, outcome: 'ELIGIBLE' },
          { userId: 3, learningPathId: 5, outcome: 'SKIPPED' },
        ],
      });
      expect(issuance.issue).not.toHaveBeenCalled();
      expect(prisma.learningPathEnrollment.updateMany).not.toHaveBeenCalled();
    });

    it('dryRun=false emite e conta as emissões', async () => {
      prisma.learningPathEnrollment.findMany.mockResolvedValue(enrollments.slice(0, 2));
      facts.collect
        .mockResolvedValueOnce({ completionPct: 100 })
        .mockResolvedValueOnce({ completionPct: 50 });

      expect(await svc.reconcile(5, false)).toMatchObject({
        dryRun: false,
        checked: 2,
        issued: 1,
        items: [{ userId: 1, learningPathId: 5, outcome: 'ISSUED' }],
      });
    });
  });
});

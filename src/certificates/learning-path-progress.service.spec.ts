import { LearningPathProgressService } from './learning-path-progress.service';

describe('LearningPathProgressService', () => {
  const prisma = {
    learningPathEnrollment: { findMany: jest.fn() },
    enrollment: { findMany: jest.fn() },
    certificate: { findMany: jest.fn() },
  };
  const facts = { trainingCompleted: jest.fn() };
  const svc = new LearningPathProgressService(prisma as never, facts as never);

  const path = {
    id: 5,
    title: 'Liderança',
    courses: [
      { courseId: 1, required: true, course: { title: 'Curso A' } },
      { courseId: 2, required: false, course: { title: 'Curso B' } },
    ],
    trainings: [{ trainingId: 9, required: true, training: { title: 'Workshop' } }],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificate.findMany.mockResolvedValue([]);
  });

  it('sem inscrições em trilhas → lista vazia, sem consultas adicionais', async () => {
    prisma.learningPathEnrollment.findMany.mockResolvedValue([]);
    expect(await svc.mine(1)).toEqual([]);
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });

  it('percentagem conta só as unidades obrigatórias (cursos + formações)', async () => {
    prisma.learningPathEnrollment.findMany.mockResolvedValue([{ learningPath: path }]);
    prisma.enrollment.findMany.mockResolvedValue([{ courseId: 1 }]);
    facts.trainingCompleted.mockResolvedValue(false);

    const [p] = await svc.mine(1);

    expect(p.completionPct).toBe(50);
    expect(p.units.map(u => [u.kind, u.done])).toEqual([
      ['COURSE', true],
      ['COURSE', false],
      ['TRAINING', false],
    ]);
    expect(p.certificate).toBeNull();
  });

  it('trilha concluída traz o estado do certificado emitido', async () => {
    prisma.learningPathEnrollment.findMany.mockResolvedValue([{ learningPath: path }]);
    prisma.enrollment.findMany.mockResolvedValue([{ courseId: 1 }]);
    facts.trainingCompleted.mockResolvedValue(true);
    prisma.certificate.findMany.mockResolvedValue([
      { id: 77, activityId: 5, status: 'ACTIVE', revoked: false, expiresAt: null },
    ]);

    const [p] = await svc.mine(1);

    expect(p.completionPct).toBe(100);
    expect(p.certificate).toEqual({ id: 77, status: 'ACTIVE' });
  });
});

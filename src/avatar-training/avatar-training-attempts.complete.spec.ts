// Conclusão de tentativas (docs/Avatar_Training.md §10, §16): etapas obrigatórias,
// submissão/revisão, avaliação formal, aprovação/reprovação e a garantia de que
// concluir a sessão nunca conclui o curso (só leitura do estado oficial).
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AvatarTrainingAttemptsService } from './avatar-training-attempts.service';
import { AvatarTrainingAssessmentsService } from './avatar-training-assessments.service';

const USER = { id: 1, role: { name: 'COLABORADOR' } } as any;

const stepsConfig = (steps: unknown[]) => JSON.stringify({ steps });
const CONTENT = { key: 'a', title: 'Introdução', type: 'CONTENT' };
const QUESTION = {
  key: 'q',
  title: 'Pergunta',
  type: 'QUESTION',
  question: { kind: 'SINGLE', options: ['x', 'y'], correctAnswer: 'x' },
};

function attemptFixture(over: Record<string, unknown> = {}, steps: unknown[] = [CONTENT]) {
  return {
    id: 10,
    userId: 1,
    status: 'IN_PROGRESS',
    score: null,
    reviewedById: null,
    currentStep: 0,
    assignment: {
      id: 5,
      sessionId: 7,
      enrollmentId: 3,
      assignedById: 9,
      developmentPlanActionId: null,
      onboardingTaskInstanceId: null,
      session: {
        title: 'Sessão X',
        contentConfig: stepsConfig(steps),
        program: { id: 2, title: 'Formação Y' },
      },
    },
    ...over,
  };
}

describe('AvatarTrainingAttemptsService.complete', () => {
  const prisma: any = {
    avatarTrainingAttempt: { findUnique: jest.fn(), update: jest.fn() },
    avatarTrainingAssignment: { update: jest.fn() },
    avatarTrainingAssessment: { findUnique: jest.fn() },
    avatarTrainingInteraction: { findMany: jest.fn() },
    enrollment: { update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as any)(prisma),
    ),
  };
  const audit = { log: jest.fn() };
  const integrations = {
    formalAssessmentResult: jest.fn(),
    courseStatus: jest.fn(),
    markEnrollmentStarted: jest.fn(),
  };
  const development = { onAttemptCompleted: jest.fn() };
  const notifications = { finished: jest.fn() };
  let svc: AvatarTrainingAttemptsService;

  const load = (a: unknown) => prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(a);
  const config = (c: Record<string, unknown> | null) =>
    prisma.avatarTrainingAssessment.findUnique.mockResolvedValue(c);
  const done = (...keys: string[]) =>
    prisma.avatarTrainingInteraction.findMany.mockResolvedValue(keys.map(stepKey => ({ stepKey })));

  beforeEach(() => {
    jest.clearAllMocks();
    config(null);
    done('a');
    integrations.courseStatus.mockResolvedValue({ id: 3, status: 'IN_PROGRESS' });
    development.onAttemptCompleted.mockResolvedValue({ competencies: [] });
    svc = new AvatarTrainingAttemptsService(
      prisma,
      audit as any,
      integrations as any,
      new AvatarTrainingAssessmentsService(prisma),
      development as any,
      notifications as any,
    );
  });

  it('não deixa concluir a tentativa de outro formando (IDOR)', async () => {
    load(attemptFixture({ userId: 99 }));
    await expect(svc.complete(USER, 10)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.avatarTrainingAttempt.update).not.toHaveBeenCalled();
  });

  it('tentativa inexistente → 404', async () => {
    load(null);
    await expect(svc.complete(USER, 10)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each(['COMPLETED', 'FAILED'])('tentativa já %s → conflito', async status => {
    load(attemptFixture({ status }));
    await expect(svc.complete(USER, 10)).rejects.toBeInstanceOf(ConflictException);
  });

  it('exige as etapas obrigatórias e nomeia as que faltam', async () => {
    load(attemptFixture({}, [CONTENT, { key: 'b', title: 'Passo B', type: 'CONTENT' }]));
    await expect(svc.complete(USER, 10)).rejects.toThrow(/Passo B/);
  });

  it('etapas marcadas como não obrigatórias não bloqueiam', async () => {
    load(
      attemptFixture({}, [
        CONTENT,
        { key: 'b', title: 'Extra', type: 'CONTENT', mandatory: false },
      ]),
    );
    await expect(svc.complete(USER, 10)).resolves.toMatchObject({ status: 'COMPLETED' });
  });

  it('com perguntas avaliáveis exige submissão antes de concluir', async () => {
    load(attemptFixture({ status: 'IN_PROGRESS' }, [CONTENT, QUESTION]));
    done('a', 'q');
    await expect(svc.complete(USER, 10)).rejects.toThrow(/Submeta a avaliação/);
  });

  it('com rubrica exige revisão do formador', async () => {
    config({ rubricConfig: JSON.stringify([{ key: 'c1', label: 'C1', weight: 100 }]) });
    load(attemptFixture({ status: 'SUBMITTED', reviewedById: null }));
    await expect(svc.complete(USER, 10)).rejects.toThrow(/aguarda revisão/);
  });

  it('avaliação formal obrigatória e não aprovada → conflito', async () => {
    config({ requireFormalAssessment: true, assessmentId: 4 });
    integrations.formalAssessmentResult.mockResolvedValue({ passed: false });
    load(attemptFixture());
    await expect(svc.complete(USER, 10)).rejects.toThrow(/avaliação formal/);
  });

  it('aprovado: conclui tentativa e atribuição, propaga desenvolvimento e não toca no curso', async () => {
    load(attemptFixture({ status: 'SUBMITTED', score: 80 }, [CONTENT, QUESTION]));
    done('a', 'q');
    const r = await svc.complete(USER, 10);

    expect(r).toMatchObject({ status: 'COMPLETED', passed: true, score: 80, passingScore: 70 });
    expect(prisma.avatarTrainingAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED', progress: 100 }),
      }),
    );
    expect(prisma.avatarTrainingAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
    expect(development.onAttemptCompleted).toHaveBeenCalledTimes(1);
    expect(notifications.finished).toHaveBeenCalledWith(expect.objectContaining({ passed: true }));
    // Concluir a sessão não conclui o curso: devolve-se o estado oficial, sem escrita.
    expect(r.course).toEqual({ id: 3, status: 'IN_PROGRESS' });
    expect(prisma.enrollment.update).not.toHaveBeenCalled();
    expect(prisma.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it('reprovado: FAILED, atribuição fica aberta e não alimenta competências/PDI', async () => {
    load(attemptFixture({ status: 'SUBMITTED', score: 50 }, [CONTENT, QUESTION]));
    done('a', 'q');
    const r = await svc.complete(USER, 10);

    expect(r).toMatchObject({ status: 'FAILED', passed: false });
    expect(prisma.avatarTrainingAssignment.update).not.toHaveBeenCalled();
    expect(development.onAttemptCompleted).not.toHaveBeenCalled();
    expect(notifications.finished).toHaveBeenCalledWith(expect.objectContaining({ passed: false }));
  });

  it('sem avaliação: conclui sem nota (passed = null, sem nota mínima)', async () => {
    load(attemptFixture());
    const r = await svc.complete(USER, 10);
    expect(r).toMatchObject({ status: 'COMPLETED', passed: null, passingScore: null });
  });

  it('regista auditoria da conclusão', async () => {
    load(attemptFixture());
    await svc.complete(USER, 10);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COMPLETE',
        entity: 'AvatarTrainingAttempt',
        entityId: 10,
      }),
    );
  });
});

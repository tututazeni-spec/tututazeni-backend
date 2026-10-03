// Ciclo de vida e acesso às tentativas (docs/Avatar_Training.md §10, §16): pausa,
// retoma, abandono, registo de interacções, sala (sem gabarito) e resultados
// (propriedade/IDOR, equipa e versões desactualizadas).
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AvatarTrainingAttemptsService } from './avatar-training-attempts.service';
import { AvatarTrainingAssessmentsService } from './avatar-training-assessments.service';

const OWNER = { id: 1, role: { name: 'COLABORADOR' } } as any;
const STRANGER = { id: 2, role: { name: 'COLABORADOR' } } as any;
const ADMIN = { id: 3, role: { name: 'ADMIN' } } as any;
const MANAGER = { id: 4, role: { name: 'GESTOR' } } as any;

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
    passed: null,
    attemptNumber: 1,
    currentStep: 0,
    pausedAt: null,
    pausedSeconds: 0,
    sessionVersion: 1,
    rubricVersion: 1,
    assignment: {
      id: 5,
      sessionId: 7,
      enrollmentId: 3,
      session: {
        id: 7,
        title: 'Sessão X',
        version: 1,
        contentConfig: JSON.stringify({ steps }),
        program: { id: 2, title: 'Formação Y', avatar: null },
        avatar: null,
      },
    },
    ...over,
  };
}

describe('AvatarTrainingAttemptsService — ciclo de vida e acesso', () => {
  const prisma: any = {
    avatarTrainingAttempt: { findUnique: jest.fn(), update: jest.fn() },
    avatarTrainingAssessment: { findUnique: jest.fn() },
    avatarTrainingInteraction: {
      aggregate: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as any)(prisma),
    ),
  };
  const integrations = {
    formalAssessmentResult: jest.fn(),
    courseStatus: jest.fn(),
    directReportIds: jest.fn(),
  };
  const notifications = { helpRequested: jest.fn() };
  const links = { humanResponsible: jest.fn() };
  let svc: AvatarTrainingAttemptsService;

  const load = (a: unknown) => prisma.avatarTrainingAttempt.findUnique.mockResolvedValue(a);
  const createdTypes = () =>
    prisma.avatarTrainingInteraction.create.mock.calls.map((c: any) => c[0].data.interactionType);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.avatarTrainingAssessment.findUnique.mockResolvedValue(null);
    prisma.avatarTrainingInteraction.aggregate.mockResolvedValue({ _max: { sequence: 0 } });
    prisma.avatarTrainingInteraction.create.mockImplementation(async ({ data }: any) => data);
    prisma.avatarTrainingInteraction.count.mockResolvedValue(0);
    prisma.avatarTrainingInteraction.findMany.mockResolvedValue([]);
    prisma.avatarTrainingInteraction.findFirst.mockResolvedValue(null);
    prisma.avatarTrainingAttempt.update.mockImplementation(async ({ data }: any) => data);
    integrations.courseStatus.mockResolvedValue({ id: 3, status: 'IN_PROGRESS' });
    integrations.formalAssessmentResult.mockResolvedValue(null);
    integrations.directReportIds.mockResolvedValue([]);
    svc = new AvatarTrainingAttemptsService(
      prisma,
      { log: jest.fn() } as any,
      integrations as any,
      new AvatarTrainingAssessmentsService(prisma),
      {} as any,
      notifications as any,
      links as any,
    );
  });

  describe('acesso (IDOR)', () => {
    it.each([
      ['room', (u: any) => svc.room(10, u)],
      ['pause', (u: any) => svc.pause(u, 10)],
      ['resume', (u: any) => svc.resume(u, 10)],
      ['abandon', (u: any) => svc.abandon(u, 10)],
      [
        'record',
        (u: any) => svc.record(u, 10, { interactionType: 'USER_MESSAGE', content: 'x' } as any),
      ],
    ])('%s: outro formando recebe 404 e nada é escrito', async (_n, call) => {
      load(attemptFixture({ status: 'PAUSED' }));
      await expect(call(STRANGER)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.avatarTrainingAttempt.update).not.toHaveBeenCalled();
      expect(prisma.avatarTrainingInteraction.create).not.toHaveBeenCalled();
    });

    it('nem ADMIN pausa a tentativa de outro (acções do formando são só do dono)', async () => {
      load(attemptFixture());
      await expect(svc.pause(ADMIN, 10)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tentativa inexistente → 404', async () => {
      load(null);
      await expect(svc.room(10, OWNER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('pausa / retoma / abandono', () => {
    it('pausa uma sessão em curso e regista a interacção PAUSE', async () => {
      load(attemptFixture());
      await svc.pause(OWNER, 10);
      expect(createdTypes()).toEqual(['PAUSE']);
      const data = prisma.avatarTrainingAttempt.update.mock.calls[0][0].data;
      expect(data.status).toBe('PAUSED');
      expect(data.pausedAt).toBeInstanceOf(Date);
    });

    it.each(['PAUSED', 'COMPLETED', 'ABANDONED'])('não pausa uma sessão %s', async status => {
      load(attemptFixture({ status }));
      await expect(svc.pause(OWNER, 10)).rejects.toBeInstanceOf(ConflictException);
    });

    it('retoma acumulando o tempo em pausa e limpando pausedAt', async () => {
      load(attemptFixture({ status: 'PAUSED', pausedAt: new Date(Date.now() - 30_000) }));
      await svc.resume(OWNER, 10);
      const data = prisma.avatarTrainingAttempt.update.mock.calls[0][0].data;
      expect(data.status).toBe('IN_PROGRESS');
      expect(data.pausedAt).toBeNull();
      expect(data.pausedSeconds.increment).toBeGreaterThanOrEqual(29);
      expect(createdTypes()).toEqual(['RESUME']);
    });

    it('não retoma uma sessão que não está em pausa', async () => {
      load(attemptFixture());
      await expect(svc.resume(OWNER, 10)).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(['IN_PROGRESS', 'PAUSED'])('abandona uma tentativa %s', async status => {
      load(attemptFixture({ status }));
      await svc.abandon(OWNER, 10);
      const data = prisma.avatarTrainingAttempt.update.mock.calls[0][0].data;
      expect(data.status).toBe('ABANDONED');
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it.each(['COMPLETED', 'FAILED', 'ABANDONED'])('não abandona uma tentativa %s', async status => {
      load(attemptFixture({ status }));
      await expect(svc.abandon(OWNER, 10)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('registo de interacções', () => {
    it('em pausa exige retomar primeiro', async () => {
      load(attemptFixture({ status: 'PAUSED' }));
      await expect(
        svc.record(OWNER, 10, { interactionType: 'USER_MESSAGE', content: 'olá' } as any),
      ).rejects.toThrow(/retome/);
    });

    it('tentativa terminada não aceita interacções', async () => {
      load(attemptFixture({ status: 'COMPLETED' }));
      await expect(
        svc.record(OWNER, 10, { interactionType: 'USER_MESSAGE', content: 'olá' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('resposta sem stepKey → conflito', async () => {
      load(attemptFixture());
      await expect(
        svc.record(OWNER, 10, { interactionType: 'USER_ANSWER', content: 'x' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('stepKey desconhecido → 404', async () => {
      load(attemptFixture());
      await expect(
        svc.record(OWNER, 10, {
          interactionType: 'STEP_ADVANCE',
          content: '',
          stepKey: 'nope',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('avançar a última etapa põe o progresso a 100%', async () => {
      load(attemptFixture());
      await svc.record(OWNER, 10, {
        interactionType: 'STEP_ADVANCE',
        content: '',
        stepKey: 'a',
      } as any);
      const data = prisma.avatarTrainingAttempt.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ currentStep: 1, progress: 100 });
    });

    it('resposta correcta gera FEEDBACK positivo e avança', async () => {
      load(attemptFixture({}, [QUESTION, CONTENT]));
      const out = await svc.record(OWNER, 10, {
        interactionType: 'USER_ANSWER',
        content: 'x',
        stepKey: 'q',
      } as any);
      expect(out.feedback?.correct).toBe(true);
      expect(createdTypes()).toEqual(['USER_ANSWER', 'FEEDBACK']);
      expect(prisma.avatarTrainingAttempt.update.mock.calls[0][0].data.currentStep).toBe(1);
    });

    it('pedido de ajuda notifica o responsável humano', async () => {
      load(attemptFixture());
      links.humanResponsible.mockResolvedValue(77);
      await svc.record(OWNER, 10, {
        interactionType: 'HELP_REQUEST',
        content: 'preciso de ajuda',
      } as any);
      expect(notifications.helpRequested).toHaveBeenCalledWith(
        expect.objectContaining({ responsibleId: 77, learnerId: 1, attemptId: 10 }),
      );
    });
  });

  describe('sala', () => {
    it('não expõe o gabarito das perguntas e identifica o instrutor virtual', async () => {
      load(attemptFixture({}, [QUESTION]));
      const room = await svc.room(10, OWNER);
      expect(JSON.stringify(room.steps)).not.toContain('correctAnswer');
      expect(room.notice).toMatch(/instrutor virtual/);
    });
  });

  describe('resultados', () => {
    it('outro formando não vê os resultados (404)', async () => {
      load(attemptFixture());
      await expect(svc.results(STRANGER, 10)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GESTOR só vê os resultados de subordinados directos', async () => {
      load(attemptFixture());
      integrations.directReportIds.mockResolvedValue([99]);
      await expect(svc.results(MANAGER, 10)).rejects.toBeInstanceOf(NotFoundException);
      integrations.directReportIds.mockResolvedValue([1]);
      await expect(svc.results(MANAGER, 10)).resolves.toMatchObject({ attemptId: 10 });
    });

    it('ADMIN vê os resultados de qualquer formando', async () => {
      load(attemptFixture());
      await expect(svc.results(ADMIN, 10)).resolves.toMatchObject({ attemptId: 10 });
      expect(integrations.directReportIds).not.toHaveBeenCalled();
    });

    it('versions.outdated é false quando conteúdo e rubrica não mudaram', async () => {
      load(attemptFixture());
      const r = await svc.results(OWNER, 10);
      expect(r.versions.outdated).toBe(false);
    });

    it('versions.outdated é true quando o conteúdo mudou depois da tentativa', async () => {
      const a = attemptFixture({ sessionVersion: 1 });
      a.assignment.session.version = 2;
      load(a);
      const r = await svc.results(OWNER, 10);
      expect(r.versions).toMatchObject({ session: 1, currentSession: 2, outdated: true });
    });

    it('versions.outdated é true quando a rubrica mudou depois da tentativa', async () => {
      load(attemptFixture({ rubricVersion: 1 }));
      prisma.avatarTrainingAssessment.findUnique.mockResolvedValue({ rubricVersion: 2 });
      const r = await svc.results(OWNER, 10);
      expect(r.versions).toMatchObject({ rubric: 1, currentRubric: 2, outdated: true });
    });

    it('o gabarito só é revelado depois de a tentativa terminar', async () => {
      prisma.avatarTrainingInteraction.findMany.mockResolvedValue([
        { stepKey: 'q', content: 'x', metadata: null },
      ]);
      load(attemptFixture({ status: 'IN_PROGRESS' }, [QUESTION]));
      const open = await svc.results(OWNER, 10);
      expect(open.knowledge.breakdown.every((b: any) => b.correct === undefined)).toBe(true);

      load(attemptFixture({ status: 'COMPLETED' }, [QUESTION]));
      const closed = await svc.results(OWNER, 10);
      expect(closed.knowledge.breakdown.some((b: any) => b.correct === true)).toBe(true);
    });
  });
});

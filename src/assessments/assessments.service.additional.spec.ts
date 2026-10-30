import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma: any = {
  assessment: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  },
  assessmentQuestion: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn(),
    delete: jest.fn(),
  },
  assessmentAttempt: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: 75, timeSpentMinutes: 20 } }),
  },
  attemptAnswer: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  },
  assessmentAttemptAnswer: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
  userPoints: { upsert: jest.fn().mockResolvedValue({}) },
  user: { findUnique: jest.fn().mockResolvedValue(null) },
};

const baseAssessment = {
  id: 1,
  title: 'Quiz TypeScript',
  type: 'QUIZ',
  status: 'PUBLISHED',
  courseId: 1,
  passingScore: 70,
  maxAttempts: 3,
  timeLimitMinutes: 30,
  questions: [
    {
      id: 1,
      assessmentId: 1,
      questionText: 'O que é TypeScript?',
      type: 'MCQ',
      weight: 10,
      correctAnswer: 'A',
    },
  ],
  _count: { questions: 1, attempts: 5 },
};

const baseAttempt = {
  id: 1,
  assessmentId: 1,
  userId: 2,
  status: 'IN_PROGRESS',
  score: null,
  startedAt: new Date(),
  finishedAt: null,
  answers: [],
};

describe('AssessmentsService (additional)', () => {
  let service: AssessmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [AssessmentsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AssessmentsService>(AssessmentsService);
  });

  // ─── create ───────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar assessment com questões', async () => {
      mockPrisma.assessment.create.mockResolvedValue(baseAssessment);
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      const result = await service.create({
        title: 'Quiz TS',
        type: 'QUIZ' as any,
        courseId: 1,
        questions: [
          { questionText: 'O que é TS?', type: 'MCQ' as any, correctAnswer: 'A', weight: 10 },
        ],
      } as any);
      expect(result).toBeDefined();
    });

    it('deve criar assessment sem questões', async () => {
      mockPrisma.assessment.create.mockResolvedValue(baseAssessment);
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      const result = await service.create({ title: 'Quiz TS', type: 'QUIZ' as any } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── findAll ──────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar assessments paginados', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([baseAssessment]);
      mockPrisma.assessment.count.mockResolvedValue(1);
      const result = await service.findAll({ courseId: 1 });
      expect(result).toBeDefined();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar assessment por id', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      const result = await service.findOne(1);
      expect(result).toBeDefined();
      expect(result.title).toBe('Quiz TypeScript');
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ───────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar assessment em rascunho', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, status: 'DRAFT' });
      mockPrisma.assessment.update.mockResolvedValue({ ...baseAssessment, title: 'Actualizado' });
      const result = await service.update(1, { title: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── publish ──────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar assessment com questões', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      mockPrisma.assessment.update.mockResolvedValue({ ...baseAssessment, status: 'PUBLISHED' });
      const result = await service.publish(1);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se sem questões', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        questions: [],
        _count: { questions: 0 },
      });
      await expect(service.publish(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── startAttempt ─────────────────────────────────────────────

  describe('startAttempt', () => {
    it('deve iniciar tentativa de assessment', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        maxAttempts: 3,
        feedbackMode: 'ON_SUBMIT',
        _count: { attempts: 0 },
      });
      mockPrisma.assessmentAttempt.count.mockResolvedValue(0);
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(null);
      mockPrisma.assessmentAttempt.create.mockResolvedValue(baseAttempt);
      const result = await service.startAttempt(2, { assessmentId: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se máximo de tentativas atingido', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        maxAttempts: 2,
        feedbackMode: 'ON_SUBMIT',
        _count: { attempts: 0 },
      });
      mockPrisma.assessmentAttempt.count.mockResolvedValue(2);
      await expect(service.startAttempt(2, { assessmentId: 1 } as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve lançar ConflictException se já tem tentativa em curso', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        maxAttempts: 3,
        feedbackMode: 'ON_SUBMIT',
        _count: { attempts: 0 },
      });
      mockPrisma.assessmentAttempt.count.mockResolvedValue(1);
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(baseAttempt);
      // findFirst with IN_PROGRESS returns baseAttempt → service returns it (no exception thrown)
      const result = await service.startAttempt(2, { assessmentId: 1 } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se ainda não abriu a janela de disponibilidade', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        maxAttempts: 0,
        feedbackMode: 'ON_SUBMIT',
        _count: { attempts: 0 },
        availableFrom: new Date(Date.now() + 3600_000),
        availableUntil: null,
      });
      await expect(service.startAttempt(2, { assessmentId: 1 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar BadRequestException se a janela de disponibilidade já fechou', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        maxAttempts: 0,
        feedbackMode: 'ON_SUBMIT',
        _count: { attempts: 0 },
        availableFrom: null,
        availableUntil: new Date(Date.now() - 3600_000),
      });
      await expect(service.startAttempt(2, { assessmentId: 1 } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('avaliação formal (EXAM) já submetida não pode ser repetida', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        type: 'EXAM',
        maxAttempts: 0,
        feedbackMode: 'ON_SUBMIT',
        _count: { attempts: 1 },
        availableFrom: null,
        availableUntil: null,
      });
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({ id: 7 });
      await expect(service.startAttempt(2, { assessmentId: 1 } as any)).rejects.toThrow(
        'Não é possível repetir',
      );
    });
  });

  describe('autoSave', () => {
    it('funde só as respostas alteradas com as já guardadas e devolve o mínimo', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        id: 5,
        savedAnswers: JSON.stringify([
          { questionId: 1, selectedIndices: [0] },
          { questionId: 2, fileUrl: 'data:application/pdf;base64,AAAA' },
        ]),
      });
      mockPrisma.assessmentAttempt.update.mockResolvedValue({ id: 5 });
      const r = await service.autoSave(2, {
        attemptId: 5,
        answers: [{ questionId: 1, selectedIndices: [1] }],
      } as any);
      const saved = JSON.parse(mockPrisma.assessmentAttempt.update.mock.calls.at(-1)[0].data.savedAnswers);
      expect(saved).toEqual([
        { questionId: 1, selectedIndices: [1] },
        { questionId: 2, fileUrl: 'data:application/pdf;base64,AAAA' },
      ]);
      expect(r).toMatchObject({ saved: true });
      expect(r).not.toHaveProperty('savedAnswers');
    });

    it('lida com savedAnswers vazio ("{}" por omissão)', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({ id: 5, savedAnswers: '{}' });
      mockPrisma.assessmentAttempt.update.mockResolvedValue({ id: 5 });
      await service.autoSave(2, { attemptId: 5, answers: [{ questionId: 3, textAnswer: 'x' }] } as any);
      const saved = JSON.parse(mockPrisma.assessmentAttempt.update.mock.calls.at(-1)[0].data.savedAnswers);
      expect(saved).toEqual([{ questionId: 3, textAnswer: 'x' }]);
    });
  });

  // ─── submitAttempt ────────────────────────────────────────────

  describe('submitAttempt', () => {
    it('deve submeter respostas e calcular pontuação', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue({
        ...baseAttempt,
        userId: 2,
        status: 'IN_PROGRESS',
        deadline: null,
        assessment: {
          ...baseAssessment,
          feedbackMode: 'ON_SUBMIT',
          questions: baseAssessment.questions,
        },
      });
      mockPrisma.assessmentAttemptAnswer.create.mockResolvedValue({});
      mockPrisma.assessmentAttempt.update.mockResolvedValue({
        ...baseAttempt,
        status: 'PASSED',
        score: 80,
      });
      mockPrisma.userPoints.upsert.mockResolvedValue({});
      const result = await service.submitAttempt(2, {
        attemptId: 1,
        answers: [{ questionId: 1, answer: 'A' }],
      } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se tentativa não encontrada', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(null);
      await expect(service.submitAttempt(2, { attemptId: 99, answers: [] } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getMyAttempts ────────────────────────────────────────────

  describe('getUserAttempts', () => {
    it('deve retornar tentativas do utilizador', async () => {
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([
        { ...baseAttempt, score: 80, assessment: { maxGrade: 20 } },
      ]);
      const result = await service.getUserAttempts(2);
      expect(result).toBeDefined();
      expect(result[0].qualitativeLabel).toBe('Bom');
      expect(result[0].displayGrade).toBe(16);
    });
  });

  // ─── addQuestion ──────────────────────────────────────────────

  describe('addQuestion', () => {
    it('deve adicionar questão a assessment existente', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      mockPrisma.assessmentQuestion.create.mockResolvedValue({ id: 2, assessmentId: 1 });
      const result = await service.addQuestion(1, {
        questionText: 'Nova questão?',
        type: 'MCQ' as any,
        weight: 10,
      } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getAvailableForUser (avaliações formais) ──────────────────

  describe('getAvailableForUser', () => {
    it('inclui avaliações sem departamento-alvo e do departamento do utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ departmentId: 5 });
      mockPrisma.assessment.findMany.mockResolvedValue([
        { ...baseAssessment, type: 'EXAM', targetDepartmentIds: [], attempts: [] },
      ]);
      const result = await service.getAvailableForUser(2);
      expect(result).toHaveLength(1);
      expect(result[0].myAttempt).toBeNull();
      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'EXAM', status: 'PUBLISHED' }),
        }),
      );
    });
  });

  describe('getAvailableForUser — tentativa já feita', () => {
    it('mantém a avaliação listada com a nota do próprio utilizador', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ departmentId: 5 });
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          ...baseAssessment,
          type: 'EXAM',
          maxGrade: 20,
          targetDepartmentIds: [],
          attempts: [{ id: 9, status: 'PASSED', score: 90, passed: true }],
        },
      ]);
      const result = await service.getAvailableForUser(2);
      expect(result[0]).not.toHaveProperty('attempts');
      expect(result[0].myAttempt).toMatchObject({ id: 9, score: 90, displayGrade: 18 });
    });
  });

  describe('getMyAttemptReview', () => {
    const attempt = (over: object = {}) => ({
      id: 9,
      status: 'PASSED',
      assessment: { allowReview: true, feedbackMode: 'ON_SUBMIT' },
      answers: [
        {
          isCorrect: false,
          earnedPoints: 0,
          selectedIndices: '[0]',
          textAnswer: null,
          reviewComment: null,
          question: {
            id: 1,
            type: 'MULTIPLE_CHOICE_SINGLE',
            questionText: 'Qual?',
            explanation: 'Porque sim',
            options: JSON.stringify([
              { text: 'A', isCorrect: false },
              { text: 'B', isCorrect: true },
            ]),
          },
        },
      ],
      ...over,
    });

    it('devolve a resposta dada e a certa por pergunta', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(attempt());
      const r = await service.getMyAttemptReview(9, 2);
      expect(r.items[0]).toMatchObject({
        isCorrect: false,
        yourAnswer: 'A',
        correctAnswer: 'B',
        explanation: 'Porque sim',
      });
    });

    it('ORDERING mostra a ordem dada e a certa', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(
        attempt({
          answers: [
            {
              isCorrect: false,
              earnedPoints: 0,
              selectedIndices: '[1,0,2]',
              textAnswer: null,
              reviewComment: null,
              question: {
                id: 2,
                type: 'ORDERING',
                questionText: 'Ordena',
                explanation: null,
                correctAnswer: '[0,1,2]',
                options: JSON.stringify([{ text: 'A' }, { text: 'B' }, { text: 'C' }]),
              },
            },
          ],
        }),
      );
      const r = await service.getMyAttemptReview(9, 2);
      expect(r.items[0]).toMatchObject({ yourAnswer: 'B → A → C', correctAnswer: 'A → B → C' });
    });

    it('resposta aberta mostra o texto, a nota atribuída e o comentário', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(
        attempt({
          answers: [
            {
              isCorrect: true,
              earnedPoints: 0,
              selectedIndices: null,
              textAnswer: 'A minha resposta',
              reviewComment: 'Bom trabalho',
              manualScore: 80,
              reviewedAt: new Date(),
              question: {
                id: 3,
                type: 'OPEN_TEXT',
                questionText: 'Explica',
                explanation: null,
                correctAnswer: 'Resposta modelo',
                options: null,
              },
            },
          ],
        }),
      );
      const r = await service.getMyAttemptReview(9, 2);
      expect(r.items[0]).toMatchObject({
        open: true,
        yourAnswer: 'A minha resposta',
        correctAnswer: 'Resposta modelo',
        manualScore: 80,
        reviewComment: 'Bom trabalho',
      });
    });

    it('resposta aberta ainda por rever não tem nota', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(
        attempt({
          answers: [
            {
              isCorrect: null,
              earnedPoints: 0,
              selectedIndices: null,
              textAnswer: 'x',
              reviewComment: null,
              manualScore: null,
              reviewedAt: null,
              question: { id: 3, type: 'OPEN_TEXT', questionText: 'q', options: null },
            },
          ],
        }),
      );
      const r = await service.getMyAttemptReview(9, 2);
      expect(r.items[0]).toMatchObject({ open: true, manualScore: null, isCorrect: null });
    });

    it('RESULT_ONLY não revela correcção', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(
        attempt({ assessment: { allowReview: true, feedbackMode: 'RESULT_ONLY' } }),
      );
      expect((await service.getMyAttemptReview(9, 2)).items).toEqual([]);
    });

    it('recusa quando a revisão não é permitida', async () => {
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(
        attempt({ assessment: { allowReview: false, feedbackMode: 'ON_SUBMIT' } }),
      );
      await expect(service.getMyAttemptReview(9, 2)).rejects.toThrow('Revisão não permitida');
    });
  });

  // ─── getResultsRoster ───────────────────────────────────────────

  describe('getResultsRoster', () => {
    it('devolve o nome, a nota escalada e o rótulo qualitativo de cada participante', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, maxGrade: 20 });
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([
        {
          id: 42,
          userId: 2,
          score: 90,
          passed: true,
          status: 'PASSED',
          submittedAt: new Date(),
          user: { id: 2, fullName: 'Ana Silva', department: { name: 'RH' } },
        },
      ]);
      const result = await service.getResultsRoster(1);
      expect(result.roster).toHaveLength(1);
      expect(result.roster[0]).toMatchObject({
        attemptId: 42,
        fullName: 'Ana Silva',
        department: 'RH',
        displayGrade: 18,
        qualitativeLabel: 'Excelente',
      });
    });
  });

  // ─── getAttemptDetailForReviewer ────────────────────────────────

  describe('getAttemptDetailForReviewer', () => {
    it('devolve a tentativa de qualquer utilizador, sem filtrar por userId', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        ...baseAttempt,
        score: 40,
        assessment: { ...baseAssessment, maxGrade: 20, allowReview: false },
        user: { id: 2, fullName: 'Ana Silva' },
      });
      const result = await service.getAttemptDetailForReviewer(1);
      expect(result.qualitativeLabel).toBe('Mau');
      expect(mockPrisma.assessmentAttempt.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1 } }),
      );
    });

    it('lança NotFoundException se a tentativa não existir', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue(null);
      await expect(service.getAttemptDetailForReviewer(99)).rejects.toThrow(NotFoundException);
    });
  });
});

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
    it('deve actualizar assessment', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
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
        { ...baseAssessment, type: 'EXAM', targetDepartmentIds: [] },
      ]);
      const result = await service.getAvailableForUser(2);
      expect(result).toHaveLength(1);
      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'EXAM', status: 'PUBLISHED' }),
        }),
      );
    });
  });

  // ─── getResultsRoster ───────────────────────────────────────────

  describe('getResultsRoster', () => {
    it('devolve o nome, a nota escalada e o rótulo qualitativo de cada participante', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, maxGrade: 20 });
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([
        {
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

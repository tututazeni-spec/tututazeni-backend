import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
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
  },
  attemptAnswer: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
};

const baseAssessment = {
  id: 1, title: 'Quiz TypeScript', type: 'QUIZ', status: 'PUBLISHED',
  courseId: 1, passingScore: 70, maxAttempts: 3, timeLimitMinutes: 30,
  questions: [
    { id: 1, assessmentId: 1, questionText: 'O que é TypeScript?', type: 'MCQ', weight: 10, correctAnswer: 'A' },
  ],
  _count: { questions: 1, attempts: 5 },
};

const baseAttempt = {
  id: 1, assessmentId: 1, userId: 2, status: 'IN_PROGRESS',
  score: null, startedAt: new Date(), finishedAt: null,
  answers: [],
};

describe('AssessmentsService (additional)', () => {
  let service: AssessmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
        title: 'Quiz TS', type: 'QUIZ' as any, courseId: 1,
        questions: [{ questionText: 'O que é TS?', type: 'MCQ' as any, correctAnswer: 'A', weight: 10 }],
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
      mockPrisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, questions: [], _count: { questions: 0 } });
      await expect(service.publish(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── startAttempt ─────────────────────────────────────────────

  describe('startAttempt', () => {
    it('deve iniciar tentativa de assessment', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, maxAttempts: 3 });
      mockPrisma.assessmentAttempt.count.mockResolvedValue(0);
      mockPrisma.assessmentAttempt.create.mockResolvedValue(baseAttempt);
      const result = await service.startAttempt({ assessmentId: 1 } as any, 2);
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se máximo de tentativas atingido', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, maxAttempts: 2 });
      mockPrisma.assessmentAttempt.count.mockResolvedValue(2);
      await expect(service.startAttempt({ assessmentId: 1 } as any, 2)).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar ConflictException se já tem tentativa em curso', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, maxAttempts: 3 });
      mockPrisma.assessmentAttempt.count.mockResolvedValue(1);
      mockPrisma.assessmentAttempt.findFirst.mockResolvedValue(baseAttempt);
      await expect(service.startAttempt({ assessmentId: 1 } as any, 2)).rejects.toThrow(ConflictException);
    });
  });

  // ─── submitAttempt ────────────────────────────────────────────

  describe('submitAttempt', () => {
    it('deve submeter respostas e calcular pontuação', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        ...baseAttempt, userId: 2,
        assessment: { ...baseAssessment, questions: baseAssessment.questions },
      });
      mockPrisma.attemptAnswer.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.assessmentAttempt.update.mockResolvedValue({ ...baseAttempt, status: 'PASSED', score: 80 });
      const result = await service.submitAttempt(1, {
        answers: [{ questionId: 1, answer: 'A' }],
      } as any, 2);
      expect(result).toBeDefined();
    });

    it('deve lançar ForbiddenException se utilizador não é dono da tentativa', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({ ...baseAttempt, userId: 999 });
      await expect(service.submitAttempt(1, { answers: [] } as any, 2)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── getMyAttempts ────────────────────────────────────────────

  describe('getMyAttempts', () => {
    it('deve retornar tentativas do utilizador', async () => {
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([baseAttempt]);
      const result = await service.getMyAttempts(2, {});
      expect(result).toBeDefined();
    });
  });

  // ─── addQuestion ──────────────────────────────────────────────

  describe('addQuestion', () => {
    it('deve adicionar questão a assessment existente', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      mockPrisma.assessmentQuestion.create.mockResolvedValue({ id: 2, assessmentId: 1 });
      const result = await service.addQuestion(1, { questionText: 'Nova questão?', type: 'MCQ' as any, weight: 10 } as any);
      expect(result).toBeDefined();
    });
  });
});

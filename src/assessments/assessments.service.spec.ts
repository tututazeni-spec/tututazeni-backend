import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentType, QuestionType } from './assessments.dto';

const mockPrisma = {
  assessment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  assessmentQuestion: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  assessmentAttempt: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  attemptAnswer: {
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    findMany: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  notificationLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}) },
};

const baseAssessment = {
  id: 1,
  title: 'Avaliação NestJS',
  description: 'Teste sobre NestJS',
  type: 'QUIZ',
  status: 'DRAFT',
  passingScore: 70,
  feedbackMode: 'ON_SUBMIT',
  questions: [],
  _count: { attempts: 0, questions: 0 },
};

describe('AssessmentsService', () => {
  let service: AssessmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AssessmentsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AssessmentsService>(AssessmentsService);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('deve criar avaliação sem questões', async () => {
      mockPrisma.assessment.create.mockResolvedValue(baseAssessment);
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);

      const result = await service.create({ title: 'Nova Avaliação', type: AssessmentType.QUIZ });

      expect(result.title).toBe('Avaliação NestJS');
      expect(mockPrisma.assessmentQuestion.createMany).not.toHaveBeenCalled();
    });

    it('deve criar avaliação com questões', async () => {
      mockPrisma.assessment.create.mockResolvedValue({ ...baseAssessment, id: 2 });
      mockPrisma.assessment.findUnique.mockResolvedValue({ ...baseAssessment, id: 2 });

      await service.create({
        title: 'Com Questões',
        type: AssessmentType.QUIZ,
        questions: [
          {
            type: QuestionType.MULTIPLE_CHOICE_SINGLE,
            questionText: 'Pergunta 1',
            correctAnswer: 'A',
            seq: 1,
            weight: 1,
          },
        ],
      });

      expect(mockPrisma.assessmentQuestion.createMany).toHaveBeenCalled();
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('deve retornar todas as avaliações', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([baseAssessment]);

      const result = await service.findAll({});

      expect(result).toHaveLength(1);
    });

    it('deve filtrar por courseId e type', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      await service.findAll({ courseId: 1, type: AssessmentType.QUIZ });

      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ courseId: 1, type: 'QUIZ' }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('deve retornar avaliação por id', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);

      const result = await service.findOne(1);

      expect(result.title).toBe('Avaliação NestJS');
    });

    it('deve esconder respostas correctas para utilizador (feedbackMode != IMMEDIATE)', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        feedbackMode: 'ON_SUBMIT',
        questions: [
          {
            id: 1,
            questionText: 'Q1',
            correctAnswer: 'A',
            options: JSON.stringify([{ text: 'A', correct: true }]),
            explanation: 'Resp A',
          },
        ],
      });

      const result = await service.findOne(1, true);

      const q = (result as any).questions[0];
      expect(q.correctAnswer).toBeUndefined();
      expect(q.explanation).toBeUndefined();
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(null);
      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deve actualizar avaliação com sucesso', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      mockPrisma.assessment.update.mockResolvedValue({ ...baseAssessment, title: 'Actualizada' });

      const result = await service.update(1, { title: 'Actualizada' });

      expect(result.title).toBe('Actualizada');
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(null);
      await expect(service.update(99, { title: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('deve substituir questões se fornecidas', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      mockPrisma.assessment.update.mockResolvedValue(baseAssessment);

      await service.update(1, {
        questions: [
          {
            type: QuestionType.MULTIPLE_CHOICE_SINGLE,
            questionText: 'Nova',
            correctAnswer: 'B',
            seq: 1,
            weight: 1,
          },
        ],
      });

      expect(mockPrisma.assessmentQuestion.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.assessmentQuestion.createMany).toHaveBeenCalled();
    });
  });

  // ─── publish ──────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('deve publicar avaliação', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      mockPrisma.assessment.update.mockResolvedValue({ ...baseAssessment, status: 'ACTIVE' });
      const result = await service.publish(1);
      expect(result).toBeDefined();
    });
  });

  // ─── archive ──────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('deve arquivar avaliação', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      mockPrisma.assessment.update.mockResolvedValue({ ...baseAssessment, status: 'ARCHIVED' });
      const result = await service.archive(1);
      expect(result).toBeDefined();
    });
  });

  // ─── duplicate ────────────────────────────────────────────────────────────

  describe('duplicate', () => {
    it('deve duplicar avaliação', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        questions: [],
      });
      mockPrisma.assessment.create.mockResolvedValue({ ...baseAssessment, id: 2 });
      const result = await service.duplicate(1);
      expect(result).toBeDefined();
    });
  });

  // ─── startAttempt ─────────────────────────────────────────────────────────

  describe('startAttempt', () => {
    it('deve iniciar tentativa de avaliação', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        status: 'PUBLISHED',
        maxAttempts: 3,
        questions: [{ id: 1, questionText: 'Q1', seq: 1 }],
      });
      mockPrisma.assessmentAttempt.count.mockResolvedValue(0);
      mockPrisma.assessmentAttempt.create.mockResolvedValue({ id: 1, userId: 1, status: 'IN_PROGRESS' });
      const result = await service.startAttempt(1, { assessmentId: 1 } as any);
      expect(result).toBeDefined();
    });
  });

  // ─── getUserAttempts ──────────────────────────────────────────────────────

  describe('getUserAttempts', () => {
    it('deve retornar tentativas do utilizador', async () => {
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([]);
      const result = await service.getUserAttempts(1);
      expect(result).toBeDefined();
    });
  });

  // ─── addQuestion ──────────────────────────────────────────────────────────

  describe('addQuestion', () => {
    it('deve adicionar questão à avaliação', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue(baseAssessment);
      mockPrisma.assessmentQuestion.create.mockResolvedValue({ id: 5, questionText: 'Nova Q' });
      const result = await service.addQuestion(1, {
        type: QuestionType.MULTIPLE_CHOICE_SINGLE,
        questionText: 'Nova Q',
        correctAnswer: 'A',
        seq: 5,
        weight: 1,
      });
      expect(result).toBeDefined();
    });
  });

  // ─── getAnalytics ─────────────────────────────────────────────────────────

  describe('getAnalytics', () => {
    it('deve retornar analytics da avaliação', async () => {
      mockPrisma.assessment.findUnique.mockResolvedValue({
        ...baseAssessment,
        questions: [],
      });
      mockPrisma.assessmentAttempt.count.mockResolvedValue(10);
      const result = await service.getAnalytics(1);
      expect(result).toBeDefined();
    });
  });

  // ─── getPendingReviews ────────────────────────────────────────────────────

  describe('getPendingReviews', () => {
    it('deve retornar respostas pendentes de revisão', async () => {
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([]);
      const result = await service.getPendingReviews();
      expect(result).toBeDefined();
    });
  });
});

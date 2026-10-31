import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { PrismaService } from '../prisma/prisma.service';
import { OneOnOneService } from '../one-on-one/one-on-one.service';
import { EvalType, EvalModel } from './evaluation.dto';

const mockOneOnOne = {
  schedule: jest.fn().mockResolvedValue({ id: 1 }),
  getOne: jest.fn().mockResolvedValue(null),
  complete: jest.fn().mockResolvedValue({ id: 1 }),
};

const mockPrisma = {
  $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(mockPrisma)),
  evaluationStrength: { deleteMany: jest.fn(), create: jest.fn() },
  evaluationImprovementArea: {
    deleteMany: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 1 }),
  },
  evaluationRecommendation: { deleteMany: jest.fn(), create: jest.fn() },
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  performanceEvaluation: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn().mockResolvedValue({ id: 1, overallScore: 4.0, status: 'COMPLETED' }),
  },
  evaluationRequest: {
    findFirst: jest.fn(),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  evaluationCampaignForm: {
    findFirst: jest.fn().mockResolvedValue({ id: 1, title: 'Formulário 2024', questions: [] }),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1, title: 'Formulário 2024' }),
  },
  evaluationCampaignQuestion: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  evaluationCampaign: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1, name: 'Ciclo 2024', model: 'DEG_360' }),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  notificationLog: {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  userPoints: { update: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
};

describe('EvaluationService', () => {
  let service: EvaluationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ id: 1, fullName: 'Test User', managerId: 2 });
    mockPrisma.user.findMany.mockResolvedValue([]);

    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OneOnOneService, useValue: mockOneOnOne },
      ],
    }).compile();
    service = module.get<EvaluationService>(EvaluationService);
  });

  describe('createCycle', () => {
    it('deve criar ciclo de avaliação', async () => {
      const result = await service.createCycle(
        {
          name: 'Ciclo 2024',
          model: EvalModel.DEG_360,
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          weights: [
            { type: EvalType.SELF, weight: 30 },
            { type: EvalType.MANAGER, weight: 70 },
          ],
        },
        1,
      );
      expect(result).toBeDefined();
    });

    it('deve lançar BadRequestException se pesos não somam 100', async () => {
      await expect(
        service.createCycle(
          {
            name: 'Ciclo Inválido',
            model: EvalModel.DEG_360,
            startDate: '2024-01-01',
            endDate: '2024-12-31',
            weights: [
              { type: EvalType.SELF, weight: 40 },
              { type: EvalType.MANAGER, weight: 40 },
            ],
          },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCycles', () => {
    it('deve retornar lista de ciclos', async () => {
      const result = await service.getCycles({});
      expect(result).toBeDefined();
    });
  });

  describe('getCycle', () => {
    it('deve lançar NotFoundException se ciclo não encontrado', async () => {
      await expect(service.getCycle(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyProgress', () => {
    it('deve retornar progresso do avaliador', async () => {
      mockPrisma.evaluationRequest.findMany.mockResolvedValue([]);
      const result = await service.getMyProgress(1);
      expect(result).toBeDefined();
    });
  });

  describe('create', () => {
    it('deve criar avaliação com sucesso', async () => {
      mockPrisma.evaluationRequest.findFirst.mockResolvedValue(null);
      mockPrisma.performanceEvaluation.create.mockResolvedValue({
        id: 1,
        evaluatorId: 1,
        evaluatedId: 2,
        type: EvalType.MANAGER,
        status: 'DRAFT',
      });

      const result = await service.create(1, {
        evaluatedId: 2,
        type: EvalType.MANAGER,
        period: '2024-Q1',
        criteria: [{ name: 'Comunicação', score: 4 }],
      });

      expect(result).toBeDefined();
    });
  });

  // ─── updateCycle ──────────────────────────────────────────────────────────

  describe('updateCycle', () => {
    it('deve actualizar ciclo', async () => {
      mockPrisma.evaluationCampaign.findFirst.mockResolvedValue({ id: 1, name: 'Ciclo 2024' });
      const result = await service.updateCycle(1, { name: 'Ciclo Actualizado' });
      expect(result).toBeDefined();
    });
  });

  // ─── publishCycle ─────────────────────────────────────────────────────────

  describe('publishCycle', () => {
    it('deve publicar ciclo', async () => {
      mockPrisma.evaluationCampaign.findFirst.mockResolvedValue({ id: 1, name: 'Ciclo 2024' });
      const result = await service.publishCycle(1);
      expect(result).toBeDefined();
    });
  });

  // ─── deleteCycle ──────────────────────────────────────────────────────────

  describe('deleteCycle', () => {
    it('elimina logicamente um ciclo sem avaliações atribuídas', async () => {
      mockPrisma.evaluationCampaign.findFirst.mockResolvedValue({ id: 1, name: 'Ciclo 2024' });
      mockPrisma.evaluationRequest.count.mockResolvedValue(0);
      mockPrisma.evaluationCampaign.update.mockClear();
      const result = await service.deleteCycle(1);
      expect(result).toEqual({ id: 1, deleted: true });
      expect(mockPrisma.evaluationCampaign.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('recusa eliminar um ciclo que já tem avaliações atribuídas', async () => {
      mockPrisma.evaluationCampaign.findFirst.mockResolvedValue({ id: 1, name: 'Ciclo 2024' });
      mockPrisma.evaluationRequest.count.mockResolvedValue(3);
      mockPrisma.evaluationCampaign.update.mockClear();
      await expect(service.deleteCycle(1)).rejects.toThrow(/já tem avaliações atribuídas/);
      expect(mockPrisma.evaluationCampaign.update).not.toHaveBeenCalled();
    });

    it('ciclo inexistente ou já eliminado → 404', async () => {
      mockPrisma.evaluationCampaign.findFirst.mockResolvedValue(null);
      await expect(service.deleteCycle(99)).rejects.toThrow('Ciclo não encontrado');
    });
  });

  // ─── activateCycle ────────────────────────────────────────────────────────

  describe('activateCycle', () => {
    it('deve activar ciclo', async () => {
      const fakeCycle = {
        id: 1,
        name: 'Ciclo 2024',
        status: 'PUBLISHED',
        endDate: new Date(),
        model: 'DEG_360',
        targetDeptIds: [],
        weights: JSON.stringify([]),
      };
      mockPrisma.evaluationCampaign.findFirst.mockResolvedValue(fakeCycle);
      mockPrisma.evaluationCampaign.update.mockResolvedValue({
        ...fakeCycle,
        status: 'ACTIVE',
      });
      const result = await service.activateCycle(1);
      expect(result).toBeDefined();
    });
  });

  // ─── createForm ───────────────────────────────────────────────────────────

  describe('createForm', () => {
    it('deve criar formulário de avaliação', async () => {
      mockPrisma.evaluationCampaignForm.create.mockResolvedValue({
        id: 1,
        title: 'Formulário 2024',
        questions: [],
      });
      const result = await service.createForm(
        { title: 'Formulário 2024', questions: [] } as any,
        1,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── getForms ─────────────────────────────────────────────────────────────

  describe('getForms', () => {
    it('deve retornar lista de formulários', async () => {
      const result = await service.getForms();
      expect(result).toBeDefined();
    });
  });

  // ─── getForm ──────────────────────────────────────────────────────────────

  describe('getForm', () => {
    it('deve retornar formulário por id', async () => {
      const result = await service.getForm(1);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se não encontrado', async () => {
      mockPrisma.evaluationCampaignForm.findFirst.mockResolvedValueOnce(null);
      await expect(service.getForm(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignEvaluator ──────────────────────────────────────────────────────

  describe('assignEvaluator', () => {
    it('deve atribuir avaliador', async () => {
      mockPrisma.evaluationRequest.findFirst.mockResolvedValue(null);
      mockPrisma.evaluationRequest.create.mockResolvedValue({
        id: 1,
        evaluatorId: 2,
        evaluatedId: 1,
        type: EvalType.MANAGER,
      });
      const result = await service.assignEvaluator(
        {
          evaluatorId: 2,
          evaluatedId: 1,
          cycleId: 1,
          type: EvalType.MANAGER,
        },
        { id: 1, role: { name: 'ADMIN' } } as any,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── bulkAssign ───────────────────────────────────────────────────────────

  describe('bulkAssign', () => {
    it('deve atribuir avaliadores em massa', async () => {
      const result = await service.bulkAssign(
        {
          cycleId: 1,
          assignments: [{ evaluatorId: 2, evaluatedId: 1, type: EvalType.MANAGER }],
        },
        { id: 1, role: { name: 'ADMIN' } } as any,
      );
      expect(result).toBeDefined();
    });
  });

  // ─── submitEvaluation ─────────────────────────────────────────────────────

  describe('submitEvaluation', () => {
    it('deve submeter avaliação', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue({
        id: 1,
        evaluatorId: 1,
        evaluatedId: 2,
        status: 'PENDING',
        cycle: {
          weights: JSON.stringify([
            { type: EvalType.MANAGER, weight: 100, selfEvalIncluded: true },
          ]),
          model: EvalModel.DEG_360,
          id: 1,
        },
      });
      mockPrisma.evaluationRequest.findFirst.mockResolvedValue(null);
      mockPrisma.performanceEvaluation.findFirst.mockResolvedValue(null);
      mockPrisma.performanceEvaluation.create.mockResolvedValue({ id: 1, score: 4.0 });
      mockPrisma.evaluationRequest.update.mockResolvedValue({});

      const result = await service.submitEvaluation(1, {
        requestId: 1,
        answers: [{ criterionId: 1, score: 4, comment: 'Bom' }],
      } as any);
      expect(result).toBeDefined();
    });
  });

  describe('submitEvaluation — classificação ponderada e estados', () => {
    const questions = [
      { id: 1, type: 'SCALE', required: true, weight: 30, scaleMax: 5, competencyId: null },
      { id: 2, type: 'SCALE', required: true, weight: 70, scaleMax: 5, competencyId: null },
    ];
    const request = (status = 'PENDING') => ({
      id: 1,
      evaluatorId: 1,
      evaluatedId: 2,
      status,
      cycleId: 1,
      cycle: { id: 1, formId: 9, startDate: new Date('2026-01-01'), requireEvidence: false },
    });

    beforeEach(() => {
      mockPrisma.evaluationCampaignQuestion.findMany.mockResolvedValue(questions);
      mockPrisma.performanceEvaluation.findFirst.mockResolvedValue(null);
      mockPrisma.performanceEvaluation.create.mockImplementation(async ({ data }: any) => ({
        id: 7,
        ...data,
      }));
      mockPrisma.evaluationRequest.update.mockResolvedValue({});
    });
    afterEach(() => mockPrisma.evaluationCampaignQuestion.findMany.mockResolvedValue([]));

    it('sem formulário, classifica pela média das notas dos pontos fortes e melhorias', async () => {
      mockPrisma.evaluationCampaignQuestion.findMany.mockResolvedValue([]);
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue({
        ...request(),
        cycle: { id: 1, formId: null, startDate: new Date('2026-01-01'), requireEvidence: false },
      });
      const r: any = await service.submitEvaluation(1, {
        requestId: 1,
        answers: [],
        strengthItems: [{ competency: 'Foco em Resultados', score: 4 }],
        improvementItems: [{ competency: 'Resiliência', score: 2, priority: 'MEDIA' }],
      } as any);
      expect(r.overallScore).toBe(3);
      expect(r.completionPct).toBe(100);
      expect(r.ratingLabel).toBe('Bom');
    });

    it('persiste média ponderada, preenchimento e classificação quando completa', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue(request());
      const r: any = await service.submitEvaluation(1, {
        requestId: 1,
        answers: [
          { questionId: 1, score: 5 },
          { questionId: 2, score: 3 },
        ],
      } as any);
      expect(r.overallScore).toBe(3.6);
      expect(r.completionPct).toBe(100);
      expect(r.ratingLabel).toBe('Muito bom');
    });

    it('recusa submissão final incompleta mas aceita rascunho sem nota final', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue(request());
      const dto = { requestId: 1, answers: [{ questionId: 1, score: 5 }] };
      await expect(service.submitEvaluation(1, dto as any)).rejects.toThrow(/incompleta/);
      const r: any = await service.submitEvaluation(1, { ...dto, isDraft: true } as any);
      expect(r.overallScore).toBe(0);
      expect(r.ratingLabel).toBeNull();
      expect(r.completionPct).toBe(50);
    });

    it('recusa notas fora de 1–5', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue(request());
      await expect(
        service.submitEvaluation(1, {
          requestId: 1,
          answers: [
            { questionId: 1, score: 0 },
            { questionId: 2, score: 6 },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('avaliação já submetida é imutável, também como rascunho', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue(request('COMPLETED'));
      await expect(
        service.submitEvaluation(1, { requestId: 1, answers: [], isDraft: true } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('avaliador diferente do atribuído não submete', async () => {
      mockPrisma.evaluationRequest.findUnique.mockResolvedValue(request());
      await expect(
        service.submitEvaluation(55, { requestId: 1, answers: [] } as any),
      ).rejects.toThrow(/permissão/);
    });
  });

  describe('createForm — soma de pesos', () => {
    const q = (weight?: number) => ({ text: 'Q', type: 'SCALE', weight }) as any;
    it('rejeita pesos explícitos que não somam 100%', async () => {
      await expect(
        service.createForm({ title: 'F', questions: [q(60), q(30)] } as any, 1),
      ).rejects.toThrow(/100%/);
    });
    it('aceita 100% e aceita ausência de pesos (peso igual por omissão)', async () => {
      await expect(
        service.createForm({ title: 'F', questions: [q(60), q(40)] } as any, 1),
      ).resolves.toBeDefined();
      await expect(
        service.createForm({ title: 'F', questions: [q(), q()] } as any, 1),
      ).resolves.toBeDefined();
    });
  });

  // ─── getAnalytics ─────────────────────────────────────────────────────────

  describe('findByUser', () => {
    it('deve retornar avaliações do utilizador', async () => {
      mockPrisma.performanceEvaluation.findMany.mockResolvedValue([]);
      mockPrisma.performanceEvaluation.count.mockResolvedValue(0);
      const result = await service.findByUser(1);
      expect(result).toBeDefined();
    });
  });
});

// src/career/career.service.progress.spec.ts
// Cobre métodos não testados: removeCareerPathStep, updateCareerPlan, addGoalToPlan,
// updateGoalProgress, findAllVacancies, createVacancy, publishVacancy,
// updateApplicationStatus, getMyApplications, checkPromotionEligibility,
// requestPromotion, getSuccessionPlans, createSuccessionPlan,
// updateSuccessionReadiness, updateCareerInterests, getTalentHeatmap

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { CareerService } from './career.service';
import { PrismaService } from '../prisma/prisma.service';

function buildMockPrisma() {
  const crud = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: { score: null } }),
  });

  return {
    user: crud(),
    careerPath: crud(),
    careerPathStep: crud(),
    userCareerPlan: crud(),
    careerGoal: crud(),
    internalVacancy: crud(),
    internalApplication: crud(),
    vacancyApplication: crud(),
    successionPlan: crud(),
    positionCompetency: crud(),
    userCompetency: crud(),
    position: crud(),
    enrollment: crud(),
    performanceReview: crud(),
    courseCompetency: crud(),
    notificationLog: crud(),
    auditLog: crud(),
    userPoints: crud(),
    profile: crud(),
  };
}

describe('CareerService (progress)', () => {
  let service: CareerService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CareerService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<CareerService>(CareerService);
  });

  // ─── removeCareerPathStep ──────────────────────────────────────

  describe('removeCareerPathStep', () => {
    it('deve remover passo de trilha existente', async () => {
      mockPrisma.careerPathStep.findUnique.mockResolvedValue({ id: 1, careerPathId: 1 });
      const result = await service.removeCareerPathStep(1);
      expect(result.message).toContain('removido');
      expect(mockPrisma.careerPathStep.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('deve lançar NotFoundException se passo não existe', async () => {
      mockPrisma.careerPathStep.findUnique.mockResolvedValue(null);
      await expect(service.removeCareerPathStep(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateCareerPlan ──────────────────────────────────────────

  describe('updateCareerPlan', () => {
    it('deve actualizar plano de carreira existente', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue({ id: 1, userId: 1, status: 'ACTIVE' });
      mockPrisma.userCareerPlan.update.mockResolvedValue({
        id: 1,
        userId: 1,
        title: 'Actualizado',
      });
      const result = await service.updateCareerPlan(1, 1, { title: 'Actualizado' } as any);
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se plano não encontrado', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue(null);
      await expect(service.updateCareerPlan(99, 1, {} as any)).rejects.toThrow(NotFoundException);
    });

    it('deve converter targetDate para Date', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue({ id: 1, userId: 1 });
      mockPrisma.userCareerPlan.update.mockResolvedValue({});
      await service.updateCareerPlan(1, 1, { targetDate: '2027-12-31' } as any);
      expect(mockPrisma.userCareerPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ targetDate: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── addGoalToPlan ─────────────────────────────────────────────

  describe('addGoalToPlan', () => {
    it('deve adicionar objectivo a plano existente', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue({ id: 1, userId: 1 });
      mockPrisma.careerGoal.create.mockResolvedValue({
        id: 1,
        careerPlanId: 1,
        title: 'Aprender NestJS',
      });
      const result = await service.addGoalToPlan(1, 1, {
        title: 'Aprender NestJS',
        timeframe: 'SHORT' as any,
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.careerGoal.create).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se plano não existe', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue(null);
      await expect(service.addGoalToPlan(99, 1, { title: 'X' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve criar objectivo com status PENDING e progress 0', async () => {
      mockPrisma.userCareerPlan.findFirst.mockResolvedValue({ id: 1, userId: 1 });
      mockPrisma.careerGoal.create.mockResolvedValue({ id: 1, status: 'PENDING', progress: 0 });
      await service.addGoalToPlan(1, 1, {
        title: 'Aprender TypeScript',
        timeframe: 'LONG' as any,
      } as any);
      expect(mockPrisma.careerGoal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', progress: 0 }),
        }),
      );
    });
  });

  // ─── updateGoalProgress ────────────────────────────────────────

  describe('updateGoalProgress', () => {
    it('deve actualizar progresso do objectivo', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue({
        id: 1,
        careerPlan: { userId: 1 },
      });
      mockPrisma.careerGoal.update.mockResolvedValue({
        id: 1,
        progress: 50,
        status: 'IN_PROGRESS',
      });
      const result = await service.updateGoalProgress(1, 1, 50);
      expect(result).toBeDefined();
    });

    it('deve marcar como COMPLETED quando progress >= 100', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue({ id: 1, careerPlan: { userId: 1 } });
      mockPrisma.careerGoal.update.mockResolvedValue({ id: 1, progress: 100, status: 'COMPLETED' });
      await service.updateGoalProgress(1, 1, 100);
      expect(mockPrisma.careerGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED', progress: 100 }),
        }),
      );
    });

    it('deve marcar como PENDING quando progress = 0', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue({ id: 1, careerPlan: { userId: 1 } });
      mockPrisma.careerGoal.update.mockResolvedValue({});
      await service.updateGoalProgress(1, 1, 0);
      expect(mockPrisma.careerGoal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('deve lançar NotFoundException se objectivo não existe', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue(null);
      await expect(service.updateGoalProgress(99, 1, 50)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar NotFoundException se objectivo pertence a outro utilizador', async () => {
      mockPrisma.careerGoal.findUnique.mockResolvedValue({ id: 1, careerPlan: { userId: 2 } });
      await expect(service.updateGoalProgress(1, 1, 50)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAllVacancies ──────────────────────────────────────────

  describe('findAllVacancies', () => {
    it('deve retornar vagas abertas com paginação', async () => {
      mockPrisma.internalVacancy.findMany.mockResolvedValue([]);
      mockPrisma.internalVacancy.count.mockResolvedValue(0);
      const result = await service.findAllVacancies({});
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('totalPages');
    });

    it('deve filtrar por search, type, departmentId', async () => {
      mockPrisma.internalVacancy.findMany.mockResolvedValue([]);
      mockPrisma.internalVacancy.count.mockResolvedValue(0);
      await service.findAllVacancies({ search: 'Dev', type: 'INTERNAL' as any, departmentId: 1 });
      expect(mockPrisma.internalVacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: expect.anything(),
            type: 'INTERNAL',
            departmentId: 1,
          }),
        }),
      );
    });

    it('deve enriquecer resultados com matchScore quando userId fornecido', async () => {
      const vacancy = {
        id: 1,
        title: 'Dev Senior',
        status: 'OPEN',
        requiredCompetencyIds: [1, 2],
      };
      mockPrisma.internalVacancy.findMany.mockResolvedValue([vacancy]);
      mockPrisma.internalVacancy.count.mockResolvedValue(1);
      mockPrisma.userCompetency.findMany.mockResolvedValue([{ competencyId: 1, currentLevel: 2 }]);
      mockPrisma.internalApplication.findMany.mockResolvedValue([]);

      const result = await service.findAllVacancies({}, 1);
      const v = result.data[0] as any;
      expect(v.matchScore).toBeDefined();
      expect(v.applied).toBeDefined();
    });
  });

  // ─── createVacancy ─────────────────────────────────────────────

  describe('createVacancy', () => {
    it('deve criar vaga interna', async () => {
      mockPrisma.internalVacancy.create.mockResolvedValue({
        id: 1,
        title: 'Dev Senior',
        status: 'DRAFT',
      });
      const result = await service.createVacancy(1, {
        title: 'Dev Senior',
        description: 'Descrição',
        type: 'INTERNAL' as any,
        positionId: 2,
        departmentId: 1,
        slots: 2,
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.internalVacancy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DRAFT', createdById: 1 }),
        }),
      );
    });

    it('deve criar vaga com closingDate convertida', async () => {
      mockPrisma.internalVacancy.create.mockResolvedValue({ id: 1 });
      await service.createVacancy(1, {
        title: 'Vaga',
        type: 'INTERNAL' as any,
        closingDate: '2027-06-30',
      } as any);
      expect(mockPrisma.internalVacancy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ closingDate: expect.any(Date) }),
        }),
      );
    });
  });

  // ─── publishVacancy ────────────────────────────────────────────

  describe('publishVacancy', () => {
    it('deve publicar vaga em rascunho', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue({ id: 1, status: 'DRAFT' });
      mockPrisma.internalVacancy.update.mockResolvedValue({ id: 1, status: 'OPEN' });
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.internalVacancy.findMany.mockResolvedValue([]);
      // notifyMatchingUsers precisa de internalVacancy.findUnique 2x
      mockPrisma.internalVacancy.findUnique
        .mockResolvedValueOnce({ id: 1, status: 'DRAFT' })
        .mockResolvedValueOnce({ title: 'Dev', requiredCompetencyIds: [] });

      const result = await service.publishVacancy(1);
      expect(result).toBeDefined();
      expect(mockPrisma.internalVacancy.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'OPEN' }) }),
      );
    });

    it('deve lançar NotFoundException se vaga não existe', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue(null);
      await expect(service.publishVacancy(99)).rejects.toThrow(NotFoundException);
    });

    it('deve lançar BadRequestException se vaga não está em rascunho', async () => {
      mockPrisma.internalVacancy.findUnique.mockResolvedValue({ id: 1, status: 'OPEN' });
      await expect(service.publishVacancy(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateApplicationStatus ───────────────────────────────────

  describe('updateApplicationStatus', () => {
    it('deve actualizar status de candidatura', async () => {
      mockPrisma.internalApplication.findUnique.mockResolvedValue({
        id: 1,
        user: { id: 5 },
        vacancy: { title: 'Dev Senior' },
      });
      mockPrisma.internalApplication.update.mockResolvedValue({ id: 1, status: 'ACCEPTED' });

      const result = await service.updateApplicationStatus(1, { status: 'ACCEPTED' as any });
      expect(result).toBeDefined();
      expect(mockPrisma.internalApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'ACCEPTED' }) }),
      );
    });

    it('deve notificar candidato sobre actualização de status', async () => {
      mockPrisma.internalApplication.findUnique.mockResolvedValue({
        id: 1,
        user: { id: 5 },
        vacancy: { title: 'Gestão de Projecto' },
      });
      mockPrisma.internalApplication.update.mockResolvedValue({ id: 1, status: 'REJECTED' });

      await service.updateApplicationStatus(1, {
        status: 'REJECTED' as any,
        feedback: 'Perfil não adequado',
      });
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 5, type: 'APPLICATION_STATUS_UPDATED' }),
        }),
      );
    });

    it('deve lançar NotFoundException se candidatura não encontrada', async () => {
      mockPrisma.internalApplication.findUnique.mockResolvedValue(null);
      await expect(
        service.updateApplicationStatus(99, { status: 'ACCEPTED' as any }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getMyApplications ─────────────────────────────────────────

  describe('getMyApplications', () => {
    it('deve retornar candidaturas do utilizador', async () => {
      mockPrisma.internalApplication.findMany.mockResolvedValue([
        {
          id: 1,
          userId: 1,
          status: 'PENDING',
          vacancy: { title: 'Dev', position: {}, department: {} },
        },
      ]);
      const result = await service.getMyApplications(1);
      expect(result).toHaveLength(1);
      expect(mockPrisma.internalApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 } }),
      );
    });

    it('deve retornar lista vazia se sem candidaturas', async () => {
      mockPrisma.internalApplication.findMany.mockResolvedValue([]);
      const result = await service.getMyApplications(1);
      expect(result).toHaveLength(0);
    });
  });

  // ─── checkPromotionEligibility ─────────────────────────────────

  describe('checkPromotionEligibility', () => {
    it('deve retornar null se utilizador sem posição', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ positionId: null });
      const result = await service.checkPromotionEligibility(1);
      expect(result).toBeNull();
    });

    it('deve verificar elegibilidade completa', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        positionId: 1,
        hireDate: new Date('2020-01-01'), // > 12 meses
      });
      mockPrisma.positionCompetency.findMany.mockResolvedValue([
        { competencyId: 1, requiredLevel: 3, competency: { id: 1, name: 'TS' } },
      ]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([
        { competencyId: 1, currentLevel: 3 }, // MET
      ]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 4.0 } }); // >= 3.5

      const result = await service.checkPromotionEligibility(1);
      expect(result).toBeDefined();
      expect(result!.eligible).toBe(true);
      expect(result!.recommendation).toBe('READY_NOW');
    });

    it('deve retornar NOT_READY se performance insuficiente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        positionId: 1,
        hireDate: new Date('2020-01-01'),
      });
      mockPrisma.positionCompetency.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 2.0 } }); // < 3.5

      const result = await service.checkPromotionEligibility(1);
      expect(result!.eligible).toBe(false);
      expect(result!.recommendation).toBe('NOT_READY');
    });

    it('deve retornar READY_12M se performance ok mas algumas competências em falta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        positionId: 1,
        hireDate: new Date('2020-01-01'),
      });
      mockPrisma.positionCompetency.findMany.mockResolvedValue([
        { competencyId: 1, requiredLevel: 3, competency: { id: 1, name: 'TS' } },
        { competencyId: 2, requiredLevel: 3, competency: { id: 2, name: 'SQL' } },
        { competencyId: 3, requiredLevel: 3, competency: { id: 3, name: 'JS' } },
        { competencyId: 4, requiredLevel: 3, competency: { id: 4, name: 'Python' } },
        { competencyId: 5, requiredLevel: 3, competency: { id: 5, name: 'Go' } },
      ]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([
        { competencyId: 1, currentLevel: 3 }, // MET - 3/5 = 60%
        { competencyId: 2, currentLevel: 3 },
        { competencyId: 3, currentLevel: 3 },
      ]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 4.0 } }); // met

      const result = await service.checkPromotionEligibility(1);
      expect(result!.recommendation).toBe('READY_12M');
    });
  });

  // ─── requestPromotion ──────────────────────────────────────────

  describe('requestPromotion', () => {
    it('deve lançar BadRequestException se não elegível', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ positionId: 1, hireDate: new Date() }) // checkPromotionEligibility
        .mockResolvedValueOnce({ fullName: 'Ana', managerId: null });
      mockPrisma.positionCompetency.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 1.0 } }); // baixo

      await expect(service.requestPromotion(1, 2, 'Motivo')).rejects.toThrow(BadRequestException);
    });

    it('deve submeter pedido de promoção quando elegível', async () => {
      // checkPromotionEligibility chama user.findUnique 1x, getCompetencyGapsForUser chama 1x, requestPromotion 1x
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ positionId: 1, hireDate: new Date('2020-01-01') }) // checkPromotionEligibility
        .mockResolvedValueOnce({ positionId: 1 }) // getCompetencyGapsForUser
        .mockResolvedValueOnce({ fullName: 'Ana', managerId: 99 }); // requestPromotion notif
      mockPrisma.positionCompetency.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 4.5 } });

      const result = (await service.requestPromotion(1, 2, 'Quero crescer')) as any;
      expect(result.message).toContain('sucesso');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
    });

    it('deve submeter sem notificação se sem manager', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ positionId: 1, hireDate: new Date('2020-01-01') }) // checkPromotionEligibility
        .mockResolvedValueOnce({ positionId: 1 }) // getCompetencyGapsForUser
        .mockResolvedValueOnce({ fullName: 'Ana', managerId: null }); // requestPromotion notif
      mockPrisma.positionCompetency.findMany.mockResolvedValue([]);
      mockPrisma.userCompetency.findMany.mockResolvedValue([]);
      mockPrisma.performanceReview.aggregate.mockResolvedValue({ _avg: { score: 4.5 } });

      const result = (await service.requestPromotion(1, 2, 'Motivo')) as any;
      expect(result.message).toBeDefined();
    });
  });

  // ─── getSuccessionPlans ────────────────────────────────────────

  describe('getSuccessionPlans', () => {
    it('deve retornar todos os planos de sucessão', async () => {
      mockPrisma.successionPlan.findMany.mockResolvedValue([
        { id: 1, positionId: 1, candidateId: 5, readiness: 'READY_NOW' },
      ]);
      const result = await service.getSuccessionPlans();
      expect(result).toHaveLength(1);
    });

    it('deve filtrar por positionId quando fornecido', async () => {
      mockPrisma.successionPlan.findMany.mockResolvedValue([]);
      await service.getSuccessionPlans(1);
      expect(mockPrisma.successionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { positionId: 1 } }),
      );
    });

    it('deve retornar todos quando positionId não fornecido', async () => {
      mockPrisma.successionPlan.findMany.mockResolvedValue([]);
      await service.getSuccessionPlans();
      expect(mockPrisma.successionPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined }),
      );
    });
  });

  // ─── createSuccessionPlan ──────────────────────────────────────

  describe('createSuccessionPlan', () => {
    it('deve criar plano de sucessão novo', async () => {
      mockPrisma.successionPlan.findFirst.mockResolvedValue(null);
      mockPrisma.successionPlan.create.mockResolvedValue({ id: 1, positionId: 1, candidateId: 5 });

      const result = await service.createSuccessionPlan({
        positionId: 1,
        candidateId: 5,
        readiness: 'READY_NOW',
        justification: 'Tem todas as competências',
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 5, type: 'SUCCESSION_MAPPED' }),
        }),
      );
    });

    it('deve lançar ConflictException se candidato já mapeado para cargo', async () => {
      mockPrisma.successionPlan.findFirst.mockResolvedValue({ id: 1 });
      await expect(
        service.createSuccessionPlan({
          positionId: 1,
          candidateId: 5,
          readiness: 'READY_NOW',
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── updateSuccessionReadiness ─────────────────────────────────

  describe('updateSuccessionReadiness', () => {
    it('deve actualizar readiness do plano de sucessão', async () => {
      mockPrisma.successionPlan.findUnique.mockResolvedValue({ id: 1, justification: 'Original' });
      mockPrisma.successionPlan.update.mockResolvedValue({ id: 1, readiness: 'READY_NOW' });
      const result = await service.updateSuccessionReadiness(1, 'READY_NOW', 'Nova justificação');
      expect(result).toBeDefined();
    });

    it('deve lançar NotFoundException se plano não existe', async () => {
      mockPrisma.successionPlan.findUnique.mockResolvedValue(null);
      await expect(service.updateSuccessionReadiness(99, 'READY_NOW')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deve manter justificação original se não fornecida', async () => {
      mockPrisma.successionPlan.findUnique.mockResolvedValue({ id: 1, justification: 'Original' });
      mockPrisma.successionPlan.update.mockResolvedValue({});
      await service.updateSuccessionReadiness(1, 'READY_12M');
      expect(mockPrisma.successionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ justification: 'Original' }),
        }),
      );
    });
  });

  // ─── updateCareerInterests ─────────────────────────────────────

  describe('updateCareerInterests', () => {
    it('deve fazer upsert do perfil com interesses', async () => {
      mockPrisma.profile.upsert.mockResolvedValue({ userId: 1, interests: ['TI', 'Gestão'] });
      const result = await service.updateCareerInterests(1, {
        areas: ['TI', 'Gestão'],
        workStyles: ['REMOTE'],
        desiredRole: 'Tech Lead',
        openToRelocation: false,
        openToRemote: true,
      } as any);
      expect(result).toBeDefined();
      expect(mockPrisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1 },
          create: expect.objectContaining({ userId: 1, interests: ['TI', 'Gestão'] }),
          update: expect.objectContaining({ interests: ['TI', 'Gestão'] }),
        }),
      );
    });

    it('deve usar arrays vazios por defeito quando não fornecidos', async () => {
      mockPrisma.profile.upsert.mockResolvedValue({ userId: 1 });
      await service.updateCareerInterests(1, {} as any);
      expect(mockPrisma.profile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ interests: [] }),
        }),
      );
    });
  });

  // ─── getTalentHeatmap ──────────────────────────────────────────

  describe('getTalentHeatmap', () => {
    it('deve retornar lista vazia se sem utilizadores', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      const result = await service.getTalentHeatmap();
      expect(result).toHaveLength(0);
    });

    it('deve categorizar utilizadores em HIGH_POTENTIAL', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 1,
          fullName: 'Ana',
          avatarUrl: null,
          department: { id: 1, name: 'TI' },
          position: { id: 1, name: 'Dev', level: 3 },
          nineBoxPlacements: [{ performanceAxis: 5, potentialAxis: 5 }],
          _count: { userCompetencies: 10, certificates: 3 },
        },
      ]);
      const result = (await service.getTalentHeatmap()) as any[];
      expect(result[0].talentCategory).toBe('HIGH_POTENTIAL');
    });

    it('deve categorizar utilizadores em SOLID_PERFORMER', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 2,
          fullName: 'João',
          avatarUrl: null,
          department: { id: 1, name: 'TI' },
          position: { id: 1, name: 'Dev', level: 2 },
          nineBoxPlacements: [{ performanceAxis: 3, potentialAxis: 3 }],
          _count: { userCompetencies: 5, certificates: 1 },
        },
      ]);
      const result = (await service.getTalentHeatmap()) as any[];
      expect(result[0].talentCategory).toBe('SOLID_PERFORMER');
    });

    it('deve categorizar como RISK se performance e potential baixos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 3,
          fullName: 'Pedro',
          avatarUrl: null,
          department: { id: 2, name: 'RH' },
          position: { id: 2, name: 'Analista', level: 1 },
          nineBoxPlacements: [{ performanceAxis: 1, potentialAxis: 1 }],
          _count: { userCompetencies: 2, certificates: 0 },
        },
      ]);
      const result = (await service.getTalentHeatmap()) as any[];
      expect(result[0].talentCategory).toBe('RISK');
    });

    it('deve categorizar UNKNOWN se placement com valores que não encaixam', async () => {
      // perf=3, pot=2: não encaixa em nenhuma categoria → UNKNOWN
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 4,
          fullName: 'Maria',
          avatarUrl: null,
          department: { id: 1, name: 'TI' },
          position: { id: 1, name: 'Dev', level: 2 },
          nineBoxPlacements: [{ performanceAxis: 3, potentialAxis: 2 }],
          _count: { userCompetencies: 3, certificates: 1 },
        },
      ]);
      const result = (await service.getTalentHeatmap()) as any[];
      expect(result[0].talentCategory).toBe('UNKNOWN');
    });

    it('deve filtrar por departmentId quando fornecido', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      await service.getTalentHeatmap(1);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ departmentId: 1 }) }),
      );
    });

    it('deve categorizar EXPERT se alta performance mas baixo potencial', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 5,
          fullName: 'Carlos',
          avatarUrl: null,
          department: { id: 1, name: 'TI' },
          position: { id: 1, name: 'Dev', level: 3 },
          nineBoxPlacements: [{ performanceAxis: 4, potentialAxis: 2 }],
          _count: { userCompetencies: 8, certificates: 2 },
        },
      ]);
      const result = (await service.getTalentHeatmap()) as any[];
      expect(result[0].talentCategory).toBe('EXPERT');
    });

    it('deve categorizar EMERGING_TALENT se alto potencial mas baixa performance', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 6,
          fullName: 'Sara',
          avatarUrl: null,
          department: { id: 1, name: 'TI' },
          position: { id: 1, name: 'Dev', level: 1 },
          nineBoxPlacements: [{ performanceAxis: 2, potentialAxis: 5 }],
          _count: { userCompetencies: 4, certificates: 0 },
        },
      ]);
      const result = (await service.getTalentHeatmap()) as any[];
      expect(result[0].talentCategory).toBe('EMERGING_TALENT');
    });
  });

  // ─── getCareerAnalytics (includeRisk path) ─────────────────────

  describe('getCareerAnalytics with includeRisk', () => {
    it('deve incluir riskUsers quando includeRisk=true', async () => {
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.userCareerPlan.count.mockResolvedValue(50);
      mockPrisma.internalVacancy.count.mockResolvedValue(5);
      mockPrisma.internalApplication.count.mockResolvedValue(20);
      mockPrisma.positionCompetency.groupBy.mockResolvedValue([]);
      mockPrisma.internalVacancy.groupBy.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1, fullName: 'Em Risco' }]);

      const result = (await service.getCareerAnalytics({ includeRisk: true })) as any;
      expect(result.riskUsers).toBeDefined();
      expect(result.overview.totalUsers).toBe(100);
    });

    it('deve não incluir riskUsers quando includeRisk=false', async () => {
      mockPrisma.user.count.mockResolvedValue(50);
      mockPrisma.userCareerPlan.count.mockResolvedValue(25);
      mockPrisma.internalVacancy.count.mockResolvedValue(3);
      mockPrisma.internalApplication.count.mockResolvedValue(10);
      mockPrisma.positionCompetency.groupBy.mockResolvedValue([]);
      mockPrisma.internalVacancy.groupBy.mockResolvedValue([]);

      const result = (await service.getCareerAnalytics({ includeRisk: false })) as any;
      expect(result.riskUsers).toBeUndefined();
    });
  });
});

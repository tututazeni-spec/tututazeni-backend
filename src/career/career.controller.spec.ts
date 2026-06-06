import { Test, TestingModule } from '@nestjs/testing';
import { CareerController } from './career.controller';
import { CareerService } from './career.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getCareerProfile: jest.fn().mockResolvedValue({}),
  getCompetencyGapsForUser: jest.fn().mockResolvedValue([]),
  checkPromotionEligibility: jest.fn().mockResolvedValue({ eligible: true }),
  requestPromotion: jest.fn().mockResolvedValue({ id: 1 }),
  simulateNextRole: jest.fn().mockResolvedValue({}),
  updateCareerInterests: jest.fn().mockResolvedValue({}),
  findAllCareerPaths: jest.fn().mockResolvedValue([]),
  findOneCareerPath: jest.fn().mockResolvedValue({ id: 1 }),
  createCareerPath: jest.fn().mockResolvedValue({ id: 2 }),
  updateCareerPath: jest.fn().mockResolvedValue({ id: 1 }),
  addCareerPathStep: jest.fn().mockResolvedValue({ id: 1 }),
  removeCareerPathStep: jest.fn().mockResolvedValue({}),
  getMyCareerPlan: jest.fn().mockResolvedValue({}),
  createCareerPlan: jest.fn().mockResolvedValue({ id: 1 }),
  updateCareerPlan: jest.fn().mockResolvedValue({ id: 1 }),
  addGoalToPlan: jest.fn().mockResolvedValue({ id: 1 }),
  updateGoalProgress: jest.fn().mockResolvedValue({}),
  findAllVacancies: jest.fn().mockResolvedValue([]),
  createVacancy: jest.fn().mockResolvedValue({ id: 1 }),
  publishVacancy: jest.fn().mockResolvedValue({}),
  applyToVacancy: jest.fn().mockResolvedValue({ id: 1 }),
  getMyApplications: jest.fn().mockResolvedValue([]),
  updateApplicationStatus: jest.fn().mockResolvedValue({}),
  getSuccessionPlans: jest.fn().mockResolvedValue([]),
  createSuccessionPlan: jest.fn().mockResolvedValue({ id: 1 }),
  updateSuccessionReadiness: jest.fn().mockResolvedValue({}),
  getCareerAnalytics: jest.fn().mockResolvedValue({}),
  getTalentHeatmap: jest.fn().mockResolvedValue([]),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('CareerController', () => {
  let controller: CareerController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CareerController],
      providers: [{ provide: CareerService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CareerController>(CareerController);
  });

  it('myProfile → getCareerProfile(userId)', async () => {
    await controller.myProfile(mockUser as any);
    expect(mockSvc.getCareerProfile).toHaveBeenCalledWith(1);
  });

  it('myGapAnalysis → getCompetencyGapsForUser(userId)', async () => {
    await controller.myGapAnalysis(mockUser as any);
    expect(mockSvc.getCompetencyGapsForUser).toHaveBeenCalledWith(1);
  });

  it('myPromotionEligibility → checkPromotionEligibility(userId)', async () => {
    await controller.myPromotionEligibility(mockUser as any);
    expect(mockSvc.checkPromotionEligibility).toHaveBeenCalledWith(1);
  });

  it('requestPromotion → requestPromotion(userId, targetPositionId, justification)', async () => {
    await controller.requestPromotion(mockUser as any, 5, 'motivo');
    expect(mockSvc.requestPromotion).toHaveBeenCalledWith(1, 5, 'motivo');
  });

  it('simulate → simulateNextRole(userId, targetPositionId)', async () => {
    await controller.simulate(mockUser as any, 3);
    expect(mockSvc.simulateNextRole).toHaveBeenCalledWith(1, 3);
  });

  it('updateInterests → updateCareerInterests(userId, dto)', async () => {
    const dto = {} as any;
    await controller.updateInterests(mockUser as any, dto);
    expect(mockSvc.updateCareerInterests).toHaveBeenCalledWith(1, dto);
  });

  it('userProfile → getCareerProfile(userId)', async () => {
    await controller.userProfile(5);
    expect(mockSvc.getCareerProfile).toHaveBeenCalledWith(5);
  });

  it('userGapAnalysis → getCompetencyGapsForUser(userId)', async () => {
    await controller.userGapAnalysis(5);
    expect(mockSvc.getCompetencyGapsForUser).toHaveBeenCalledWith(5);
  });

  it('simulateUser → simulateNextRole(userId, targetPositionId)', async () => {
    await controller.simulateUser(3, 7);
    expect(mockSvc.simulateNextRole).toHaveBeenCalledWith(3, 7);
  });

  it('findPaths sem deptId → findAllCareerPaths(undefined)', async () => {
    await controller.findPaths();
    expect(mockSvc.findAllCareerPaths).toHaveBeenCalledWith(undefined);
  });

  it('findPaths com deptId → findAllCareerPaths(parsed)', async () => {
    await controller.findPaths('4');
    expect(mockSvc.findAllCareerPaths).toHaveBeenCalledWith(4);
  });

  it('findPath → findOneCareerPath(id)', async () => {
    await controller.findPath(2);
    expect(mockSvc.findOneCareerPath).toHaveBeenCalledWith(2);
  });

  it('createPath → createCareerPath(dto)', async () => {
    const dto = {} as any;
    await controller.createPath(dto);
    expect(mockSvc.createCareerPath).toHaveBeenCalledWith(dto);
  });

  it('updatePath → updateCareerPath(id, dto)', async () => {
    const dto = {} as any;
    await controller.updatePath(1, dto);
    expect(mockSvc.updateCareerPath).toHaveBeenCalledWith(1, dto);
  });

  it('addStep → addCareerPathStep(id, dto)', async () => {
    const dto = {} as any;
    await controller.addStep(1, dto);
    expect(mockSvc.addCareerPathStep).toHaveBeenCalledWith(1, dto);
  });

  it('removeStep → removeCareerPathStep(stepId)', async () => {
    await controller.removeStep(3);
    expect(mockSvc.removeCareerPathStep).toHaveBeenCalledWith(3);
  });

  it('myPlan → getMyCareerPlan(userId)', async () => {
    await controller.myPlan(mockUser as any);
    expect(mockSvc.getMyCareerPlan).toHaveBeenCalledWith(1);
  });

  it('createPlan → createCareerPlan(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createPlan(mockUser as any, dto);
    expect(mockSvc.createCareerPlan).toHaveBeenCalledWith(1, dto);
  });

  it('updatePlan → updateCareerPlan(planId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.updatePlan(mockUser as any, 5, dto);
    expect(mockSvc.updateCareerPlan).toHaveBeenCalledWith(5, 1, dto);
  });

  it('addGoal → addGoalToPlan(planId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.addGoal(mockUser as any, 3, dto);
    expect(mockSvc.addGoalToPlan).toHaveBeenCalledWith(3, 1, dto);
  });

  it('updateGoal → updateGoalProgress(goalId, userId, progress)', async () => {
    await controller.updateGoal(mockUser as any, 4, 75);
    expect(mockSvc.updateGoalProgress).toHaveBeenCalledWith(4, 1, 75);
  });

  it('findVacancies → findAllVacancies(filters, userId)', async () => {
    const filters = {} as any;
    await controller.findVacancies(filters, mockUser as any);
    expect(mockSvc.findAllVacancies).toHaveBeenCalledWith(filters, 1);
  });

  it('createVacancy → createVacancy(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createVacancy(mockUser as any, dto);
    expect(mockSvc.createVacancy).toHaveBeenCalledWith(1, dto);
  });

  it('publishVacancy → publishVacancy(id)', async () => {
    await controller.publishVacancy(2);
    expect(mockSvc.publishVacancy).toHaveBeenCalledWith(2);
  });

  it('apply → applyToVacancy(vacancyId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.apply(3, mockUser as any, dto);
    expect(mockSvc.applyToVacancy).toHaveBeenCalledWith(3, 1, dto);
  });

  it('myApplications → getMyApplications(userId)', async () => {
    await controller.myApplications(mockUser as any);
    expect(mockSvc.getMyApplications).toHaveBeenCalledWith(1);
  });

  it('updateAppStatus → updateApplicationStatus(appId, dto)', async () => {
    const dto = {} as any;
    await controller.updateAppStatus(5, dto);
    expect(mockSvc.updateApplicationStatus).toHaveBeenCalledWith(5, dto);
  });

  it('getSuccession sem posId → getSuccessionPlans(undefined)', async () => {
    await controller.getSuccession();
    expect(mockSvc.getSuccessionPlans).toHaveBeenCalledWith(undefined);
  });

  it('createSuccession → createSuccessionPlan(dto)', async () => {
    const dto = {} as any;
    await controller.createSuccession(dto);
    expect(mockSvc.createSuccessionPlan).toHaveBeenCalledWith(dto);
  });

  it('updateReadiness → updateSuccessionReadiness(id, readiness)', async () => {
    await controller.updateReadiness(1, 'READY');
    expect(mockSvc.updateSuccessionReadiness).toHaveBeenCalledWith(1, 'READY', undefined);
  });

  it('analytics → getCareerAnalytics(filters)', async () => {
    const filters = {} as any;
    await controller.analytics(filters);
    expect(mockSvc.getCareerAnalytics).toHaveBeenCalledWith(filters);
  });

  it('heatmap sem deptId → getTalentHeatmap(undefined)', async () => {
    await controller.heatmap();
    expect(mockSvc.getTalentHeatmap).toHaveBeenCalledWith(undefined);
  });
});

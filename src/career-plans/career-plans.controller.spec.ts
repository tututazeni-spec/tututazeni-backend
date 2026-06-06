import { Test, TestingModule } from '@nestjs/testing';
import { CareerPlansController } from './career-plans.controller';
import { CareerPlansService } from './career-plans.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getAnalytics: jest.fn().mockResolvedValue({}),
  getSuccessionDashboard: jest.fn().mockResolvedValue({}),
  getSuccessionPipeline: jest.fn().mockResolvedValue([]),
  getRoles: jest.fn().mockResolvedValue([]),
  getRole: jest.fn().mockResolvedValue({ id: 1 }),
  createRole: jest.fn().mockResolvedValue({ id: 2 }),
  setRoleSkills: jest.fn().mockResolvedValue({}),
  getSkills: jest.fn().mockResolvedValue([]),
  createSkill: jest.fn().mockResolvedValue({ id: 1 }),
  getCareerPaths: jest.fn().mockResolvedValue([]),
  createCareerPath: jest.fn().mockResolvedValue({ id: 1 }),
  getProgressionRules: jest.fn().mockResolvedValue([]),
  createProgressionRule: jest.fn().mockResolvedValue({ id: 1 }),
  calculateReadiness: jest.fn().mockResolvedValue({ score: 80 }),
  simulateCareer: jest.fn().mockResolvedValue({}),
  getMyPlan: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getProgress: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  activate: jest.fn().mockResolvedValue({}),
  addGoal: jest.fn().mockResolvedValue({ id: 1 }),
  updateGoalProgress: jest.fn().mockResolvedValue({}),
  getPromotions: jest.fn().mockResolvedValue([]),
  requestPromotion: jest.fn().mockResolvedValue({ id: 1 }),
  reviewPromotion: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('CareerPlansController', () => {
  let controller: CareerPlansController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CareerPlansController],
      providers: [{ provide: CareerPlansService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<CareerPlansController>(CareerPlansController);
  });

  it('getAnalytics sem department → getAnalytics(undefined)', async () => {
    await controller.getAnalytics();
    expect(mockSvc.getAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('getAnalytics com department → getAnalytics(dept)', async () => {
    await controller.getAnalytics('IT');
    expect(mockSvc.getAnalytics).toHaveBeenCalledWith('IT');
  });

  it('getSuccessionDashboard → getSuccessionDashboard', async () => {
    await controller.getSuccessionDashboard();
    expect(mockSvc.getSuccessionDashboard).toHaveBeenCalledWith(undefined);
  });

  it('getSuccessionPipeline → getSuccessionPipeline(roleId)', async () => {
    await controller.getSuccessionPipeline(3);
    expect(mockSvc.getSuccessionPipeline).toHaveBeenCalledWith(3);
  });

  it('getRoles → getRoles(undefined)', async () => {
    await controller.getRoles();
    expect(mockSvc.getRoles).toHaveBeenCalledWith(undefined);
  });

  it('getRole → getRole(id)', async () => {
    await controller.getRole(2);
    expect(mockSvc.getRole).toHaveBeenCalledWith(2);
  });

  it('createRole → createRole(dto)', async () => {
    const dto = {} as any;
    await controller.createRole(dto);
    expect(mockSvc.createRole).toHaveBeenCalledWith(dto);
  });

  it('setRoleSkills → setRoleSkills(dto)', async () => {
    const dto = {} as any;
    await controller.setRoleSkills(dto);
    expect(mockSvc.setRoleSkills).toHaveBeenCalledWith(dto);
  });

  it('getSkills → getSkills(undefined)', async () => {
    await controller.getSkills();
    expect(mockSvc.getSkills).toHaveBeenCalledWith(undefined);
  });

  it('createSkill → createSkill(dto)', async () => {
    const dto = {} as any;
    await controller.createSkill(dto);
    expect(mockSvc.createSkill).toHaveBeenCalledWith(dto);
  });

  it('getCareerPaths → getCareerPaths(undefined)', async () => {
    await controller.getCareerPaths();
    expect(mockSvc.getCareerPaths).toHaveBeenCalledWith(undefined);
  });

  it('createCareerPath → createCareerPath(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createCareerPath(dto, mockUser as any);
    expect(mockSvc.createCareerPath).toHaveBeenCalledWith(dto, 1);
  });

  it('getProgressionRules sem fromRoleId → getProgressionRules(undefined)', async () => {
    await controller.getProgressionRules();
    expect(mockSvc.getProgressionRules).toHaveBeenCalledWith(undefined);
  });

  it('getProgressionRules com fromRoleId → getProgressionRules(parsed)', async () => {
    await controller.getProgressionRules('5');
    expect(mockSvc.getProgressionRules).toHaveBeenCalledWith(5);
  });

  it('createProgressionRule → createProgressionRule(dto)', async () => {
    const dto = {} as any;
    await controller.createProgressionRule(dto);
    expect(mockSvc.createProgressionRule).toHaveBeenCalledWith(dto);
  });

  it('getReadiness → calculateReadiness(userId, targetRoleId)', async () => {
    await controller.getReadiness(2, 5);
    expect(mockSvc.calculateReadiness).toHaveBeenCalledWith(2, 5);
  });

  it('simulate → simulateCareer(dto)', async () => {
    const dto = {} as any;
    await controller.simulate(dto);
    expect(mockSvc.simulateCareer).toHaveBeenCalledWith(dto);
  });

  it('myPlan → getMyPlan(userId)', async () => {
    await controller.myPlan(mockUser as any);
    expect(mockSvc.getMyPlan).toHaveBeenCalledWith(1);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(3);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3);
  });

  it('getProgress → getProgress(id)', async () => {
    await controller.getProgress(3);
    expect(mockSvc.getProgress).toHaveBeenCalledWith(3);
  });

  it('create → create(dto, userId)', async () => {
    const dto = {} as any;
    await controller.create(dto, mockUser as any);
    expect(mockSvc.create).toHaveBeenCalledWith(dto, 1);
  });

  it('update → update(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.update(1, dto, mockUser as any);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto, 1);
  });

  it('activate → activate(id, userId)', async () => {
    await controller.activate(2, mockUser as any);
    expect(mockSvc.activate).toHaveBeenCalledWith(2, 1);
  });

  it('addGoal → addGoal(dto)', async () => {
    const dto = {} as any;
    await controller.addGoal(dto);
    expect(mockSvc.addGoal).toHaveBeenCalledWith(dto);
  });

  it('updateGoalProgress → updateGoalProgress(goalId, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateGoalProgress(5, dto, mockUser as any);
    expect(mockSvc.updateGoalProgress).toHaveBeenCalledWith(5, dto, 1);
  });

  it('getPromotions → getPromotions(filters)', async () => {
    const filters = {} as any;
    await controller.getPromotions(filters);
    expect(mockSvc.getPromotions).toHaveBeenCalledWith(filters);
  });

  it('requestPromotion → requestPromotion(dto, userId)', async () => {
    const dto = {} as any;
    await controller.requestPromotion(dto, mockUser as any);
    expect(mockSvc.requestPromotion).toHaveBeenCalledWith(dto, 1);
  });

  it('reviewPromotion → reviewPromotion(id, dto, userId, role)', async () => {
    const dto = {} as any;
    await controller.reviewPromotion(3, dto, mockUser as any);
    expect(mockSvc.reviewPromotion).toHaveBeenCalledWith(3, dto, 1, mockUser.role);
  });
});

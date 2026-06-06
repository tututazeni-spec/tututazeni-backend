import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getCycles: jest.fn().mockResolvedValue([]),
  getCurrentCycle: jest.fn().mockResolvedValue({}),
  createCycle: jest.fn().mockResolvedValue({ id: 1 }),
  activateCycle: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getUserHistory: jest.fn().mockResolvedValue({}),
  getUserGoals: jest.fn().mockResolvedValue([]),
  getUserFeedback: jest.fn().mockResolvedValue([]),
  getPerformanceAnalytics: jest.fn().mockResolvedValue({}),
  get9Box: jest.fn().mockResolvedValue([]),
  getTeamPerformance: jest.fn().mockResolvedValue({}),
  getPeriods: jest.fn().mockResolvedValue([]),
  getDepartmentStats: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  submitReview: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue({}),
  createGoal: jest.fn().mockResolvedValue({ id: 1 }),
  updateGoalProgress: jest.fn().mockResolvedValue({}),
  createFeedback: jest.fn().mockResolvedValue({ id: 1 }),
  calibrateReview: jest.fn().mockResolvedValue({}),
  createDispute: jest.fn().mockResolvedValue({ id: 1 }),
  update9Box: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('PerformanceController', () => {
  let controller: PerformanceController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PerformanceController],
      providers: [{ provide: PerformanceService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<PerformanceController>(PerformanceController);
  });

  it('getCycles → getCycles', async () => {
    await controller.getCycles();
    expect(mockSvc.getCycles).toHaveBeenCalled();
  });

  it('getCurrentCycle → getCurrentCycle', async () => {
    await controller.getCurrentCycle();
    expect(mockSvc.getCurrentCycle).toHaveBeenCalled();
  });

  it('createCycle → createCycle(dto)', async () => {
    const dto = {} as any;
    await controller.createCycle(dto);
    expect(mockSvc.createCycle).toHaveBeenCalledWith(dto);
  });

  it('activateCycle → activateCycle(id)', async () => {
    await controller.activateCycle(2);
    expect(mockSvc.activateCycle).toHaveBeenCalledWith(2);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('myHistory → getUserHistory(userId)', async () => {
    await controller.myHistory(mockUser as any);
    expect(mockSvc.getUserHistory).toHaveBeenCalledWith(1);
  });

  it('myGoals sem cycleId → getUserGoals(userId, undefined)', async () => {
    await controller.myGoals(mockUser as any);
    expect(mockSvc.getUserGoals).toHaveBeenCalledWith(1, undefined);
  });

  it('myGoals com cycleId → getUserGoals(userId, parsed)', async () => {
    await controller.myGoals(mockUser as any, '3');
    expect(mockSvc.getUserGoals).toHaveBeenCalledWith(1, 3);
  });

  it('myFeedback sem cycleId → getUserFeedback(userId, undefined)', async () => {
    await controller.myFeedback(mockUser as any);
    expect(mockSvc.getUserFeedback).toHaveBeenCalledWith(1, undefined);
  });

  it('myFeedback com cycleId → getUserFeedback(userId, parsed)', async () => {
    await controller.myFeedback(mockUser as any, '4');
    expect(mockSvc.getUserFeedback).toHaveBeenCalledWith(1, 4);
  });

  it('analytics sem cycleId → getPerformanceAnalytics(undefined)', async () => {
    await controller.analytics();
    expect(mockSvc.getPerformanceAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('analytics com cycleId → getPerformanceAnalytics(parsed)', async () => {
    await controller.analytics('2');
    expect(mockSvc.getPerformanceAnalytics).toHaveBeenCalledWith(2);
  });

  it('get9Box sem params → get9Box(undefined, undefined)', async () => {
    await controller.get9Box();
    expect(mockSvc.get9Box).toHaveBeenCalledWith(undefined, undefined);
  });

  it('get9Box com params → get9Box(parsed, parsed)', async () => {
    await controller.get9Box('1', '5');
    expect(mockSvc.get9Box).toHaveBeenCalledWith(1, 5);
  });

  it('teamPerformance sem cycleId → getTeamPerformance(userId, undefined)', async () => {
    await controller.teamPerformance(mockUser as any);
    expect(mockSvc.getTeamPerformance).toHaveBeenCalledWith(1, undefined);
  });

  it('teamPerformance com cycleId → getTeamPerformance(userId, parsed)', async () => {
    await controller.teamPerformance(mockUser as any, '3');
    expect(mockSvc.getTeamPerformance).toHaveBeenCalledWith(1, 3);
  });

  it('periods → getPeriods', async () => {
    await controller.periods();
    expect(mockSvc.getPeriods).toHaveBeenCalled();
  });

  it('departmentStats sem cycleId → getDepartmentStats(id, undefined)', async () => {
    await controller.departmentStats(2);
    expect(mockSvc.getDepartmentStats).toHaveBeenCalledWith(2, undefined);
  });

  it('departmentStats com cycleId → getDepartmentStats(id, parsed)', async () => {
    await controller.departmentStats(2, '5');
    expect(mockSvc.getDepartmentStats).toHaveBeenCalledWith(2, 5);
  });

  it('userHistory → getUserHistory(userId)', async () => {
    await controller.userHistory(3);
    expect(mockSvc.getUserHistory).toHaveBeenCalledWith(3);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(1);
    expect(mockSvc.findOne).toHaveBeenCalledWith(1);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('submit → submitReview(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submit(mockUser as any, dto);
    expect(mockSvc.submitReview).toHaveBeenCalledWith(1, dto);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('createGoal → createGoal(dto)', async () => {
    const dto = {} as any;
    await controller.createGoal(dto);
    expect(mockSvc.createGoal).toHaveBeenCalledWith(dto);
  });

  it('updateGoalProgress → updateGoalProgress(goalId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.updateGoalProgress(5, mockUser as any, dto);
    expect(mockSvc.updateGoalProgress).toHaveBeenCalledWith(5, 1, dto);
  });

  it('userGoals sem cycleId → getUserGoals(userId, undefined)', async () => {
    await controller.userGoals(3);
    expect(mockSvc.getUserGoals).toHaveBeenCalledWith(3, undefined);
  });

  it('createFeedback → createFeedback(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createFeedback(mockUser as any, dto);
    expect(mockSvc.createFeedback).toHaveBeenCalledWith(1, dto);
  });

  it('userFeedback → getUserFeedback(userId)', async () => {
    await controller.userFeedback(3);
    expect(mockSvc.getUserFeedback).toHaveBeenCalledWith(3, undefined);
  });

  it('calibrate → calibrateReview(userId, dto)', async () => {
    const dto = {} as any;
    await controller.calibrate(mockUser as any, dto);
    expect(mockSvc.calibrateReview).toHaveBeenCalledWith(1, dto);
  });

  it('dispute → createDispute(userId, dto)', async () => {
    const dto = {} as any;
    await controller.dispute(mockUser as any, dto);
    expect(mockSvc.createDispute).toHaveBeenCalledWith(1, dto);
  });

  it('update9Box → update9Box(userId, dto)', async () => {
    const dto = {} as any;
    await controller.update9Box(mockUser as any, dto);
    expect(mockSvc.update9Box).toHaveBeenCalledWith(1, dto);
  });
});

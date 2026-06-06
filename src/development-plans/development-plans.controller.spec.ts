import { Test, TestingModule } from '@nestjs/testing';
import { DevelopmentPlansController } from './development-plans.controller';
import { DevelopmentPlansService } from './development-plans.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getMyPlans: jest.fn().mockResolvedValue([]),
  getStats: jest.fn().mockResolvedValue({}),
  getTeamDashboard: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  submitForApproval: jest.fn().mockResolvedValue({}),
  approvePlan: jest.fn().mockResolvedValue({}),
  complete: jest.fn().mockResolvedValue({}),
  cancel: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
  addAction: jest.fn().mockResolvedValue({ id: 1 }),
  updateAction: jest.fn().mockResolvedValue({}),
  removeAction: jest.fn().mockResolvedValue({}),
  addEvidence: jest.fn().mockResolvedValue({ id: 1 }),
  addGoal: jest.fn().mockResolvedValue({ id: 1 }),
  updateGoalProgress: jest.fn().mockResolvedValue({}),
  addCheckpoint: jest.fn().mockResolvedValue({ id: 1 }),
  completeCheckpoint: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('DevelopmentPlansController', () => {
  let controller: DevelopmentPlansController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DevelopmentPlansController],
      providers: [{ provide: DevelopmentPlansService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<DevelopmentPlansController>(DevelopmentPlansController);
  });

  it('myPlans → getMyPlans(userId)', async () => {
    await controller.myPlans(mockUser as any);
    expect(mockSvc.getMyPlans).toHaveBeenCalledWith(1);
  });

  it('myStats → getStats(userId)', async () => {
    await controller.myStats(mockUser as any);
    expect(mockSvc.getStats).toHaveBeenCalledWith(1);
  });

  it('teamDashboard → getTeamDashboard(userId)', async () => {
    await controller.teamDashboard(mockUser as any);
    expect(mockSvc.getTeamDashboard).toHaveBeenCalledWith(1);
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

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });

  it('submit → submitForApproval(id)', async () => {
    await controller.submit(2);
    expect(mockSvc.submitForApproval).toHaveBeenCalledWith(2);
  });

  it('approve → approvePlan(dto, userId)', async () => {
    const dto = {} as any;
    await controller.approve(mockUser as any, dto);
    expect(mockSvc.approvePlan).toHaveBeenCalledWith(dto, 1);
  });

  it('complete → complete(id)', async () => {
    await controller.complete(4);
    expect(mockSvc.complete).toHaveBeenCalledWith(4);
  });

  it('cancel sem reason → cancel(id, undefined)', async () => {
    await controller.cancel(5);
    expect(mockSvc.cancel).toHaveBeenCalledWith(5, undefined);
  });

  it('cancel com reason → cancel(id, reason)', async () => {
    await controller.cancel(5, 'motivo');
    expect(mockSvc.cancel).toHaveBeenCalledWith(5, 'motivo');
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('addAction → addAction(dto)', async () => {
    const dto = {} as any;
    await controller.addAction(dto);
    expect(mockSvc.addAction).toHaveBeenCalledWith(dto);
  });

  it('updateAction → updateAction(actionId, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateAction(5, mockUser as any, dto);
    expect(mockSvc.updateAction).toHaveBeenCalledWith(5, dto, 1);
  });

  it('removeAction → removeAction(actionId)', async () => {
    await controller.removeAction(7);
    expect(mockSvc.removeAction).toHaveBeenCalledWith(7);
  });

  it('addEvidence → addEvidence(userId, dto)', async () => {
    const dto = {} as any;
    await controller.addEvidence(mockUser as any, dto);
    expect(mockSvc.addEvidence).toHaveBeenCalledWith(1, dto);
  });

  it('addGoal → addGoal(dto)', async () => {
    const dto = {} as any;
    await controller.addGoal(dto);
    expect(mockSvc.addGoal).toHaveBeenCalledWith(dto);
  });

  it('updateGoalProgress → updateGoalProgress(userId, dto)', async () => {
    const dto = {} as any;
    await controller.updateGoalProgress(mockUser as any, dto);
    expect(mockSvc.updateGoalProgress).toHaveBeenCalledWith(1, dto);
  });

  it('addCheckpoint → addCheckpoint(dto)', async () => {
    const dto = {} as any;
    await controller.addCheckpoint(dto);
    expect(mockSvc.addCheckpoint).toHaveBeenCalledWith(dto);
  });

  it('completeCheckpoint → completeCheckpoint(dto)', async () => {
    const dto = {} as any;
    await controller.completeCheckpoint(dto);
    expect(mockSvc.completeCheckpoint).toHaveBeenCalledWith(dto);
  });
});

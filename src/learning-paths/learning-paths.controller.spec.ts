import { Test, TestingModule } from '@nestjs/testing';
import { LearningPathsController } from './learning-paths.controller';
import { LearningPathsService } from './learning-paths.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getAdminDashboard: jest.fn().mockResolvedValue({}),
  getMyEnrollments: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getAnalytics: jest.fn().mockResolvedValue({}),
  getAssignments: jest.fn().mockResolvedValue([]),
  getMyProgress: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  archive: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
  duplicate: jest.fn().mockResolvedValue({ id: 3 }),
  remove: jest.fn().mockResolvedValue({}),
  addStep: jest.fn().mockResolvedValue({ id: 1 }),
  reorderSteps: jest.fn().mockResolvedValue({}),
  removeStep: jest.fn().mockResolvedValue({}),
  createMilestone: jest.fn().mockResolvedValue({ id: 1 }),
  removeMilestone: jest.fn().mockResolvedValue({}),
  selfEnroll: jest.fn().mockResolvedValue({ id: 1 }),
  assign: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('LearningPathsController', () => {
  let controller: LearningPathsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LearningPathsController],
      providers: [{ provide: LearningPathsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<LearningPathsController>(LearningPathsController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('adminDashboard → getAdminDashboard', async () => {
    await controller.adminDashboard();
    expect(mockSvc.getAdminDashboard).toHaveBeenCalled();
  });

  it('myEnrollments → getMyEnrollments(userId)', async () => {
    await controller.myEnrollments(mockUser as any);
    expect(mockSvc.getMyEnrollments).toHaveBeenCalledWith(1);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(3);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3);
  });

  it('analytics → getAnalytics(id)', async () => {
    await controller.analytics(2);
    expect(mockSvc.getAnalytics).toHaveBeenCalledWith(2);
  });

  it('assignments → getAssignments(id)', async () => {
    await controller.assignments(4);
    expect(mockSvc.getAssignments).toHaveBeenCalledWith(4);
  });

  it('progress → getMyProgress(id, userId)', async () => {
    await controller.progress(5, mockUser as any);
    expect(mockSvc.getMyProgress).toHaveBeenCalledWith(5, 1);
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

  it('publish → publish(id)', async () => {
    await controller.publish(1);
    expect(mockSvc.publish).toHaveBeenCalledWith(1);
  });

  it('archive → archive(id)', async () => {
    await controller.archive(1);
    expect(mockSvc.archive).toHaveBeenCalledWith(1);
  });

  it('duplicate → duplicate(id)', async () => {
    await controller.duplicate(1);
    expect(mockSvc.duplicate).toHaveBeenCalledWith(1);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('addStep → addStep(id, dto)', async () => {
    const dto = {} as any;
    await controller.addStep(1, dto);
    expect(mockSvc.addStep).toHaveBeenCalledWith(1, dto);
  });

  it('reorderSteps → reorderSteps(id, dto)', async () => {
    const dto = {} as any;
    await controller.reorderSteps(1, dto);
    expect(mockSvc.reorderSteps).toHaveBeenCalledWith(1, dto);
  });

  it('removeStep → removeStep(id, courseId)', async () => {
    await controller.removeStep(1, 5);
    expect(mockSvc.removeStep).toHaveBeenCalledWith(1, 5);
  });

  it('createMilestone → createMilestone(id, dto)', async () => {
    const dto = { title: 'M1', seq: 1 };
    await controller.createMilestone(1, dto);
    expect(mockSvc.createMilestone).toHaveBeenCalledWith(1, dto);
  });

  it('removeMilestone → removeMilestone(milestoneId)', async () => {
    await controller.removeMilestone(3);
    expect(mockSvc.removeMilestone).toHaveBeenCalledWith(3);
  });

  it('selfEnroll → selfEnroll(id, userId)', async () => {
    await controller.selfEnroll(5, mockUser as any);
    expect(mockSvc.selfEnroll).toHaveBeenCalledWith(5, 1);
  });

  it('assign → assign(dto)', async () => {
    const dto = {} as any;
    await controller.assign(dto);
    expect(mockSvc.assign).toHaveBeenCalledWith(dto);
  });
});

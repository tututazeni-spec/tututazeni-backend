import { Test, TestingModule } from '@nestjs/testing';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getPendingReviews: jest.fn().mockResolvedValue([]),
  getUserAttempts: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getAnalytics: jest.fn().mockResolvedValue({}),
  getAttemptDetail: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  archive: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
  duplicate: jest.fn().mockResolvedValue({ id: 3 }),
  remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  addQuestion: jest.fn().mockResolvedValue({ id: 1 }),
  removeQuestion: jest.fn().mockResolvedValue({}),
  startAttempt: jest.fn().mockResolvedValue({ attemptId: 1 }),
  autoSave: jest.fn().mockResolvedValue({ saved: true }),
  submitAttempt: jest.fn().mockResolvedValue({ score: 80 }),
  reviewAnswer: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('AssessmentsController', () => {
  let controller: AssessmentsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [{ provide: AssessmentsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AssessmentsController>(AssessmentsController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('pendingReviews → getPendingReviews', async () => {
    await controller.pendingReviews();
    expect(mockSvc.getPendingReviews).toHaveBeenCalled();
  });

  it('myAttempts sem assessmentId → getUserAttempts(userId, undefined)', async () => {
    await controller.myAttempts(mockUser as any);
    expect(mockSvc.getUserAttempts).toHaveBeenCalledWith(1, undefined);
  });

  it('myAttempts com assessmentId → getUserAttempts(userId, parsed)', async () => {
    await controller.myAttempts(mockUser as any, '5');
    expect(mockSvc.getUserAttempts).toHaveBeenCalledWith(1, 5);
  });

  it('findOne → findOne(id, true)', async () => {
    await controller.findOne(2);
    expect(mockSvc.findOne).toHaveBeenCalledWith(2, true);
  });

  it('analytics → getAnalytics(id)', async () => {
    await controller.analytics(3);
    expect(mockSvc.getAnalytics).toHaveBeenCalledWith(3);
  });

  it('attemptDetail → getAttemptDetail(attemptId, userId)', async () => {
    await controller.attemptDetail(10, mockUser as any);
    expect(mockSvc.getAttemptDetail).toHaveBeenCalledWith(10, 1);
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

  it('addQuestion → addQuestion(id, dto)', async () => {
    const dto = {} as any;
    await controller.addQuestion(1, dto);
    expect(mockSvc.addQuestion).toHaveBeenCalledWith(1, dto);
  });

  it('removeQuestion → removeQuestion(questionId)', async () => {
    await controller.removeQuestion(7);
    expect(mockSvc.removeQuestion).toHaveBeenCalledWith(7);
  });

  it('startAttempt → startAttempt(userId, dto)', async () => {
    const dto = {} as any;
    await controller.startAttempt(mockUser as any, dto);
    expect(mockSvc.startAttempt).toHaveBeenCalledWith(1, dto);
  });

  it('autoSave → autoSave(userId, dto)', async () => {
    const dto = {} as any;
    await controller.autoSave(mockUser as any, dto);
    expect(mockSvc.autoSave).toHaveBeenCalledWith(1, dto);
  });

  it('submitAttempt → submitAttempt(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submitAttempt(mockUser as any, dto);
    expect(mockSvc.submitAttempt).toHaveBeenCalledWith(1, dto);
  });

  it('reviewAnswer → reviewAnswer(dto, reviewerId)', async () => {
    const dto = {} as any;
    await controller.reviewAnswer(mockUser as any, dto);
    expect(mockSvc.reviewAnswer).toHaveBeenCalledWith(dto, 1);
  });

  it('findByCourse → findAll({ courseId })', async () => {
    await controller.findByCourse(5);
    expect(mockSvc.findAll).toHaveBeenCalledWith({ courseId: 5 });
  });

  it('userAttempts sem assessmentId → getUserAttempts(userId, undefined)', async () => {
    await controller.userAttempts(2);
    expect(mockSvc.getUserAttempts).toHaveBeenCalledWith(2, undefined);
  });

  it('userAttempts com assessmentId → getUserAttempts(userId, parsed)', async () => {
    await controller.userAttempts(2, '3');
    expect(mockSvc.getUserAttempts).toHaveBeenCalledWith(2, 3);
  });
});

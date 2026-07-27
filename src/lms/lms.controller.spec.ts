import { Test, TestingModule } from '@nestjs/testing';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  createPath: jest.fn().mockResolvedValue({ id: 1 }),
  findAllPaths: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getLmsDashboard: jest.fn().mockResolvedValue({}),
  getRecommendations: jest.fn().mockResolvedValue([]),
  getMyPaths: jest.fn().mockResolvedValue([]),
  getMyAnalytics: jest.fn().mockResolvedValue({}),
  findPathById: jest.fn().mockResolvedValue({ id: 1 }),
  updatePath: jest.fn().mockResolvedValue({ id: 1 }),
  softDeletePath: jest.fn().mockResolvedValue({}),
  enrollInPath: jest.fn().mockResolvedValue({ id: 1 }),
  updatePathProgress: jest.fn().mockResolvedValue({}),
  createSession: jest.fn().mockResolvedValue({ id: 1 }),
  findUpcomingSessions: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  registerForSession: jest.fn().mockResolvedValue({}),
  markAttendance: jest.fn().mockResolvedValue({}),
  submitSessionFeedback: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('LmsController', () => {
  let controller: LmsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LmsController],
      providers: [{ provide: LmsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<LmsController>(LmsController);
  });

  it('createPath → createPath(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createPath(dto, mockUser as any);
    expect(mockSvc.createPath).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllPaths → findAllPaths(filters)', async () => {
    const filters = {} as any;
    await controller.findAllPaths(filters);
    expect(mockSvc.findAllPaths).toHaveBeenCalledWith(filters);
  });

  it('getDashboard → getLmsDashboard()', async () => {
    await controller.getDashboard();
    expect(mockSvc.getLmsDashboard).toHaveBeenCalled();
  });

  it('getRecommendations → getRecommendations(userId)', async () => {
    await controller.getRecommendations(mockUser as any);
    expect(mockSvc.getRecommendations).toHaveBeenCalledWith(1);
  });

  it('getMyPaths → getMyPaths(userId)', async () => {
    await controller.getMyPaths(mockUser as any);
    expect(mockSvc.getMyPaths).toHaveBeenCalledWith(1);
  });

  it('getMyAnalytics → getMyAnalytics(userId)', async () => {
    await controller.getMyAnalytics(mockUser as any);
    expect(mockSvc.getMyAnalytics).toHaveBeenCalledWith(1);
  });

  it('findPathById → findPathById(id)', async () => {
    await controller.findPathById('p1');
    expect(mockSvc.findPathById).toHaveBeenCalledWith('p1');
  });

  it('updatePath → updatePath(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updatePath('p1', dto, mockUser as any);
    expect(mockSvc.updatePath).toHaveBeenCalledWith('p1', dto, 1);
  });

  it('removePath → softDeletePath(id, userId)', async () => {
    await controller.removePath('p1', mockUser as any);
    expect(mockSvc.softDeletePath).toHaveBeenCalledWith('p1', 1);
  });

  it('enrollInPath → enrollInPath(id, userId)', async () => {
    await controller.enrollInPath('p1', mockUser as any);
    expect(mockSvc.enrollInPath).toHaveBeenCalledWith('p1', 1);
  });

  it('updateProgress → updatePathProgress(id, completedCourseId, userId)', async () => {
    await controller.updateProgress('p1', 'c1', mockUser as any);
    expect(mockSvc.updatePathProgress).toHaveBeenCalledWith('p1', 'c1', 1);
  });

  it('createSession → createSession(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createSession(dto, mockUser as any);
    expect(mockSvc.createSession).toHaveBeenCalledWith(dto, 1);
  });

  it('findUpcomingSessions → findUpcomingSessions(page, limit)', async () => {
    await controller.findUpcomingSessions(1, 20);
    expect(mockSvc.findUpcomingSessions).toHaveBeenCalledWith(1, 20);
  });

  it('registerForSession → registerForSession(id, userId)', async () => {
    await controller.registerForSession('s1', mockUser as any);
    expect(mockSvc.registerForSession).toHaveBeenCalledWith('s1', 1);
  });

  it('markAttendance → markAttendance(id, userId)', async () => {
    await controller.markAttendance('s1', mockUser as any);
    expect(mockSvc.markAttendance).toHaveBeenCalledWith('s1', 1);
  });

  it('submitFeedback → submitSessionFeedback(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.submitFeedback('s1', dto, mockUser as any);
    expect(mockSvc.submitSessionFeedback).toHaveBeenCalledWith('s1', dto, 1);
  });
});

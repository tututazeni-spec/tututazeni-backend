import { Test, TestingModule } from '@nestjs/testing';
import { LeaderController } from './leader.controller';
import { LeaderService } from './leader.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getLeaders: jest.fn().mockResolvedValue([]),
  getLeaderDashboard: jest.fn().mockResolvedValue({}),
  getTeam: jest.fn().mockResolvedValue([]),
  getTeamPlans: jest.fn().mockResolvedValue([]),
  getTalentPipeline: jest.fn().mockResolvedValue({}),
  getLeaderAlerts: jest.fn().mockResolvedValue([]),
  getAiRecommendations: jest.fn().mockResolvedValue([]),
  getMemberProfile: jest.fn().mockResolvedValue({}),
  getTeamPerformance: jest.fn().mockResolvedValue({}),
  giveFeedback: jest.fn().mockResolvedValue({ id: 1 }),
  getTeamFeedbacks: jest.fn().mockResolvedValue([]),
  createOneOnOne: jest.fn().mockResolvedValue({ id: 1 }),
  getOneOnOnes: jest.fn().mockResolvedValue([]),
  completeOneOnOne: jest.fn().mockResolvedValue({}),
  approvePlan: jest.fn().mockResolvedValue({}),
  assignCourse: jest.fn().mockResolvedValue({}),
  upsertProfile: jest.fn().mockResolvedValue({}),
  getProfile: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('LeaderController', () => {
  let controller: LeaderController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaderController],
      providers: [{ provide: LeaderService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<LeaderController>(LeaderController);
  });

  it('getLeaders → getLeaders', async () => {
    await controller.getLeaders();
    expect(mockSvc.getLeaders).toHaveBeenCalled();
  });

  it('myDashboard → getLeaderDashboard(userId)', async () => {
    await controller.myDashboard(mockUser as any);
    expect(mockSvc.getLeaderDashboard).toHaveBeenCalledWith(1);
  });

  it('myTeam → getTeam(userId, filters)', async () => {
    const filters = {} as any;
    await controller.myTeam(mockUser as any, filters);
    expect(mockSvc.getTeam).toHaveBeenCalledWith(1, filters);
  });

  it('myTeamPlans → getTeamPlans(userId)', async () => {
    await controller.myTeamPlans(mockUser as any);
    expect(mockSvc.getTeamPlans).toHaveBeenCalledWith(1);
  });

  it('myTalentPipeline → getTalentPipeline(userId)', async () => {
    await controller.myTalentPipeline(mockUser as any);
    expect(mockSvc.getTalentPipeline).toHaveBeenCalledWith(1);
  });

  it('myAlerts → getLeaderAlerts(userId)', async () => {
    await controller.myAlerts(mockUser as any);
    expect(mockSvc.getLeaderAlerts).toHaveBeenCalledWith(1);
  });

  it('myRecommendations → getAiRecommendations(userId)', async () => {
    await controller.myRecommendations(mockUser as any);
    expect(mockSvc.getAiRecommendations).toHaveBeenCalledWith(1);
  });

  it('memberProfile → getMemberProfile(userId, memberId)', async () => {
    await controller.memberProfile(mockUser as any, 3);
    expect(mockSvc.getMemberProfile).toHaveBeenCalledWith(1, 3);
  });

  it('dashboard → getLeaderDashboard(id)', async () => {
    await controller.dashboard(5);
    expect(mockSvc.getLeaderDashboard).toHaveBeenCalledWith(5);
  });

  it('teamPerf → getTeamPerformance(id)', async () => {
    await controller.teamPerf(3);
    expect(mockSvc.getTeamPerformance).toHaveBeenCalledWith(3, undefined);
  });

  it('giveFeedback → giveFeedback(userId, dto)', async () => {
    const dto = {} as any;
    await controller.giveFeedback(mockUser as any, dto);
    expect(mockSvc.giveFeedback).toHaveBeenCalledWith(1, dto);
  });

  it('teamFeedbacks → getTeamFeedbacks(userId)', async () => {
    await controller.teamFeedbacks(mockUser as any);
    expect(mockSvc.getTeamFeedbacks).toHaveBeenCalledWith(1, undefined);
  });

  it('create1on1 → createOneOnOne(userId, dto)', async () => {
    const dto = {} as any;
    await controller.create1on1(mockUser as any, dto);
    expect(mockSvc.createOneOnOne).toHaveBeenCalledWith(1, dto);
  });

  it('list1on1 → getOneOnOnes(userId)', async () => {
    await controller.list1on1(mockUser as any);
    expect(mockSvc.getOneOnOnes).toHaveBeenCalledWith(1, undefined);
  });

  it('complete1on1 → completeOneOnOne(id, notes)', async () => {
    await controller.complete1on1(4, { notes: 'notas' });
    expect(mockSvc.completeOneOnOne).toHaveBeenCalledWith(4, 'notas');
  });

  it('approvePlan → approvePlan(planId, userId)', async () => {
    await controller.approvePlan(5, mockUser as any);
    expect(mockSvc.approvePlan).toHaveBeenCalledWith(5, 1);
  });

  it('assignCourse → assignCourse(dto)', async () => {
    const dto = {} as any;
    await controller.assignCourse(dto);
    expect(mockSvc.assignCourse).toHaveBeenCalledWith(dto);
  });

  it('upsertProfile → upsertProfile(dto)', async () => {
    const dto = {} as any;
    await controller.upsertProfile(dto);
    expect(mockSvc.upsertProfile).toHaveBeenCalledWith(dto);
  });

  it('getProfile → getProfile(userId)', async () => {
    await controller.getProfile(3);
    expect(mockSvc.getProfile).toHaveBeenCalledWith(3);
  });
});

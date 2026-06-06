import { Test, TestingModule } from '@nestjs/testing';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getSurveys: jest.fn().mockResolvedValue([]),
  getTemplates: jest.fn().mockResolvedValue([]),
  getSurvey: jest.fn().mockResolvedValue({ id: 1 }),
  getSurveyResults: jest.fn().mockResolvedValue({}),
  createSurvey: jest.fn().mockResolvedValue({ id: 2 }),
  updateSurvey: jest.fn().mockResolvedValue({ id: 1 }),
  activateSurvey: jest.fn().mockResolvedValue({}),
  closeSurvey: jest.fn().mockResolvedValue({}),
  submitSurvey: jest.fn().mockResolvedValue({}),
  submitENPS: jest.fn().mockResolvedValue({}),
  getENPSScore: jest.fn().mockResolvedValue({}),
  submitMood: jest.fn().mockResolvedValue({}),
  getMoodTrend: jest.fn().mockResolvedValue([]),
  getTeamMoodOverview: jest.fn().mockResolvedValue({}),
  createFeedback: jest.fn().mockResolvedValue({ id: 1 }),
  getFeedback: jest.fn().mockResolvedValue([]),
  replyToFeedback: jest.fn().mockResolvedValue({}),
  giveRecognition: jest.fn().mockResolvedValue({ id: 1 }),
  getRecognitionFeed: jest.fn().mockResolvedValue([]),
  getLeaderboard: jest.fn().mockResolvedValue([]),
  createOneOnOne: jest.fn().mockResolvedValue({ id: 1 }),
  getOneOnOnes: jest.fn().mockResolvedValue([]),
  updateOneOnOne: jest.fn().mockResolvedValue({}),
  createActionPlan: jest.fn().mockResolvedValue({ id: 1 }),
  getActionPlans: jest.fn().mockResolvedValue([]),
  updateActionPlan: jest.fn().mockResolvedValue({}),
  getDashboard: jest.fn().mockResolvedValue({}),
  getEngagementIndex: jest.fn().mockResolvedValue({}),
  getEngagementHeatmap: jest.fn().mockResolvedValue([]),
  getManagerInsights: jest.fn().mockResolvedValue({}),
  getHumanSuccessScore: jest.fn().mockResolvedValue({}),
  getMyEngagementSummary: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('EngagementController', () => {
  let controller: EngagementController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EngagementController],
      providers: [{ provide: EngagementService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<EngagementController>(EngagementController);
  });

  it('getSurveys → getSurveys(filters)', async () => {
    const filters = {} as any;
    await controller.getSurveys(filters);
    expect(mockSvc.getSurveys).toHaveBeenCalledWith(filters);
  });

  it('getTemplates → getTemplates', async () => {
    await controller.getTemplates();
    expect(mockSvc.getTemplates).toHaveBeenCalled();
  });

  it('getSurvey → getSurvey(id)', async () => {
    await controller.getSurvey(3);
    expect(mockSvc.getSurvey).toHaveBeenCalledWith(3);
  });

  it('getResults → getSurveyResults(id, userId)', async () => {
    await controller.getResults(2, mockUser as any);
    expect(mockSvc.getSurveyResults).toHaveBeenCalledWith(2, 1);
  });

  it('createSurvey → createSurvey(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createSurvey(dto, mockUser as any);
    expect(mockSvc.createSurvey).toHaveBeenCalledWith(dto, 1);
  });

  it('updateSurvey → updateSurvey(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateSurvey(1, dto);
    expect(mockSvc.updateSurvey).toHaveBeenCalledWith(1, dto);
  });

  it('activateSurvey → activateSurvey(id)', async () => {
    await controller.activateSurvey(2);
    expect(mockSvc.activateSurvey).toHaveBeenCalledWith(2);
  });

  it('closeSurvey → closeSurvey(id)', async () => {
    await controller.closeSurvey(3);
    expect(mockSvc.closeSurvey).toHaveBeenCalledWith(3);
  });

  it('respond → submitSurvey(userId, dto)', async () => {
    const dto = {} as any;
    await controller.respond(mockUser as any, dto);
    expect(mockSvc.submitSurvey).toHaveBeenCalledWith(1, dto);
  });

  it('submitENPS → submitENPS(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submitENPS(mockUser as any, dto);
    expect(mockSvc.submitENPS).toHaveBeenCalledWith(1, dto);
  });

  it('getENPS sem departmentId → getENPSScore(undefined)', async () => {
    await controller.getENPS();
    expect(mockSvc.getENPSScore).toHaveBeenCalledWith(undefined);
  });

  it('getENPS com departmentId → getENPSScore(parsed)', async () => {
    await controller.getENPS('4');
    expect(mockSvc.getENPSScore).toHaveBeenCalledWith(4);
  });

  it('submitMood → submitMood(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submitMood(mockUser as any, dto);
    expect(mockSvc.submitMood).toHaveBeenCalledWith(1, dto);
  });

  it('myMoodTrend sem days → getMoodTrend(userId, 14)', async () => {
    await controller.myMoodTrend(mockUser as any);
    expect(mockSvc.getMoodTrend).toHaveBeenCalledWith(1, 14);
  });

  it('myMoodTrend com days → getMoodTrend(userId, parsed)', async () => {
    await controller.myMoodTrend(mockUser as any, '7');
    expect(mockSvc.getMoodTrend).toHaveBeenCalledWith(1, 7);
  });

  it('teamMood → getTeamMoodOverview(managerId)', async () => {
    await controller.teamMood(5);
    expect(mockSvc.getTeamMoodOverview).toHaveBeenCalledWith(5);
  });

  it('createFeedback → createFeedback(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createFeedback(mockUser as any, dto);
    expect(mockSvc.createFeedback).toHaveBeenCalledWith(1, dto);
  });

  it('getFeedback → getFeedback(filters)', async () => {
    const filters = {} as any;
    await controller.getFeedback(filters);
    expect(mockSvc.getFeedback).toHaveBeenCalledWith(filters);
  });

  it('replyFeedback → replyToFeedback(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.replyFeedback(3, mockUser as any, dto);
    expect(mockSvc.replyToFeedback).toHaveBeenCalledWith(3, 1, dto);
  });

  it('giveRecognition → giveRecognition(userId, dto)', async () => {
    const dto = {} as any;
    await controller.giveRecognition(mockUser as any, dto);
    expect(mockSvc.giveRecognition).toHaveBeenCalledWith(1, dto);
  });

  it('recognitionFeed → getRecognitionFeed(filters)', async () => {
    const filters = {} as any;
    await controller.recognitionFeed(filters);
    expect(mockSvc.getRecognitionFeed).toHaveBeenCalledWith(filters);
  });

  it('leaderboard com defaults → getLeaderboard(points, undefined, 10)', async () => {
    await controller.leaderboard();
    expect(mockSvc.getLeaderboard).toHaveBeenCalledWith('points', undefined, 10);
  });

  it('createOneOnOne → createOneOnOne(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createOneOnOne(mockUser as any, dto);
    expect(mockSvc.createOneOnOne).toHaveBeenCalledWith(1, dto);
  });

  it('myOneOnOnes → getOneOnOnes(userId)', async () => {
    await controller.myOneOnOnes(mockUser as any);
    expect(mockSvc.getOneOnOnes).toHaveBeenCalledWith(1);
  });

  it('updateOneOnOne → updateOneOnOne(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.updateOneOnOne(2, mockUser as any, dto);
    expect(mockSvc.updateOneOnOne).toHaveBeenCalledWith(2, 1, dto);
  });

  it('createActionPlan → createActionPlan(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createActionPlan(mockUser as any, dto);
    expect(mockSvc.createActionPlan).toHaveBeenCalledWith(1, dto);
  });

  it('getActionPlans com defaults → getActionPlans com page=1 limit=20', async () => {
    await controller.getActionPlans();
    expect(mockSvc.getActionPlans).toHaveBeenCalledWith({ departmentId: undefined, status: undefined, page: 1, limit: 20 });
  });

  it('updateActionPlan → updateActionPlan(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateActionPlan(3, dto);
    expect(mockSvc.updateActionPlan).toHaveBeenCalledWith(3, dto);
  });

  it('dashboard → getDashboard(filters)', async () => {
    const filters = {} as any;
    await controller.dashboard(filters);
    expect(mockSvc.getDashboard).toHaveBeenCalledWith(filters);
  });

  it('index sem departmentId → getEngagementIndex(undefined)', async () => {
    await controller.index();
    expect(mockSvc.getEngagementIndex).toHaveBeenCalledWith(undefined);
  });

  it('heatmap com default → getEngagementHeatmap(score)', async () => {
    await controller.heatmap();
    expect(mockSvc.getEngagementHeatmap).toHaveBeenCalledWith('score');
  });

  it('managerInsights → getManagerInsights(managerId)', async () => {
    await controller.managerInsights(3);
    expect(mockSvc.getManagerInsights).toHaveBeenCalledWith(3);
  });

  it('humanSuccessScore → getHumanSuccessScore(userId)', async () => {
    await controller.humanSuccessScore(5);
    expect(mockSvc.getHumanSuccessScore).toHaveBeenCalledWith(5);
  });

  it('mySummary → getMyEngagementSummary(userId)', async () => {
    await controller.mySummary(mockUser as any);
    expect(mockSvc.getMyEngagementSummary).toHaveBeenCalledWith(1);
  });
});

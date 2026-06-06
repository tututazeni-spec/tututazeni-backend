import { Test, TestingModule } from '@nestjs/testing';
import { TalentDevelopmentController } from './talent-development.controller';
import { TalentDevelopmentService } from './talent-development.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getTalentPool: jest.fn().mockResolvedValue([]),
  getHighPotentials: jest.fn().mockResolvedValue([]),
  getTalentMatrix: jest.fn().mockResolvedValue({}),
  getSuccessionDashboard: jest.fn().mockResolvedValue({}),
  getSuccessionCandidates: jest.fn().mockResolvedValue([]),
  getTemplates: jest.fn().mockResolvedValue([]),
  createFromTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  createPlan: jest.fn().mockResolvedValue({ id: 1 }),
  getPlans: jest.fn().mockResolvedValue([]),
  getPlan: jest.fn().mockResolvedValue({ id: 1 }),
  updatePlan: jest.fn().mockResolvedValue({ id: 1 }),
  activatePlan: jest.fn().mockResolvedValue({}),
  pausePlan: jest.fn().mockResolvedValue({}),
  completePlan: jest.fn().mockResolvedValue({}),
  cancelPlan: jest.fn().mockResolvedValue({}),
  addGoal: jest.fn().mockResolvedValue({ id: 1 }),
  updateGoal: jest.fn().mockResolvedValue({}),
  deleteGoal: jest.fn().mockResolvedValue({}),
  addAction: jest.fn().mockResolvedValue({ id: 1 }),
  updateAction: jest.fn().mockResolvedValue({}),
  updateActionProgress: jest.fn().mockResolvedValue({}),
  approveActionEvidence: jest.fn().mockResolvedValue({}),
  deleteAction: jest.fn().mockResolvedValue({}),
  getUserSkillGaps: jest.fn().mockResolvedValue([]),
  getTrainingNeeds: jest.fn().mockResolvedValue([]),
  getOrgSkillHeatmap: jest.fn().mockResolvedValue([]),
  getMentorRecommendations: jest.fn().mockResolvedValue([]),
  getMentoring: jest.fn().mockResolvedValue({ id: 1 }),
  getMentorings: jest.fn().mockResolvedValue([]),
  createMentoring: jest.fn().mockResolvedValue({ id: 1 }),
  addMentoringSession: jest.fn().mockResolvedValue({ id: 1 }),
  completeMentoring: jest.fn().mockResolvedValue({}),
  getDashboard: jest.fn().mockResolvedValue({}),
  getTalentHealthScore: jest.fn().mockResolvedValue({}),
  getUserEvolution: jest.fn().mockResolvedValue([]),
  getRecommendations: jest.fn().mockResolvedValue({}),
  simulateCareer: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };
const mockReq = { user: { id: 1 } };

describe('TalentDevelopmentController', () => {
  let controller: TalentDevelopmentController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TalentDevelopmentController],
      providers: [{ provide: TalentDevelopmentService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<TalentDevelopmentController>(TalentDevelopmentController);
  });

  it('pool → getTalentPool(filters)', async () => {
    const filters = {} as any;
    await controller.pool(filters);
    expect(mockSvc.getTalentPool).toHaveBeenCalledWith(filters);
  });

  it('highPotentials com defaults → getHighPotentials(20, undefined)', async () => {
    await controller.highPotentials();
    expect(mockSvc.getHighPotentials).toHaveBeenCalledWith(20, undefined);
  });

  it('matrix → getTalentMatrix', async () => {
    await controller.matrix();
    expect(mockSvc.getTalentMatrix).toHaveBeenCalled();
  });

  it('successionDashboard → getSuccessionDashboard', async () => {
    await controller.successionDashboard();
    expect(mockSvc.getSuccessionDashboard).toHaveBeenCalled();
  });

  it('succession → getSuccessionCandidates(id)', async () => {
    await controller.succession(3);
    expect(mockSvc.getSuccessionCandidates).toHaveBeenCalledWith(3);
  });

  it('templates → getTemplates', async () => {
    await controller.templates();
    expect(mockSvc.getTemplates).toHaveBeenCalled();
  });

  it('fromTemplate → createFromTemplate(templateId, dto, userId)', async () => {
    const dto = {} as any;
    await controller.fromTemplate(2, dto, mockReq as any);
    expect(mockSvc.createFromTemplate).toHaveBeenCalledWith(2, dto, 1);
  });

  it('createPlan → createPlan(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createPlan(dto, mockReq as any);
    expect(mockSvc.createPlan).toHaveBeenCalledWith(dto, 1);
  });

  it('getPlans → getPlans(filters)', async () => {
    const filters = {} as any;
    await controller.getPlans(filters);
    expect(mockSvc.getPlans).toHaveBeenCalledWith(filters);
  });

  it('getPlan → getPlan(id)', async () => {
    await controller.getPlan(4);
    expect(mockSvc.getPlan).toHaveBeenCalledWith(4);
  });

  it('updatePlan → updatePlan(id, dto)', async () => {
    const dto = {} as any;
    await controller.updatePlan(1, dto);
    expect(mockSvc.updatePlan).toHaveBeenCalledWith(1, dto);
  });

  it('activate → activatePlan(id, userId)', async () => {
    await controller.activate(2, mockReq as any);
    expect(mockSvc.activatePlan).toHaveBeenCalledWith(2, 1);
  });

  it('pause → pausePlan(id, undefined)', async () => {
    await controller.pause(3);
    expect(mockSvc.pausePlan).toHaveBeenCalledWith(3, undefined);
  });

  it('complete → completePlan(id)', async () => {
    await controller.complete(4);
    expect(mockSvc.completePlan).toHaveBeenCalledWith(4);
  });

  it('cancel → cancelPlan(id, reason)', async () => {
    const dto = { reason: 'teste' } as any;
    await controller.cancel(1, dto);
    expect(mockSvc.cancelPlan).toHaveBeenCalledWith(1, 'teste');
  });

  it('addGoal → addGoal(planId, dto)', async () => {
    const dto = {} as any;
    await controller.addGoal(5, dto);
    expect(mockSvc.addGoal).toHaveBeenCalledWith(5, dto);
  });

  it('updateGoal → updateGoal(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateGoal(2, dto);
    expect(mockSvc.updateGoal).toHaveBeenCalledWith(2, dto);
  });

  it('deleteGoal → deleteGoal(id)', async () => {
    await controller.deleteGoal(3);
    expect(mockSvc.deleteGoal).toHaveBeenCalledWith(3);
  });

  it('addAction → addAction(planId, dto)', async () => {
    const dto = {} as any;
    await controller.addAction(5, dto);
    expect(mockSvc.addAction).toHaveBeenCalledWith(5, dto);
  });

  it('updateAction → updateAction(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateAction(2, dto);
    expect(mockSvc.updateAction).toHaveBeenCalledWith(2, dto);
  });

  it('updateProgress → updateActionProgress(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateProgress(3, dto, mockReq as any);
    expect(mockSvc.updateActionProgress).toHaveBeenCalledWith(3, dto, 1);
  });

  it('approveAction → approveActionEvidence(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.approveAction(4, dto, mockReq as any);
    expect(mockSvc.approveActionEvidence).toHaveBeenCalledWith(4, dto, 1);
  });

  it('deleteAction → deleteAction(id)', async () => {
    await controller.deleteAction(5);
    expect(mockSvc.deleteAction).toHaveBeenCalledWith(5);
  });

  it('skillGaps → getUserSkillGaps(userId)', async () => {
    await controller.skillGaps(3);
    expect(mockSvc.getUserSkillGaps).toHaveBeenCalledWith(3);
  });

  it('trainingNeeds → getTrainingNeeds(filters)', async () => {
    const filters = {} as any;
    await controller.trainingNeeds(filters);
    expect(mockSvc.getTrainingNeeds).toHaveBeenCalledWith(filters);
  });

  it('skillHeatmap sem deptId → getOrgSkillHeatmap(undefined)', async () => {
    await controller.skillHeatmap();
    expect(mockSvc.getOrgSkillHeatmap).toHaveBeenCalledWith(undefined);
  });

  it('mentorMatch → getMentorRecommendations(userId)', async () => {
    await controller.mentorMatch(2);
    expect(mockSvc.getMentorRecommendations).toHaveBeenCalledWith(2);
  });

  it('getMentoring → getMentoring(id)', async () => {
    await controller.getMentoring(4);
    expect(mockSvc.getMentoring).toHaveBeenCalledWith(4);
  });

  it('getMentorings → getMentorings(filters)', async () => {
    const filters = {} as any;
    await controller.getMentorings(filters);
    expect(mockSvc.getMentorings).toHaveBeenCalledWith(filters);
  });

  it('createMentoring → createMentoring(dto)', async () => {
    const dto = {} as any;
    await controller.createMentoring(dto);
    expect(mockSvc.createMentoring).toHaveBeenCalledWith(dto);
  });

  it('addSession → addMentoringSession(id, dto)', async () => {
    const dto = {} as any;
    await controller.addSession(3, dto);
    expect(mockSvc.addMentoringSession).toHaveBeenCalledWith(3, dto);
  });

  it('completeMentoring → completeMentoring(id)', async () => {
    await controller.completeMentoring(5);
    expect(mockSvc.completeMentoring).toHaveBeenCalledWith(5);
  });

  it('dashboard → getDashboard(filters)', async () => {
    const filters = {} as any;
    await controller.dashboard(filters);
    expect(mockSvc.getDashboard).toHaveBeenCalledWith(filters);
  });

  it('talentHealth sem deptId → getTalentHealthScore(undefined)', async () => {
    await controller.talentHealth();
    expect(mockSvc.getTalentHealthScore).toHaveBeenCalledWith(undefined);
  });

  it('evolution → getUserEvolution(userId)', async () => {
    await controller.evolution(5);
    expect(mockSvc.getUserEvolution).toHaveBeenCalledWith(5);
  });

  it('recommendations → getRecommendations(userId)', async () => {
    await controller.recommendations(3);
    expect(mockSvc.getRecommendations).toHaveBeenCalledWith(3);
  });

  it('careerSimulation → simulateCareer(userId, dto)', async () => {
    const dto = {} as any;
    await controller.careerSimulation(4, dto);
    expect(mockSvc.simulateCareer).toHaveBeenCalledWith(4, dto);
  });
});

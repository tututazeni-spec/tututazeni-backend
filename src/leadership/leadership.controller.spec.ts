import { Test, TestingModule } from '@nestjs/testing';
import { LeadershipController } from './leadership.controller';
import { LeadershipService } from './leadership.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { LeadershipEligibilityService } from './leadership-eligibility.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockProgramsSvc = {
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  transition: jest.fn().mockResolvedValue({ id: 1, status: 'PLANNED' }),
  replaceConfiguration: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue({}),
};

const mockEligibilitySvc = {
  listCandidates: jest.fn().mockResolvedValue([]),
  recalculate: jest
    .fn()
    .mockResolvedValue({ score: 80, eligible: true, breakdown: [], missingData: [] }),
  selectCandidate: jest.fn().mockResolvedValue({ status: 'SELECTED' }),
  advanceSelection: jest.fn().mockResolvedValue({ status: 'INVITED' }),
};

const mockSvc = {
  getMyLeaderDashboard: jest.fn().mockResolvedValue({}),
  getTeamDashboard: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue([]),
  getMyPrograms: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getProgramStats: jest.fn().mockResolvedValue({}),
  enroll: jest.fn().mockResolvedValue({ id: 1 }),
  updateProgress: jest.fn().mockResolvedValue({}),
  withdraw: jest.fn().mockResolvedValue({}),
  getTeamHealth: jest.fn().mockResolvedValue({}),
  upsertTeamHealth: jest.fn().mockResolvedValue({}),
  getOneOnOnes: jest.fn().mockResolvedValue([]),
  createOneOnOne: jest.fn().mockResolvedValue({ id: 1 }),
  completeOneOnOne: jest.fn().mockResolvedValue({}),
  submit360Feedback: jest.fn().mockResolvedValue({}),
  get360Summary: jest.fn().mockResolvedValue({}),
  submitPulse: jest.fn().mockResolvedValue({}),
  createMentoring: jest.fn().mockResolvedValue({ id: 1 }),
  logMentoringSession: jest.fn().mockResolvedValue({ id: 1 }),
  getMyMentoring: jest.fn().mockResolvedValue([]),
  sendKudos: jest.fn().mockResolvedValue({ id: 1 }),
  getKudosWall: jest.fn().mockResolvedValue([]),
  getLeadershipScore: jest.fn().mockResolvedValue({}),
  getLeadershipRanking: jest.fn().mockResolvedValue([]),
  recalcLeadershipScore: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('LeadershipController', () => {
  let controller: LeadershipController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeadershipController],
      providers: [
        { provide: LeadershipService, useValue: mockSvc },
        { provide: LeadershipProgramsService, useValue: mockProgramsSvc },
        { provide: LeadershipEligibilityService, useValue: mockEligibilitySvc },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<LeadershipController>(LeadershipController);
  });

  it('myDashboard → getMyLeaderDashboard(userId)', async () => {
    await controller.myDashboard(mockUser as any);
    expect(mockSvc.getMyLeaderDashboard).toHaveBeenCalledWith(1);
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

  it('myPrograms → getMyPrograms(userId)', async () => {
    await controller.myPrograms(mockUser as any);
    expect(mockSvc.getMyPrograms).toHaveBeenCalledWith(1);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(3);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3);
  });

  it('stats → getProgramStats(id)', async () => {
    await controller.stats(2);
    expect(mockSvc.getProgramStats).toHaveBeenCalledWith(2);
  });

  it('create → programsSvc.create(user, dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockProgramsSvc.create).toHaveBeenCalledWith(mockUser, dto);
  });

  it('update → programsSvc.update(user, id, dto)', async () => {
    const dto = {} as any;
    await controller.update(mockUser as any, 1, dto);
    expect(mockProgramsSvc.update).toHaveBeenCalledWith(mockUser, 1, dto);
  });

  it('transition → programsSvc.transition(user, id, dto.status)', async () => {
    await controller.transition(mockUser as any, 3, { status: 'PLANNED' } as any);
    expect(mockProgramsSvc.transition).toHaveBeenCalledWith(mockUser, 3, 'PLANNED');
  });

  it('replaceConfiguration → programsSvc.replaceConfiguration(user, id, dto)', async () => {
    const dto = {} as any;
    await controller.replaceConfiguration(mockUser as any, 4, dto);
    expect(mockProgramsSvc.replaceConfiguration).toHaveBeenCalledWith(mockUser, 4, dto);
  });

  it('remove → programsSvc.remove(user, id)', async () => {
    await controller.remove(mockUser as any, 1);
    expect(mockProgramsSvc.remove).toHaveBeenCalledWith(mockUser, 1);
  });

  it('listCandidates → eligibilitySvc.listCandidates(user, id)', async () => {
    await controller.listCandidates(mockUser as any, 5);
    expect(mockEligibilitySvc.listCandidates).toHaveBeenCalledWith(mockUser, 5);
  });

  it('recalculateEligibility → eligibilitySvc.recalculate(user, id, userId, dto)', async () => {
    const dto = { manualValues: { X: 90 } } as any;
    await controller.recalculateEligibility(mockUser as any, 5, 3, dto);
    expect(mockEligibilitySvc.recalculate).toHaveBeenCalledWith(mockUser, 5, 3, dto);
  });

  it('selectCandidate → eligibilitySvc.selectCandidate(user, id, userId)', async () => {
    await controller.selectCandidate(mockUser as any, 5, 3);
    expect(mockEligibilitySvc.selectCandidate).toHaveBeenCalledWith(mockUser, 5, 3);
  });

  it('advanceSelectionStatus → eligibilitySvc.advanceSelection(user, id, userId, dto.status)', async () => {
    await controller.advanceSelectionStatus(mockUser as any, 5, 3, { status: 'INVITED' } as any);
    expect(mockEligibilitySvc.advanceSelection).toHaveBeenCalledWith(mockUser, 5, 3, 'INVITED');
  });

  it('enroll → enroll(dto)', async () => {
    const dto = {} as any;
    await controller.enroll(dto);
    expect(mockSvc.enroll).toHaveBeenCalledWith(dto);
  });

  it('selfEnroll → enroll({userId, programId})', async () => {
    await controller.selfEnroll(mockUser as any, 5);
    expect(mockSvc.enroll).toHaveBeenCalledWith({ userId: 1, programId: 5 });
  });

  it('updateProgress → updateProgress(userId, programId, dto)', async () => {
    const dto = {} as any;
    await controller.updateProgress(3, 2, dto);
    expect(mockSvc.updateProgress).toHaveBeenCalledWith(2, 3, dto);
  });

  it('withdraw → withdraw(userId, programId)', async () => {
    await controller.withdraw(mockUser as any, 4);
    expect(mockSvc.withdraw).toHaveBeenCalledWith(1, 4);
  });

  it('teamHealth → getTeamHealth(userId)', async () => {
    await controller.teamHealth(mockUser as any);
    expect(mockSvc.getTeamHealth).toHaveBeenCalledWith(1);
  });

  it('upsertTeamHealth → upsertTeamHealth(userId, dto)', async () => {
    const dto = {} as any;
    await controller.upsertTeamHealth(mockUser as any, dto);
    expect(mockSvc.upsertTeamHealth).toHaveBeenCalledWith(1, dto);
  });

  it('getOneOnOnes sem subordinateId → getOneOnOnes(userId, undefined)', async () => {
    await controller.getOneOnOnes(mockUser as any);
    expect(mockSvc.getOneOnOnes).toHaveBeenCalledWith(1, undefined);
  });

  it('createOneOnOne → createOneOnOne(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createOneOnOne(mockUser as any, dto);
    expect(mockSvc.createOneOnOne).toHaveBeenCalledWith(1, dto);
  });

  it('completeOneOnOne → completeOneOnOne(userId, dto)', async () => {
    const dto = {} as any;
    await controller.completeOneOnOne(mockUser as any, dto);
    expect(mockSvc.completeOneOnOne).toHaveBeenCalledWith(1, dto);
  });

  it('submit360 → submit360Feedback(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submit360(mockUser as any, dto);
    expect(mockSvc.submit360Feedback).toHaveBeenCalledWith(1, dto);
  });

  it('get360Summary → get360Summary(leaderId, user)', async () => {
    await controller.get360Summary(mockUser as any, 3);
    expect(mockSvc.get360Summary).toHaveBeenCalledWith(3, mockUser);
  });

  it('my360Summary → get360Summary(userId)', async () => {
    await controller.my360Summary(mockUser as any);
    expect(mockSvc.get360Summary).toHaveBeenCalledWith(1);
  });

  it('submitPulse → submitPulse(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submitPulse(mockUser as any, dto);
    expect(mockSvc.submitPulse).toHaveBeenCalledWith(1, dto);
  });

  it('createMentoring → createMentoring(dto)', async () => {
    const dto = {} as any;
    await controller.createMentoring(dto);
    expect(mockSvc.createMentoring).toHaveBeenCalledWith(dto);
  });

  it('logSession → logMentoringSession(userId, dto)', async () => {
    const dto = {} as any;
    await controller.logSession(mockUser as any, dto);
    expect(mockSvc.logMentoringSession).toHaveBeenCalledWith(1, dto);
  });

  it('myMentoring → getMyMentoring(userId)', async () => {
    await controller.myMentoring(mockUser as any);
    expect(mockSvc.getMyMentoring).toHaveBeenCalledWith(1);
  });

  it('sendKudos → sendKudos(userId, dto)', async () => {
    const dto = {} as any;
    await controller.sendKudos(mockUser as any, dto);
    expect(mockSvc.sendKudos).toHaveBeenCalledWith(1, dto);
  });

  it('getKudosWall sem userId → getKudosWall(undefined)', async () => {
    await controller.getKudosWall();
    expect(mockSvc.getKudosWall).toHaveBeenCalledWith(undefined);
  });

  it('myScore → getLeadershipScore(userId)', async () => {
    await controller.myScore(mockUser as any);
    expect(mockSvc.getLeadershipScore).toHaveBeenCalledWith(1);
  });

  it('userScore → getLeadershipScore(userId)', async () => {
    await controller.userScore(5);
    expect(mockSvc.getLeadershipScore).toHaveBeenCalledWith(5);
  });

  it('ranking → getLeadershipRanking', async () => {
    await controller.ranking();
    expect(mockSvc.getLeadershipRanking).toHaveBeenCalled();
  });

  it('recalcScore → recalcLeadershipScore(userId)', async () => {
    await controller.recalcScore(3);
    expect(mockSvc.recalcLeadershipScore).toHaveBeenCalledWith(3);
  });
});

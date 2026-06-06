import { Test, TestingModule } from '@nestjs/testing';
import { LeadershipController } from './leadership.controller';
import { LeadershipService } from './leadership.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getMyLeaderDashboard: jest.fn().mockResolvedValue({}),
  getTeamDashboard: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue([]),
  getMyPrograms: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getProgramStats: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue({}),
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
      providers: [{ provide: LeadershipService, useValue: mockSvc }],
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

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
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

  it('get360Summary → get360Summary(leaderId)', async () => {
    await controller.get360Summary(3);
    expect(mockSvc.get360Summary).toHaveBeenCalledWith(3);
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

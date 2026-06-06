import { Test, TestingModule } from '@nestjs/testing';
import { AvatarTrainingController } from './avatar-training.controller';
import { AvatarTrainingService } from './avatar-training.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  createAvatar: jest.fn().mockResolvedValue({ id: 1 }),
  getAvatars: jest.fn().mockResolvedValue([]),
  getAvatar: jest.fn().mockResolvedValue({ id: 1 }),
  updateAvatar: jest.fn().mockResolvedValue({}),
  deleteAvatar: jest.fn().mockResolvedValue({}),
  uploadKnowledge: jest.fn().mockResolvedValue({}),
  createScenario: jest.fn().mockResolvedValue({ id: 1 }),
  getScenarios: jest.fn().mockResolvedValue([]),
  getRecommendedScenarios: jest.fn().mockResolvedValue([]),
  getScenario: jest.fn().mockResolvedValue({ id: 1 }),
  getLeaderboard: jest.fn().mockResolvedValue([]),
  startSession: jest.fn().mockResolvedValue({ id: 1 }),
  sendMessage: jest.fn().mockResolvedValue({ reply: 'ok' }),
  completeSession: jest.fn().mockResolvedValue({}),
  pauseSession: jest.fn().mockResolvedValue({}),
  resumeSession: jest.fn().mockResolvedValue({}),
  getSessionDetail: jest.fn().mockResolvedValue({}),
  getMyHistory: jest.fn().mockResolvedValue([]),
  getUserAnalytics: jest.fn().mockResolvedValue({}),
  getGlobalLeaderboard: jest.fn().mockResolvedValue([]),
  getDashboard: jest.fn().mockResolvedValue({}),
  getTeamAnalytics: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('AvatarTrainingController', () => {
  let controller: AvatarTrainingController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AvatarTrainingController],
      providers: [{ provide: AvatarTrainingService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AvatarTrainingController>(AvatarTrainingController);
  });

  it('createAvatar → createAvatar(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createAvatar(mockUser as any, dto);
    expect(mockSvc.createAvatar).toHaveBeenCalledWith(1, dto);
  });

  it('getAvatars → getAvatars(filters)', async () => {
    const filters = {} as any;
    await controller.getAvatars(filters);
    expect(mockSvc.getAvatars).toHaveBeenCalledWith(filters);
  });

  it('getAvatar → getAvatar(id)', async () => {
    await controller.getAvatar(2);
    expect(mockSvc.getAvatar).toHaveBeenCalledWith(2);
  });

  it('updateAvatar → updateAvatar(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateAvatar(1, dto);
    expect(mockSvc.updateAvatar).toHaveBeenCalledWith(1, dto);
  });

  it('deleteAvatar → deleteAvatar(id)', async () => {
    await controller.deleteAvatar(1);
    expect(mockSvc.deleteAvatar).toHaveBeenCalledWith(1);
  });

  it('uploadKnowledge → uploadKnowledge(id, fileUrl, title)', async () => {
    await controller.uploadKnowledge(2, { fileUrl: 'https://file', title: 'doc' });
    expect(mockSvc.uploadKnowledge).toHaveBeenCalledWith(2, 'https://file', 'doc');
  });

  it('createScenario → createScenario(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createScenario(mockUser as any, dto);
    expect(mockSvc.createScenario).toHaveBeenCalledWith(1, dto);
  });

  it('getScenarios → getScenarios(filters)', async () => {
    const filters = {} as any;
    await controller.getScenarios(filters);
    expect(mockSvc.getScenarios).toHaveBeenCalledWith(filters);
  });

  it('recommended → getRecommendedScenarios(userId, 6)', async () => {
    await controller.recommended(mockUser as any);
    expect(mockSvc.getRecommendedScenarios).toHaveBeenCalledWith(1, 6);
  });

  it('getScenario → getScenario(id, userId)', async () => {
    await controller.getScenario(3, mockUser as any);
    expect(mockSvc.getScenario).toHaveBeenCalledWith(3, 1);
  });

  it('leaderboard → getLeaderboard(id, 10)', async () => {
    await controller.leaderboard(2);
    expect(mockSvc.getLeaderboard).toHaveBeenCalledWith(2, 10);
  });

  it('start → startSession(userId, dto)', async () => {
    const dto = {} as any;
    await controller.start(mockUser as any, dto);
    expect(mockSvc.startSession).toHaveBeenCalledWith(1, dto);
  });

  it('sendMessage → sendMessage(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.sendMessage(5, mockUser as any, dto);
    expect(mockSvc.sendMessage).toHaveBeenCalledWith(5, 1, dto);
  });

  it('complete → completeSession(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.complete(4, mockUser as any, dto);
    expect(mockSvc.completeSession).toHaveBeenCalledWith(4, 1, dto);
  });

  it('pause → pauseSession(id, userId)', async () => {
    await controller.pause(3, mockUser as any);
    expect(mockSvc.pauseSession).toHaveBeenCalledWith(3, 1);
  });

  it('resume → resumeSession(id, userId)', async () => {
    await controller.resume(3, mockUser as any);
    expect(mockSvc.resumeSession).toHaveBeenCalledWith(3, 1);
  });

  it('sessionDetail → getSessionDetail(id, userId)', async () => {
    await controller.sessionDetail(2, mockUser as any);
    expect(mockSvc.getSessionDetail).toHaveBeenCalledWith(2, 1);
  });

  it('myHistory → getMyHistory(userId, 20)', async () => {
    await controller.myHistory(mockUser as any);
    expect(mockSvc.getMyHistory).toHaveBeenCalledWith(1, 20);
  });

  it('myAnalytics → getUserAnalytics(userId)', async () => {
    await controller.myAnalytics(mockUser as any);
    expect(mockSvc.getUserAnalytics).toHaveBeenCalledWith(1);
  });

  it('globalLeaderboard → getGlobalLeaderboard(undefined, 20)', async () => {
    await controller.globalLeaderboard();
    expect(mockSvc.getGlobalLeaderboard).toHaveBeenCalledWith(undefined, 20);
  });

  it('dashboard → getDashboard(filters)', async () => {
    const filters = {} as any;
    await controller.dashboard(filters);
    expect(mockSvc.getDashboard).toHaveBeenCalledWith(filters);
  });

  it('teamAnalytics → getTeamAnalytics(managerId)', async () => {
    await controller.teamAnalytics(3);
    expect(mockSvc.getTeamAnalytics).toHaveBeenCalledWith(3);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { MicroLearningController } from './micro-learning.controller';
import { MicroLearningService } from './micro-learning.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getAdminDashboard: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getContentStats: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  archive: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
  remove: jest.fn().mockResolvedValue({}),
  getMyFeed: jest.fn().mockResolvedValue([]),
  getMySaved: jest.fn().mockResolvedValue([]),
  getMyDashboard: jest.fn().mockResolvedValue({}),
  updateProgress: jest.fn().mockResolvedValue({}),
  submitQuiz: jest.fn().mockResolvedValue({ score: 80 }),
  interact: jest.fn().mockResolvedValue({}),
  getPlaylists: jest.fn().mockResolvedValue([]),
  getPlaylist: jest.fn().mockResolvedValue({ id: 1 }),
  createPlaylist: jest.fn().mockResolvedValue({ id: 1 }),
  dispatch: jest.fn().mockResolvedValue({}),
  dispatchToAll: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('MicroLearningController', () => {
  let controller: MicroLearningController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MicroLearningController],
      providers: [{ provide: MicroLearningService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<MicroLearningController>(MicroLearningController);
  });

  it('adminDashboard → getAdminDashboard', async () => {
    await controller.adminDashboard();
    expect(mockSvc.getAdminDashboard).toHaveBeenCalled();
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(2);
    expect(mockSvc.findOne).toHaveBeenCalledWith(2);
  });

  it('stats → getContentStats(id)', async () => {
    await controller.stats(3);
    expect(mockSvc.getContentStats).toHaveBeenCalledWith(3);
  });

  it('create → create(dto, userId)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto, 1);
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

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('myFeed → getMyFeed(userId, filters)', async () => {
    const filters = {} as any;
    await controller.myFeed(mockUser as any, filters);
    expect(mockSvc.getMyFeed).toHaveBeenCalledWith(1, filters);
  });

  it('mySaved → getMySaved(userId)', async () => {
    await controller.mySaved(mockUser as any);
    expect(mockSvc.getMySaved).toHaveBeenCalledWith(1);
  });

  it('myDashboard → getMyDashboard(userId)', async () => {
    await controller.myDashboard(mockUser as any);
    expect(mockSvc.getMyDashboard).toHaveBeenCalledWith(1);
  });

  it('updateProgress → updateProgress(userId, dto)', async () => {
    const dto = {} as any;
    await controller.updateProgress(mockUser as any, dto);
    expect(mockSvc.updateProgress).toHaveBeenCalledWith(1, dto);
  });

  it('submitQuiz → submitQuiz(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submitQuiz(mockUser as any, dto);
    expect(mockSvc.submitQuiz).toHaveBeenCalledWith(1, dto);
  });

  it('interact → interact(userId, dto)', async () => {
    const dto = {} as any;
    await controller.interact(mockUser as any, dto);
    expect(mockSvc.interact).toHaveBeenCalledWith(1, dto);
  });

  it('getPlaylists → getPlaylists', async () => {
    await controller.getPlaylists();
    expect(mockSvc.getPlaylists).toHaveBeenCalled();
  });

  it('getPlaylist → getPlaylist(id)', async () => {
    await controller.getPlaylist(2);
    expect(mockSvc.getPlaylist).toHaveBeenCalledWith(2);
  });

  it('createPlaylist → createPlaylist(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createPlaylist(mockUser as any, dto);
    expect(mockSvc.createPlaylist).toHaveBeenCalledWith(dto, 1);
  });

  it('dispatch → dispatch(dto)', async () => {
    const dto = {} as any;
    await controller.dispatch(dto);
    expect(mockSvc.dispatch).toHaveBeenCalledWith(dto);
  });

  it('dispatchAll → dispatchToAll(id)', async () => {
    await controller.dispatchAll(3);
    expect(mockSvc.dispatchToAll).toHaveBeenCalledWith(3);
  });
});

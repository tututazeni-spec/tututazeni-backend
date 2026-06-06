import { Test, TestingModule } from '@nestjs/testing';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue([]),
  getUserActivity: jest.fn().mockResolvedValue([]),
  getEntityHistory: jest.fn().mockResolvedValue([]),
  createEvent: jest.fn().mockResolvedValue({ id: 1 }),
  getUserTimeline: jest.fn().mockResolvedValue([]),
  getTeamTimeline: jest.fn().mockResolvedValue([]),
  getUserMilestones: jest.fn().mockResolvedValue([]),
  getUserActivityStats: jest.fn().mockResolvedValue({}),
  getUpcomingEvents: jest.fn().mockResolvedValue([]),
  getAuditStats: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('HistoryController', () => {
  let controller: HistoryController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoryController],
      providers: [{ provide: HistoryService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<HistoryController>(HistoryController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('userActivity sem limit → getUserActivity(id, 50)', async () => {
    await controller.userActivity(3);
    expect(mockSvc.getUserActivity).toHaveBeenCalledWith(3, 50);
  });

  it('entityHistory → getEntityHistory(entity, id)', async () => {
    await controller.entityHistory('user', 5);
    expect(mockSvc.getEntityHistory).toHaveBeenCalledWith('user', 5);
  });

  it('createEvent → createEvent(dto)', async () => {
    const dto = {} as any;
    await controller.createEvent(dto);
    expect(mockSvc.createEvent).toHaveBeenCalledWith(dto);
  });

  it('myTimeline → getUserTimeline(userId, filters)', async () => {
    const filters = {} as any;
    await controller.myTimeline(mockUser as any, filters);
    expect(mockSvc.getUserTimeline).toHaveBeenCalledWith(1, filters);
  });

  it('userTimeline → getUserTimeline(userId, filters)', async () => {
    const filters = {} as any;
    await controller.userTimeline(3, filters);
    expect(mockSvc.getUserTimeline).toHaveBeenCalledWith(3, filters);
  });

  it('teamTimeline → getTeamTimeline(userId, filters)', async () => {
    const filters = {} as any;
    await controller.teamTimeline(mockUser as any, filters);
    expect(mockSvc.getTeamTimeline).toHaveBeenCalledWith(1, filters);
  });

  it('myMilestones → getUserMilestones(userId)', async () => {
    await controller.myMilestones(mockUser as any);
    expect(mockSvc.getUserMilestones).toHaveBeenCalledWith(1);
  });

  it('userMilestones → getUserMilestones(userId)', async () => {
    await controller.userMilestones(4);
    expect(mockSvc.getUserMilestones).toHaveBeenCalledWith(4);
  });

  it('myStats → getUserActivityStats(userId)', async () => {
    await controller.myStats(mockUser as any);
    expect(mockSvc.getUserActivityStats).toHaveBeenCalledWith(1);
  });

  it('userStats → getUserActivityStats(userId)', async () => {
    await controller.userStats(5);
    expect(mockSvc.getUserActivityStats).toHaveBeenCalledWith(5);
  });

  it('upcoming → getUpcomingEvents', async () => {
    await controller.upcoming();
    expect(mockSvc.getUpcomingEvents).toHaveBeenCalled();
  });

  it('auditStats → getAuditStats(from, to)', async () => {
    await controller.auditStats('2024-01', '2024-12');
    expect(mockSvc.getAuditStats).toHaveBeenCalledWith('2024-01', '2024-12');
  });
});

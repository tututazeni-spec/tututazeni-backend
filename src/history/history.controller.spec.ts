import { Test, TestingModule } from '@nestjs/testing';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { HistoryHubService } from './history-hub.service';
import { HistoryReportsService } from './history-reports.service';
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

const mockHub = {
  assertCanViewUser: jest.fn().mockResolvedValue(undefined),
  timelineExtras: jest.fn().mockResolvedValue([]),
  getOverview: jest.fn().mockResolvedValue({}),
  getHistory: jest.fn().mockResolvedValue({}),
  getMovements: jest.fn().mockResolvedValue({}),
  getOrgChanges: jest.fn().mockResolvedValue({}),
  getDocuments: jest.fn().mockResolvedValue({}),
  getActivities: jest.fn().mockResolvedValue({}),
};
const mockReports = {
  build: jest.fn().mockResolvedValue({}),
  export: jest.fn().mockResolvedValue({
    buffer: Buffer.from('x'),
    contentType: 'text/csv',
    filename: 'f.csv',
  }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('HistoryController', () => {
  let controller: HistoryController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HistoryController],
      providers: [
        { provide: HistoryService, useValue: mockSvc },
        { provide: HistoryHubService, useValue: mockHub },
        { provide: HistoryReportsService, useValue: mockReports },
      ],
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
    await controller.userActivity(mockUser as any, 3);
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
    expect(mockSvc.getUserTimeline).toHaveBeenCalledWith(1, filters, []);
  });

  it('userTimeline → getUserTimeline(userId, filters)', async () => {
    const filters = {} as any;
    await controller.userTimeline(mockUser as any, 3, filters);
    expect(mockHub.assertCanViewUser).toHaveBeenCalledWith(mockUser, 3);
    expect(mockSvc.getUserTimeline).toHaveBeenCalledWith(3, filters, []);
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
    await controller.userMilestones(mockUser as any, 4);
    expect(mockSvc.getUserMilestones).toHaveBeenCalledWith(4);
  });

  it('myStats → getUserActivityStats(userId)', async () => {
    await controller.myStats(mockUser as any);
    expect(mockSvc.getUserActivityStats).toHaveBeenCalledWith(1);
  });

  it('userStats → getUserActivityStats(userId)', async () => {
    await controller.userStats(mockUser as any, 5);
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

  it('overview/feed/movements/org-changes/documents/activities delegam no hub', async () => {
    const scope = {} as any;
    await controller.overview(scope);
    await controller.feed(scope);
    await controller.movements(scope);
    await controller.orgChanges(scope);
    await controller.documents(scope);
    await controller.activities(scope);
    expect(mockHub.getOverview).toHaveBeenCalledWith(scope);
    expect(mockHub.getHistory).toHaveBeenCalledWith(scope);
    expect(mockHub.getMovements).toHaveBeenCalledWith(scope);
    expect(mockHub.getOrgChanges).toHaveBeenCalledWith(scope);
    expect(mockHub.getDocuments).toHaveBeenCalledWith(scope);
    expect(mockHub.getActivities).toHaveBeenCalledWith(scope);
  });

  it('reports → build(dto)', async () => {
    const dto = { type: 'movements' } as any;
    await controller.report(dto);
    expect(mockReports.build).toHaveBeenCalledWith(dto);
  });

  it('reports/export → define Content-Disposition e devolve o ficheiro', async () => {
    const dto = { type: 'movements', format: 'csv' } as any;
    const res = { set: jest.fn() } as any;
    const file = await controller.exportReport(dto, res);
    expect(mockReports.export).toHaveBeenCalledWith(dto, 'csv');
    expect(res.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Disposition': 'attachment; filename="f.csv"' }),
    );
    expect(file).toBeDefined();
  });
});

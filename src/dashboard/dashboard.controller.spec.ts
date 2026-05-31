import { Test, TestingModule } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getMyDashboard: jest.fn().mockResolvedValue({}),
  getManagerDashboard: jest.fn().mockResolvedValue({}),
  getOrganizationSummary: jest.fn().mockResolvedValue({}),
  getExecutiveDashboard: jest.fn().mockResolvedValue({}),
  getDepartmentDashboard: jest.fn().mockResolvedValue({}),
  getAlerts: jest.fn().mockResolvedValue([]),
  getLeaderboard: jest.fn().mockResolvedValue([]),
  globalSearch: jest.fn().mockResolvedValue([]),
  listSnapshots: jest.fn().mockResolvedValue([]),
  generateSnapshot: jest.fn().mockResolvedValue({ id: 1 }),
};

const mockUser = { id: 1, email: 'test@innova.com', roleCode: 'ADMIN', role: { name: 'ADMIN' } };

describe('DashboardController', () => {
  let controller: DashboardController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(DashboardController);
  });

  it('myDashboard', async () => {
    await controller.myDashboard(mockUser as any);
    expect(mockSvc.getMyDashboard).toHaveBeenCalledWith(1);
  });

  it('managerDashboard', async () => {
    await controller.managerDashboard(mockUser as any, {} as any);
    expect(mockSvc.getManagerDashboard).toHaveBeenCalledWith(1, {});
  });

  it('organizationSummary', async () => {
    await controller.organizationSummary({} as any);
    expect(mockSvc.getOrganizationSummary).toHaveBeenCalledWith({});
  });

  it('executive', async () => {
    await controller.executive();
    expect(mockSvc.getExecutiveDashboard).toHaveBeenCalled();
  });

  it('department sem period', async () => {
    await controller.department(1);
    expect(mockSvc.getDepartmentDashboard).toHaveBeenCalledWith(1, undefined);
  });

  it('department com period', async () => {
    await controller.department(1, 'MONTH' as any);
    expect(mockSvc.getDepartmentDashboard).toHaveBeenCalledWith(1, 'MONTH');
  });

  it('alerts', async () => {
    await controller.alerts(mockUser as any);
    expect(mockSvc.getAlerts).toHaveBeenCalledWith(1, 'ADMIN');
  });

  it('leaderboard sem params', async () => {
    await controller.leaderboard();
    expect(mockSvc.getLeaderboard).toHaveBeenCalledWith(undefined, 10);
  });

  it('leaderboard com params', async () => {
    await controller.leaderboard('3', '5');
    expect(mockSvc.getLeaderboard).toHaveBeenCalledWith(3, 5);
  });

  it('search', async () => {
    await controller.search('cursos');
    expect(mockSvc.globalSearch).toHaveBeenCalledWith('cursos', 10);
  });

  it('snapshots', async () => {
    await controller.snapshots();
    expect(mockSvc.listSnapshots).toHaveBeenCalled();
  });

  it('generateSnapshot', async () => {
    await controller.generateSnapshot();
    expect(mockSvc.generateSnapshot).toHaveBeenCalled();
  });
});

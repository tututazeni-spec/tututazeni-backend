import { Test, TestingModule } from '@nestjs/testing';
import { DashboardInstitutionalController } from './dashboard-institutional.controller';
import { DashboardInstitutionalService } from './dashboard-institutional.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getExecutiveSummary: jest.fn().mockResolvedValue({}),
  getGrowthTrend: jest.fn().mockResolvedValue([]),
  getGeographicDistribution: jest.fn().mockResolvedValue([]),
  getAlerts: jest.fn().mockResolvedValue([]),
  createSnapshot: jest.fn().mockResolvedValue({ id: 1 }),
  findAllSnapshots: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  compareSnapshots: jest.fn().mockResolvedValue({}),
  createWidget: jest.fn().mockResolvedValue({ id: 1 }),
  getMyWidgets: jest.fn().mockResolvedValue([]),
  updateWidget: jest.fn().mockResolvedValue({ id: 1 }),
  deleteWidget: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('DashboardInstitutionalController', () => {
  let controller: DashboardInstitutionalController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardInstitutionalController],
      providers: [{ provide: DashboardInstitutionalService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<DashboardInstitutionalController>(DashboardInstitutionalController);
  });

  it('getExecutiveSummary → getExecutiveSummary()', async () => {
    await controller.getExecutiveSummary();
    expect(mockSvc.getExecutiveSummary).toHaveBeenCalled();
  });

  it('getGrowthTrend → getGrowthTrend(months)', async () => {
    await controller.getGrowthTrend(6);
    expect(mockSvc.getGrowthTrend).toHaveBeenCalledWith(6);
  });

  it('getGeographicDistribution → getGeographicDistribution()', async () => {
    await controller.getGeographicDistribution();
    expect(mockSvc.getGeographicDistribution).toHaveBeenCalled();
  });

  it('getAlerts → getAlerts()', async () => {
    await controller.getAlerts();
    expect(mockSvc.getAlerts).toHaveBeenCalled();
  });

  it('createSnapshot → createSnapshot(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createSnapshot(dto, mockUser as any);
    expect(mockSvc.createSnapshot).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllSnapshots → findAllSnapshots(filters)', async () => {
    const filters = {} as any;
    await controller.findAllSnapshots(filters);
    expect(mockSvc.findAllSnapshots).toHaveBeenCalledWith(filters);
  });

  it('compareSnapshots → compareSnapshots(period1, period2, type)', async () => {
    await controller.compareSnapshots('2024-Q1', '2024-Q2', 'kpi');
    expect(mockSvc.compareSnapshots).toHaveBeenCalledWith('2024-Q1', '2024-Q2', 'kpi');
  });

  it('createWidget → createWidget(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createWidget(dto, mockUser as any);
    expect(mockSvc.createWidget).toHaveBeenCalledWith(dto, 1);
  });

  it('getMyWidgets → getMyWidgets(userId)', async () => {
    await controller.getMyWidgets(mockUser as any);
    expect(mockSvc.getMyWidgets).toHaveBeenCalledWith(1);
  });

  it('updateWidget → updateWidget(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateWidget('w1', dto, mockUser as any);
    expect(mockSvc.updateWidget).toHaveBeenCalledWith('w1', dto, 1);
  });

  it('deleteWidget → deleteWidget(id, userId)', async () => {
    await controller.deleteWidget('w1', mockUser as any);
    expect(mockSvc.deleteWidget).toHaveBeenCalledWith('w1', 1);
  });
});

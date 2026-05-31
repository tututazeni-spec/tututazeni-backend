import { Test, TestingModule } from '@nestjs/testing';
import { DashboardRhController } from './dashboard-rh.controller';
import { DashboardRhService } from './dashboard-rh.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getFullRhDashboard: jest.fn().mockResolvedValue({}),
  getHeadcountPanel: jest.fn().mockResolvedValue({}),
  getHeadcountTrend: jest.fn().mockResolvedValue([]),
  getTurnoverPanel: jest.fn().mockResolvedValue({}),
  getEngagementPanel: jest.fn().mockResolvedValue({}),
  getPerformancePanel: jest.fn().mockResolvedValue({}),
  getSkillsPanel: jest.fn().mockResolvedValue({}),
  getTrainingPanel: jest.fn().mockResolvedValue({}),
  getCompliancePanel: jest.fn().mockResolvedValue({}),
  getAttendancePanel: jest.fn().mockResolvedValue({}),
  getTalentPipeline: jest.fn().mockResolvedValue({}),
  getBirthdaysThisMonth: jest.fn().mockResolvedValue([]),
  getAnniversariesThisMonth: jest.fn().mockResolvedValue([]),
  getPayrollPanel: jest.fn().mockResolvedValue({}),
  getAlerts: jest.fn().mockResolvedValue([]),
  getPredictions: jest.fn().mockResolvedValue([]),
  getCorrelations: jest.fn().mockResolvedValue({}),
};

describe('DashboardRhController', () => {
  let controller: DashboardRhController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardRhController],
      providers: [{ provide: DashboardRhService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(DashboardRhController);
  });

  it('fullDashboard', async () => {
    await controller.fullDashboard();
    expect(mockSvc.getFullRhDashboard).toHaveBeenCalled();
  });

  it('headcount sem dept', async () => {
    await controller.headcount();
    expect(mockSvc.getHeadcountPanel).toHaveBeenCalledWith(undefined);
  });

  it('headcount com dept', async () => {
    await controller.headcount('3');
    expect(mockSvc.getHeadcountPanel).toHaveBeenCalledWith(3);
  });

  it('headcountTrend default', async () => {
    await controller.headcountTrend();
    expect(mockSvc.getHeadcountTrend).toHaveBeenCalledWith(6);
  });

  it('headcountTrend custom', async () => {
    await controller.headcountTrend('3');
    expect(mockSvc.getHeadcountTrend).toHaveBeenCalledWith(3);
  });

  it('turnover default', async () => {
    await controller.turnover();
    expect(mockSvc.getTurnoverPanel).toHaveBeenCalledWith(12);
  });

  it('engagement sem dept', async () => {
    await controller.engagement();
    expect(mockSvc.getEngagementPanel).toHaveBeenCalledWith(undefined);
  });

  it('performance com dept', async () => {
    await controller.performance('2');
    expect(mockSvc.getPerformancePanel).toHaveBeenCalledWith(2);
  });

  it('skills', async () => {
    await controller.skills();
    expect(mockSvc.getSkillsPanel).toHaveBeenCalledWith(undefined);
  });

  it('training', async () => {
    await controller.training();
    expect(mockSvc.getTrainingPanel).toHaveBeenCalledWith(undefined);
  });

  it('compliance', async () => {
    await controller.compliance();
    expect(mockSvc.getCompliancePanel).toHaveBeenCalled();
  });

  it('attendance sem params', async () => {
    await controller.attendance();
    expect(mockSvc.getAttendancePanel).toHaveBeenCalledWith(undefined, undefined);
  });

  it('attendance com params', async () => {
    await controller.attendance('2024-01-01', '2024-01-31');
    expect(mockSvc.getAttendancePanel).toHaveBeenCalledWith('2024-01-01', '2024-01-31');
  });

  it('talentPipeline', async () => {
    await controller.talentPipeline();
    expect(mockSvc.getTalentPipeline).toHaveBeenCalled();
  });

  it('birthdays', async () => {
    await controller.birthdays();
    expect(mockSvc.getBirthdaysThisMonth).toHaveBeenCalled();
  });

  it('anniversaries', async () => {
    await controller.anniversaries();
    expect(mockSvc.getAnniversariesThisMonth).toHaveBeenCalled();
  });

  it('payroll', async () => {
    await controller.payroll('2024-01');
    expect(mockSvc.getPayrollPanel).toHaveBeenCalledWith('2024-01');
  });

  it('alerts', async () => {
    await controller.alerts();
    expect(mockSvc.getAlerts).toHaveBeenCalled();
  });

  it('predictions', async () => {
    await controller.predictions();
    expect(mockSvc.getPredictions).toHaveBeenCalled();
  });

  it('correlations', async () => {
    await controller.correlations();
    expect(mockSvc.getCorrelations).toHaveBeenCalled();
  });
});

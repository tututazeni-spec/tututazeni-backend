import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  headcountReport: jest.fn().mockResolvedValue({}),
  turnoverReport: jest.fn().mockResolvedValue({}),
  attendanceReport: jest.fn().mockResolvedValue({}),
  payrollSummary: jest.fn().mockResolvedValue({}),
  trainingReportFull: jest.fn().mockResolvedValue({}),
  skillGapReport: jest.fn().mockResolvedValue({ skills: [] }),
  performanceReportFull: jest.fn().mockResolvedValue({ topPerformers: [] }),
  performanceReport: jest.fn().mockResolvedValue({}),
  engagementReport: jest.fn().mockResolvedValue({}),
  talentReport: jest.fn().mockResolvedValue({}),
  complianceReport: jest.fn().mockResolvedValue({}),
  competencyGapReport: jest.fn().mockResolvedValue({}),
  platformUsageReport: jest.fn().mockResolvedValue({}),
  getInsights: jest.fn().mockResolvedValue({}),
  listSavedReports: jest.fn().mockResolvedValue([]),
  saveReport: jest.fn().mockResolvedValue({ id: 1 }),
  deleteReport: jest.fn().mockResolvedValue({}),
  getTemplates: jest.fn().mockResolvedValue([]),
  createSchedule: jest.fn().mockResolvedValue({ id: 1 }),
  listSchedules: jest.fn().mockResolvedValue([]),
  deleteSchedule: jest.fn().mockResolvedValue({}),
  exportToCsv: jest.fn().mockResolvedValue('csv-data'),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('ReportsController', () => {
  let controller: ReportsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ReportsController>(ReportsController);
  });

  it('headcount → headcountReport(filter)', async () => {
    const filter = {} as any;
    await controller.headcount(filter);
    expect(mockSvc.headcountReport).toHaveBeenCalledWith(filter);
  });

  it('turnover → turnoverReport(filter)', async () => {
    const filter = {} as any;
    await controller.turnover(filter);
    expect(mockSvc.turnoverReport).toHaveBeenCalledWith(filter);
  });

  it('attendance → attendanceReport(from, to)', async () => {
    await controller.attendance('2024-01-01', '2024-12-31');
    expect(mockSvc.attendanceReport).toHaveBeenCalledWith('2024-01-01', '2024-12-31', undefined);
  });

  it('payroll → payrollSummary(period)', async () => {
    await controller.payroll('2024-06');
    expect(mockSvc.payrollSummary).toHaveBeenCalledWith('2024-06');
  });

  it('training → trainingReportFull(filter)', async () => {
    const filter = {} as any;
    await controller.training(filter);
    expect(mockSvc.trainingReportFull).toHaveBeenCalledWith(filter);
  });

  it('skillGap → skillGapReport(filter)', async () => {
    const filter = {} as any;
    await controller.skillGap(filter);
    expect(mockSvc.skillGapReport).toHaveBeenCalledWith(filter);
  });

  it('performance → performanceReportFull(filter)', async () => {
    const filter = {} as any;
    await controller.performance(filter);
    expect(mockSvc.performanceReportFull).toHaveBeenCalledWith(filter);
  });

  it('performanceLegacy sem deptId → performanceReport(period, undefined)', async () => {
    await controller.performanceLegacy('2024');
    expect(mockSvc.performanceReport).toHaveBeenCalledWith('2024', undefined);
  });

  it('engagement → engagementReport(filter)', async () => {
    const filter = {} as any;
    await controller.engagement(filter);
    expect(mockSvc.engagementReport).toHaveBeenCalledWith(filter);
  });

  it('talent → talentReport(filter)', async () => {
    const filter = {} as any;
    await controller.talent(filter);
    expect(mockSvc.talentReport).toHaveBeenCalledWith(filter);
  });

  it('compliance → complianceReport(filter)', async () => {
    const filter = {} as any;
    await controller.compliance(filter);
    expect(mockSvc.complianceReport).toHaveBeenCalledWith(filter);
  });

  it('competencyGap sem deptId → competencyGapReport(undefined)', async () => {
    await controller.competencyGap();
    expect(mockSvc.competencyGapReport).toHaveBeenCalledWith(undefined);
  });

  it('usage → platformUsageReport(filter)', async () => {
    const filter = {} as any;
    await controller.usage(filter);
    expect(mockSvc.platformUsageReport).toHaveBeenCalledWith(filter);
  });

  it('insights → getInsights(filter)', async () => {
    const filter = {} as any;
    await controller.insights(filter);
    expect(mockSvc.getInsights).toHaveBeenCalledWith(filter);
  });

  it('listSaved → listSavedReports(userId)', async () => {
    await controller.listSaved(mockUser as any);
    expect(mockSvc.listSavedReports).toHaveBeenCalledWith(1, undefined);
  });

  it('saveReport → saveReport(userId, dto)', async () => {
    const dto = {} as any;
    await controller.saveReport(mockUser as any, dto);
    expect(mockSvc.saveReport).toHaveBeenCalledWith(1, dto);
  });

  it('deleteReport → deleteReport(id)', async () => {
    await controller.deleteReport(3);
    expect(mockSvc.deleteReport).toHaveBeenCalledWith(3);
  });

  it('templates → getTemplates', async () => {
    await controller.templates();
    expect(mockSvc.getTemplates).toHaveBeenCalled();
  });

  it('createSchedule → createSchedule(userId, dto)', async () => {
    const dto = {} as any;
    await controller.createSchedule(mockUser as any, dto);
    expect(mockSvc.createSchedule).toHaveBeenCalledWith(1, dto);
  });

  it('listSchedules → listSchedules(userId)', async () => {
    await controller.listSchedules(mockUser as any);
    expect(mockSvc.listSchedules).toHaveBeenCalledWith(1);
  });

  it('deleteSchedule → deleteSchedule(id)', async () => {
    await controller.deleteSchedule(2);
    expect(mockSvc.deleteSchedule).toHaveBeenCalledWith(2);
  });
});

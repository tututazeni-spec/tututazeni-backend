import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getOrganizationOverview: jest.fn().mockResolvedValue({}),
  getCollaboratorDashboard: jest.fn().mockResolvedValue({}),
  getManagerDashboard: jest.fn().mockResolvedValue({}),
  getHRDashboard: jest.fn().mockResolvedValue({}),
  getLearningAnalytics: jest.fn().mockResolvedValue({}),
  getPeopleAnalytics: jest.fn().mockResolvedValue({}),
  getPDIAnalytics: jest.fn().mockResolvedValue({}),
  getCompetencyGapAnalytics: jest.fn().mockResolvedValue({}),
  getEngagementMetrics: jest.fn().mockResolvedValue({}),
  getRiskAlerts: jest.fn().mockResolvedValue([]),
  getTrainingROI: jest.fn().mockResolvedValue({}),
  getCoursePerformance: jest.fn().mockResolvedValue([]),
  getDepartmentAnalytics: jest.fn().mockResolvedValue({}),
  getSnapshots: jest.fn().mockResolvedValue([]),
  generateDashboardSnapshot: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  it('overview → getOrganizationOverview', async () => {
    await controller.overview();
    expect(mockSvc.getOrganizationOverview).toHaveBeenCalled();
  });

  it('myDashboard → getCollaboratorDashboard(userId)', async () => {
    await controller.myDashboard(mockUser as any);
    expect(mockSvc.getCollaboratorDashboard).toHaveBeenCalledWith(1);
  });

  it('managerDashboard → getManagerDashboard(userId)', async () => {
    await controller.managerDashboard(mockUser as any);
    expect(mockSvc.getManagerDashboard).toHaveBeenCalledWith(1);
  });

  it('hrDashboard → getHRDashboard(filters)', async () => {
    const filters = {} as any;
    await controller.hrDashboard(filters);
    expect(mockSvc.getHRDashboard).toHaveBeenCalledWith(filters);
  });

  it('learning → getLearningAnalytics(filters)', async () => {
    const filters = {} as any;
    await controller.learning(filters);
    expect(mockSvc.getLearningAnalytics).toHaveBeenCalledWith(filters);
  });

  it('people → getPeopleAnalytics(filters)', async () => {
    const filters = {} as any;
    await controller.people(filters);
    expect(mockSvc.getPeopleAnalytics).toHaveBeenCalledWith(filters);
  });

  it('pdi → getPDIAnalytics(filters)', async () => {
    const filters = {} as any;
    await controller.pdi(filters);
    expect(mockSvc.getPDIAnalytics).toHaveBeenCalledWith(filters);
  });

  it('competencyGaps → getCompetencyGapAnalytics(filters)', async () => {
    const filters = {} as any;
    await controller.competencyGaps(filters);
    expect(mockSvc.getCompetencyGapAnalytics).toHaveBeenCalledWith(filters);
  });

  it('engagement → getEngagementMetrics(filters)', async () => {
    const filters = {} as any;
    await controller.engagement(filters);
    expect(mockSvc.getEngagementMetrics).toHaveBeenCalledWith(filters);
  });

  it('risks → getRiskAlerts(filters)', async () => {
    const filters = {} as any;
    await controller.risks(filters);
    expect(mockSvc.getRiskAlerts).toHaveBeenCalledWith(filters);
  });

  it('roi → getTrainingROI', async () => {
    await controller.roi();
    expect(mockSvc.getTrainingROI).toHaveBeenCalled();
  });

  it('courses → getCoursePerformance sem courseId', async () => {
    await controller.courses();
    expect(mockSvc.getCoursePerformance).toHaveBeenCalledWith();
  });

  it('courseDetail → getCoursePerformance(courseId)', async () => {
    await controller.courseDetail(5);
    expect(mockSvc.getCoursePerformance).toHaveBeenCalledWith(5);
  });

  it('department → getDepartmentAnalytics(departmentId)', async () => {
    await controller.department(3);
    expect(mockSvc.getDepartmentAnalytics).toHaveBeenCalledWith(3);
  });

  it('snapshots sem departmentId → getSnapshots(undefined)', async () => {
    await controller.snapshots();
    expect(mockSvc.getSnapshots).toHaveBeenCalledWith(undefined);
  });

  it('snapshots com departmentId → getSnapshots(parsed)', async () => {
    await controller.snapshots('4');
    expect(mockSvc.getSnapshots).toHaveBeenCalledWith(4);
  });

  it('generateSnapshot sem departmentId → generateDashboardSnapshot(undefined)', async () => {
    await controller.generateSnapshot();
    expect(mockSvc.generateDashboardSnapshot).toHaveBeenCalledWith(undefined);
  });

  it('generateSnapshot com departmentId → generateDashboardSnapshot(parsed)', async () => {
    await controller.generateSnapshot('7');
    expect(mockSvc.generateDashboardSnapshot).toHaveBeenCalledWith(7);
  });
});

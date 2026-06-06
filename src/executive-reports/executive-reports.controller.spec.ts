import { Test, TestingModule } from '@nestjs/testing';
import { ExecutiveReportsController } from './executive-reports.controller';
import { ExecutiveReportsService } from './executive-reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ReportType } from './executive-reports.dto';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getReportStats: jest.fn().mockResolvedValue({}),
  getTemplates: jest.fn().mockResolvedValue([]),
  getExecutiveSnapshot: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  generateAutoReport: jest.fn().mockResolvedValue({ id: 3 }),
  submitForReview: jest.fn().mockResolvedValue({}),
  approveReport: jest.fn().mockResolvedValue({}),
  publishReport: jest.fn().mockResolvedValue({}),
  archiveReport: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('ExecutiveReportsController', () => {
  let controller: ExecutiveReportsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExecutiveReportsController],
      providers: [{ provide: ExecutiveReportsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ExecutiveReportsController>(ExecutiveReportsController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('stats → getReportStats', async () => {
    await controller.stats();
    expect(mockSvc.getReportStats).toHaveBeenCalled();
  });

  it('templates → getTemplates', async () => {
    await controller.templates();
    expect(mockSvc.getTemplates).toHaveBeenCalled();
  });

  it('snapshots → getExecutiveSnapshot(orgId)', async () => {
    await controller.snapshots(3);
    expect(mockSvc.getExecutiveSnapshot).toHaveBeenCalledWith(3);
  });

  it('findOne → findOne(id, userId)', async () => {
    await controller.findOne(2, mockUser as any);
    expect(mockSvc.findOne).toHaveBeenCalledWith(2, 1);
  });

  it('create → create(userId, dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(1, dto);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });

  it('autoGenerate sem params → generateAutoReport(userId, MONTHLY, undefined)', async () => {
    await controller.autoGenerate(mockUser as any);
    expect(mockSvc.generateAutoReport).toHaveBeenCalledWith(1, ReportType.MONTHLY, undefined);
  });

  it('submit → submitForReview(id)', async () => {
    await controller.submit(2);
    expect(mockSvc.submitForReview).toHaveBeenCalledWith(2);
  });

  it('approve → approveReport(dto, userId)', async () => {
    const dto = {} as any;
    await controller.approve(mockUser as any, dto);
    expect(mockSvc.approveReport).toHaveBeenCalledWith(dto, 1);
  });

  it('publish → publishReport(id)', async () => {
    await controller.publish(1);
    expect(mockSvc.publishReport).toHaveBeenCalledWith(1);
  });

  it('archive → archiveReport(id)', async () => {
    await controller.archive(1);
    expect(mockSvc.archiveReport).toHaveBeenCalledWith(1);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });
});

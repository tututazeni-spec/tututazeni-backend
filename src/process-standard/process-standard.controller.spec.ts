import { Test, TestingModule } from '@nestjs/testing';
import { ProcessStandardController } from './process-standard.controller';
import { ProcessStandardService } from './process-standard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getDashboard: jest.fn().mockResolvedValue({}),
  getMyTasks: jest.fn().mockResolvedValue([]),
  getAuditLogs: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getQRCodeUrl: jest.fn().mockResolvedValue({ url: 'https://qr' }),
  compareVersions: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  createNewVersion: jest.fn().mockResolvedValue({ id: 1 }),
  submitForReview: jest.fn().mockResolvedValue({}),
  approvalAction: jest.fn().mockResolvedValue({}),
  archive: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
  getInstances: jest.fn().mockResolvedValue([]),
  getInstanceDetail: jest.fn().mockResolvedValue({ id: 1 }),
  startInstance: jest.fn().mockResolvedValue({ id: 1 }),
  cancelInstance: jest.fn().mockResolvedValue({}),
  completeStep: jest.fn().mockResolvedValue({}),
  rejectStep: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('ProcessStandardController', () => {
  let controller: ProcessStandardController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessStandardController],
      providers: [{ provide: ProcessStandardService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ProcessStandardController>(ProcessStandardController);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('dashboard → getDashboard', async () => {
    await controller.dashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalled();
  });

  it('myTasks → getMyTasks(userId)', async () => {
    await controller.myTasks(mockUser as any);
    expect(mockSvc.getMyTasks).toHaveBeenCalledWith(1);
  });

  it('auditLogs → getAuditLogs(processId, instanceId, page)', async () => {
    await controller.auditLogs('3', '5', '2');
    expect(mockSvc.getAuditLogs).toHaveBeenCalledWith(3, 5, 2);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(2);
    expect(mockSvc.findOne).toHaveBeenCalledWith(2);
  });

  it('qrCode → getQRCodeUrl(id)', async () => {
    await controller.qrCode(3);
    expect(mockSvc.getQRCodeUrl).toHaveBeenCalledWith(3);
  });

  it('compareVersions → compareVersions(id, versionA, versionB)', async () => {
    await controller.compareVersions(1, '1.0', '2.0');
    expect(mockSvc.compareVersions).toHaveBeenCalledWith(1, '1.0', '2.0');
  });

  it('create → create(userId, dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(1, dto);
  });

  it('update → update(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, mockUser as any, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto, 1);
  });

  it('newVersion → createNewVersion(id, userId)', async () => {
    await controller.newVersion(2, mockUser as any);
    expect(mockSvc.createNewVersion).toHaveBeenCalledWith(2, 1);
  });

  it('submitReview → submitForReview(id, userId)', async () => {
    await controller.submitReview(3, mockUser as any);
    expect(mockSvc.submitForReview).toHaveBeenCalledWith(3, 1);
  });

  it('approvalAction → approvalAction(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.approvalAction(4, mockUser as any, dto);
    expect(mockSvc.approvalAction).toHaveBeenCalledWith(4, 1, dto);
  });

  it('archive → archive(id, userId)', async () => {
    await controller.archive(5, mockUser as any);
    expect(mockSvc.archive).toHaveBeenCalledWith(5, 1);
  });

  it('remove → remove(id, userId)', async () => {
    await controller.remove(6, mockUser as any);
    expect(mockSvc.remove).toHaveBeenCalledWith(6, 1);
  });

  it('getInstances → getInstances(query)', async () => {
    await controller.getInstances(mockUser as any);
    expect(mockSvc.getInstances).toHaveBeenCalledWith({ processId: undefined, status: undefined, page: 1 });
  });

  it('getInstance → getInstanceDetail(id)', async () => {
    await controller.getInstance(3);
    expect(mockSvc.getInstanceDetail).toHaveBeenCalledWith(3);
  });

  it('startInstance → startInstance(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.startInstance(2, mockUser as any, dto);
    expect(mockSvc.startInstance).toHaveBeenCalledWith(2, 1, dto);
  });

  it('cancelInstance → cancelInstance(instanceId, userId, reason)', async () => {
    await controller.cancelInstance(4, mockUser as any, 'motivo');
    expect(mockSvc.cancelInstance).toHaveBeenCalledWith(4, 1, 'motivo');
  });

  it('completeStep → completeStep(instanceId, stepId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.completeStep(5, 2, mockUser as any, dto);
    expect(mockSvc.completeStep).toHaveBeenCalledWith(5, 2, 1, dto);
  });

  it('rejectStep → rejectStep(instanceId, stepId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.rejectStep(6, 3, mockUser as any, dto);
    expect(mockSvc.rejectStep).toHaveBeenCalledWith(6, 3, 1, dto);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ProcessStandardController } from './process-standard.controller';
import { ProcessStandardService } from './process-standard.service';
import { ProcessInstancesService } from './process-instances.service';
import { ProcessTasksService } from './process-tasks.service';
import { ProcessApprovalsService } from './process-approvals.service';
import { ProcessAutomationsService } from './process-automations.service';
import { ProcessCalendarService } from './process-calendar.service';
import { ProcessDocumentsService } from './process-documents.service';
import { ProcessReportsService } from './process-reports.service';
import { ProcessAuditTrailService } from './process-audit-trail.service';
import { ProcessSettingsService } from './process-settings.service';
import { ProcessIntegrationsService } from './process-integrations.service';
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
  getInstanceDetail: jest.fn().mockResolvedValue({ id: 1 }),
  startInstance: jest.fn().mockResolvedValue({ id: 1 }),
  cancelInstance: jest.fn().mockResolvedValue({}),
  completeStep: jest.fn().mockResolvedValue({}),
  rejectStep: jest.fn().mockResolvedValue({}),
};

const mockInstances = {
  list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  filterOptions: jest.fn().mockResolvedValue({}),
  exportCsv: jest.fn().mockResolvedValue({ csv: 'a,b', count: 0 }),
  update: jest.fn().mockResolvedValue({}),
  assign: jest.fn().mockResolvedValue({}),
  changePriority: jest.fn().mockResolvedValue({}),
  suspend: jest.fn().mockResolvedValue({}),
  resume: jest.fn().mockResolvedValue({}),
  archive: jest.fn().mockResolvedValue({}),
  duplicate: jest.fn().mockResolvedValue({}),
  history: jest.fn().mockResolvedValue({ data: [] }),
};

const mockTasks = {
  list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  detail: jest.fn().mockResolvedValue({}),
  start: jest.fn().mockResolvedValue({}),
  block: jest.fn().mockResolvedValue({}),
  unblock: jest.fn().mockResolvedValue({}),
  requestClarification: jest.fn().mockResolvedValue({}),
  addComment: jest.fn().mockResolvedValue({}),
  updateChecklist: jest.fn().mockResolvedValue({}),
  reassign: jest.fn().mockResolvedValue({}),
  returnForCorrection: jest.fn().mockResolvedValue({}),
  reopen: jest.fn().mockResolvedValue({}),
  remind: jest.fn().mockResolvedValue({}),
  escalate: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('ProcessStandardController', () => {
  let controller: ProcessStandardController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessStandardController],
      providers: [
        { provide: ProcessStandardService, useValue: mockSvc },
        { provide: ProcessInstancesService, useValue: mockInstances },
        { provide: ProcessTasksService, useValue: mockTasks },
        { provide: ProcessApprovalsService, useValue: {} },
        { provide: ProcessAutomationsService, useValue: {} },
        { provide: ProcessCalendarService, useValue: {} },
        { provide: ProcessDocumentsService, useValue: {} },
        { provide: ProcessReportsService, useValue: {} },
        { provide: ProcessAuditTrailService, useValue: {} },
        { provide: ProcessSettingsService, useValue: {} },
        { provide: ProcessIntegrationsService, useValue: {} },
      ],
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
    await controller.findAll(filters, mockUser as any);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters, mockUser);
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

  it('getInstances → instances.list(filters, user)', async () => {
    const filters = { status: 'IN_PROGRESS' } as any;
    await controller.getInstances(filters, mockUser as any);
    expect(mockInstances.list).toHaveBeenCalledWith(filters, mockUser);
  });

  it('listTasks → tasks.list(filters, user)', async () => {
    const filters = { scope: 'mine' } as any;
    await controller.listTasks(filters, mockUser as any);
    expect(mockTasks.list).toHaveBeenCalledWith(filters, mockUser);
  });

  it('taskDetail → tasks.detail(instanceId, stepId, user)', async () => {
    await controller.taskDetail(1, 2, mockUser as any);
    expect(mockTasks.detail).toHaveBeenCalledWith(1, 2, mockUser);
  });

  it('blockTask → tasks.block(instanceId, stepId, user, reason)', async () => {
    await controller.blockTask(1, 2, mockUser as any, { reason: 'falta info' });
    expect(mockTasks.block).toHaveBeenCalledWith(1, 2, mockUser, 'falta info');
  });

  it('returnTask → tasks.returnForCorrection(...)', async () => {
    await controller.returnTask(1, 2, mockUser as any, { reason: 'corrigir' });
    expect(mockTasks.returnForCorrection).toHaveBeenCalledWith(1, 2, mockUser, 'corrigir');
  });

  it('suspendInstance → instances.suspend(id, user, reason)', async () => {
    await controller.suspendInstance(7, mockUser as any, { reason: 'pausa' });
    expect(mockInstances.suspend).toHaveBeenCalledWith(7, mockUser, 'pausa');
  });

  it('assignInstance → instances.assign(id, dto, user)', async () => {
    const dto = { responsibleId: 9 } as any;
    await controller.assignInstance(7, mockUser as any, dto);
    expect(mockInstances.assign).toHaveBeenCalledWith(7, dto, mockUser);
  });

  it('getInstance → getInstanceDetail(id, user)', async () => {
    await controller.getInstance(3, mockUser as any);
    expect(mockSvc.getInstanceDetail).toHaveBeenCalledWith(3, mockUser);
  });

  it('startInstance → startInstance(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.startInstance(2, mockUser as any, dto);
    expect(mockSvc.startInstance).toHaveBeenCalledWith(2, 1, dto, mockUser);
  });

  it('cancelInstance → cancelInstance(instanceId, userId, reason)', async () => {
    await controller.cancelInstance(4, mockUser as any, 'motivo');
    expect(mockSvc.cancelInstance).toHaveBeenCalledWith(4, 1, 'motivo');
  });

  it('completeStep → completeStep(instanceId, stepId, user, dto)', async () => {
    const dto = {} as any;
    await controller.completeStep(5, 2, mockUser as any, dto);
    expect(mockSvc.completeStep).toHaveBeenCalledWith(5, 2, mockUser, dto);
  });

  it('rejectStep → rejectStep(instanceId, stepId, user, dto)', async () => {
    const dto = {} as any;
    await controller.rejectStep(6, 3, mockUser as any, dto);
    expect(mockSvc.rejectStep).toHaveBeenCalledWith(6, 3, mockUser, dto);
  });
});

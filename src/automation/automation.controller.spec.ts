import { Test, TestingModule } from '@nestjs/testing';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationScheduleService } from './automation-schedule.service';
import { AutomationHistoryService } from './automation-history.service';
import { AutomationTasksService } from './automation-tasks.service';
import { AutomationReportsService } from './automation-reports.service';
import { AutomationAccessService } from './automation-access.service';
import { AutomationPermissionGuard } from './automation-permission.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getRules: jest.fn().mockResolvedValue([]),
  createRule: jest.fn().mockResolvedValue({ id: 1 }),
  updateRule: jest.fn().mockResolvedValue({ id: 1 }),
  toggleRule: jest.fn().mockResolvedValue({ active: true }),
  cloneRule: jest.fn().mockResolvedValue({ id: 2 }),
  deleteRule: jest.fn().mockResolvedValue({}),
  runAllActiveRules: jest.fn().mockResolvedValue({ executed: 0 }),
  triggerEvent: jest.fn().mockResolvedValue({}),
  getExecutions: jest.fn().mockResolvedValue([]),
  rerunExecution: jest.fn().mockResolvedValue({}),
  getStats: jest.fn().mockResolvedValue({}),
  getTemplates: jest.fn().mockResolvedValue([]),
  applyTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  initDefaultRules: jest.fn().mockResolvedValue({}),
};

const mockSchedules = {
  list: jest.fn().mockResolvedValue({ data: [] }),
  create: jest.fn().mockResolvedValue({ id: 's1' }),
};

const mockHistory = {
  list: jest.fn().mockResolvedValue({ data: [] }),
  cancel: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
};

const mockTasks = {
  list: jest.fn().mockResolvedValue({ data: [] }),
  decide: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
};

const mockAccess = {
  scopedRuleIds: jest.fn().mockResolvedValue(null),
};

const mockReports = {
  build: jest.fn().mockResolvedValue({}),
};

describe('AutomationController', () => {
  let controller: AutomationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationController],
      providers: [
        { provide: AutomationService, useValue: mockSvc },
        { provide: AutomationScheduleService, useValue: mockSchedules },
        { provide: AutomationHistoryService, useValue: mockHistory },
        { provide: AutomationTasksService, useValue: mockTasks },
        { provide: AutomationReportsService, useValue: mockReports },
        { provide: AutomationAccessService, useValue: mockAccess },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AutomationPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AutomationController>(AutomationController);
  });

  it('rules → getRules(category)', async () => {
    await controller.rules({} as any, { id: 1 } as any);
    expect(mockSvc.getRules).toHaveBeenCalledWith({}, null);
  });

  it('create → createRule(dto, user.id)', async () => {
    const dto = {} as any;
    const user = { id: 7 } as any;
    await controller.create(dto, user);
    expect(mockSvc.createRule).toHaveBeenCalledWith(dto, 7);
  });

  it('update → updateRule(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto, { id: 7 } as any);
    expect(mockSvc.updateRule).toHaveBeenCalledWith(1, dto, 7);
  });

  it('toggle → toggleRule(id)', async () => {
    await controller.toggle(2, { id: 7 } as any);
    expect(mockSvc.toggleRule).toHaveBeenCalledWith(2, 7);
  });

  it('clone → cloneRule(id)', async () => {
    await controller.clone(3, { id: 7 } as any);
    expect(mockSvc.cloneRule).toHaveBeenCalledWith(3, 7);
  });

  it('remove → deleteRule(id)', async () => {
    await controller.remove(4, { id: 7 } as any);
    expect(mockSvc.deleteRule).toHaveBeenCalledWith(4, 7);
  });

  it('runAll → runAllActiveRules', async () => {
    await controller.runAll();
    expect(mockSvc.runAllActiveRules).toHaveBeenCalled();
  });

  it('trigger → triggerEvent(dto)', async () => {
    const dto = {} as any;
    await controller.trigger(dto);
    expect(mockSvc.triggerEvent).toHaveBeenCalledWith(dto);
  });

  it('executions → getExecutions(filters)', async () => {
    const filters = {} as any;
    await controller.executions(filters, { id: 7 } as any);
    expect(mockSvc.getExecutions).toHaveBeenCalledWith(filters, null);
  });

  it('rerun → rerunExecution(id)', async () => {
    await controller.rerun(5);
    expect(mockSvc.rerunExecution).toHaveBeenCalledWith(5);
  });

  it('stats → getStats', async () => {
    await controller.stats();
    expect(mockSvc.getStats).toHaveBeenCalled();
  });

  it('templates → getTemplates', async () => {
    await controller.templates();
    expect(mockSvc.getTemplates).toHaveBeenCalled();
  });

  it('applyTemplate → applyTemplate(index)', async () => {
    await controller.applyTemplate(2);
    expect(mockSvc.applyTemplate).toHaveBeenCalledWith(2);
  });

  it('initDefaults → initDefaultRules', async () => {
    await controller.initDefaults();
    expect(mockSvc.initDefaultRules).toHaveBeenCalled();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
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

describe('AutomationController', () => {
  let controller: AutomationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationController],
      providers: [{ provide: AutomationService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AutomationController>(AutomationController);
  });

  it('rules → getRules(category)', async () => {
    await controller.rules();
    expect(mockSvc.getRules).toHaveBeenCalledWith(undefined);
  });

  it('create → createRule(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.createRule).toHaveBeenCalledWith(dto);
  });

  it('update → updateRule(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.updateRule).toHaveBeenCalledWith(1, dto);
  });

  it('toggle → toggleRule(id)', async () => {
    await controller.toggle(2);
    expect(mockSvc.toggleRule).toHaveBeenCalledWith(2);
  });

  it('clone → cloneRule(id)', async () => {
    await controller.clone(3);
    expect(mockSvc.cloneRule).toHaveBeenCalledWith(3);
  });

  it('remove → deleteRule(id)', async () => {
    await controller.remove(4);
    expect(mockSvc.deleteRule).toHaveBeenCalledWith(4);
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
    await controller.executions(filters);
    expect(mockSvc.getExecutions).toHaveBeenCalledWith(filters);
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

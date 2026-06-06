import { Test, TestingModule } from '@nestjs/testing';
import { ScalabilityController } from './scalability.controller';
import { ScalabilityService } from './scalability.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  createTenant: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
  updateTenant: jest.fn().mockResolvedValue({}),
  listTenants: jest.fn().mockResolvedValue([]),
  findTenantOrFail: jest.fn().mockResolvedValue({ id: 'tenant-1' }),
  createIntegration: jest.fn().mockResolvedValue({ id: 'int-1' }),
  updateIntegration: jest.fn().mockResolvedValue({}),
  listIntegrations: jest.fn().mockResolvedValue([]),
  triggerSync: jest.fn().mockResolvedValue({ queued: true }),
  getIntegrationSyncLogs: jest.fn().mockResolvedValue([]),
  createAutomationRule: jest.fn().mockResolvedValue({ id: 'auto-1' }),
  updateAutomationRule: jest.fn().mockResolvedValue({}),
  listAutomationRules: jest.fn().mockResolvedValue([]),
  executeAutomationRule: jest.fn().mockResolvedValue({ executed: true }),
  createSlaConfig: jest.fn().mockResolvedValue({ id: 'sla-1' }),
  updateSlaConfig: jest.fn().mockResolvedValue({}),
  listSlaConfigs: jest.fn().mockResolvedValue([]),
  getContentDeliveryConfig: jest.fn().mockResolvedValue({}),
  updateContentDeliveryConfig: jest.fn().mockResolvedValue({}),
  getMetrics: jest.fn().mockResolvedValue({}),
  getRealtimeMetrics: jest.fn().mockResolvedValue({}),
  createAlert: jest.fn().mockResolvedValue({ id: 'alert-1' }),
  resolveAlert: jest.fn().mockResolvedValue({}),
  listAlerts: jest.fn().mockResolvedValue([]),
  bulkImportUsers: jest.fn().mockResolvedValue({ imported: 0 }),
  scheduleLoadTest: jest.fn().mockResolvedValue({ scheduled: true }),
};

const mockReq = { user: { id: 1 } };

describe('ScalabilityController', () => {
  let controller: ScalabilityController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScalabilityController],
      providers: [{ provide: ScalabilityService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ScalabilityController>(ScalabilityController);
  });

  it('getDashboard → getDashboard(tenantId)', async () => {
    await controller.getDashboard('tenant-1');
    expect(mockSvc.getDashboard).toHaveBeenCalledWith('tenant-1');
  });

  it('createTenant → createTenant(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createTenant(dto, mockReq as any);
    expect(mockSvc.createTenant).toHaveBeenCalledWith(dto, 1);
  });

  it('updateTenant → updateTenant(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateTenant('tenant-1', dto, mockReq as any);
    expect(mockSvc.updateTenant).toHaveBeenCalledWith('tenant-1', dto, 1);
  });

  it('listTenants → listTenants(query)', async () => {
    const query = {} as any;
    await controller.listTenants(query);
    expect(mockSvc.listTenants).toHaveBeenCalledWith(query);
  });

  it('getTenant → findTenantOrFail(id)', async () => {
    await controller.getTenant('tenant-1');
    expect(mockSvc.findTenantOrFail).toHaveBeenCalledWith('tenant-1');
  });

  it('createIntegration → createIntegration(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createIntegration(dto, mockReq as any);
    expect(mockSvc.createIntegration).toHaveBeenCalledWith(dto, 1);
  });

  it('updateIntegration → updateIntegration(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateIntegration('int-1', dto, mockReq as any);
    expect(mockSvc.updateIntegration).toHaveBeenCalledWith('int-1', dto, 1);
  });

  it('listIntegrations → listIntegrations(tenantId, query)', async () => {
    const query = {} as any;
    await controller.listIntegrations('tenant-1', query);
    expect(mockSvc.listIntegrations).toHaveBeenCalledWith('tenant-1', query);
  });

  it('triggerSync → triggerSync(integrationId, userId)', async () => {
    const dto = { integrationId: 'int-1' } as any;
    await controller.triggerSync(dto, mockReq as any);
    expect(mockSvc.triggerSync).toHaveBeenCalledWith('int-1', 1);
  });

  it('getSyncLogs → getIntegrationSyncLogs(integrationId, limit)', async () => {
    await controller.getSyncLogs('int-1', 20);
    expect(mockSvc.getIntegrationSyncLogs).toHaveBeenCalledWith('int-1', 20);
  });

  it('createAutomationRule → createAutomationRule(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createAutomationRule(dto, mockReq as any);
    expect(mockSvc.createAutomationRule).toHaveBeenCalledWith(dto, 1);
  });

  it('updateAutomationRule → updateAutomationRule(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateAutomationRule('auto-1', dto, mockReq as any);
    expect(mockSvc.updateAutomationRule).toHaveBeenCalledWith('auto-1', dto, 1);
  });

  it('listAutomationRules → listAutomationRules(tenantId, query)', async () => {
    const query = {} as any;
    await controller.listAutomationRules('tenant-1', query);
    expect(mockSvc.listAutomationRules).toHaveBeenCalledWith('tenant-1', query);
  });

  it('executeAutomationRule → executeAutomationRule(dto, userId)', async () => {
    const dto = {} as any;
    await controller.executeAutomationRule(dto, mockReq as any);
    expect(mockSvc.executeAutomationRule).toHaveBeenCalledWith(dto, 1);
  });

  it('createSla → createSlaConfig(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createSla(dto, mockReq as any);
    expect(mockSvc.createSlaConfig).toHaveBeenCalledWith(dto, 1);
  });

  it('updateSla → updateSlaConfig(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateSla('sla-1', dto, mockReq as any);
    expect(mockSvc.updateSlaConfig).toHaveBeenCalledWith('sla-1', dto, 1);
  });

  it('listSlas → listSlaConfigs(tenantId)', async () => {
    await controller.listSlas('tenant-1');
    expect(mockSvc.listSlaConfigs).toHaveBeenCalledWith('tenant-1');
  });

  it('getContentDelivery → getContentDeliveryConfig(tenantId)', async () => {
    await controller.getContentDelivery('tenant-1');
    expect(mockSvc.getContentDeliveryConfig).toHaveBeenCalledWith('tenant-1');
  });

  it('updateContentDelivery → updateContentDeliveryConfig(tenantId, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateContentDelivery('tenant-1', dto, mockReq as any);
    expect(mockSvc.updateContentDeliveryConfig).toHaveBeenCalledWith('tenant-1', dto, 1);
  });

  it('getMetrics → getMetrics(query)', async () => {
    const query = {} as any;
    await controller.getMetrics(query);
    expect(mockSvc.getMetrics).toHaveBeenCalledWith(query);
  });

  it('getRealtimeMetrics sem tenantId → getRealtimeMetrics(undefined)', async () => {
    await controller.getRealtimeMetrics();
    expect(mockSvc.getRealtimeMetrics).toHaveBeenCalledWith(undefined);
  });

  it('createAlert → createAlert(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createAlert(dto, mockReq as any);
    expect(mockSvc.createAlert).toHaveBeenCalledWith(dto, 1);
  });

  it('resolveAlert → resolveAlert(id, dto)', async () => {
    const dto = {} as any;
    await controller.resolveAlert('alert-1', dto);
    expect(mockSvc.resolveAlert).toHaveBeenCalledWith('alert-1', dto);
  });

  it('listAlerts → listAlerts(query)', async () => {
    const query = {} as any;
    await controller.listAlerts(query);
    expect(mockSvc.listAlerts).toHaveBeenCalledWith(query);
  });

  it('bulkImport → bulkImportUsers(dto, userId)', async () => {
    const dto = {} as any;
    await controller.bulkImport(dto, mockReq as any);
    expect(mockSvc.bulkImportUsers).toHaveBeenCalledWith(dto, 1);
  });

  it('scheduleLoadTest → scheduleLoadTest(dto, userId)', async () => {
    const dto = {} as any;
    await controller.scheduleLoadTest(dto, mockReq as any);
    expect(mockSvc.scheduleLoadTest).toHaveBeenCalledWith(dto, 1);
  });
});

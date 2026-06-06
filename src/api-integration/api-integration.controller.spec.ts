import { Test, TestingModule } from '@nestjs/testing';
import { ApiIntegrationController } from './api-integration.controller';
import { ApiIntegrationService } from './api-integration.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getIntegrations: jest.fn().mockResolvedValue([]),
  getStats: jest.fn().mockResolvedValue({}),
  getAllLogs: jest.fn().mockResolvedValue([]),
  getIntegration: jest.fn().mockResolvedValue({ id: 1 }),
  createIntegration: jest.fn().mockResolvedValue({ id: 2 }),
  updateIntegration: jest.fn().mockResolvedValue({ id: 1 }),
  testIntegration: jest.fn().mockResolvedValue({ ok: true }),
  toggleIntegration: jest.fn().mockResolvedValue({ active: true }),
  deleteIntegration: jest.fn().mockResolvedValue({}),
  getLogs: jest.fn().mockResolvedValue([]),
  getApiKeys: jest.fn().mockResolvedValue([]),
  createApiKey: jest.fn().mockResolvedValue({ id: 1, key: 'raw-key' }),
  revokeApiKey: jest.fn().mockResolvedValue({}),
  rotateApiKey: jest.fn().mockResolvedValue({ key: 'new-key' }),
  validateApiKey: jest.fn().mockResolvedValue({ valid: true }),
  getWebhooks: jest.fn().mockResolvedValue([]),
  createWebhook: jest.fn().mockResolvedValue({ id: 1 }),
  toggleWebhook: jest.fn().mockResolvedValue({}),
  deleteWebhook: jest.fn().mockResolvedValue({}),
  triggerWebhook: jest.fn().mockResolvedValue({}),
  getWebhookDeliveries: jest.fn().mockResolvedValue([]),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('ApiIntegrationController', () => {
  let controller: ApiIntegrationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiIntegrationController],
      providers: [{ provide: ApiIntegrationService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<ApiIntegrationController>(ApiIntegrationController);
  });

  it('findAll → getIntegrations', async () => {
    await controller.findAll();
    expect(mockSvc.getIntegrations).toHaveBeenCalled();
  });

  it('stats → getStats', async () => {
    await controller.stats();
    expect(mockSvc.getStats).toHaveBeenCalled();
  });

  it('allLogs → getAllLogs(filters)', async () => {
    const filters = {} as any;
    await controller.allLogs(filters);
    expect(mockSvc.getAllLogs).toHaveBeenCalledWith(filters);
  });

  it('findOne → getIntegration(id)', async () => {
    await controller.findOne(2);
    expect(mockSvc.getIntegration).toHaveBeenCalledWith(2);
  });

  it('create → createIntegration(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.createIntegration).toHaveBeenCalledWith(dto);
  });

  it('update → updateIntegration(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.updateIntegration).toHaveBeenCalledWith(1, dto);
  });

  it('test → testIntegration(id)', async () => {
    await controller.test(3);
    expect(mockSvc.testIntegration).toHaveBeenCalledWith(3);
  });

  it('toggle → toggleIntegration(id)', async () => {
    await controller.toggle(4);
    expect(mockSvc.toggleIntegration).toHaveBeenCalledWith(4);
  });

  it('remove → deleteIntegration(id)', async () => {
    await controller.remove(5);
    expect(mockSvc.deleteIntegration).toHaveBeenCalledWith(5);
  });

  it('logs → getLogs(id, filters)', async () => {
    const filters = {} as any;
    await controller.logs(2, filters);
    expect(mockSvc.getLogs).toHaveBeenCalledWith(2, filters);
  });

  it('getApiKeys → getApiKeys', async () => {
    await controller.getApiKeys(mockUser as any);
    expect(mockSvc.getApiKeys).toHaveBeenCalled();
  });

  it('createApiKey → createApiKey(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createApiKey(dto, mockUser as any);
    expect(mockSvc.createApiKey).toHaveBeenCalledWith(dto, 1);
  });

  it('revokeApiKey → revokeApiKey(id, userId)', async () => {
    await controller.revokeApiKey(3, mockUser as any);
    expect(mockSvc.revokeApiKey).toHaveBeenCalledWith(3, 1);
  });

  it('rotateApiKey → rotateApiKey(id, userId)', async () => {
    await controller.rotateApiKey(4, mockUser as any);
    expect(mockSvc.rotateApiKey).toHaveBeenCalledWith(4, 1);
  });

  it('validateApiKey → validateApiKey(key)', async () => {
    await controller.validateApiKey({ key: 'test-key' });
    expect(mockSvc.validateApiKey).toHaveBeenCalledWith('test-key');
  });

  it('getWebhooks → getWebhooks', async () => {
    await controller.getWebhooks();
    expect(mockSvc.getWebhooks).toHaveBeenCalled();
  });

  it('createWebhook → createWebhook(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createWebhook(dto, mockUser as any);
    expect(mockSvc.createWebhook).toHaveBeenCalledWith(dto, 1);
  });

  it('toggleWebhook → toggleWebhook(id)', async () => {
    await controller.toggleWebhook(2);
    expect(mockSvc.toggleWebhook).toHaveBeenCalledWith(2);
  });

  it('deleteWebhook → deleteWebhook(id)', async () => {
    await controller.deleteWebhook(3);
    expect(mockSvc.deleteWebhook).toHaveBeenCalledWith(3);
  });

  it('triggerWebhook → triggerWebhook(dto)', async () => {
    const dto = {} as any;
    await controller.triggerWebhook(dto);
    expect(mockSvc.triggerWebhook).toHaveBeenCalledWith(dto);
  });

  it('webhookDeliveries sem limit → getWebhookDeliveries(id, 20)', async () => {
    await controller.webhookDeliveries(5);
    expect(mockSvc.getWebhookDeliveries).toHaveBeenCalledWith(5, 20);
  });
});

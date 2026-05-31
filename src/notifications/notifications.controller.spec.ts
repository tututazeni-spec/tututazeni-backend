import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getMyNotifications: jest.fn().mockResolvedValue([]),
  getUnreadCount: jest.fn().mockResolvedValue(0),
  markAsRead: jest.fn().mockResolvedValue({}),
  markAllAsRead: jest.fn().mockResolvedValue({}),
  markBulkAsRead: jest.fn().mockResolvedValue({}),
  archiveNotification: jest.fn().mockResolvedValue({}),
  getPreferences: jest.fn().mockResolvedValue({}),
  updatePreferences: jest.fn().mockResolvedValue({}),
  getTemplates: jest.fn().mockResolvedValue([]),
  createTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  updateTemplate: jest.fn().mockResolvedValue({}),
  deleteTemplate: jest.fn().mockResolvedValue({}),
  send: jest.fn().mockResolvedValue({}),
  sendBulk: jest.fn().mockResolvedValue({}),
  sendToAll: jest.fn().mockResolvedValue({}),
  getAllLogs: jest.fn().mockResolvedValue([]),
  getStats: jest.fn().mockResolvedValue({}),
  getAutomationRules: jest.fn().mockResolvedValue([]),
  createAutomationRule: jest.fn().mockResolvedValue({ id: 1 }),
  toggleAutomationRule: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com' };

describe('NotificationsController', () => {
  let controller: NotificationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('my → getMyNotifications', async () => {
    const filters = {} as any;
    await controller.my(mockUser as any, filters);
    expect(mockSvc.getMyNotifications).toHaveBeenCalledWith(1, filters);
  });

  it('unreadCount → getUnreadCount', async () => {
    await controller.unreadCount(mockUser as any);
    expect(mockSvc.getUnreadCount).toHaveBeenCalledWith(1);
  });

  it('markRead → markAsRead', async () => {
    await controller.markRead(5, mockUser as any);
    expect(mockSvc.markAsRead).toHaveBeenCalledWith(5, 1);
  });

  it('readAll → markAllAsRead', async () => {
    await controller.readAll(mockUser as any);
    expect(mockSvc.markAllAsRead).toHaveBeenCalledWith(1);
  });

  it('readBulk → markBulkAsRead', async () => {
    await controller.readBulk(mockUser as any, { ids: [1, 2, 3] });
    expect(mockSvc.markBulkAsRead).toHaveBeenCalledWith(1, [1, 2, 3]);
  });

  it('archive → archiveNotification', async () => {
    await controller.archive(3, mockUser as any);
    expect(mockSvc.archiveNotification).toHaveBeenCalledWith(3, 1);
  });

  it('getPrefs → getPreferences', async () => {
    await controller.getPrefs(mockUser as any);
    expect(mockSvc.getPreferences).toHaveBeenCalledWith(1);
  });

  it('updatePrefs → updatePreferences', async () => {
    const dto = {} as any;
    await controller.updatePrefs(mockUser as any, dto);
    expect(mockSvc.updatePreferences).toHaveBeenCalledWith(1, dto);
  });

  it('getTemplates → getTemplates', async () => {
    await controller.getTemplates();
    expect(mockSvc.getTemplates).toHaveBeenCalled();
  });

  it('createTemplate → createTemplate', async () => {
    const dto = {} as any;
    await controller.createTemplate(dto);
    expect(mockSvc.createTemplate).toHaveBeenCalledWith(dto);
  });

  it('updateTemplate → updateTemplate', async () => {
    const dto = {} as any;
    await controller.updateTemplate(2, dto);
    expect(mockSvc.updateTemplate).toHaveBeenCalledWith(2, dto);
  });

  it('deleteTemplate → deleteTemplate', async () => {
    await controller.deleteTemplate(2);
    expect(mockSvc.deleteTemplate).toHaveBeenCalledWith(2);
  });

  it('send → send', async () => {
    const dto = {} as any;
    await controller.send(dto);
    expect(mockSvc.send).toHaveBeenCalledWith(dto);
  });

  it('sendBulk → sendBulk', async () => {
    const dto = {} as any;
    await controller.sendBulk(dto);
    expect(mockSvc.sendBulk).toHaveBeenCalledWith(dto);
  });

  it('sendAll → sendToAll', async () => {
    const body = { type: 'INFO', message: 'msg', title: 'Título' };
    await controller.sendAll(body);
    expect(mockSvc.sendToAll).toHaveBeenCalledWith('INFO', 'msg', 'Título');
  });

  it('all → getAllLogs', async () => {
    const filters = {} as any;
    await controller.all(filters);
    expect(mockSvc.getAllLogs).toHaveBeenCalledWith(filters);
  });

  it('stats → getStats', async () => {
    await controller.stats();
    expect(mockSvc.getStats).toHaveBeenCalled();
  });

  it('rules → getAutomationRules', async () => {
    await controller.rules();
    expect(mockSvc.getAutomationRules).toHaveBeenCalled();
  });

  it('createRule → createAutomationRule', async () => {
    const body = { name: 'R', trigger: 'T', action: 'A', condition: 'C' };
    await controller.createRule(body);
    expect(mockSvc.createAutomationRule).toHaveBeenCalledWith(body);
  });

  it('toggleRule → toggleAutomationRule', async () => {
    await controller.toggleRule(7);
    expect(mockSvc.toggleAutomationRule).toHaveBeenCalledWith(7);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationCategory } from './notifications.dto';

const mockPrisma = {
  notificationLog: {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    groupBy: jest.fn(),
  },
  notificationPreference: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  notificationTemplate: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

const baseNotification = {
  id: 1,
  userId: 1,
  type: 'INFO',
  title: 'Teste',
  message: 'Mensagem de teste',
  read: false,
  success: true,
  priority: 'MEDIUM',
  createdAt: new Date(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
  });

  // ─── send ─────────────────────────────────────────────────────────────────

  describe('send', () => {
    const dto = { userId: 1, type: 'INFO', message: 'Test', title: 'Title' };

    beforeEach(() => {
      // send() valida o destinatário antes de criar a notificação
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1 });
    });

    it('deve lançar NotFoundException se o destinatário não existir', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.send(dto)).rejects.toThrow(NotFoundException);
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('deve criar notificação com sucesso', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
      mockPrisma.notificationLog.create.mockResolvedValue(baseNotification);

      const result = await service.send(dto);

      expect(result).toHaveProperty('id');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 1, type: 'INFO' }),
        }),
      );
    });

    it('deve serializar metadata com JSON.stringify', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
      mockPrisma.notificationLog.create.mockResolvedValue(baseNotification);

      await service.send({ ...dto, metadata: { key: 'value' } });

      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: '{"key":"value"}' }),
        }),
      );
    });

    it('deve ignorar notificação se categoria desactivada', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        userId: 1,
        disabledCategories: [NotificationCategory.LMS],
      });

      const result = await service.send({ ...dto, category: NotificationCategory.LMS });

      expect((result as any).skipped).toBe(true);
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
    });
  });

  // ─── sendBulk ─────────────────────────────────────────────────────────────

  describe('sendBulk', () => {
    it('deve enviar para múltiplos utilizadores', async () => {
      mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
      mockPrisma.notificationLog.createMany.mockResolvedValue({ count: 3 });

      const result = await service.sendBulk({
        userIds: [1, 2, 3],
        type: 'INFO',
        message: 'Bulk message',
      });

      expect(result.sent).toBe(3);
    });

    it('deve retornar 0 enviados se todos filtrados por categoria', async () => {
      mockPrisma.notificationPreference.findMany.mockResolvedValue([
        { userId: 1, disabledCategories: [NotificationCategory.SYSTEM] },
        { userId: 2, disabledCategories: [NotificationCategory.SYSTEM] },
      ]);

      const result = await service.sendBulk({
        userIds: [1, 2],
        type: 'SYSTEM',
        message: 'Mensagem sistema',
        category: NotificationCategory.SYSTEM,
      });

      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(2);
    });
  });

  // ─── getMyNotifications ───────────────────────────────────────────────────

  describe('getMyNotifications', () => {
    it('deve retornar notificações paginadas com agrupamento por data', async () => {
      const now = new Date();
      const notif = { ...baseNotification, createdAt: now };
      mockPrisma.notificationLog.findMany.mockResolvedValue([notif]);
      mockPrisma.notificationLog.count.mockResolvedValue(1);

      const result = await service.getMyNotifications(1, { page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.unreadCount).toBeDefined();
      expect(result.grouped).toHaveProperty('today');
      expect(result.grouped).toHaveProperty('yesterday');
    });
  });

  // ─── getUnreadCount ───────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('deve retornar contagem de não lidas', async () => {
      mockPrisma.notificationLog.count.mockResolvedValue(5);

      const result = await service.getUnreadCount(1);

      expect(result.count).toBe(5);
    });
  });

  // ─── markAsRead ───────────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('deve marcar notificação como lida', async () => {
      mockPrisma.notificationLog.findFirst.mockResolvedValue(baseNotification);
      mockPrisma.notificationLog.update.mockResolvedValue({ ...baseNotification, read: true });

      const result = await service.markAsRead(1, 1);

      expect(result.read).toBe(true);
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.notificationLog.findFirst.mockResolvedValue(null);
      await expect(service.markAsRead(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── markAllAsRead ────────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('deve marcar todas como lidas', async () => {
      mockPrisma.notificationLog.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead(1);

      expect(result.updated).toBe(3);
    });
  });

  // ─── markBulkAsRead ───────────────────────────────────────────────────────

  describe('markBulkAsRead', () => {
    it('deve marcar lista de ids como lidas', async () => {
      mockPrisma.notificationLog.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markBulkAsRead(1, [1, 2]);

      expect(result.updated).toBe(2);
    });
  });

  // ─── archiveNotification ──────────────────────────────────────────────────

  describe('archiveNotification', () => {
    it('deve arquivar notificação', async () => {
      mockPrisma.notificationLog.findFirst.mockResolvedValue(baseNotification);
      mockPrisma.notificationLog.update.mockResolvedValue({ ...baseNotification, archived: true });

      const result = await service.archiveNotification(1, 1);

      expect((result as any).archived).toBe(true);
    });

    it('deve lançar NotFoundException se não encontrada', async () => {
      mockPrisma.notificationLog.findFirst.mockResolvedValue(null);
      await expect(service.archiveNotification(99, 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── sendToAll ────────────────────────────────────────────────────────────

  describe('sendToAll', () => {
    it('deve enviar para todos os utilizadores activos', async () => {
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      mockPrisma.notificationPreference.findMany.mockResolvedValue([]);
      mockPrisma.notificationLog.createMany.mockResolvedValue({ count: 2 });

      const result = await service.sendToAll('INFO', 'Mensagem global');

      expect(result.sent).toBe(2);
    });
  });
});

// src/notifications/notifications.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNotificationDto, BulkNotificationDto, NotificationFilterDto,
  CreateTemplateDto, UpdateTemplateDto, UpdatePreferencesDto,
  NotificationPriority,
} from './notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── ENVIO ────────────────────────────────────────────────────────────────

  async send(dto: CreateNotificationDto) {
    // Verificar preferências do utilizador
    const prefs = await this.prisma.notificationPreference.findUnique({
      where: { userId: dto.userId },
    });

    // Verificar categorias desactivadas
    if (prefs && dto.category) {
      const disabled = (prefs as any).disabledCategories ?? [];
      if (disabled.includes(dto.category)) {
        this.logger.debug(`Notificação ignorada — categoria ${dto.category} desactivada para user ${dto.userId}`);
        return { skipped: true, reason: 'category_disabled' };
      }
    }

    const notification = await this.prisma.notificationLog.create({
      data: {
        userId:      dto.userId,
        type:        dto.type,
        title:       dto.title,
        message:     dto.message,
        priority:    dto.priority    ?? 'MEDIUM',
        category:    dto.category,
        actionUrl:   dto.actionUrl,
        actionLabel: dto.actionLabel,
        metadata:    dto.metadata ? JSON.stringify(dto.metadata) : undefined,
        expiresAt:   dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        read:        false,
        success:     true,
      },
    });

    // Log para canais externos (estrutura para integração futura)
    if (dto.priority === NotificationPriority.CRITICAL) {
      this.logger.warn(`[CRITICAL] Notificação crítica enviada para user ${dto.userId}: ${dto.type}`);
    }

    return notification;
  }

  async sendBulk(dto: BulkNotificationDto) {
    // Filtrar utilizadores com categorias desactivadas
    let targetIds = dto.userIds;

    if (dto.category) {
      const prefs = await this.prisma.notificationPreference.findMany({
        where: { userId: { in: dto.userIds } },
        select: { userId: true, disabledCategories: true },
      });
      const blockedUsers = new Set(
        prefs
          .filter(p => ((p as any).disabledCategories ?? []).includes(dto.category))
          .map(p => p.userId)
      );
      targetIds = dto.userIds.filter(id => !blockedUsers.has(id));
    }

    if (!targetIds.length) return { sent: 0, skipped: dto.userIds.length };

    const now = new Date();
    const result = await this.prisma.notificationLog.createMany({
      data: targetIds.map(userId => ({
        userId,
        type:        dto.type,
        title:       dto.title,
        message:     dto.message,
        priority:    dto.priority   ?? 'MEDIUM',
        category:    dto.category,
        actionUrl:   dto.actionUrl,
        metadata:    dto.metadata ? JSON.stringify(dto.metadata) : undefined,
        read:        false,
        success:     true,
        createdAt:   now,
      })),
    });

    return { sent: result.count, skipped: dto.userIds.length - result.count };
  }

  async sendToAll(type: string, message: string, title?: string) {
    const users = await this.prisma.user.findMany({
      where:  { active: true },
      select: { id: true },
    });
    return this.sendBulk({ userIds: users.map(u => u.id), type, message, title });
  }

  // ─── NOTIFICAÇÕES DO UTILIZADOR ───────────────────────────────────────────

  async getMyNotifications(userId: number, filters: NotificationFilterDto) {
    const { page = 1, limit = 20, type, category, priority, read } = filters;
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
    };
    if (type)     where.type     = type;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (read !== undefined) where.read = read;

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where, skip, take: limit,
        orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.notificationLog.count({ where }),
      this.prisma.notificationLog.count({ where: { userId, read: false } }),
    ]);

    // Agrupar por data
    const today     = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo   = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

    const grouped = {
      today:     data.filter(n => new Date(n.createdAt) >= today),
      yesterday: data.filter(n => new Date(n.createdAt) >= yesterday && new Date(n.createdAt) < today),
      thisWeek:  data.filter(n => new Date(n.createdAt) >= weekAgo && new Date(n.createdAt) < yesterday),
      older:     data.filter(n => new Date(n.createdAt) < weekAgo),
    };

    return {
      data, grouped, total, unreadCount,
      page, limit, totalPages: Math.ceil(total / limit),
    };
  }

  async getUnreadCount(userId: number): Promise<{ count: number }> {
    const count = await this.prisma.notificationLog.count({
      where: {
        userId,
        read: false,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
    });
    return { count };
  }

  async markAsRead(notificationId: number, userId: number) {
    const n = await this.prisma.notificationLog.findFirst({
      where: { id: notificationId, userId },
    });
    if (!n) throw new NotFoundException('Notificação não encontrada');
    return this.prisma.notificationLog.update({
      where: { id: notificationId },
      data:  { read: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: number) {
    const result = await this.prisma.notificationLog.updateMany({
      where: { userId, read: false },
      data:  { read: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async markBulkAsRead(userId: number, ids: number[]) {
    const result = await this.prisma.notificationLog.updateMany({
      where: { userId, id: { in: ids }, read: false },
      data:  { read: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async archiveNotification(notificationId: number, userId: number) {
    const n = await this.prisma.notificationLog.findFirst({ where: { id: notificationId, userId } });
    if (!n) throw new NotFoundException('Notificação não encontrada');
    return this.prisma.notificationLog.update({
      where: { id: notificationId },
      data:  { archived: true },
    });
  }

  // ─── ADMIN ────────────────────────────────────────────────────────────────

  async getAllLogs(filters: NotificationFilterDto) {
    const { page = 1, limit = 20, type, category, priority } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (type)     where.type     = type;
    if (category) where.category = category;
    if (priority) where.priority = priority;

    const [data, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where, skip, take: limit,
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getStats() {
    const [total, readCount, byType, byCategory, byPriority] = await Promise.all([
      this.prisma.notificationLog.count(),
      this.prisma.notificationLog.count({ where: { read: true } }),
      this.prisma.notificationLog.groupBy({ by: ['type'],     _count: true, orderBy: { _count: { type:     'desc' } }, take: 10 }),
      this.prisma.notificationLog.groupBy({ by: ['category'], _count: true, orderBy: { _count: { category: 'desc' } } }),
      this.prisma.notificationLog.groupBy({ by: ['priority'], _count: true }),
    ]);

    const unread = total - readCount;
    return {
      total, read: readCount, unread,
      openRate: total > 0 ? Math.round((readCount / total) * 100) : 0,
      byType:     byType.map(t => ({ type: t.type, count: t._count })),
      byCategory: byCategory.map(c => ({ category: c.category, count: c._count })),
      byPriority: Object.fromEntries(byPriority.map(p => [p.priority ?? 'N/D', p._count])),
    };
  }

  // ─── PREFERÊNCIAS ─────────────────────────────────────────────────────────

  async getPreferences(userId: number) {
    return this.prisma.notificationPreference.upsert({
      where:  { userId },
      create: {
        userId,
        inApp:             true,
        email:             true,
        push:              false,
        slack:             false,
        sms:               false,
        quietHourStart:    22,
        quietHourEnd:      8,
        digestFrequency:   'NONE',
        disabledCategories:[],
      },
      update: {},
    });
  }

  async updatePreferences(userId: number, dto: UpdatePreferencesDto) {
    return this.prisma.notificationPreference.upsert({
      where:  { userId },
      create: { userId, ...dto, disabledCategories: dto.disabledCategories ?? [] },
      update: { ...dto, disabledCategories: dto.disabledCategories ?? undefined },
    });
  }

  // ─── TEMPLATES ────────────────────────────────────────────────────────────

  async getTemplates() {
    return this.prisma.notificationTemplate.findMany({
      orderBy: { eventType: 'asc' },
    });
  }

  async createTemplate(dto: CreateTemplateDto) {
    return this.prisma.notificationTemplate.create({ data: dto });
  }

  async updateTemplate(id: number, dto: UpdateTemplateDto) {
    return this.prisma.notificationTemplate.update({ where: { id }, data: dto });
  }

  async deleteTemplate(id: number) {
    await this.prisma.notificationTemplate.delete({ where: { id } });
    return { message: 'Template eliminado' };
  }

  // ─── Enviar via template ──────────────────────────────────────────────────

  async sendFromTemplate(
    eventType: string,
    userId: number,
    variables: Record<string, string> = {},
  ) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { eventType, active: true },
    });
    if (!template) {
      this.logger.debug(`Sem template activo para evento: ${eventType}`);
      return null;
    }

    const interpolate = (str: string) =>
      str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);

    return this.send({
      userId,
      type:       eventType,
      title:      template.titleTemplate    ? interpolate(template.titleTemplate)    : undefined,
      message:    interpolate((template as any).messageTemplate),
      priority:   (template as any).priority  ?? 'MEDIUM',
      category:   (template as any).category,
      actionUrl:  template.actionUrlTemplate ? interpolate(template.actionUrlTemplate) : undefined,
    });
  }

  // ─── AUTOMATION RULES ─────────────────────────────────────────────────────

  async getAutomationRules() {
    return this.prisma.automationRule.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createAutomationRule(data: { name: string; trigger: string; action: string; condition: string }) {
    return this.prisma.automationRule.create({ data });
  }

  async toggleAutomationRule(id: number) {
    const rule = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Regra não encontrada');
    return this.prisma.automationRule.update({ where: { id }, data: { active: !rule.active } });
  }
}
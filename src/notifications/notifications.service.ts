// ─── notifications.service.ts ────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto, BulkNotificationDto, NotificationFilterDto } from './notifications.dto';
 
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}
 
  async send(dto: CreateNotificationDto) {
    // Em produção: integrar com FCM/WebPush/Email
    return this.prisma.notificationLog.create({
      data: { userId: dto.userId, type: dto.type, message: dto.message, success: true },
    });
  }
 
  async sendBulk(dto: BulkNotificationDto) {
    const results = await this.prisma.notificationLog.createMany({
      data: dto.userIds.map(userId => ({
        userId, type: dto.type, message: dto.message, success: true,
      })),
    });
    return { sent: results.count };
  }
 
  async sendToAll(type: string, message: string) {
    const users = await this.prisma.user.findMany({
      where: { active: true }, select: { id: true },
    });
    return this.sendBulk({ userIds: users.map(u => u.id), type, message });
  }
 
  async getMyNotifications(userId: number, filters: NotificationFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;
 
    const [data, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where: { userId },
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notificationLog.count({ where: { userId } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async getAllLogs(filters: NotificationFilterDto) {
    const { page = 1, limit = 20, type, success } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (type) where.type = type;
    if (success !== undefined) where.success = success;
 
    const [data, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where, skip, take: limit,
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notificationLog.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async getStats() {
    const [total, success, byType] = await Promise.all([
      this.prisma.notificationLog.count(),
      this.prisma.notificationLog.count({ where: { success: true } }),
      this.prisma.notificationLog.groupBy({
        by: ['type'], _count: true, orderBy: { _count: { type: 'desc' } },
      }),
    ]);
    return { total, success, failed: total - success, successRate: total ? Math.round((success / total) * 100) : 0, byType };
  }
 
  async getAutomationRules() {
    return this.prisma.automationRule.findMany({ orderBy: { createdAt: 'desc' } });
  }
 
  async createAutomationRule(data: { name: string; trigger: string; action: string; condition: string }) {
    return this.prisma.automationRule.create({ data });
  }
 
  async toggleAutomationRule(id: number) {
    const rule = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!rule) return null;
    return this.prisma.automationRule.update({ where: { id }, data: { active: !rule.active } });
  }
}
 

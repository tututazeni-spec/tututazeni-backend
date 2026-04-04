// ─── audit.service.ts ────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditFilterDto } from './audit.dto';
 
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: AuditFilterDto) {
    const { page = 1, limit = 50, userId, entity, action, from, to } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (entity) where.entity = { contains: entity, mode: 'insensitive' };
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }
 
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where, skip, take: limit,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async log(userId: number | null, action: string, entity: string, entityId?: number, metadata?: any) {
    return this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, metadata },
    });
  }
 
  async getStats() {
    const [total, byAction, byEntity, recentUsers] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.groupBy({
        by: ['action'], _count: true, orderBy: { _count: { action: 'desc' } }, take: 10,
      }),
      this.prisma.auditLog.groupBy({
        by: ['entity'], _count: true, orderBy: { _count: { entity: 'desc' } }, take: 10,
      }),
      this.prisma.auditLog.findMany({
        where: { userId: { not: null } },
        distinct: ['userId'],
        orderBy: { timestamp: 'desc' },
        take: 5,
        include: { user: { select: { id: true, fullName: true } } },
      }),
    ]);
    return { total, byAction, byEntity, recentUsers };
  }
 
  async getHistoryRecords(userId?: number) {
    return this.prisma.historyRecord.findMany({
      where: userId ? { userId } : {},
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
 

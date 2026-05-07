// src/common/services/audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
 
interface AuditLogInput {
  action:      string;
  entity?:     string;
  entityType?: string;
  entityId?:   number | string;
  userId:      number | string;
  metadata?:   Record<string, any>;
  details?:    Record<string, any>;
}
 
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
 
  async log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        action:   input.action,
        entity:   input.entity ?? input.entityType ?? 'Unknown',
        entityId: input.entityId !== undefined ? Number(input.entityId) : undefined,
        userId:   Number(input.userId),
        metadata: (input.metadata ?? input.details) ? (input.metadata ?? input.details) as any : undefined,
      },
    });
  }
}
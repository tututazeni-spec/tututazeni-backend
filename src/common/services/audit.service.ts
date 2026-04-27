// src/common/services/audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
 
interface AuditLogInput {
  action:      string;
  entity?:     string;
  entityType?: string;   // aceita ambos — normaliza para entity
  entityId?:   number;
  userId:      number;
  metadata?:   Record<string, any>;
}
 
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
 
  async log(input: AuditLogInput) {
    return this.prisma.auditLog.create({
      data: {
        action:   input.action,
        entity:   input.entity ?? input.entityType ?? 'Unknown',
        entityId: input.entityId,
        userId:   input.userId,
        metadata: input.metadata ? input.metadata as any : undefined,
      },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  log(data: any) {
    return this.prisma.auditLog.create({ data });
  }

  findByUser(userId: number) {
    return this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: [{ timestamp: 'desc' }],
    });
  }
}

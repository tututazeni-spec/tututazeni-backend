// src/executive-reports/executive-reports.audit.service.ts
// Auditoria do módulo (docs/Executive_Reports.md §11 ExecutiveReportAudit, §12.7/12.10):
// quem gerou/consultou/exportou o quê, com que filtros, e as falhas de geração.
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './dto/executive-audit.dto';

export type ExecutiveAuditAction =
  | 'REPORT_GENERATE'
  | 'REPORT_VIEW'
  | 'REPORT_EXPORT'
  | 'DOMAIN_VIEW'
  | 'SCHEDULE_CREATE'
  | 'SCHEDULE_UPDATE'
  | 'SCHEDULE_DELETE'
  | 'KPI_DEFINITION_UPDATE';

export interface AuditEntry {
  userId?: number | null;
  reportId?: number | null;
  action: ExecutiveAuditAction;
  filters?: unknown;
  status?: 'SUCCESS' | 'FAILED';
  errorMessage?: string;
}

@Injectable()
export class ExecutiveReportsAuditService {
  private readonly logger = new Logger(ExecutiveReportsAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Nunca rebenta o pedido: uma falha de auditoria é apenas registada no log. */
  async record(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.executiveReportAudit.create({
        data: {
          userId: e.userId ?? null,
          reportId: e.reportId ?? null,
          action: e.action,
          filters: (e.filters ?? undefined) as Prisma.InputJsonValue | undefined,
          status: e.status ?? 'SUCCESS',
          errorMessage: e.errorMessage?.slice(0, 1000),
        },
      });
    } catch (err) {
      this.logger.warn({
        action: 'EXECUTIVE_REPORT_AUDIT_WRITE',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: `Falha ao registar auditoria (${e.action})`,
      });
    }
  }

  async list(q: AuditQueryDto) {
    const { page = 1, limit = 50 } = q;
    const where: Prisma.ExecutiveReportAuditWhereInput = {
      ...(q.action ? { action: q.action } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.reportId ? { reportId: q.reportId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.executiveReportAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, fullName: true } } },
      }),
      this.prisma.read.executiveReportAudit.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}

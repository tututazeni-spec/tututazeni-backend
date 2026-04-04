import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeaveRequestDto,
  ApproveLeaveDto,
  LeaveFilterDto,
} from './leave-management.dto';

// ---------------------------------------------------------------------------
// NOTE: The schema has no LeaveRequest or LeaveBalance models.
// Leave requests are stored as JSON inside HistoryRecord (action = 'LEAVE_REQUEST').
// Balance is tracked via AuditLog (action = 'LEAVE_BALANCE', entity = 'LeaveBalance').
//
// To restore full functionality, add to schema.prisma and run `prisma migrate dev`:
//
// model LeaveRequest {
//   id          Int       @id @default(autoincrement())
//   userId      Int
//   approverId  Int?
//   type        String
//   status      String    @default("PENDING")
//   startDate   DateTime
//   endDate     DateTime
//   workDays    Int?
//   reason      String?   @db.Text
//   documentUrl String?   @db.Text
//   approverNote String?  @db.Text
//   approvedAt  DateTime?
//   createdAt   DateTime  @default(now())
//   user        User      @relation(fields: [userId], references: [id])
//   approver    User?     @relation("LeaveApprovals", fields: [approverId], references: [id])
// }
//
// model LeaveBalance {
//   id           Int  @id @default(autoincrement())
//   userId       Int  @unique
//   vacationDays Int  @default(22)
//   sickDays     Int  @default(15)
//   otherDays    Int  @default(5)
//   user         User @relation(fields: [userId], references: [id])
// }
// ---------------------------------------------------------------------------

@Injectable()
export class LeaveManagementService {
  constructor(private prisma: PrismaService) {}

  private calcWorkDays(start: Date, end: Date): number {
    let days = 0;
    const current = new Date(start);
    while (current <= end) {
      const dow = current.getDay();
      if (dow !== 0 && dow !== 6) days++;
      current.setDate(current.getDate() + 1);
    }
    return days;
  }

  // ── Helpers to read/write leave data via HistoryRecord ──────────────────

  private parseLeave(record: any) {
    try {
      return JSON.parse(record.description ?? '{}');
    } catch {
      return {};
    }
  }

  private async getLeaveRecord(id: number) {
    const record = await this.prisma.historyRecord.findFirst({
      where: { id, action: 'LEAVE_REQUEST' },
      include: { user: { select: { id: true, fullName: true, email: true, department: true } } },
    });
    if (!record) throw new NotFoundException('Pedido não encontrado');
    return { ...record, ...this.parseLeave(record) };
  }

  // ── Public methods ────────────────────────────────────────────────────────

  async findAll(filters: LeaveFilterDto) {
    const { page = 1, limit = 20, userId, type, status, from, to } = filters;
    const skip = (page - 1) * limit;

    const where: any = { action: 'LEAVE_REQUEST' };
    if (userId) where.userId = userId;

    const records = await this.prisma.historyRecord.findMany({
      where,
      skip,
      take: limit,
      include: { user: { select: { id: true, fullName: true, department: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Parse and filter in memory (type/status/date stored as JSON in description)
    let data = records.map(r => ({ ...r, ...this.parseLeave(r) }));
    if (type)   data = data.filter(r => r.type === type);
    if (status) data = data.filter(r => r.status === status);
    if (from)   data = data.filter(r => new Date(r.startDate) >= new Date(from));
    if (to)     data = data.filter(r => new Date(r.startDate) <= new Date(to));

    const total = data.length;
    return { data: data.slice(skip, skip + limit), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    return this.getLeaveRecord(id);
  }

  async create(dto: CreateLeaveRequestDto) {
    const start = new Date(dto.startDate);
    const end   = new Date(dto.endDate);
    if (end < start) {
      throw new BadRequestException('Data de fim não pode ser anterior à data de início');
    }
    const workDays = this.calcWorkDays(start, end);

    // Check balance via AuditLog metadata
    if (dto.type === 'FERIAS') {
      const balanceLog = await this.prisma.auditLog.findFirst({
        where: { entity: 'LeaveBalance', entityId: dto.userId },
        orderBy: { timestamp: 'desc' },
      });
      const vacationDays: number = (balanceLog?.metadata as any)?.vacationDays ?? 22;
      if (vacationDays < workDays) {
        throw new BadRequestException(
          `Saldo insuficiente: tem ${vacationDays} dias, pediu ${workDays}`,
        );
      }
    }

    const payload = JSON.stringify({
      type: dto.type,
      status: 'PENDING',
      startDate: dto.startDate,
      endDate: dto.endDate,
      workDays,
      reason: dto.reason,
      documentUrl: dto.documentUrl,
    });

    return this.prisma.historyRecord.create({
      data: {
        userId: dto.userId,
        action: 'LEAVE_REQUEST',
        entityType: 'LeaveRequest',
        description: payload,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async approve(id: number, approverId: number, dto: ApproveLeaveDto) {
    const record = await this.getLeaveRecord(id);
    if (record.status !== 'PENDING') {
      throw new BadRequestException('Só pedidos pendentes podem ser aprovados/rejeitados');
    }

    const updated = await this.prisma.historyRecord.update({
      where: { id },
      data: {
        description: JSON.stringify({
          ...this.parseLeave(record),
          status: dto.status,
          approverId,
          approverNote: dto.approverNote,
          approvedAt: new Date().toISOString(),
        }),
      },
    });

    // Decrement balance in AuditLog if FERIAS approved
    if (dto.status === 'APPROVED' && record.type === 'FERIAS') {
      const balanceLog = await this.prisma.auditLog.findFirst({
        where: { entity: 'LeaveBalance', entityId: record.userId },
        orderBy: { timestamp: 'desc' },
      });
      const current = (balanceLog?.metadata as any) ?? { vacationDays: 22, sickDays: 15, otherDays: 5 };
      await this.prisma.auditLog.create({
        data: {
          userId: approverId,
          action: 'LEAVE_BALANCE_UPDATE',
          entity: 'LeaveBalance',
          entityId: record.userId,
          metadata: { ...current, vacationDays: current.vacationDays - (record.workDays ?? 0) },
        },
      });
    }

    const statusLabel = dto.status === 'APPROVED' ? 'aprovado' : 'rejeitado';
    await this.prisma.notificationLog.create({
      data: {
        userId: record.userId,
        type: 'LEAVE_UPDATE',
        message: `O seu pedido de ${record.type} foi ${statusLabel}. ${dto.approverNote ?? ''}`,
        success: true,
      },
    });

    return updated;
  }

  async getBalance(userId: number) {
    const balanceLog = await this.prisma.auditLog.findFirst({
      where: { entity: 'LeaveBalance', entityId: userId },
      orderBy: { timestamp: 'desc' },
    });
    if (!balanceLog) {
      const defaults = { vacationDays: 22, sickDays: 15, otherDays: 5 };
      await this.prisma.auditLog.create({
        data: {
          action: 'LEAVE_BALANCE_INIT',
          entity: 'LeaveBalance',
          entityId: userId,
          metadata: defaults,
        },
      });
      return { userId, ...defaults };
    }
    return { userId, ...(balanceLog.metadata as object) };
  }

  async updateBalance(
    userId: number,
    data: { vacationDays?: number; sickDays?: number; otherDays?: number },
  ) {
    const current = await this.getBalance(userId);
    const updated = { ...current, ...data };
    await this.prisma.auditLog.create({
      data: {
        action: 'LEAVE_BALANCE_UPDATE',
        entity: 'LeaveBalance',
        entityId: userId,
        metadata: updated,
      },
    });
    return updated;
  }

  async getCalendar(departmentId?: number, year?: number) {
    const y = year ?? new Date().getFullYear();
    const records = await this.prisma.historyRecord.findMany({
      where: { action: 'LEAVE_REQUEST' },
      include: { user: { select: { id: true, fullName: true, departmentId: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return records
      .map(r => ({ ...r, ...this.parseLeave(r) }))
      .filter(r => {
        if (r.status !== 'APPROVED') return false;
        const start = new Date(r.startDate);
        if (start.getFullYear() !== y) return false;
        if (departmentId && r.user?.departmentId !== departmentId) return false;
        return true;
      });
  }

  async cancel(id: number, userId: number) {
    const record = await this.getLeaveRecord(id);
    if (record.userId !== userId) {
      throw new BadRequestException('Sem permissão para cancelar este pedido');
    }
    if (!['PENDING', 'APPROVED'].includes(record.status)) {
      throw new BadRequestException('Pedido não pode ser cancelado');
    }
    if (record.status === 'APPROVED' && record.type === 'FERIAS') {
      const current = await this.getBalance(userId);
      await this.prisma.auditLog.create({
        data: {
          action: 'LEAVE_BALANCE_UPDATE',
          entity: 'LeaveBalance',
          entityId: userId,
          metadata: { ...current, vacationDays: (current as any).vacationDays + (record.workDays ?? 0) },
        },
      });
    }
    return this.prisma.historyRecord.update({
      where: { id },
      data: {
        description: JSON.stringify({ ...this.parseLeave(record), status: 'CANCELLED' }),
      },
    });
  }
}
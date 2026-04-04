import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAttendanceDto, UpdateAttendanceDto,
  AttendanceFilterDto, ClockInDto,
} from './attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: AttendanceFilterDto) {
    const { page = 1, limit = 20, userId, departmentId, from, to, status } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.employeeId = userId;
    if (status) where.status = status;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    const [data, total] = await Promise.all([
      (this.prisma.attendance as any).findMany({
        where, skip, take: limit,
        orderBy: [{ date: 'desc' }],
      }),
      (this.prisma.attendance as any).count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByUser(userId: number, from?: string, to?: string) {
    const where: any = { employeeId: userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    return (this.prisma.attendance as any).findMany({ where, orderBy: { date: 'desc' } });
  }

  async clockIn(userId: number, dto: ClockInDto) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await (this.prisma.attendance as any).findFirst({
      where: { employeeId: userId, date: today },
    });
    if (existing?.clockIn) throw new ConflictException('Clock-in já registado hoje');
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const clockInTime = `${hh}:${mm}`;
    const status = clockInTime > '08:30' ? 'LATE' : 'PRESENT';
    if (existing) {
      return (this.prisma.attendance as any).update({
        where: { id: existing.id },
        data: { clockIn: clockInTime, status, notes: dto.notes },
      });
    }
    return (this.prisma.attendance as any).create({
      data: {
        employeeId: userId,
        date: today,
        hoursWorked: 0,
        clockIn: clockInTime,
        status,
        notes: dto.notes,
      },
    });
  }

  async clockOut(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const record = await (this.prisma.attendance as any).findFirst({
      where: { employeeId: userId, date: today },
    });
    if (!record) throw new NotFoundException('Sem clock-in registado hoje');
    if (record.clockOut) throw new ConflictException('Clock-out já registado hoje');
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const clockOutTime = `${hh}:${mm}`;
    const workMinutes = record.clockIn ? this.calcMinutes(record.clockIn, clockOutTime) : 0;
    return (this.prisma.attendance as any).update({
      where: { id: record.id },
      data: { clockOut: clockOutTime, workMinutes, hoursWorked: +(workMinutes / 60).toFixed(2) },
    });
  }

  async create(dto: CreateAttendanceDto) {
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);
    const exists = await (this.prisma.attendance as any).findFirst({
      where: { employeeId: dto.userId, date },
    });
    if (exists) throw new ConflictException('Presença já registada para este dia');
    return (this.prisma.attendance as any).create({
      data: {
        employeeId: dto.userId,
        date,
        hoursWorked: 0,
        status: dto.status ?? 'PRESENT',
        clockIn: dto.clockIn,
        clockOut: dto.clockOut,
        notes: dto.notes,
        justification: dto.justification,
      },
    });
  }

  async update(id: number, dto: UpdateAttendanceDto) {
    const r = await (this.prisma.attendance as any).findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Registo não encontrado');
    return (this.prisma.attendance as any).update({ where: { id }, data: dto });
  }

  async getMonthlyReport(year: number, month: number, departmentId?: number) {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0);
    const where: any = { date: { gte: from, lte: to } };
    const records = await (this.prisma.attendance as any).findMany({ where });
    const userMap: Record<number, any> = {};
    for (const r of records) {
      const uid = r.employeeId;
      if (!userMap[uid]) {
        userMap[uid] = { userId: uid, present: 0, absent: 0, late: 0, justified: 0, totalWorkMin: 0 };
      }
      if (r.status === 'PRESENT' || r.status === 'REMOTE') userMap[uid].present++;
      else if (r.status === 'ABSENT') userMap[uid].absent++;
      else if (r.status === 'LATE') { userMap[uid].late++; userMap[uid].present++; }
      else if (r.status === 'JUSTIFIED') userMap[uid].justified++;
      userMap[uid].totalWorkMin += (r.workMinutes ?? (r.hoursWorked ?? 0) * 60);
    }
    return {
      period: `${year}-${String(month).padStart(2, '0')}`,
      summary: Object.values(userMap),
    };
  }

  async remove(id: number) {
    await (this.prisma.attendance as any).findUniqueOrThrow({ where: { id } });
    await (this.prisma.attendance as any).delete({ where: { id } });
    return { message: 'Registo removido' };
  }

  private calcMinutes(start: string, end: string): number {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  }
}
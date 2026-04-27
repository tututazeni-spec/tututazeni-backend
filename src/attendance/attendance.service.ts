// src/attendance/attendance.service.ts
import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService }  from '../prisma/prisma.service';
import { AuditService }   from '../common/services/audit.service';
import * as crypto        from 'crypto';
import {
  AttendanceFilterDto, LeaveFilterDto,
  CreateAttendanceDto, UpdateAttendanceDto,
  ClockInDto, ClockOutDto,
  CreateLeaveRequestDto, ReviewLeaveDto,
  CreateWorkScheduleDto, AssignScheduleDto,
  CreateOvertimeDto, ReviewOvertimeDto,
  CreateJustificationDto, ReviewJustificationDto,
  CreateAdjustmentDto, CreateOvertimeDto as OTDto,
  GenerateQrDto, ValidateQrDto,
  AttendanceStatus, LeaveStatus, LeaveType,
  CheckInMethod, AttendanceContext, OvertimeStatus,
} from './attendance.dto';

const qrStore = new Map<string, { userId?: number; payload: any; expiresAt: number }>();

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHours(min: number): number {
  return +(min / 60).toFixed(2);
}

function nowHHMM(): string {
  const n = new Date();
  return `${n.getHours().toString().padStart(2, '0')}:${n.getMinutes().toString().padStart(2, '0')}`;
}

function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function calcWorkMinutes(clockIn: string, clockOut: string, breakMinutes = 0): number {
  const total = parseTime(clockOut) - parseTime(clockIn);
  return Math.max(0, total - breakMinutes);
}

function determineStatus(
  clockInTime: string,
  toleranceMinutes = 10,
  scheduleStart = '08:00',
): AttendanceStatus {
  const late = parseTime(clockInTime) > parseTime(scheduleStart) + toleranceMinutes;
  return late ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filters: AttendanceFilterDto) {
    const { page = 1, limit = 20, userId, department, from, to, status, context, eventId, courseId, sortBy = 'date', sortOrder = 'desc' } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};

    if (userId)  where.userId = userId;
    if (status)  where.status = status;
    if (context) where.context = context;
    if (eventId) where.eventId = eventId;
    if (courseId)where.courseId = courseId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to)   where.date.lte = new Date(to);
    }
    if (department) {
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };
    }

    const [data, total] = await Promise.all([
      (this.prisma as any).attendanceRecord.findMany({
        where, skip, take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          justifications: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      }),
      (this.prisma as any).attendanceRecord.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByUser(userId: number, from?: string, to?: string) {
    const where: any = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to)   where.date.lte = new Date(to);
    }

    const records = await (this.prisma as any).attendanceRecord.findMany({
      where, orderBy: { date: 'desc' },
      include: { justifications: true },
    });

    const totalMinutes = records.reduce((a: number, r: any) => a + (r.workMinutes ?? 0), 0);
    const presentDays  = records.filter((r: any) => [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.REMOTE].includes(r.status as any)).length;
    const absentDays   = records.filter((r: any) => r.status === AttendanceStatus.ABSENT).length;
    const lateDays     = records.filter((r: any) => r.status === AttendanceStatus.LATE).length;

    return {
      records,
      summary: {
        totalDays: records.length,
        presentDays,
        absentDays,
        lateDays,
        totalHours: minutesToHours(totalMinutes),
        attendanceRate: records.length ? +((presentDays / records.length) * 100).toFixed(1) : 0,
      },
    };
  }

  async findOne(id: number) {
    const r = await (this.prisma as any).attendanceRecord.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        justifications: true,
        adjustments: true,
      },
    });
    if (!r) throw new NotFoundException('Registo não encontrado');
    return r;
  }

  async clockIn(userId: number, dto: ClockInDto) {
    const today = todayMidnight();

    const existing = await (this.prisma as any).attendanceRecord.findFirst({
      where: { userId, date: today, context: dto.context ?? AttendanceContext.WORK },
    });
    if (existing?.clockIn) {
      throw new ConflictException('Clock-in já registado para este período hoje');
    }

    if (dto.location) {
      await this.validateGeofence(userId, dto.location.latitude, dto.location.longitude);
    }

    if (dto.qrToken) {
      await this.validateQrToken(dto.qrToken, userId, dto.location);
    }

    const schedule = await this.getActiveSchedule(userId);
    const clockInTime = nowHHMM();
    const status = determineStatus(
      clockInTime,
      schedule?.toleranceMinutes ?? 10,
      schedule?.startTime ?? '08:00',
    );

    const data: any = {
      userId,
      date: today,
      clockIn: clockInTime,
      clockInAt: new Date(),
      status,
      context: dto.context ?? AttendanceContext.WORK,
      method: dto.method ?? CheckInMethod.MANUAL,
      workMinutes: 0,
      hoursWorked: 0,
      notes: dto.notes,
      locationLabel: dto.locationLabel,
      deviceInfo: dto.deviceInfo,
      ipAddress: dto.ipAddress,
      selfieUrl: dto.selfieUrl,
      facialValidated: dto.facialValidated ?? false,
      eventId: dto.eventId,
      courseId: dto.courseId,
      sessionId: dto.sessionId,
      shiftId: schedule?.id,
    };

    if (dto.location) {
      data.latitude  = dto.location.latitude;
      data.longitude = dto.location.longitude;
    }

    const record = existing
      ? await (this.prisma as any).attendanceRecord.update({ where: { id: existing.id }, data })
      : await (this.prisma as any).attendanceRecord.create({ data });

    await this.audit.log({ action: 'CLOCK_IN', entityType: 'AttendanceRecord', entityId: record.id, userId, metadata: { method: data.method, context: data.context } });

    return record;
  }

  async clockOut(userId: number, dto: ClockOutDto = {}) {
    const today = todayMidnight();
    const record = await (this.prisma as any).attendanceRecord.findFirst({
      where: { userId, date: today, clockIn: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    if (!record)          throw new NotFoundException('Nenhum clock-in registado hoje');
    if (record.clockOut)  throw new ConflictException('Clock-out já registado hoje');

    const clockOutTime  = nowHHMM();
    const breakMinutes  = dto.breakMinutes ?? record.breakMinutes ?? 0;
    const workMinutes   = calcWorkMinutes(record.clockIn!, clockOutTime, breakMinutes);
    const hoursWorked   = minutesToHours(workMinutes);

    const schedule      = await this.getActiveSchedule(userId);
    const expectedMin   = schedule ? parseTime(schedule.endTime) - parseTime(schedule.startTime) - (schedule.breakMinutes ?? 0) : 480;
    const overtimeMin   = Math.max(0, workMinutes - expectedMin);

    const updated = await (this.prisma as any).attendanceRecord.update({
      where: { id: record.id },
      data: {
        clockOut: clockOutTime,
        clockOutAt: new Date(),
        workMinutes,
        hoursWorked,
        breakMinutes,
        overtimeMinutes: overtimeMin,
        notes: dto.notes ?? record.notes,
      },
    });

    if (overtimeMin >= 30) {
      await this.prisma.overtimeRecord.create({
        data: {
          userId,
          date: today,
          overtimeMinutes: overtimeMin,
          reason: 'Auto-detectado no clock-out',
          status: OvertimeStatus.PENDING,
          attendanceId: record.id,
        },
      });
    }

    await this.audit.log({ action: 'CLOCK_OUT', entityType: 'AttendanceRecord', entityId: record.id, userId, metadata: { workMinutes, overtimeMin } });

    return updated;
  }

  async create(dto: CreateAttendanceDto) {
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const exists = await (this.prisma as any).attendanceRecord.findFirst({
      where: { userId: dto.userId, date, context: dto.context ?? AttendanceContext.WORK },
    });
    if (exists) throw new ConflictException('Presença já registada para este dia/contexto');

    const workMinutes = dto.clockIn && dto.clockOut
      ? calcWorkMinutes(dto.clockIn, dto.clockOut, dto.breakMinutes ?? 0)
      : dto.workMinutes ?? 0;

    return (this.prisma as any).attendanceRecord.create({
      data: {
        userId: dto.userId,
        date,
        status: dto.status ?? AttendanceStatus.PRESENT,
        context: dto.context ?? AttendanceContext.WORK,
        method: dto.method ?? CheckInMethod.MANUAL,
        clockIn: dto.clockIn,
        clockOut: dto.clockOut,
        workMinutes,
        hoursWorked: minutesToHours(workMinutes),
        breakMinutes: dto.breakMinutes,
        presencePercent: dto.presencePercent,
        notes: dto.notes,
        justification: dto.justification,
        eventId: dto.eventId,
        courseId: dto.courseId,
        shiftId: dto.shiftId,
      },
    });
  }

  async update(id: number, dto: UpdateAttendanceDto, updatedById: number) {
    const record = await this.findOne(id);

    const changedFields = Object.keys(dto).filter(k => (record as any)[k] !== (dto as any)[k]);
    if (changedFields.length > 0) {
      await this.prisma.attendanceAdjustment.create({
        data: {
          attendanceId: id,
          adjustedById: updatedById,
          changes: changedFields.reduce((acc, k) => {
            (acc as any)[k] = { from: (record as any)[k], to: (dto as any)[k] };
            return acc;
          }, {} as any),
          reason: 'Actualização manual',
        },
      });
    }

    if (dto.clockIn && dto.clockOut) {
      const wm = calcWorkMinutes(dto.clockIn, dto.clockOut, dto.breakMinutes ?? record.breakMinutes ?? 0);
      (dto as any).workMinutes  = wm;
      (dto as any).hoursWorked  = minutesToHours(wm);
    }

    return (this.prisma as any).attendanceRecord.update({ where: { id }, data: dto as any });
  }

  async remove(id: number) {
    await this.findOne(id);
    await (this.prisma as any).attendanceRecord.delete({ where: { id } });
    return { message: 'Registo removido' };
  }

  async createLeaveRequest(userId: number, dto: CreateLeaveRequestDto) {
    const start = new Date(dto.startDate);
    const end   = new Date(dto.endDate);

    if (end < start) throw new BadRequestException('Data de fim anterior ao início');

    const conflict = await this.prisma.leaveRequest.findFirst({
      where: {
        userId,
        status: LeaveStatus.APPROVED,
        OR: [
          { startDate: { lte: end }, endDate: { gte: start } },
        ],
      },
    });
    if (conflict) throw new ConflictException('Existe sobreposição com licença já aprovada neste período');

    const workDays = this.countWorkdays(start, end);

    return this.prisma.leaveRequest.create({
      data: {
        userId,
        leaveType: dto.type as any,
        startDate: start,
        endDate: end,
        reason: dto.reason,
        attachments: dto.attachments ?? [],
        halfDay: dto.halfDay ?? false,
        halfDayPeriod: dto.halfDayPeriod,
        workDays,
        status: LeaveStatus.PENDING,
      },
    });
  }

  async reviewLeave(id: number, dto: ReviewLeaveDto, reviewerId: number) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Pedido de licença não encontrado');
    if (leave.status !== LeaveStatus.PENDING) throw new BadRequestException('Pedido já processado');

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: dto.status, reviewNotes: dto.reviewNotes, reviewedById: reviewerId, reviewedAt: new Date() },
    });

    if (dto.status === LeaveStatus.APPROVED) {
      await this.createLeaveAttendanceRecords(leave);
    }

    return updated;
  }

  async getLeaves(filters: LeaveFilterDto) {
    const { page = 1, limit = 20, userId, type, status, from, to } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (type)   where.leaveType = type;
    if (status) where.status = status;
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = new Date(from);
      if (to)   where.startDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          // FIX: removed reviewedBy (does not exist on LeaveRequest); kept user only
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getLeaveBalance(userId: number) {
    const year  = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end   = new Date(year, 11, 31);

    const approved = await this.prisma.leaveRequest.findMany({
      where: { userId, status: LeaveStatus.APPROVED, startDate: { gte: start, lte: end } },
    });

    const used: Record<string, number> = {};
    for (const l of approved) {
      used[l.leaveType as string] = (used[l.leaveType as string] ?? 0) + (l.workDays ?? 1);
    }

    const entitlements: Record<string, number> = {
      [LeaveType.VACATION]: 22,
      [LeaveType.SICK_LEAVE]: 30,
      [LeaveType.MATERNITY]: 90,
      [LeaveType.PATERNITY]: 2,
      [LeaveType.BEREAVEMENT]: 3,
      [LeaveType.JUSTIFIED_ABSENCE]: 6,
    };

    return Object.entries(entitlements).map(([type, total]) => ({
      type,
      entitled: total,
      used: used[type] ?? 0,
      remaining: total - (used[type] ?? 0),
    }));
  }

  async createWorkSchedule(dto: CreateWorkScheduleDto) {
    return this.prisma.workSchedule.create({ data: dto as any });
  }

  async getWorkSchedules() {
    return this.prisma.workSchedule.findMany({ orderBy: { name: 'asc' } });
  }

  async assignSchedule(dto: AssignScheduleDto) {
    return this.prisma.userSchedule.upsert({
      where: { userId: dto.userId },
      create: { ...dto, effectiveFrom: new Date(dto.effectiveFrom), effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null },
      update: { scheduleId: dto.scheduleId, effectiveFrom: new Date(dto.effectiveFrom), effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null },
    });
  }

  async createOvertime(userId: number, dto: CreateOvertimeDto) {
    return this.prisma.overtimeRecord.create({
      data: {
        userId: dto.userId ?? userId,
        date: new Date(dto.date),
        overtimeMinutes: dto.overtimeMinutes,
        reason: dto.reason,
        compensateWithTime: dto.compensateWithTime ?? true,
        status: OvertimeStatus.PENDING,
      },
    });
  }

  async reviewOvertime(id: number, dto: ReviewOvertimeDto, reviewerId: number) {
    return this.prisma.overtimeRecord.update({
      where: { id },
      data: { status: dto.status, reviewNotes: dto.reviewNotes, reviewedById: reviewerId, reviewedAt: new Date() },
    });
  }

  async getOvertimeBalance(userId: number) {
    const records = await this.prisma.overtimeRecord.findMany({
      where: { userId, status: { in: [OvertimeStatus.APPROVED] } },
    });
    const totalMin    = records.filter(r => !r.compensated).reduce((a, r) => a + r.overtimeMinutes, 0);
    const compensated = records.filter(r => r.compensated).reduce((a, r) => a + r.overtimeMinutes, 0);
    return { totalMinutes: totalMin, totalHours: minutesToHours(totalMin), compensatedHours: minutesToHours(compensated), balanceHours: minutesToHours(totalMin - compensated) };
  }

  async createJustification(userId: number, dto: CreateJustificationDto) {
    const record = await this.findOne(dto.attendanceId);
    if (record.userId !== userId) throw new ForbiddenException('Não pode justificar presença de outro utilizador');

    const deadline = new Date(record.date);
    deadline.setDate(deadline.getDate() + 3);
    if (new Date() > deadline) throw new BadRequestException('Prazo para justificação expirado (3 dias)');

    return this.prisma.attendanceJustification.create({
      data: {
        attendanceId: dto.attendanceId,
        userId,
        reason: dto.reason,
        attachments: dto.attachments ?? [],
        leaveType: dto.leaveType,
        status: 'PENDING',
      },
    });
  }

  async reviewJustification(id: number, dto: ReviewJustificationDto, reviewerId: number) {
    const justification = await this.prisma.attendanceJustification.findUnique({
      where: { id }, include: { attendance: true },
    });
    if (!justification) throw new NotFoundException('Justificativa não encontrada');

    const updated = await this.prisma.attendanceJustification.update({
      where: { id },
      data: { status: dto.status, reviewNotes: dto.reviewNotes, reviewedById: reviewerId, reviewedAt: new Date() },
    });

    if (dto.status === 'APPROVED') {
      await (this.prisma as any).attendanceRecord.update({
        where: { id: justification.attendanceId },
        data: { status: AttendanceStatus.JUSTIFIED },
      });
    }

    return updated;
  }

  async getPendingJustifications(managerId?: number) {
    const where: any = { status: 'PENDING' };
    return this.prisma.attendanceJustification.findMany({
      where,
      include: {
        // FIX: attendance.user → cast as any since Attendance uses Employee not User
        attendance: { include: { user: { select: { id: true, fullName: true, email: true } } } as any },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async generateQrCode(generatorId: number, dto: GenerateQrDto) {
    const token    = crypto.randomBytes(32).toString('hex');
    const ttl      = dto.ttlSeconds ?? 30;
    const expiresAt = Date.now() + ttl * 1000;

    qrStore.set(token, {
      payload: {
        context:            dto.context ?? AttendanceContext.WORK,
        eventId:            dto.eventId,
        sessionId:          dto.sessionId,
        requireGeolocation: dto.requireGeolocation ?? false,
        generatedById:      generatorId,
        generatedAt:        new Date().toISOString(),
      },
      expiresAt,
    });

    return { token, expiresAt: new Date(expiresAt).toISOString(), ttlSeconds: ttl };
  }

  async validateQrToken(token: string, userId: number, location?: { latitude: number; longitude: number }) {
    const entry = qrStore.get(token);
    if (!entry) throw new BadRequestException('QR code inválido ou já utilizado');
    if (Date.now() > entry.expiresAt) {
      qrStore.delete(token);
      throw new BadRequestException('QR code expirado');
    }
    if (entry.userId && entry.userId !== userId) throw new ForbiddenException('QR code não pertence a este utilizador');
    if (entry.payload.requireGeolocation && !location) throw new BadRequestException('Geolocalização obrigatória para este QR code');

    qrStore.delete(token);
    return entry.payload;
  }

  async getMonthlyReport(year: number, month: number, department?: string) {
    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 0, 23, 59, 59);
    const where: any = { date: { gte: from, lte: to } };
    if (department) where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const records = await (this.prisma as any).attendanceRecord.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    const workdays = this.countWorkdays(from, to);

    const userMap = new Map<number, any>();
    for (const r of records) {
      const uid = r.userId;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          name: r.user?.fullName,
          present: 0, late: 0, absent: 0, justified: 0, remote: 0,
          totalWorkMin: 0, overtimeMin: 0,
        });
      }
      const u = userMap.get(uid)!;
      if ([AttendanceStatus.PRESENT, AttendanceStatus.PARTIAL].includes(r.status as any)) u.present++;
      if (r.status === AttendanceStatus.LATE)      { u.present++; u.late++; }
      if (r.status === AttendanceStatus.ABSENT)    u.absent++;
      if (r.status === AttendanceStatus.JUSTIFIED) u.justified++;
      if (r.status === AttendanceStatus.REMOTE)    { u.present++; u.remote++; }
      u.totalWorkMin  += r.workMinutes ?? 0;
      u.overtimeMin   += r.overtimeMinutes ?? 0;
    }

    const summary = Array.from(userMap.values()).map(u => ({
      ...u,
      totalHours:     minutesToHours(u.totalWorkMin),
      overtimeHours:  minutesToHours(u.overtimeMin),
      attendanceRate: workdays > 0 ? +((u.present / workdays) * 100).toFixed(1) : 0,
      absenteeismRate:workdays > 0 ? +((u.absent  / workdays) * 100).toFixed(1) : 0,
    }));

    const totals = summary.reduce((a, u) => ({
      totalPresent: a.totalPresent + u.present,
      totalAbsent:  a.totalAbsent  + u.absent,
      totalHours:   +(a.totalHours  + u.totalHours).toFixed(2),
    }), { totalPresent: 0, totalAbsent: 0, totalHours: 0 });

    return {
      period: `${year}-${String(month).padStart(2, '0')}`,
      workdays,
      employees: summary.length,
      totals,
      summary,
    };
  }

  async getDashboard(department?: string) {
    const today = todayMidnight();
    const todayEnd = new Date(today.getTime() + 86399999);
    const where: any = { date: { gte: today, lte: todayEnd } };
    if (department) where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [records, pendingLeaves, pendingJustifications, pendingOvertime] = await Promise.all([
      (this.prisma as any).attendanceRecord.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      }),
      this.prisma.leaveRequest.count({ where: { status: LeaveStatus.PENDING } }),
      this.prisma.attendanceJustification.count({ where: { status: 'PENDING' } }),
      this.prisma.overtimeRecord.count({ where: { status: OvertimeStatus.PENDING } }),
    ]);

    const present   = records.filter((r: any) => [AttendanceStatus.PRESENT, AttendanceStatus.REMOTE, AttendanceStatus.LATE].includes(r.status as any));
    const absent    = records.filter((r: any) => r.status === AttendanceStatus.ABSENT);
    const late      = records.filter((r: any) => r.status === AttendanceStatus.LATE);
    const checkedIn = records.filter((r: any) => r.clockIn && !r.clockOut);

    return {
      date: today.toISOString().split('T')[0],
      kpis: {
        totalPresent: present.length,
        totalAbsent: absent.length,
        totalLate: late.length,
        checkedInNow: checkedIn.length,
        pendingLeaves,
        pendingJustifications,
        pendingOvertime,
        attendanceRate: records.length > 0 ? +((present.length / records.length) * 100).toFixed(1) : 0,
      },
      presentList: present.map((r: any) => ({ id: r.userId, name: r.user?.fullName, clockIn: r.clockIn, status: r.status })),
      absentList:  absent.map((r: any) => ({ id: r.userId, name: r.user?.fullName })),
      lateList:    late.map((r: any) => ({ id: r.userId, name: r.user?.fullName, clockIn: r.clockIn })),
    };
  }

  async getKpiTrend(userId?: number, days = 30) {
    const from = new Date(Date.now() - days * 86400000);
    const where: any = { date: { gte: from } };
    if (userId) where.userId = userId;

    const records = await (this.prisma as any).attendanceRecord.findMany({ where, orderBy: { date: 'asc' } });

    const byDate = records.reduce((acc: any, r: any) => {
      const key = r.date.toISOString().split('T')[0];
      if (!acc[key]) acc[key] = { date: key, present: 0, absent: 0, late: 0, totalHours: 0 };
      if ([AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.REMOTE].includes(r.status as any)) acc[key].present++;
      if (r.status === AttendanceStatus.ABSENT) acc[key].absent++;
      if (r.status === AttendanceStatus.LATE)   acc[key].late++;
      acc[key].totalHours = +(acc[key].totalHours + (r.hoursWorked ?? 0)).toFixed(2);
      return acc;
    }, {});

    return Object.values(byDate);
  }

  async getAbsenteeismReport(from: string, to: string, department?: string) {
    const where: any = {
      status: AttendanceStatus.ABSENT,
      date: { gte: new Date(from), lte: new Date(to) },
    };
    if (department) where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const records = await (this.prisma as any).attendanceRecord.findMany({
      where,
      include: { user: { select: { id: true, fullName: true } } },
    });

    const byUser = records.reduce((acc: any, r: any) => {
      const uid = r.userId;
      if (!acc[uid]) acc[uid] = { userId: uid, name: r.user?.fullName, absences: 0 };
      acc[uid].absences++;
      return acc;
    }, {});

    return Object.values(byUser).sort((a: any, b: any) => b.absences - a.absences);
  }

  async checkInToEvent(userId: number, eventId: number, dto: ClockInDto) {
    return this.clockIn(userId, { ...dto, eventId, context: AttendanceContext.EVENT });
  }

  async checkInToSession(userId: number, sessionId: number, dto: ClockInDto) {
    return this.clockIn(userId, { ...dto, sessionId, context: AttendanceContext.WEBINAR });
  }

  async getEventAttendance(eventId: number) {
    const records = await (this.prisma as any).attendanceRecord.findMany({
      where: { eventId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { clockIn: 'asc' },
    });

    const present = records.filter((r: any) => r.status !== AttendanceStatus.ABSENT).length;

    return {
      eventId,
      total: records.length,
      present,
      absent: records.length - present,
      attendanceRate: records.length ? +((present / records.length) * 100).toFixed(1) : 0,
      records,
    };
  }

  private async getActiveSchedule(userId: number) {
    const userSchedule = await this.prisma.userSchedule.findUnique({
      where: { userId }, include: { schedule: true },
    });
    return userSchedule?.schedule ?? null;
  }

  private async validateGeofence(userId: number, lat: number, lon: number) {
    const locations = await this.prisma.allowedLocation.findMany();
    if (locations.length === 0) return;

    const inRange = locations.some(loc =>
      distanceMeters(lat, lon, loc.latitude, loc.longitude) <= loc.radiusMeters
    );

    if (!inRange) {
      await this.audit.log({ action: 'GEOFENCE_VIOLATION', entityType: 'AttendanceRecord', entityId: 0, userId, metadata: { lat, lon } });
      throw new BadRequestException('Localização fora da área permitida para check-in');
    }
  }

  private async createLeaveAttendanceRecords(leave: any) {
    const dates: Date[] = [];
    const cur = new Date(leave.startDate);
    const end = new Date(leave.endDate);

    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    await (this.prisma as any).attendanceRecord.createMany({
      data: dates.map(d => ({
        userId: leave.userId,
        date: d,
        status: AttendanceStatus.ON_LEAVE,
        context: AttendanceContext.WORK,
        method: CheckInMethod.MANUAL,
        workMinutes: 0,
        hoursWorked: 0,
        notes: `Licença: ${leave.leaveType}`,
        leaveRequestId: leave.id,
      })),
      skipDuplicates: true,
    });
  }

  private countWorkdays(from: Date, to: Date): number {
    let count = 0;
    const cur = new Date(from);
    while (cur <= to) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }
}
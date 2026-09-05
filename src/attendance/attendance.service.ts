// src/attendance/attendance.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CacheService } from '../cache/cache.service';
import { LeaveManagementService } from '../leave-management/leave-management.service';
import { DurationMode } from '../leave-management/leave-management.dto';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import {
  AttendanceFilterDto,
  AttendanceLeaveFilterDto,
  CreateAttendanceDto,
  UpdateAttendanceDto,
  ClockInDto,
  ClockOutDto,
  CreateLeaveRequestDto,
  ReviewLeaveDto,
  CreateWorkScheduleDto,
  AssignScheduleDto,
  CreateOvertimeDto,
  ReviewOvertimeDto,
  CreateJustificationDto,
  ReviewJustificationDto,
  GenerateQrDto,
  AttendanceStatus,
  LeaveStatus,
  LeaveType,
  CheckInMethod,
  AttendanceContext,
  OvertimeStatus,
  DayPeriod,
} from './attendance.dto';

interface QrPayload {
  context: AttendanceContext;
  eventId?: number;
  sessionId?: number;
  requireGeolocation: boolean;
  generatedById: number;
  generatedAt: string;
}

interface QrEntry {
  userId?: number;
  payload: QrPayload;
  expiresAt: number;
}
function qrKey(token: string): string {
  return `attendance:qr:${token}`;
}

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

const PRESENT_LIKE_STATUSES: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.REMOTE,
];

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class AttendanceService {
  // Traduz o enum LeaveType (Prisma, usado por CreateLeaveRequestDto.type —
  // contrato público já consumido pelo frontend) para LeaveTypeConfig.code
  // (chave real do catálogo configurável de leave-management). SICK_LEAVE→
  // 'SICK' é o único par que diverge de uma correspondência 1:1 nome-a-nome
  // (ver docs/superpowers/plans/2026-09-04-fase-b-attendance-leave-consolidation.md
  // Task 1) — os restantes 9 usam o próprio nome do enum como código.
  private static readonly LEAVE_TYPE_TO_CODE: Record<LeaveType, string> = {
    [LeaveType.VACATION]: 'VACATION',
    [LeaveType.SICK_LEAVE]: 'SICK',
    [LeaveType.MATERNITY]: 'MATERNITY',
    [LeaveType.PATERNITY]: 'PATERNITY',
    [LeaveType.JUSTIFIED_ABSENCE]: 'JUSTIFIED_ABSENCE',
    [LeaveType.UNJUSTIFIED_ABSENCE]: 'UNJUSTIFIED_ABSENCE',
    [LeaveType.BEREAVEMENT]: 'BEREAVEMENT',
    [LeaveType.TRAINING]: 'TRAINING',
    [LeaveType.PUBLIC_DUTY]: 'PUBLIC_DUTY',
    [LeaveType.OTHER]: 'OTHER',
  };

  // 6 tipos legados que attendance.getLeaveBalance() sempre expôs (entitlements
  // hardcoded antes desta consolidação) — mantidos como o conjunto exposto por
  // GET /attendance/my/leave-balance e /attendance/leaves/balance/:userId para
  // não alterar a forma da resposta que o frontend já consome.
  private static readonly LEGACY_BALANCE_TYPES: LeaveType[] = [
    LeaveType.VACATION,
    LeaveType.SICK_LEAVE,
    LeaveType.MATERNITY,
    LeaveType.PATERNITY,
    LeaveType.BEREAVEMENT,
    LeaveType.JUSTIFIED_ABSENCE,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly leaveManagement: LeaveManagementService,
  ) {}

  async findAll(filters: AttendanceFilterDto) {
    const {
      page = 1,
      limit = 20,
      userId,
      department,
      from,
      to,
      status,
      context,
      eventId,
      courseId,
      sortBy = 'date',
      sortOrder = 'desc',
    } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.AttendanceRecordWhereInput = {};

    if (userId) where.userId = userId;
    if (status) where.status = status;
    if (context) where.context = context;
    if (eventId) where.eventId = eventId;
    if (courseId) where.courseId = courseId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    if (department) {
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };
    }

    const [data, total] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          justifications: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findByUser(userId: number, from?: string, to?: string) {
    const where: Prisma.AttendanceRecordWhereInput = { userId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { justifications: true },
    });

    const totalMinutes = records.reduce((a, r) => a + (r.workMinutes ?? 0), 0);
    const presentDays = records.filter(r => PRESENT_LIKE_STATUSES.includes(r.status)).length;
    const absentDays = records.filter(r => r.status === AttendanceStatus.ABSENT).length;
    const lateDays = records.filter(r => r.status === AttendanceStatus.LATE).length;

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
    const r = await this.prisma.attendanceRecord.findUnique({
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

    const existing = await this.prisma.attendanceRecord.findFirst({
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

    const data: Prisma.AttendanceRecordUncheckedCreateInput = {
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
      data.latitude = dto.location.latitude;
      data.longitude = dto.location.longitude;
    }

    const record = existing
      ? await this.prisma.attendanceRecord.update({ where: { id: existing.id }, data })
      : await this.prisma.attendanceRecord.create({ data });

    await this.audit.log({
      action: 'CLOCK_IN',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      userId,
      metadata: {},
    });

    return record;
  }

  async clockOut(userId: number, dto: ClockOutDto = {}) {
    const today = todayMidnight();
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { userId, date: today, clockIn: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) throw new NotFoundException('Nenhum clock-in registado hoje');
    if (record.clockOut) throw new ConflictException('Clock-out já registado hoje');

    const clockOutTime = nowHHMM();
    const breakMinutes = dto.breakMinutes ?? record.breakMinutes ?? 0;
    const workMinutes = calcWorkMinutes(record.clockIn, clockOutTime, breakMinutes);
    const hoursWorked = minutesToHours(workMinutes);

    const schedule = await this.getActiveSchedule(userId);
    const expectedMin = schedule
      ? parseTime(schedule.endTime) - parseTime(schedule.startTime) - (schedule.breakMinutes ?? 0)
      : 480;
    const overtimeMin = Math.max(0, workMinutes - expectedMin);

    const updated = await this.prisma.attendanceRecord.update({
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

    await this.audit.log({
      action: 'CLOCK_OUT',
      entityType: 'AttendanceRecord',
      entityId: record.id,
      userId,
      metadata: {},
    });

    return updated;
  }

  async create(dto: CreateAttendanceDto) {
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const exists = await this.prisma.attendanceRecord.findFirst({
      where: { userId: dto.userId, date, context: dto.context ?? AttendanceContext.WORK },
    });
    if (exists) throw new ConflictException('Presença já registada para este dia/contexto');

    const workMinutes =
      dto.clockIn && dto.clockOut
        ? calcWorkMinutes(dto.clockIn, dto.clockOut, dto.breakMinutes ?? 0)
        : (dto.workMinutes ?? 0);

    return this.prisma.attendanceRecord.create({
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

  // ACHADO ESTRUTURAL (não corrigido nesta limpeza de tipos): tal como
  // AttendanceJustification, AttendanceAdjustment.attendanceId é FK
  // obrigatória para o modelo legacy `Attendance` (ligado a Employee, não
  // User) — este módulo opera inteiramente sobre AttendanceRecord/User.
  // `recordId` (FK opcional já existente, relação "RecordAdjustments") é o
  // campo correcto para o que este código quer fazer, mas attendanceId
  // continua obrigatório no schema, por isso este create() rebenta sempre
  // com violação de FK sempre que há um campo alterado a registar. Precisa
  // de decisão de schema/produto, não de correcção mecânica.
  async update(id: number, dto: UpdateAttendanceDto, updatedById: number) {
    const record = await this.findOne(id);

    const changedFields = (Object.keys(dto) as (keyof UpdateAttendanceDto)[]).filter(
      k => record[k] !== dto[k],
    );
    if (changedFields.length > 0) {
      const changes = changedFields.reduce<Record<string, { from: unknown; to: unknown }>>(
        (acc, k) => {
          acc[k] = { from: record[k], to: dto[k] };
          return acc;
        },
        {},
      );
      await this.prisma.attendanceAdjustment.create({
        data: {
          attendanceId: id,
          adjustedById: updatedById,
          changes: changes as unknown as Prisma.InputJsonValue,
          reason: 'Actualização manual',
        },
      });
    }

    if (dto.clockIn && dto.clockOut) {
      const wm = calcWorkMinutes(
        dto.clockIn,
        dto.clockOut,
        dto.breakMinutes ?? record.breakMinutes ?? 0,
      );
      dto.workMinutes = wm;
      dto.hoursWorked = minutesToHours(wm);
    }

    return this.prisma.attendanceRecord.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.attendanceRecord.delete({ where: { id } });
    return { message: 'Registo removido' };
  }

  async createLeaveRequest(userId: number, dto: CreateLeaveRequestDto) {
    // Validação de datas (end < start) já é feita por leave-management.create()
    // (leave-management.service.ts:290) — não duplicar aqui.
    const durationMode = dto.halfDay
      ? dto.halfDayPeriod === DayPeriod.PM
        ? DurationMode.HALF_PM
        : DurationMode.HALF_AM
      : DurationMode.FULL_DAY;

    // A partir daqui, a validação de sobreposição, saldo, antecedência
    // mínima, blackout periods e o fluxo de aprovação são inteiramente
    // responsabilidade de LeaveManagementService — attendance deixou de ter
    // a sua própria cópia divergente destas regras (Fase B da consolidação).
    return this.leaveManagement.create(
      {
        userId,
        leaveTypeCode: AttendanceService.LEAVE_TYPE_TO_CODE[dto.type],
        startDate: dto.startDate,
        endDate: dto.endDate,
        durationMode,
        reason: dto.reason,
        attachments: dto.attachments,
      },
      userId,
    );
  }

  async reviewLeave(id: number, dto: ReviewLeaveDto, reviewerId: number) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Pedido de licença não encontrado');
    if (leave.status !== LeaveStatus.PENDING) throw new BadRequestException('Pedido já processado');

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: dto.status,
        reviewNotes: dto.reviewNotes,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    if (dto.status === LeaveStatus.APPROVED) {
      await this.createLeaveAttendanceRecords(leave);
    }

    return updated;
  }

  async getLeaves(filters: AttendanceLeaveFilterDto) {
    const { page = 1, limit = 20, userId, type, status, from, to } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.LeaveRequestWhereInput = {};
    if (userId) where.userId = userId;
    if (type) where.leaveType = type;
    if (status) where.status = status;
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = new Date(from);
      if (to) where.startDate.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.read.leaveRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          // FIX: removed reviewedBy (does not exist on LeaveRequest); kept user only
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.read.leaveRequest.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async getLeaveBalance(userId: number) {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    const approved = await this.prisma.read.leaveRequest.findMany({
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
    return this.prisma.workSchedule.create({ data: dto });
  }

  async getWorkSchedules() {
    return this.prisma.read.workSchedule.findMany({ orderBy: { name: 'asc' } });
  }

  async assignSchedule(dto: AssignScheduleDto) {
    return this.prisma.userSchedule.upsert({
      where: { userId: dto.userId },
      create: {
        ...dto,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
      update: {
        scheduleId: dto.scheduleId,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
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
      data: {
        status: dto.status,
        reviewNotes: dto.reviewNotes,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }

  async getOvertimeBalance(userId: number) {
    const records = await this.prisma.read.overtimeRecord.findMany({
      where: { userId, status: { in: [OvertimeStatus.APPROVED] } },
    });
    const totalMin = records.filter(r => !r.compensated).reduce((a, r) => a + r.overtimeMinutes, 0);
    const compensated = records
      .filter(r => r.compensated)
      .reduce((a, r) => a + r.overtimeMinutes, 0);
    return {
      totalMinutes: totalMin,
      totalHours: minutesToHours(totalMin),
      compensatedHours: minutesToHours(compensated),
      balanceHours: minutesToHours(totalMin - compensated),
    };
  }

  async createJustification(userId: number, dto: CreateJustificationDto) {
    const record = await this.findOne(dto.attendanceId);
    if (record.userId !== userId)
      throw new ForbiddenException('Não pode justificar presença de outro utilizador');

    const deadline = new Date(record.date);
    deadline.setDate(deadline.getDate() + 3);
    if (new Date() > deadline)
      throw new BadRequestException('Prazo para justificação expirado (3 dias)');

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
      where: { id },
      include: { attendance: true },
    });
    if (!justification) throw new NotFoundException('Justificativa não encontrada');

    const updated = await this.prisma.attendanceJustification.update({
      where: { id },
      data: {
        status: dto.status,
        reviewNotes: dto.reviewNotes,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });

    if (dto.status === 'APPROVED') {
      await this.prisma.attendanceRecord.update({
        where: { id: justification.attendanceId },
        data: { status: AttendanceStatus.JUSTIFIED },
      });
    }

    return updated;
  }

  async getPendingJustifications(_managerId?: number) {
    const where: Prisma.AttendanceJustificationWhereInput = { status: 'PENDING' };
    return this.prisma.read.attendanceJustification.findMany({
      where,
      include: {
        // FIX: a relação `attendance` aponta para o modelo legacy Attendance
        // (ligado a Employee, não User) — o cast `as any` escondia que
        // `attendance.user` não existe. `record` é a relação correcta para
        // AttendanceRecord/User, que é o que este módulo usa de facto.
        record: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async generateQrCode(generatorId: number, dto: GenerateQrDto) {
    const token = crypto.randomBytes(32).toString('hex');
    const ttl = dto.ttlSeconds ?? 30;
    const expiresAt = Date.now() + ttl * 1000;

    // TTL do Redis com folga sobre `expiresAt` — a expiração de negócio é sempre
    // decidida pelo campo `expiresAt`, o Redis só garante que a chave não fica
    // pendurada para sempre se nunca for validada.
    await this.cache.set<QrEntry>(
      qrKey(token),
      {
        payload: {
          context: dto.context ?? AttendanceContext.WORK,
          eventId: dto.eventId,
          sessionId: dto.sessionId,
          requireGeolocation: dto.requireGeolocation ?? false,
          generatedById: generatorId,
          generatedAt: new Date().toISOString(),
        },
        expiresAt,
      },
      ttl + 5,
    );

    return { token, expiresAt: new Date(expiresAt).toISOString(), ttlSeconds: ttl };
  }

  async validateQrToken(
    token: string,
    userId: number,
    location?: { latitude: number; longitude: number },
  ) {
    const key = qrKey(token);
    const entry = await this.cache.get<QrEntry>(key);
    if (!entry) throw new BadRequestException('QR code inválido ou já utilizado');
    if (Date.now() > entry.expiresAt) {
      await this.cache.del(key);
      throw new BadRequestException('QR code expirado');
    }
    if (entry.userId && entry.userId !== userId)
      throw new ForbiddenException('QR code não pertence a este utilizador');
    if (entry.payload.requireGeolocation && !location)
      throw new BadRequestException('Geolocalização obrigatória para este QR code');

    await this.cache.del(key);
    return entry.payload;
  }

  async getMonthlyReport(year: number, month: number, department?: string) {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);
    const where: Prisma.AttendanceRecordWhereInput = { date: { gte: from, lte: to } };
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const records = await this.prisma.attendanceRecord.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    const workdays = this.countWorkdays(from, to);

    interface UserMonthlyStats {
      userId: number;
      name: string;
      present: number;
      late: number;
      absent: number;
      justified: number;
      remote: number;
      totalWorkMin: number;
      overtimeMin: number;
    }
    const userMap = new Map<number, UserMonthlyStats>();
    for (const r of records) {
      const uid = r.userId;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          name: r.user?.fullName,
          present: 0,
          late: 0,
          absent: 0,
          justified: 0,
          remote: 0,
          totalWorkMin: 0,
          overtimeMin: 0,
        });
      }
      const u = userMap.get(uid)!;
      const presentStatuses: AttendanceStatus[] = [
        AttendanceStatus.PRESENT,
        AttendanceStatus.PARTIAL,
      ];
      if (presentStatuses.includes(r.status)) u.present++;
      if (r.status === AttendanceStatus.LATE) {
        u.present++;
        u.late++;
      }
      if (r.status === AttendanceStatus.ABSENT) u.absent++;
      if (r.status === AttendanceStatus.JUSTIFIED) u.justified++;
      if (r.status === AttendanceStatus.REMOTE) {
        u.present++;
        u.remote++;
      }
      u.totalWorkMin += r.workMinutes ?? 0;
      u.overtimeMin += r.overtimeMinutes ?? 0;
    }

    const summary = Array.from(userMap.values()).map(u => ({
      ...u,
      totalHours: minutesToHours(u.totalWorkMin),
      overtimeHours: minutesToHours(u.overtimeMin),
      attendanceRate: workdays > 0 ? +((u.present / workdays) * 100).toFixed(1) : 0,
      absenteeismRate: workdays > 0 ? +((u.absent / workdays) * 100).toFixed(1) : 0,
    }));

    const totals = summary.reduce(
      (a, u) => ({
        totalPresent: a.totalPresent + u.present,
        totalAbsent: a.totalAbsent + u.absent,
        totalHours: +(a.totalHours + u.totalHours).toFixed(2),
      }),
      { totalPresent: 0, totalAbsent: 0, totalHours: 0 },
    );

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
    const where: Prisma.AttendanceRecordWhereInput = { date: { gte: today, lte: todayEnd } };
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [records, pendingLeaves, pendingJustifications, pendingOvertime] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      }),
      this.prisma.read.leaveRequest.count({ where: { status: LeaveStatus.PENDING } }),
      this.prisma.read.attendanceJustification.count({ where: { status: 'PENDING' } }),
      this.prisma.read.overtimeRecord.count({ where: { status: OvertimeStatus.PENDING } }),
    ]);

    const present = records.filter(r => PRESENT_LIKE_STATUSES.includes(r.status));
    const absent = records.filter(r => r.status === AttendanceStatus.ABSENT);
    const late = records.filter(r => r.status === AttendanceStatus.LATE);
    const checkedIn = records.filter(r => r.clockIn && !r.clockOut);

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
        attendanceRate:
          records.length > 0 ? +((present.length / records.length) * 100).toFixed(1) : 0,
      },
      presentList: present.map(r => ({
        id: r.userId,
        name: r.user?.fullName,
        clockIn: r.clockIn,
        status: r.status,
      })),
      absentList: absent.map(r => ({ id: r.userId, name: r.user?.fullName })),
      lateList: late.map(r => ({
        id: r.userId,
        name: r.user?.fullName,
        clockIn: r.clockIn,
      })),
    };
  }

  async getKpiTrend(userId?: number, days = 30) {
    const from = new Date(Date.now() - days * 86400000);
    const where: Prisma.AttendanceRecordWhereInput = { date: { gte: from } };
    if (userId) where.userId = userId;

    const records = await this.prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    const byDate = records.reduce<
      Record<
        string,
        { date: string; present: number; absent: number; late: number; totalHours: number }
      >
    >((acc, r) => {
      const key = r.date.toISOString().split('T')[0];
      if (!acc[key]) acc[key] = { date: key, present: 0, absent: 0, late: 0, totalHours: 0 };
      if (PRESENT_LIKE_STATUSES.includes(r.status)) acc[key].present++;
      if (r.status === AttendanceStatus.ABSENT) acc[key].absent++;
      if (r.status === AttendanceStatus.LATE) acc[key].late++;
      acc[key].totalHours = +(acc[key].totalHours + (r.hoursWorked ?? 0)).toFixed(2);
      return acc;
    }, {});

    return Object.values(byDate);
  }

  async getAbsenteeismReport(from: string, to: string, department?: string) {
    const where: Prisma.AttendanceRecordWhereInput = {
      status: AttendanceStatus.ABSENT,
      date: { gte: new Date(from), lte: new Date(to) },
    };
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const records = await this.prisma.attendanceRecord.findMany({
      where,
      include: { user: { select: { id: true, fullName: true } } },
    });

    const byUser = records.reduce<
      Record<number, { userId: number; name: string; absences: number }>
    >((acc, r) => {
      const uid = r.userId;
      if (!acc[uid]) acc[uid] = { userId: uid, name: r.user?.fullName, absences: 0 };
      acc[uid].absences++;
      return acc;
    }, {});

    return Object.values(byUser).sort((a, b) => b.absences - a.absences);
  }

  async checkInToEvent(userId: number, eventId: number, dto: ClockInDto) {
    return this.clockIn(userId, { ...dto, eventId, context: AttendanceContext.EVENT });
  }

  async checkInToSession(userId: number, sessionId: number, dto: ClockInDto) {
    return this.clockIn(userId, { ...dto, sessionId, context: AttendanceContext.WEBINAR });
  }

  async getEventAttendance(eventId: number) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { eventId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { clockIn: 'asc' },
    });

    const present = records.filter(r => r.status !== AttendanceStatus.ABSENT).length;

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
    const userSchedule = await this.prisma.read.userSchedule.findUnique({
      where: { userId },
      include: { schedule: true },
    });
    return userSchedule?.schedule ?? null;
  }

  private async validateGeofence(userId: number, lat: number, lon: number) {
    const locations = await this.prisma.read.allowedLocation.findMany();
    if (locations.length === 0) return;

    const inRange = locations.some(
      loc => distanceMeters(lat, lon, loc.latitude, loc.longitude) <= loc.radiusMeters,
    );

    if (!inRange) {
      await this.audit.log({
        action: 'GEOFENCE_VIOLATION',
        entityType: 'AttendanceRecord',
        entityId: 0,
        userId,
        metadata: {},
      });
      throw new BadRequestException('Localização fora da área permitida para check-in');
    }
  }

  private async createLeaveAttendanceRecords(leave: Prisma.LeaveRequestGetPayload<object>) {
    const dates: Date[] = [];
    const cur = new Date(leave.startDate);
    const end = new Date(leave.endDate);

    while (cur <= end) {
      const dow = cur.getDay();
      if (dow !== 0 && dow !== 6) dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    await this.prisma.attendanceRecord.createMany({
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

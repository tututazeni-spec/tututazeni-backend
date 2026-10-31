import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurrentUserData } from '../common/decorators';
import { AuditService } from '../common/services/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendancePolicy,
  AttendanceState,
  effectiveSessionStatus,
  isValidTime,
  minutesOf,
  round1,
  summarizeAttendance,
  timesOverlap,
} from './cohort-attendance-calc';
import {
  CancelCohortSessionDto,
  ClearCohortSessionAttendanceDto,
  CreateCohortSessionDto,
  SaveCohortSessionAttendanceDto,
  UpdateCohortAttendancePolicyDto,
  UpdateCohortSessionDto,
} from './courses.dto';

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const toDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00.000Z`);

interface CohortScope {
  id: number;
  name: string;
  instructorId: number | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  minAttendancePercent: number;
  excludeExcusedFromTotal: boolean;
  course: { title: string };
}

interface SessionTiming {
  date: Date;
  startTime: string;
  endTime: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}

/**
 * Sessões (aulas) de uma turma e respectivas presenças.
 * Acesso: ADMIN/RH ou o formador da turma gerem tudo; o formador de uma sessão
 * concreta só vê e regista presenças nessa sessão. Tudo é validado aqui (API).
 */
@Injectable()
export class CohortSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isPrivileged(user: CurrentUserData) {
    return ['ADMIN', 'RH'].includes(user.role?.name ?? '');
  }

  private canManage(cohort: CohortScope, user: CurrentUserData) {
    return this.isPrivileged(user) || cohort.instructorId === user.id;
  }

  private async loadCohort(cohortId: number): Promise<CohortScope> {
    const cohort = await this.prisma.read.courseCohort.findUnique({
      where: { id: cohortId },
      include: { course: { select: { title: true } } },
    });
    if (!cohort) throw new NotFoundException('Turma não encontrada');
    return cohort;
  }

  private async loadSession(cohortId: number, sessionId: number) {
    const session = await this.prisma.read.courseCohortSession.findFirst({
      where: { id: sessionId, cohortId },
      include: { instructor: { select: { id: true, fullName: true } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    return session;
  }

  /** Gestor da turma, ou formador da própria sessão. */
  private assertSessionAccess(
    cohort: CohortScope,
    session: { instructorId: number | null },
    user: CurrentUserData,
  ) {
    if (this.canManage(cohort, user) || session.instructorId === user.id) return;
    throw new ForbiddenException('Sem acesso a esta sessão');
  }

  private assertManage(cohort: CohortScope, user: CurrentUserData) {
    if (!this.canManage(cohort, user)) throw new ForbiddenException('Sem acesso a esta turma');
  }

  private assertTimes(startTime: string, endTime: string) {
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      throw new BadRequestException('Horas inválidas (use HH:mm)');
    }
    if (minutesOf(endTime) <= minutesOf(startTime)) {
      throw new BadRequestException('A hora de fim tem de ser depois da hora de início');
    }
  }

  private assertDateInCohort(cohort: CohortScope, day: string) {
    const first = isoDay(cohort.startDate);
    const last = isoDay(cohort.endDate ?? cohort.startDate);
    if (day < first || day > last) {
      throw new BadRequestException('A data da sessão está fora do período da turma');
    }
  }

  /** Conflito real = mesma turma, mesmo dia e horários que se sobrepõem. */
  private async assertNoOverlap(
    cohortId: number,
    day: string,
    startTime: string,
    endTime: string,
    ignoreId?: number,
  ) {
    const same = await this.prisma.courseCohortSession.findMany({
      where: {
        cohortId,
        date: toDate(day),
        status: { not: 'CANCELLED' },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { startTime: true, endTime: true },
    });
    if (same.some(s => timesOverlap(startTime, endTime, s.startTime, s.endTime))) {
      throw new ConflictException('Já existe uma sessão desta turma nesse horário');
    }
  }

  private derived(s: SessionTiming) {
    return {
      status: effectiveSessionStatus(s.status, s.date, s.startTime, s.endTime),
      durationMinutes: minutesOf(s.endTime) - minutesOf(s.startTime),
    };
  }

  private policyOf(c: AttendancePolicy): AttendancePolicy {
    return {
      minAttendancePercent: c.minAttendancePercent,
      excludeExcusedFromTotal: c.excludeExcusedFromTotal,
    };
  }

  // ─── Sessões ────────────────────────────────────────────────────────────

  async listSessions(cohortId: number, user: CurrentUserData) {
    const cohort = await this.loadCohort(cohortId);
    const manage = this.canManage(cohort, user);
    const sessions = await this.prisma.read.courseCohortSession.findMany({
      where: { cohortId, ...(manage ? {} : { instructorId: user.id }) },
      include: {
        instructor: { select: { id: true, fullName: true } },
        _count: { select: { attendances: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    if (!manage && sessions.length === 0) throw new ForbiddenException('Sem acesso a esta turma');
    return sessions.map(s => ({
      ...s,
      ...this.derived(s),
      attendanceRecorded: s._count.attendances > 0,
      recordedCount: s._count.attendances,
    }));
  }

  async createSession(cohortId: number, dto: CreateCohortSessionDto, user: CurrentUserData) {
    const cohort = await this.loadCohort(cohortId);
    this.assertManage(cohort, user);
    if (cohort.status === 'CANCELLED') {
      throw new BadRequestException('Não é possível criar sessões numa turma cancelada');
    }
    const day = dto.date.slice(0, 10);
    this.assertTimes(dto.startTime, dto.endTime);
    this.assertDateInCohort(cohort, day);
    await this.assertNoOverlap(cohortId, day, dto.startTime, dto.endTime);
    const session = await this.prisma.courseCohortSession.create({
      data: {
        cohortId,
        title: dto.title,
        date: toDate(day),
        startTime: dto.startTime,
        endTime: dto.endTime,
        instructorId: dto.instructorId ?? cohort.instructorId,
        modality: dto.modality ?? 'IN_PERSON',
        notes: dto.notes,
      },
    });
    await this.audit.log({
      action: 'COHORT_SESSION_CREATED',
      entity: 'CourseCohort',
      entityId: cohortId,
      userId: user.id,
      metadata: { sessionId: session.id, date: day },
    });
    return session;
  }

  async updateSession(
    cohortId: number,
    sessionId: number,
    dto: UpdateCohortSessionDto,
    user: CurrentUserData,
  ) {
    const cohort = await this.loadCohort(cohortId);
    this.assertManage(cohort, user);
    const session = await this.loadSession(cohortId, sessionId);
    if (session.status === 'CANCELLED') {
      throw new BadRequestException('Uma sessão cancelada não pode ser editada');
    }
    const day = dto.date ? dto.date.slice(0, 10) : isoDay(session.date);
    const startTime = dto.startTime ?? session.startTime;
    const endTime = dto.endTime ?? session.endTime;
    this.assertTimes(startTime, endTime);
    this.assertDateInCohort(cohort, day);
    await this.assertNoOverlap(cohortId, day, startTime, endTime, sessionId);
    const updated = await this.prisma.courseCohortSession.update({
      where: { id: sessionId },
      data: {
        title: dto.title,
        date: toDate(day),
        startTime,
        endTime,
        instructorId: dto.instructorId,
        modality: dto.modality,
        notes: dto.notes,
        status: dto.status,
      },
    });
    await this.audit.log({
      action: 'COHORT_SESSION_UPDATED',
      entity: 'CourseCohort',
      entityId: cohortId,
      userId: user.id,
      metadata: { sessionId },
    });
    return updated;
  }

  /** Cancela sem apagar: os registos de presença ficam guardados, mas deixam de contar. */
  async cancelSession(
    cohortId: number,
    sessionId: number,
    dto: CancelCohortSessionDto,
    user: CurrentUserData,
  ) {
    const cohort = await this.loadCohort(cohortId);
    this.assertManage(cohort, user);
    const session = await this.loadSession(cohortId, sessionId);
    if (session.status === 'CANCELLED') {
      throw new BadRequestException('A sessão já está cancelada');
    }
    const updated = await this.prisma.courseCohortSession.update({
      where: { id: sessionId },
      data: { status: 'CANCELLED', cancelReason: dto.reason },
    });
    await this.audit.log({
      action: 'COHORT_SESSION_CANCELLED',
      entity: 'CourseCohort',
      entityId: cohortId,
      userId: user.id,
      metadata: { sessionId },
      reason: dto.reason,
    });
    return updated;
  }

  // ─── Presenças de uma sessão ────────────────────────────────────────────

  async getSessionAttendance(cohortId: number, sessionId: number, user: CurrentUserData) {
    const cohort = await this.loadCohort(cohortId);
    const session = await this.loadSession(cohortId, sessionId);
    this.assertSessionAccess(cohort, session, user);
    const [participants, records] = await Promise.all([
      this.prisma.read.courseCohortParticipant.findMany({
        where: { cohortId },
        include: {
          user: { select: { id: true, fullName: true, email: true, employeeNumber: true } },
        },
      }),
      this.prisma.read.courseCohortAttendance.findMany({ where: { sessionId } }),
    ]);
    const byUser = new Map(records.map(r => [r.userId, r]));
    const rows = participants
      .map(p => {
        const r = byUser.get(p.userId);
        return {
          userId: p.userId,
          fullName: p.user.fullName,
          identifier: p.user.employeeNumber ?? p.user.email,
          status: r?.status ?? null,
          checkInTime: r?.checkInTime ?? null,
          checkOutTime: r?.checkOutTime ?? null,
          note: r?.note ?? null,
          method: r?.method ?? null,
          updatedAt: r?.updatedAt ?? null,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt'));
    const count = (st: AttendanceState) => rows.filter(r => r.status === st).length;
    return {
      cohort: { id: cohort.id, name: cohort.name, courseTitle: cohort.course.title },
      session: { ...session, ...this.derived(session) },
      summary: {
        enrolled: rows.length,
        present: count('PRESENT'),
        absent: count('ABSENT'),
        late: count('LATE'),
        justified: count('JUSTIFIED'),
        unmarked: rows.filter(r => r.status === null).length,
      },
      participants: rows,
    };
  }

  async saveSessionAttendance(
    cohortId: number,
    sessionId: number,
    dto: SaveCohortSessionAttendanceDto,
    user: CurrentUserData,
  ) {
    const cohort = await this.loadCohort(cohortId);
    const session = await this.loadSession(cohortId, sessionId);
    this.assertSessionAccess(cohort, session, user);
    if (session.status === 'CANCELLED') {
      throw new BadRequestException('Não se registam presenças numa sessão cancelada');
    }
    if (isoDay(session.date) > isoDay(new Date())) {
      throw new BadRequestException('Só é possível registar presenças em sessões que já começaram');
    }

    const userIds = dto.records.map(r => r.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw new BadRequestException('Há participantes repetidos na lista');
    }
    for (const r of dto.records) {
      if (r.checkInTime && r.checkOutTime && minutesOf(r.checkOutTime) < minutesOf(r.checkInTime)) {
        throw new BadRequestException('A hora de saída não pode ser anterior à de entrada');
      }
    }
    const enrolled = await this.prisma.courseCohortParticipant.findMany({
      where: { cohortId, userId: { in: userIds } },
      select: { userId: true },
    });
    const enrolledIds = new Set(enrolled.map(e => e.userId));
    if (userIds.some(id => !enrolledIds.has(id))) {
      throw new BadRequestException('Há utilizadores que não são participantes desta turma');
    }

    const existing = await this.prisma.courseCohortAttendance.findMany({
      where: { sessionId, userId: { in: userIds } },
    });
    const prev = new Map(existing.map(e => [e.userId, e]));

    const changed = dto.records.filter(r => {
      const b = prev.get(r.userId);
      return (
        !b ||
        b.status !== r.status ||
        b.checkInTime !== (r.checkInTime ?? null) ||
        b.checkOutTime !== (r.checkOutTime ?? null) ||
        b.note !== (r.note ?? null)
      );
    });
    const statusChanges = changed.filter(r => prev.get(r.userId)?.status !== r.status);

    await this.prisma.$transaction([
      ...changed.map(r => {
        const data = {
          status: r.status,
          checkInTime: r.checkInTime ?? null,
          checkOutTime: r.checkOutTime ?? null,
          note: r.note ?? null,
          recordedById: user.id,
        };
        return this.prisma.courseCohortAttendance.upsert({
          where: { sessionId_userId: { sessionId, userId: r.userId } },
          create: { sessionId, userId: r.userId, ...data },
          update: data,
        });
      }),
      ...statusChanges.map(r =>
        this.prisma.courseCohortAttendanceLog.create({
          data: {
            sessionId,
            userId: r.userId,
            previousStatus: prev.get(r.userId)?.status ?? null,
            newStatus: r.status,
            reason: dto.reason,
            changedById: user.id,
          },
        }),
      ),
    ]);

    await this.audit.log({
      action: 'COHORT_ATTENDANCE_SAVED',
      entity: 'CourseCohort',
      entityId: cohortId,
      userId: user.id,
      metadata: { sessionId, records: dto.records.length, statusChanges: statusChanges.length },
      reason: dto.reason,
    });
    return { saved: dto.records.length, changed: changed.length };
  }

  /** Limpa as marcações da sessão. Só ADMIN/RH; fica tudo no histórico. */
  async clearSessionAttendance(
    cohortId: number,
    sessionId: number,
    dto: ClearCohortSessionAttendanceDto,
    user: CurrentUserData,
  ) {
    if (!this.isPrivileged(user)) {
      throw new ForbiddenException('Apenas administração/RH pode limpar as marcações');
    }
    await this.loadCohort(cohortId);
    await this.loadSession(cohortId, sessionId);
    const records = await this.prisma.courseCohortAttendance.findMany({ where: { sessionId } });
    if (records.length === 0) return { cleared: 0 };
    await this.prisma.$transaction([
      ...records.map(r =>
        this.prisma.courseCohortAttendanceLog.create({
          data: {
            sessionId,
            userId: r.userId,
            previousStatus: r.status,
            newStatus: null,
            reason: dto.reason,
            changedById: user.id,
          },
        }),
      ),
      this.prisma.courseCohortAttendance.deleteMany({ where: { sessionId } }),
    ]);
    await this.audit.log({
      action: 'COHORT_ATTENDANCE_CLEARED',
      entity: 'CourseCohort',
      entityId: cohortId,
      userId: user.id,
      metadata: { sessionId, records: records.length },
      reason: dto.reason,
      strict: true,
    });
    return { cleared: records.length };
  }

  async getSessionAttendanceHistory(cohortId: number, sessionId: number, user: CurrentUserData) {
    const cohort = await this.loadCohort(cohortId);
    const session = await this.loadSession(cohortId, sessionId);
    this.assertSessionAccess(cohort, session, user);
    return this.prisma.read.courseCohortAttendanceLog.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ─── Política e relatórios ──────────────────────────────────────────────

  async updatePolicy(
    cohortId: number,
    dto: UpdateCohortAttendancePolicyDto,
    user: CurrentUserData,
  ) {
    if (!this.isPrivileged(user)) {
      throw new ForbiddenException(
        'Apenas administração/RH pode alterar o critério de assiduidade',
      );
    }
    const cohort = await this.loadCohort(cohortId);
    const updated = await this.prisma.courseCohort.update({
      where: { id: cohortId },
      data: {
        minAttendancePercent: dto.minAttendancePercent,
        excludeExcusedFromTotal: dto.excludeExcusedFromTotal,
      },
      select: { minAttendancePercent: true, excludeExcusedFromTotal: true },
    });
    await this.audit.log({
      action: 'COHORT_ATTENDANCE_POLICY_UPDATED',
      entity: 'CourseCohort',
      entityId: cohortId,
      userId: user.id,
      before: this.policyOf(cohort),
      after: updated,
    });
    return updated;
  }

  /** Relatório geral + individual. Âmbito: gestores da turma. */
  async getReport(cohortId: number, user: CurrentUserData) {
    const cohort = await this.loadCohort(cohortId);
    this.assertManage(cohort, user);
    const policy = this.policyOf(cohort);
    const [sessions, participants] = await Promise.all([
      this.prisma.read.courseCohortSession.findMany({
        where: { cohortId },
        include: { attendances: true },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.read.courseCohortParticipant.findMany({
        where: { cohortId },
        include: {
          user: { select: { id: true, fullName: true, email: true, employeeNumber: true } },
        },
      }),
    ]);
    const completed = sessions.filter(s => this.derived(s).status === 'COMPLETED');
    const completedIds = completed.map(s => s.id);
    const marksByUser = new Map<number, Map<number, AttendanceState>>();
    for (const s of completed) {
      for (const a of s.attendances) {
        const m = marksByUser.get(a.userId) ?? new Map<number, AttendanceState>();
        m.set(s.id, a.status);
        marksByUser.set(a.userId, m);
      }
    }
    const rows = participants
      .map(p => ({
        userId: p.userId,
        fullName: p.user.fullName,
        identifier: p.user.employeeNumber ?? p.user.email,
        ...summarizeAttendance(completedIds, marksByUser.get(p.userId) ?? new Map(), policy),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt'));

    const withData = rows.filter(r => r.rate !== null);
    const sum = (k: 'present' | 'late' | 'absent' | 'justified' | 'unmarked') =>
      rows.reduce((n, r) => n + r[k], 0);
    return {
      cohort: { id: cohort.id, name: cohort.name, courseTitle: cohort.course.title },
      generatedAt: new Date().toISOString(),
      period: {
        from: completed.length ? isoDay(completed[0].date) : null,
        to: completed.length ? isoDay(completed[completed.length - 1].date) : null,
      },
      criteria: {
        ...policy,
        countsAsAttendance: ['PRESENT', 'LATE'],
        note: policy.excludeExcusedFromTotal
          ? 'Faltas justificadas não entram no total de sessões.'
          : 'Faltas justificadas contam como falta.',
      },
      general: {
        enrolled: rows.length,
        sessionsTotal: sessions.length,
        sessionsCompleted: completed.length,
        sessionsCancelled: sessions.filter(s => s.status === 'CANCELLED').length,
        present: sum('present'),
        late: sum('late'),
        absent: sum('absent'),
        justified: sum('justified'),
        unmarked: sum('unmarked'),
        averageRate: withData.length
          ? round1(withData.reduce((n, r) => n + (r.rate ?? 0), 0) / withData.length)
          : null,
        belowMinimum: rows.filter(r => r.meetsMinimum === false).length,
      },
      participants: rows,
    };
  }

  /** O próprio participante consulta a sua assiduidade. */
  async getMine(cohortId: number, user: CurrentUserData) {
    const cohort = await this.loadCohort(cohortId);
    const enrolled = await this.prisma.read.courseCohortParticipant.findUnique({
      where: { cohortId_userId: { cohortId, userId: user.id } },
    });
    if (!enrolled) throw new ForbiddenException('Não está inscrito nesta turma');
    const sessions = await this.prisma.read.courseCohortSession.findMany({
      where: { cohortId },
      include: { attendances: { where: { userId: user.id } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const completed = sessions.filter(s => this.derived(s).status === 'COMPLETED');
    const marks = new Map<number, AttendanceState>();
    for (const s of completed) if (s.attendances[0]) marks.set(s.id, s.attendances[0].status);
    const policy = this.policyOf(cohort);
    return {
      cohort: { id: cohort.id, name: cohort.name, courseTitle: cohort.course.title },
      criteria: policy,
      summary: summarizeAttendance(
        completed.map(s => s.id),
        marks,
        policy,
      ),
      sessions: sessions.map(s => ({
        id: s.id,
        title: s.title,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        ...this.derived(s),
        myStatus: s.attendances[0]?.status ?? null,
      })),
    };
  }
}

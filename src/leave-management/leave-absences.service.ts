// ─── src/leave-management/leave-absences.service.ts ───────────────────────────
// Aba Gestão de Ausências (docs/Modulo_Leave.md §5): faltas e ocorrências
// pontuais, separadas dos pedidos (LeaveRequest). Cada registo associa-se ao
// registo de assiduidade existente (AttendanceRecord) em vez de criar uma
// segunda ocorrência independente.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/types/current-user';
import { buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { isPrivileged } from '../common/authz/ownership';
import {
  AbsenceFilterDto,
  AbsenceJustificationStatus,
  AbsenceOccurrenceType,
  AbsenceSource,
  AddAbsenceAttachmentDto,
  CorrectAbsenceDto,
  CreateAbsenceDto,
  ForwardAbsenceDto,
  LeaveDocumentInputDto,
  LeaveStatus,
  SubmitJustificationDto,
  SyncAttendanceDto,
  ValidateAbsenceDto,
} from './leave-management.dto';
import { canSeeSensitive, leaveUserFilter, ORG_WIDE_ROLES, TEAM_ROLES } from './leave-scope.helper';

const HOURS_PER_DAY = 8;
/** Ocorrências que só fazem sentido com hora de início e de fim. */
const TIMED_TYPES = new Set<string>([
  AbsenceOccurrenceType.PARTIAL_ABSENCE,
  AbsenceOccurrenceType.LATE,
  AbsenceOccurrenceType.EARLY_DEPARTURE,
]);
/** Ocorrências que sinalizam o registo para análise do Payroll. */
const PAYROLL_REVIEW_TYPES = new Set<string>([
  AbsenceOccurrenceType.UNJUSTIFIED_ABSENCE,
  AbsenceOccurrenceType.NO_SHOW,
]);

const DAY_MS = 24 * 3600 * 1000;

/**
 * Meia-noite UTC do dia civil indicado — a mesma convenção de LeaveRequest
 * (`new Date('YYYY-MM-DD')`), para as datas não deslizarem num servidor com
 * fuso horário.
 */
function dayUtc(d: Date | string): Date {
  const iso = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return new Date(`${iso}T00:00:00.000Z`);
}

function nextDay(d: Date): Date {
  return new Date(dayUtc(d).getTime() + DAY_MS);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

interface TimeWindow {
  startTime: string | null;
  endTime: string | null;
}

/** Dois registos do mesmo dia colidem se algum for de dia inteiro ou os intervalos se cruzarem. */
function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return true;
  return (
    toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime)
  );
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Neutraliza fórmulas (CSV injection) em folhas de cálculo.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const ABSENCE_INCLUDE = {
  user: {
    select: {
      id: true,
      fullName: true,
      employeeNumber: true,
      department: { select: { id: true, name: true } },
    },
  },
  attachments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AbsenceRecordInclude;

type AbsenceWithRelations = Prisma.AbsenceRecordGetPayload<{ include: typeof ABSENCE_INCLUDE }>;

@Injectable()
export class LeaveAbsencesService {
  private readonly logger = new Logger(LeaveAbsencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // Autorização
  // ══════════════════════════════════════════════════════════════════

  private isOrg(viewer: CurrentUserData): boolean {
    return isPrivileged(viewer, ORG_WIDE_ROLES);
  }

  private isManagerLike(viewer: CurrentUserData): boolean {
    return isPrivileged(viewer, [...ORG_WIDE_ROLES, ...TEAM_ROLES]);
  }

  /** O próprio ou alguém do âmbito do perfil; caso contrário 404 (não revela existência). */
  private async assertInScope(viewer: CurrentUserData, userId: number): Promise<void> {
    if (viewer.id === userId) return;
    const inScope = await this.prisma.read.user.count({
      where: leaveUserFilter(viewer, { userId }),
    });
    if (!inScope) throw new NotFoundException('Recurso não encontrado');
  }

  private async load(id: number, viewer: CurrentUserData) {
    const a = await this.prisma.absenceRecord.findUnique({
      where: { id },
      include: ABSENCE_INCLUDE,
    });
    if (!a) throw new NotFoundException('Ausência não encontrada');
    await this.assertInScope(viewer, a.userId);
    return a;
  }

  // ══════════════════════════════════════════════════════════════════
  // Apresentação (com privacidade)
  // ══════════════════════════════════════════════════════════════════

  private async userNames(ids: Array<number | null | undefined>): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((i): i is number => !!i))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map(u => [u.id, u.fullName]));
  }

  private async toViews(rows: AbsenceWithRelations[], viewer: CurrentUserData) {
    const names = await this.userNames(
      rows.flatMap(r => [r.validatorId, r.forwardedToId, r.createdById]),
    );
    const attendanceIds = rows.map(r => r.attendanceRecordId).filter((i): i is number => !!i);
    const attendance = attendanceIds.length
      ? await this.prisma.read.attendanceRecord.findMany({
          where: { id: { in: attendanceIds } },
          select: { id: true, status: true, date: true, clockIn: true, clockOut: true },
        })
      : [];
    const attendanceById = new Map(attendance.map(a => [a.id, a]));
    const org = this.isOrg(viewer);
    const managerLike = this.isManagerLike(viewer);

    return rows.map(r => {
      const isOwner = viewer.id === r.userId;
      const health = r.occurrenceType === AbsenceOccurrenceType.HEALTH_ABSENCE;
      // Motivos de saúde e comprovativos só o titular e o RH vêem.
      const allowed = !health || canSeeSensitive(viewer, r.userId);
      const status = r.justificationStatus;
      return {
        id: r.id,
        user: r.user,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        durationDays: r.durationDays,
        durationHours: r.durationHours,
        occurrenceType: r.occurrenceType,
        customCategory: r.customCategory,
        justification: allowed ? r.justification : null,
        hasAttachment: r.attachments.length > 0,
        attachments: allowed
          ? r.attachments.map(a => ({
              id: a.id,
              name: a.name,
              fileUrl: a.fileUrl,
              mimeType: a.mimeType,
            }))
          : [],
        source: r.source,
        justificationStatus: status,
        validator: r.validatorId
          ? { id: r.validatorId, fullName: names.get(r.validatorId) ?? null }
          : null,
        validatedAt: r.validatedAt,
        validationNotes: allowed ? r.validationNotes : null,
        attendance: r.attendanceRecordId
          ? (attendanceById.get(r.attendanceRecordId) ?? null)
          : null,
        forwardedTo: r.forwardedToId
          ? { id: r.forwardedToId, fullName: names.get(r.forwardedToId) ?? null }
          : null,
        sentToHrAt: r.sentToHrAt,
        createdBy: { id: r.createdById, fullName: names.get(r.createdById) ?? null },
        createdAt: r.createdAt,
        // Impacto salarial: indicação só para ADMIN/RH.
        payrollReview: org
          ? PAYROLL_REVIEW_TYPES.has(r.occurrenceType) ||
            status === AbsenceJustificationStatus.REJECTED
          : undefined,
        actions: {
          submitJustification:
            (isOwner || managerLike) &&
            (status === AbsenceJustificationStatus.TO_JUSTIFY ||
              status === AbsenceJustificationStatus.REJECTED),
          validate:
            managerLike &&
            !isOwner &&
            status === AbsenceJustificationStatus.SUBMITTED &&
            (!health || org),
          attach: isOwner || managerLike,
          correct: managerLike && (status !== AbsenceJustificationStatus.VALIDATED || org),
          forward:
            managerLike &&
            (status === AbsenceJustificationStatus.TO_JUSTIFY ||
              status === AbsenceJustificationStatus.SUBMITTED),
          sendToHr:
            managerLike && !org && !r.sentToHrAt && status === AbsenceJustificationStatus.SUBMITTED,
        },
      };
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // Consulta
  // ══════════════════════════════════════════════════════════════════

  private buildWhere(
    filters: AbsenceFilterDto,
    viewer: CurrentUserData,
  ): Prisma.AbsenceRecordWhereInput {
    const and: Prisma.AbsenceRecordWhereInput[] = [{ user: leaveUserFilter(viewer, filters) }];
    if (filters.occurrenceType) and.push({ occurrenceType: filters.occurrenceType });
    if (filters.justificationStatus) and.push({ justificationStatus: filters.justificationStatus });
    if (filters.source) and.push({ source: filters.source });
    if (filters.from) and.push({ date: { gte: dayUtc(filters.from) } });
    if (filters.to) and.push({ date: { lt: nextDay(dayUtc(filters.to)) } });
    if (filters.search) {
      and.push({
        user: {
          OR: [
            { fullName: { contains: filters.search, mode: 'insensitive' } },
            { employeeNumber: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      });
    }
    return { AND: and };
  }

  async list(filters: AbsenceFilterDto, viewer: CurrentUserData) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const where = this.buildWhere(filters, viewer);
    const [rows, total] = await Promise.all([
      this.prisma.read.absenceRecord.findMany({
        where,
        include: ABSENCE_INCLUDE,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.read.absenceRecord.count({ where }),
    ]);
    return buildPaginatedResponse(await this.toViews(rows, viewer), total, page, limit);
  }

  async findOne(id: number, viewer: CurrentUserData) {
    const a = await this.load(id, viewer);
    const [view] = await this.toViews([a], viewer);
    const revisions = await this.prisma.absenceRevision.findMany({
      where: { absenceId: id },
      orderBy: { createdAt: 'asc' },
    });
    const names = await this.userNames(revisions.map(r => r.changedById));
    const allowed =
      a.occurrenceType !== AbsenceOccurrenceType.HEALTH_ABSENCE ||
      canSeeSensitive(viewer, a.userId);
    return {
      ...view,
      revisions: revisions.map(r => ({
        id: r.id,
        reason: r.reason,
        // Os valores anteriores/novos de justificação clínica não saem para o gestor.
        changes: allowed ? r.changes : {},
        changedBy: { id: r.changedById, fullName: names.get(r.changedById) ?? null },
        createdAt: r.createdAt,
      })),
    };
  }

  /** Histórico do colaborador: todas as ocorrências + totais por tipo e estado. */
  async history(userId: number, viewer: CurrentUserData) {
    await this.assertInScope(viewer, userId);
    const rows = await this.prisma.read.absenceRecord.findMany({
      where: { userId },
      include: ABSENCE_INCLUDE,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const byType = new Map<string, { occurrenceType: string; count: number; days: number }>();
    const byStatus = new Map<string, number>();
    for (const r of rows) {
      const t = byType.get(r.occurrenceType) ?? {
        occurrenceType: r.occurrenceType,
        count: 0,
        days: 0,
      };
      t.count += 1;
      t.days += r.durationDays;
      byType.set(r.occurrenceType, t);
      byStatus.set(r.justificationStatus, (byStatus.get(r.justificationStatus) ?? 0) + 1);
    }
    return {
      summary: {
        total: rows.length,
        totalDays: +rows.reduce((a, r) => a + r.durationDays, 0).toFixed(2),
        byType: [...byType.values()],
        byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
      },
      records: await this.toViews(rows, viewer),
    };
  }

  /** CSV do âmbito do perfil (só quem pode ver a equipa/organização). */
  async exportCsv(filters: AbsenceFilterDto, viewer: CurrentUserData) {
    if (!this.isManagerLike(viewer)) throw new ForbiddenException('Sem permissão para exportar');
    const rows = await this.prisma.read.absenceRecord.findMany({
      where: this.buildWhere(filters, viewer),
      include: ABSENCE_INCLUDE,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 5000,
    });
    const views = await this.toViews(rows, viewer);
    const header = [
      'Colaborador',
      'N.º interno',
      'Departamento',
      'Data',
      'Início',
      'Fim',
      'Duração (dias)',
      'Duração (horas)',
      'Tipo',
      'Origem',
      'Estado de justificação',
      'Validador',
      'Estado assiduidade',
      ...(this.isOrg(viewer) ? ['Análise Payroll'] : []),
    ];
    const lines = views.map(v =>
      [
        v.user.fullName,
        v.user.employeeNumber,
        v.user.department?.name,
        v.date.toISOString().slice(0, 10),
        v.startTime,
        v.endTime,
        v.durationDays,
        v.durationHours,
        v.customCategory ?? v.occurrenceType,
        v.source,
        v.justificationStatus,
        v.validator?.fullName,
        v.attendance?.status,
        ...(this.isOrg(viewer) ? [v.payrollReview ? 'Sim' : 'Não'] : []),
      ]
        .map(csvCell)
        .join(';'),
    );
    return {
      filename: `ausencias-${new Date().toISOString().slice(0, 10)}.csv`,
      mimeType: 'text/csv',
      content: [header.map(csvCell).join(';'), ...lines].join('\n'),
      total: views.length,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // Escrita
  // ══════════════════════════════════════════════════════════════════

  private durationOf(startTime?: string | null, endTime?: string | null) {
    if (!startTime && !endTime) return { durationDays: 1, durationHours: null as number | null };
    if (!startTime || !endTime)
      throw new BadRequestException('Indique a hora de início e a hora de fim');
    const span = toMinutes(endTime) - toMinutes(startTime);
    if (span <= 0) throw new BadRequestException('A hora de fim tem de ser posterior ao início');
    const durationHours = +(span / 60).toFixed(2);
    return {
      durationDays: +Math.min(1, durationHours / HOURS_PER_DAY).toFixed(2),
      durationHours,
    };
  }

  /** Sobreposição com outra ocorrência do mesmo dia e com licença/férias aprovadas. */
  private async assertNoConflict(
    userId: number,
    day: Date,
    window: TimeWindow,
    ignoreId?: number,
  ): Promise<void> {
    const sameDay = await this.prisma.absenceRecord.findMany({
      where: {
        userId,
        date: { gte: day, lt: nextDay(day) },
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true, startTime: true, endTime: true },
    });
    const clash = sameDay.find(o => windowsOverlap(window, o));
    if (clash)
      throw new ConflictException(
        `Já existe uma ocorrência nesse período (ocorrência #${clash.id})`,
      );

    const leave = await this.prisma.leaveRequest.findFirst({
      where: {
        userId,
        status: LeaveStatus.APPROVED,
        durationMode: 'FULL_DAY',
        startDate: { lt: nextDay(day) },
        endDate: { gte: day },
      },
      select: { id: true, leaveTypeCode: true },
    });
    if (leave)
      throw new ConflictException(
        `O colaborador tem ${leave.leaveTypeCode} aprovada nesse dia (pedido #${leave.id})`,
      );
  }

  private attachmentRows(
    attachments: LeaveDocumentInputDto[] | undefined,
    uploadedById: number,
    isSensitive: boolean,
  ) {
    return (attachments ?? []).map(a => ({
      name: a.name,
      fileUrl: a.fileUrl,
      mimeType: a.mimeType,
      isSensitive,
      uploadedById,
    }));
  }

  async create(dto: CreateAbsenceDto, viewer: CurrentUserData) {
    const userId = dto.userId ?? viewer.id;
    await this.assertInScope(viewer, userId);
    if (userId !== viewer.id && !this.isManagerLike(viewer))
      throw new ForbiddenException('Sem permissão para registar ausências de outros colaboradores');

    const day = dayUtc(dto.date);
    if (TIMED_TYPES.has(dto.occurrenceType) && !(dto.startTime && dto.endTime))
      throw new BadRequestException('Este tipo de ocorrência exige hora de início e de fim');
    if (dto.occurrenceType === AbsenceOccurrenceType.OTHER && !dto.customCategory?.trim())
      throw new BadRequestException('Indique a categoria da ocorrência');
    const { durationDays, durationHours } = this.durationOf(dto.startTime, dto.endTime);
    const window = { startTime: dto.startTime ?? null, endTime: dto.endTime ?? null };

    await this.assertNoConflict(userId, day, window);

    // Se a falta já consta da assiduidade, associa-a em vez de a duplicar.
    const attendance = await this.prisma.attendanceRecord.findFirst({
      where: {
        userId,
        // A assiduidade guarda o dia à meia-noite local ou UTC conforme a origem.
        date: {
          gte: new Date(day.getTime() - DAY_MS / 2),
          lt: new Date(day.getTime() + DAY_MS / 2),
        },
        status: { in: ['ABSENT', 'LATE', 'PARTIAL', 'JUSTIFIED', 'HALF_DAY_AM', 'HALF_DAY_PM'] },
      },
      select: { id: true },
    });
    if (attendance) {
      const linked = await this.prisma.absenceRecord.findUnique({
        where: { attendanceRecordId: attendance.id },
        select: { id: true },
      });
      if (linked)
        throw new ConflictException(
          `Esta falta já está registada na assiduidade e associada à ocorrência #${linked.id}`,
        );
    }

    const health = dto.occurrenceType === AbsenceOccurrenceType.HEALTH_ABSENCE;
    const hasJustification = !!dto.justification?.trim() || !!dto.attachments?.length;
    const created = await this.prisma.absenceRecord.create({
      data: {
        userId,
        date: day,
        startTime: dto.startTime,
        endTime: dto.endTime,
        durationDays,
        durationHours,
        occurrenceType: dto.occurrenceType,
        customCategory: dto.customCategory?.trim() || null,
        justification: dto.justification?.trim() || null,
        source: AbsenceSource.MANUAL,
        justificationStatus: hasJustification
          ? AbsenceJustificationStatus.SUBMITTED
          : AbsenceJustificationStatus.TO_JUSTIFY,
        attendanceRecordId: attendance?.id,
        createdById: viewer.id,
        attachments: dto.attachments?.length
          ? { create: this.attachmentRows(dto.attachments, viewer.id, health) }
          : undefined,
      },
      include: ABSENCE_INCLUDE,
    });

    await this.audit.log({
      action: 'ABSENCE_REGISTERED',
      entityType: 'AbsenceRecord',
      entityId: created.id,
      userId: viewer.id,
      metadata: {
        targetUserId: userId,
        occurrenceType: dto.occurrenceType,
        linkedAttendance: !!attendance,
      },
    });
    if (userId !== viewer.id) {
      await this.notify(
        userId,
        'ABSENCE_REGISTERED',
        'Foi registada uma ocorrência de ausência em seu nome',
      );
    }
    return (await this.toViews([created], viewer))[0];
  }

  async submitJustification(id: number, dto: SubmitJustificationDto, viewer: CurrentUserData) {
    const a = await this.load(id, viewer);
    if (viewer.id !== a.userId && !this.isManagerLike(viewer))
      throw new ForbiddenException('Sem permissão para submeter a justificação');
    if (
      a.justificationStatus !== AbsenceJustificationStatus.TO_JUSTIFY &&
      a.justificationStatus !== AbsenceJustificationStatus.REJECTED
    )
      throw new ConflictException('Esta ocorrência não aguarda justificação');

    const health = a.occurrenceType === AbsenceOccurrenceType.HEALTH_ABSENCE;
    const [updated] = await this.prisma.$transaction([
      this.prisma.absenceRecord.update({
        where: { id },
        data: {
          justification: dto.justification.trim(),
          justificationStatus: AbsenceJustificationStatus.SUBMITTED,
          validationNotes: null,
          validatorId: null,
          validatedAt: null,
          attachments: dto.attachments?.length
            ? { create: this.attachmentRows(dto.attachments, viewer.id, health) }
            : undefined,
        },
        include: ABSENCE_INCLUDE,
      }),
      this.prisma.absenceRevision.create({
        data: {
          absenceId: id,
          changedById: viewer.id,
          reason: 'Justificação submetida',
          changes: {
            justificationStatus: [a.justificationStatus, AbsenceJustificationStatus.SUBMITTED],
          },
        },
      }),
    ]);

    await this.audit.log({
      action: 'ABSENCE_JUSTIFICATION_SUBMITTED',
      entityType: 'AbsenceRecord',
      entityId: id,
      userId: viewer.id,
    });
    const owner = await this.prisma.user.findUnique({
      where: { id: a.userId },
      select: { managerId: true },
    });
    const approver = a.forwardedToId ?? owner?.managerId;
    if (approver && approver !== viewer.id)
      await this.notify(
        approver,
        'ABSENCE_JUSTIFICATION_PENDING',
        'Há uma justificação de ausência para validar',
      );
    return (await this.toViews([updated], viewer))[0];
  }

  async validate(id: number, dto: ValidateAbsenceDto, viewer: CurrentUserData) {
    const a = await this.load(id, viewer);
    if (!this.isManagerLike(viewer)) throw new ForbiddenException('Sem permissão para validar');
    if (viewer.id === a.userId)
      throw new ForbiddenException('Não pode validar a sua própria justificação');
    if (a.occurrenceType === AbsenceOccurrenceType.HEALTH_ABSENCE && !this.isOrg(viewer))
      throw new ForbiddenException('Ausências por motivo de saúde são validadas pelo RH');
    if (a.justificationStatus !== AbsenceJustificationStatus.SUBMITTED)
      throw new ConflictException('Só justificações submetidas podem ser validadas ou recusadas');
    const reject = dto.decision === 'REJECT';
    if (reject && !dto.notes?.trim())
      throw new BadRequestException('A recusa exige uma justificação');

    const next = reject
      ? AbsenceJustificationStatus.REJECTED
      : AbsenceJustificationStatus.VALIDATED;
    const [updated] = await this.prisma.$transaction([
      this.prisma.absenceRecord.update({
        where: { id },
        data: {
          justificationStatus: next,
          validatorId: viewer.id,
          validatedAt: new Date(),
          validationNotes: dto.notes?.trim() || null,
        },
        include: ABSENCE_INCLUDE,
      }),
      this.prisma.absenceRevision.create({
        data: {
          absenceId: id,
          changedById: viewer.id,
          reason: reject ? 'Justificação recusada' : 'Justificação validada',
          changes: { justificationStatus: [a.justificationStatus, next] },
        },
      }),
    ]);

    await this.audit.log({
      action: reject ? 'ABSENCE_JUSTIFICATION_REJECTED' : 'ABSENCE_JUSTIFICATION_VALIDATED',
      entityType: 'AbsenceRecord',
      entityId: id,
      userId: viewer.id,
    });
    await this.notify(
      a.userId,
      reject ? 'ABSENCE_JUSTIFICATION_REJECTED' : 'ABSENCE_JUSTIFICATION_VALIDATED',
      reject
        ? 'A sua justificação de ausência foi recusada'
        : 'A sua justificação de ausência foi validada',
    );
    return (await this.toViews([updated], viewer))[0];
  }

  async addAttachment(id: number, dto: AddAbsenceAttachmentDto, viewer: CurrentUserData) {
    const a = await this.load(id, viewer);
    if (viewer.id !== a.userId && !this.isManagerLike(viewer))
      throw new ForbiddenException('Sem permissão para anexar documentos');
    await this.prisma.absenceAttachment.create({
      data: {
        absenceId: id,
        name: dto.name,
        fileUrl: dto.fileUrl,
        mimeType: dto.mimeType,
        isSensitive: a.occurrenceType === AbsenceOccurrenceType.HEALTH_ABSENCE,
        uploadedById: viewer.id,
      },
    });
    await this.audit.log({
      action: 'ABSENCE_ATTACHMENT_ADDED',
      entityType: 'AbsenceRecord',
      entityId: id,
      userId: viewer.id,
    });
    const fresh = await this.load(id, viewer);
    return (await this.toViews([fresh], viewer))[0];
  }

  /** Corrige o registo e deixa a diferença (antes/depois) e o motivo em AbsenceRevision. */
  async correct(id: number, dto: CorrectAbsenceDto, viewer: CurrentUserData) {
    const a = await this.load(id, viewer);
    if (!this.isManagerLike(viewer)) throw new ForbiddenException('Sem permissão para corrigir');
    if (a.justificationStatus === AbsenceJustificationStatus.VALIDATED && !this.isOrg(viewer))
      throw new ForbiddenException('Registos validados só podem ser corrigidos pelo RH');
    if (!dto.reason.trim()) throw new BadRequestException('Indique o motivo da correcção');

    const patch: Prisma.AbsenceRecordUpdateInput = {};
    const changes: Record<string, [unknown, unknown]> = {};
    const track = <K extends string>(field: K, before: unknown, after: unknown) => {
      if (after !== undefined && String(before ?? '') !== String(after ?? ''))
        changes[field] = [before, after];
    };

    const date = dto.date ? dayUtc(dto.date) : a.date;
    const startTime = dto.startTime ?? a.startTime;
    const endTime = dto.endTime ?? a.endTime;
    const type = dto.occurrenceType ?? a.occurrenceType;
    if (TIMED_TYPES.has(type) && !(startTime && endTime))
      throw new BadRequestException('Este tipo de ocorrência exige hora de início e de fim');
    if (type === AbsenceOccurrenceType.OTHER && !(dto.customCategory ?? a.customCategory)?.trim())
      throw new BadRequestException('Indique a categoria da ocorrência');

    track(
      'date',
      a.date.toISOString().slice(0, 10),
      dto.date ? date.toISOString().slice(0, 10) : undefined,
    );
    track('startTime', a.startTime, dto.startTime);
    track('endTime', a.endTime, dto.endTime);
    track('occurrenceType', a.occurrenceType, dto.occurrenceType);
    track('customCategory', a.customCategory, dto.customCategory?.trim());
    if (Object.keys(changes).length === 0)
      throw new BadRequestException('Nenhum campo foi alterado');

    if (changes.date || changes.startTime || changes.endTime) {
      const { durationDays, durationHours } = this.durationOf(startTime, endTime);
      await this.assertNoConflict(a.userId, date, { startTime, endTime }, id);
      patch.date = date;
      patch.startTime = startTime;
      patch.endTime = endTime;
      patch.durationDays = durationDays;
      patch.durationHours = durationHours;
    }
    if (changes.occurrenceType) patch.occurrenceType = type;
    if (changes.customCategory) patch.customCategory = dto.customCategory?.trim() || null;

    const [updated] = await this.prisma.$transaction([
      this.prisma.absenceRecord.update({ where: { id }, data: patch, include: ABSENCE_INCLUDE }),
      this.prisma.absenceRevision.create({
        data: {
          absenceId: id,
          changedById: viewer.id,
          reason: dto.reason.trim(),
          changes: changes as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    await this.audit.log({
      action: 'ABSENCE_CORRECTED',
      entityType: 'AbsenceRecord',
      entityId: id,
      userId: viewer.id,
      metadata: { changes, reason: dto.reason.trim() },
    });
    return (await this.toViews([updated], viewer))[0];
  }

  async forward(id: number, dto: ForwardAbsenceDto, viewer: CurrentUserData) {
    const a = await this.load(id, viewer);
    if (!this.isManagerLike(viewer)) throw new ForbiddenException('Sem permissão para encaminhar');
    let targetId = dto.toUserId;
    if (!targetId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: a.userId },
        select: { managerId: true },
      });
      targetId = owner?.managerId ?? undefined;
    }
    if (!targetId) throw new BadRequestException('O colaborador não tem gestor atribuído');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('Destinatário não encontrado');

    const updated = await this.prisma.absenceRecord.update({
      where: { id },
      data: { forwardedToId: targetId, forwardedAt: new Date() },
      include: ABSENCE_INCLUDE,
    });
    await this.audit.log({
      action: 'ABSENCE_FORWARDED',
      entityType: 'AbsenceRecord',
      entityId: id,
      userId: viewer.id,
      metadata: { toUserId: targetId },
    });
    await this.notify(
      targetId,
      'ABSENCE_FORWARDED',
      'Foi-lhe encaminhada uma ocorrência de ausência',
    );
    return (await this.toViews([updated], viewer))[0];
  }

  async sendToHr(id: number, viewer: CurrentUserData) {
    const a = await this.load(id, viewer);
    if (!this.isManagerLike(viewer)) throw new ForbiddenException('Sem permissão');
    if (a.justificationStatus !== AbsenceJustificationStatus.SUBMITTED)
      throw new ConflictException('Só justificações submetidas podem seguir para validação do RH');
    if (a.sentToHrAt) throw new ConflictException('Já foi enviada para validação do RH');

    const updated = await this.prisma.absenceRecord.update({
      where: { id },
      data: { sentToHrAt: new Date() },
      include: ABSENCE_INCLUDE,
    });
    await this.audit.log({
      action: 'ABSENCE_SENT_TO_HR',
      entityType: 'AbsenceRecord',
      entityId: id,
      userId: viewer.id,
    });
    const hr = await this.prisma.user.findMany({
      where: { role: { code: 'RH' } },
      select: { id: true },
      take: 20,
    });
    await Promise.all(
      hr.map(u =>
        this.notify(u.id, 'ABSENCE_HR_VALIDATION', 'Há uma ausência para validação do RH'),
      ),
    );
    return (await this.toViews([updated], viewer))[0];
  }

  /**
   * Cria ocorrências a partir de faltas/atrasos já registados na assiduidade e
   * ainda sem ocorrência — o vínculo único evita duplicados em reexecuções e
   * ignora dias cobertos por férias/licença aprovadas.
   */
  async syncFromAttendance(dto: SyncAttendanceDto, viewer: CurrentUserData) {
    if (!this.isOrg(viewer)) throw new ForbiddenException('Sem permissão');
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const to = dto.to ? nextDay(dayUtc(dto.to)) : nextDay(today);
    const from = dto.from ? dayUtc(dto.from) : new Date(to.getTime() - 31 * DAY_MS);
    const half = DAY_MS / 2;
    const civilDay = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        date: { gte: new Date(from.getTime() - half), lt: new Date(to.getTime() - half) },
        status: { in: ['ABSENT', 'LATE'] },
      },
      select: { id: true, userId: true, date: true, status: true },
      orderBy: { date: 'asc' },
      take: 1000,
    });
    if (records.length === 0) return { created: 0, skipped: 0 };

    const [linked, leaves] = await Promise.all([
      this.prisma.absenceRecord.findMany({
        where: { attendanceRecordId: { in: records.map(r => r.id) } },
        select: { attendanceRecordId: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          userId: { in: [...new Set(records.map(r => r.userId))] },
          status: LeaveStatus.APPROVED,
          startDate: { lt: to },
          endDate: { gte: from },
        },
        select: { userId: true, startDate: true, endDate: true },
      }),
    ]);
    const linkedIds = new Set(linked.map(l => l.attendanceRecordId));
    const onLeave = (userId: number, date: Date) => {
      const day = civilDay(date);
      return leaves.some(l => l.userId === userId && l.startDate <= day && l.endDate >= day);
    };

    const todo = records.filter(r => !linkedIds.has(r.id) && !onLeave(r.userId, r.date));
    const result = await this.prisma.absenceRecord.createMany({
      data: todo.map(r => ({
        userId: r.userId,
        date: civilDay(r.date),
        durationDays: r.status === 'ABSENT' ? 1 : 0,
        occurrenceType:
          r.status === 'ABSENT'
            ? AbsenceOccurrenceType.UNJUSTIFIED_ABSENCE
            : AbsenceOccurrenceType.LATE,
        source: AbsenceSource.ATTENDANCE,
        justificationStatus: AbsenceJustificationStatus.TO_JUSTIFY,
        attendanceRecordId: r.id,
        createdById: viewer.id,
      })),
      skipDuplicates: true,
    });
    await this.audit.log({
      action: 'ABSENCE_SYNC_ATTENDANCE',
      entityType: 'AbsenceRecord',
      entityId: 0,
      userId: viewer.id,
      metadata: { created: result.count, scanned: records.length },
    });
    return { created: result.count, skipped: records.length - result.count };
  }

  private async notify(userId: number, type: string, message: string) {
    await createNotificationSafe(this.prisma, this.logger, { userId, type, message });
  }
}

// ─── src/leave-management/leave-settings.service.ts ──────────────────────────
// Configurações do módulo Leave (docs/Modulo_Leave.md §10): versões imutáveis
// com data de entrada em vigor e histórico, calendário de feriados por
// localização e delegações temporárias de aprovadores.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/types/current-user';
import { Role } from '../auth/enums/role.enum';
import { isPrivileged } from '../common/authz/ownership';
import {
  configureLeaveCalendar,
  holidaysForYear,
  setLeaveCalendarLoader,
} from './leave-calendar.helper';
import {
  CreateLeaveDelegationDto,
  CreateLeaveHolidayDto,
  DEFAULT_LEAVE_SETTINGS,
  LeaveSettings,
  UpdateLeaveHolidayDto,
  UpdateLeaveSettingsDto,
} from './leave-settings.dto';

const CACHE_MS = 30_000;
const DAY_MS = 86_400_000;
const MAX_FUTURE_DAYS = 730;

const SETTING_KEYS = Object.keys(DEFAULT_LEAVE_SETTINGS) as Array<keyof LeaveSettings>;

const toDateOnly = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);

/** Junta valores guardados sobre os por omissão, ignorando chaves desconhecidas. */
export function mergeSettings(stored: unknown): LeaveSettings {
  const out: Record<string, unknown> = { ...DEFAULT_LEAVE_SETTINGS };
  if (stored && typeof stored === 'object') {
    for (const k of SETTING_KEYS) {
      const v = (stored as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = v;
    }
  }
  return out as unknown as LeaveSettings;
}

/** Chaves cujo valor difere entre duas versões. */
export function diffSettings(prev: LeaveSettings, next: LeaveSettings): string[] {
  return SETTING_KEYS.filter(k => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
}

/** Regras entre campos que os validadores do DTO não apanham. */
export function validateSettings(s: LeaveSettings): void {
  if (s.workWeekDays.length === 0) {
    throw new BadRequestException('A semana de trabalho tem de ter pelo menos um dia útil');
  }
  if (!!s.vacationWindowStart !== !!s.vacationWindowEnd) {
    throw new BadRequestException('Indique o início e o fim do período de férias, ou nenhum');
  }
  if (s.workdayEnd <= s.workdayStart) {
    throw new BadRequestException('O fim do horário tem de ser posterior ao início');
  }
  const clash = s.justifiedOccurrenceTypes.filter(t => s.unjustifiedOccurrenceTypes.includes(t));
  if (clash.length > 0) {
    throw new BadRequestException(
      `Uma ocorrência não pode ser justificada e injustificada ao mesmo tempo: ${clash.join(', ')}`,
    );
  }
}

@Injectable()
export class LeaveSettingsService implements OnModuleInit {
  private readonly logger = new Logger(LeaveSettingsService.name);
  private cache: { at: number; value: LeaveSettings; effectiveFrom: Date | null } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    setLeaveCalendarLoader(() => this.reloadCalendar());
    await this.reloadCalendar().catch((e: unknown) =>
      this.logger.warn({
        action: 'LEAVE_CALENDAR_BOOT',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Não foi possível carregar o calendário de Leave — a usar feriados de base',
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // CONFIGURAÇÕES (versionadas)
  // ══════════════════════════════════════════════════════════════════

  /** Valores em vigor agora (cache curto — é lido em cada pedido). */
  async current(): Promise<LeaveSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const active = await this.activeVersion(new Date());
    const value = mergeSettings(active?.values);
    this.cache = { at: Date.now(), value, effectiveFrom: active?.effectiveFrom ?? null };
    return value;
  }

  private activeVersion(at: Date) {
    // Primário (não réplica): a seguir a uma gravação a leitura tem de ver a nova versão.
    return this.prisma.leaveSettingVersion.findFirst({
      where: { effectiveFrom: { lte: at } },
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
    });
  }

  async overview() {
    const now = new Date();
    const [active, upcoming] = await Promise.all([
      this.activeVersion(now),
      this.prisma.leaveSettingVersion.findFirst({
        where: { effectiveFrom: { gt: now } },
        orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      settings: mergeSettings(active?.values),
      effectiveFrom: active?.effectiveFrom ?? null,
      versionId: active?.id ?? null,
      upcoming: upcoming
        ? {
            versionId: upcoming.id,
            effectiveFrom: upcoming.effectiveFrom,
            changeNote: upcoming.changeNote,
            changedKeys: diffSettings(
              mergeSettings(active?.values),
              mergeSettings(upcoming.values),
            ),
          }
        : null,
      defaults: DEFAULT_LEAVE_SETTINGS,
    };
  }

  async history(limit = 50) {
    const rows = await this.prisma.leaveSettingVersion.findMany({
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const authors = await this.prisma.read.user.findMany({
      where: { id: { in: [...new Set(rows.map(r => r.createdById))] } },
      select: { id: true, fullName: true },
    });
    const name = new Map(authors.map(a => [a.id, a.fullName]));
    const now = Date.now();
    return rows.slice(0, limit).map((r, i) => {
      const prev = rows[i + 1];
      const values = mergeSettings(r.values);
      return {
        id: r.id,
        effectiveFrom: r.effectiveFrom,
        createdAt: r.createdAt,
        createdById: r.createdById,
        createdByName: name.get(r.createdById) ?? null,
        changeNote: r.changeNote,
        scheduled: r.effectiveFrom.getTime() > now,
        // Primeira versão: tudo o que difere dos valores por omissão.
        changedKeys: diffSettings(
          prev ? mergeSettings(prev.values) : DEFAULT_LEAVE_SETTINGS,
          values,
        ),
        values,
      };
    });
  }

  async update(dto: UpdateLeaveSettingsDto, actorId: number) {
    const { effectiveFrom, changeNote, ...changes } = dto;
    if (!changeNote?.trim()) throw new BadRequestException('Indique o motivo da alteração');

    const from = effectiveFrom ? toDateOnly(effectiveFrom) : new Date();
    if (from.getTime() - Date.now() > MAX_FUTURE_DAYS * DAY_MS) {
      throw new BadRequestException('A data de entrada em vigor está demasiado longe');
    }

    // Base = a versão que estará em vigor nessa data, para que uma alteração
    // agendada não perca alterações anteriores já agendadas para antes dela.
    const base = mergeSettings((await this.activeVersion(from))?.values);
    const next: LeaveSettings = { ...base };
    for (const k of SETTING_KEYS) {
      const v = (changes as Record<string, unknown>)[k];
      if (v !== undefined) (next as unknown as Record<string, unknown>)[k] = v;
    }
    validateSettings(next);

    const changedKeys = diffSettings(base, next);
    if (changedKeys.length === 0) {
      throw new BadRequestException('Nenhuma configuração foi alterada');
    }

    const created = await this.prisma.leaveSettingVersion.create({
      data: {
        effectiveFrom: from,
        values: next as unknown as Prisma.InputJsonValue,
        changeNote: changeNote.trim(),
        createdById: actorId,
      },
    });
    this.cache = null;
    await this.reloadCalendar();
    await this.audit.log({
      action: 'LEAVE_SETTINGS_CHANGED',
      entityType: 'LeaveSettingVersion',
      entityId: created.id,
      userId: actorId,
      metadata: { changedKeys, effectiveFrom: from.toISOString(), changeNote: changeNote.trim() },
    });
    return this.overview();
  }

  // ══════════════════════════════════════════════════════════════════
  // FERIADOS POR LOCALIZAÇÃO
  // ══════════════════════════════════════════════════════════════════

  /** Recarrega feriados e semana de trabalho para o registo em memória. */
  async reloadCalendar(): Promise<void> {
    const [rows, settings] = await Promise.all([
      this.prisma.leaveHoliday.findMany(),
      this.current(),
    ]);
    configureLeaveCalendar({
      workWeekDays: settings.workWeekDays,
      holidays: rows.map(r => ({
        date: r.date.toISOString().slice(0, 10),
        name: r.name,
        location: r.location,
        recurring: r.recurring,
        active: r.active,
      })),
    });
  }

  async listHolidays(year: number, location?: string) {
    const rows = await this.prisma.leaveHoliday.findMany({
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    const custom = rows.map(r => ({ ...r, date: r.date.toISOString().slice(0, 10) }));
    const customKeys = new Map<string, string>();
    for (const r of custom) {
      if (!r.active) continue;
      const loc = r.location?.trim().toLowerCase() || '';
      if (loc && loc !== (location?.trim().toLowerCase() || '')) continue;
      customKeys.set(r.recurring ? `${year}-${r.date.slice(5)}` : r.date, r.name);
    }
    const effective = [...holidaysForYear(year, location).entries()]
      .map(([date, name]) => ({
        date,
        name,
        source: customKeys.has(date) ? ('CUSTOM' as const) : ('BASE' as const),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return { year, location: location ?? null, effective, custom };
  }

  async listLocations() {
    const rows = await this.prisma.read.user.findMany({
      where: { workLocation: { not: null } },
      select: { workLocation: true },
      distinct: ['workLocation'],
      orderBy: { workLocation: 'asc' },
    });
    return rows.map(r => r.workLocation).filter((l): l is string => !!l?.trim());
  }

  async createHoliday(dto: CreateLeaveHolidayDto, actorId: number) {
    const date = toDateOnly(dto.date);
    const location = dto.location?.trim() || null;
    const clash = await this.prisma.leaveHoliday.findFirst({ where: { date, location } });
    if (clash)
      throw new ConflictException('Já existe um feriado configurado nessa data e localização');
    const row = await this.prisma.leaveHoliday.create({
      data: {
        name: dto.name.trim(),
        date,
        location,
        recurring: dto.recurring ?? false,
        active: dto.active ?? true,
        createdById: actorId,
      },
    });
    await this.reloadCalendar();
    await this.audit.log({
      action: 'LEAVE_HOLIDAY_CREATED',
      entityType: 'LeaveHoliday',
      entityId: row.id,
      userId: actorId,
      metadata: { date: dto.date, location, name: row.name, active: row.active },
    });
    return row;
  }

  async updateHoliday(id: number, dto: UpdateLeaveHolidayDto, actorId: number) {
    const found = await this.prisma.leaveHoliday.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Feriado não encontrado');
    const date = dto.date ? toDateOnly(dto.date) : found.date;
    const location = dto.location !== undefined ? dto.location.trim() || null : found.location;
    const clash = await this.prisma.leaveHoliday.findFirst({
      where: { date, location, id: { not: id } },
    });
    if (clash)
      throw new ConflictException('Já existe um feriado configurado nessa data e localização');
    const row = await this.prisma.leaveHoliday.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        date,
        location,
        recurring: dto.recurring,
        active: dto.active,
      },
    });
    await this.reloadCalendar();
    await this.audit.log({
      action: 'LEAVE_HOLIDAY_UPDATED',
      entityType: 'LeaveHoliday',
      entityId: id,
      userId: actorId,
      metadata: { before: found, after: row },
    });
    return row;
  }

  async deleteHoliday(id: number, actorId: number) {
    const found = await this.prisma.leaveHoliday.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Feriado não encontrado');
    await this.prisma.leaveHoliday.delete({ where: { id } });
    await this.reloadCalendar();
    await this.audit.log({
      action: 'LEAVE_HOLIDAY_DELETED',
      entityType: 'LeaveHoliday',
      entityId: id,
      userId: actorId,
      metadata: { name: found.name, date: found.date.toISOString().slice(0, 10) },
    });
    return { message: 'Feriado removido' };
  }

  // ══════════════════════════════════════════════════════════════════
  // DELEGAÇÕES (substituição de aprovadores)
  // ══════════════════════════════════════════════════════════════════

  async listDelegations(viewer: CurrentUserData, onlyActive = true) {
    const orgWide = isPrivileged(viewer, [Role.ADMIN, Role.RH]);
    const rows = await this.prisma.leaveDelegation.findMany({
      where: {
        ...(onlyActive
          ? { active: true, endDate: { gte: toDateOnly(new Date().toISOString()) } }
          : {}),
        ...(orgWide ? {} : { OR: [{ delegatorId: viewer.id }, { delegateId: viewer.id }] }),
      },
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const people = await this.prisma.read.user.findMany({
      where: { id: { in: [...new Set(rows.flatMap(r => [r.delegatorId, r.delegateId]))] } },
      select: { id: true, fullName: true },
    });
    const name = new Map(people.map(p => [p.id, p.fullName]));
    return rows.map(r => ({
      ...r,
      delegatorName: name.get(r.delegatorId) ?? null,
      delegateName: name.get(r.delegateId) ?? null,
    }));
  }

  async createDelegation(dto: CreateLeaveDelegationDto, viewer: CurrentUserData) {
    const delegatorId = dto.delegatorId ?? viewer.id;
    if (delegatorId !== viewer.id && !isPrivileged(viewer, [Role.ADMIN, Role.RH])) {
      throw new ForbiddenException('Só ADMIN/RH criam delegações em nome de outro aprovador');
    }
    if (dto.delegateId === delegatorId) {
      throw new BadRequestException('O substituto tem de ser outro utilizador');
    }
    const startDate = toDateOnly(dto.startDate);
    const endDate = toDateOnly(dto.endDate);
    if (endDate < startDate) throw new BadRequestException('A data de fim é anterior ao início');
    const delegate = await this.prisma.read.user.findUnique({
      where: { id: dto.delegateId },
      select: { id: true, hrStatus: true },
    });
    if (!delegate || delegate.hrStatus === 'TERMINATED') {
      throw new NotFoundException('Substituto não encontrado');
    }
    const overlap = await this.prisma.leaveDelegation.findFirst({
      where: {
        delegatorId,
        active: true,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) throw new ConflictException('Já existe uma delegação activa nesse período');

    const row = await this.prisma.leaveDelegation.create({
      data: {
        delegatorId,
        delegateId: dto.delegateId,
        startDate,
        endDate,
        reason: dto.reason?.trim() || null,
        createdById: viewer.id,
      },
    });
    await this.audit.log({
      action: 'LEAVE_DELEGATION_CREATED',
      entityType: 'LeaveDelegation',
      entityId: row.id,
      userId: viewer.id,
      metadata: { delegatorId, delegateId: dto.delegateId, from: dto.startDate, to: dto.endDate },
    });
    return row;
  }

  async revokeDelegation(id: number, viewer: CurrentUserData) {
    const found = await this.prisma.leaveDelegation.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Delegação não encontrada');
    if (found.delegatorId !== viewer.id && !isPrivileged(viewer, [Role.ADMIN, Role.RH])) {
      throw new ForbiddenException('Sem permissão para revogar esta delegação');
    }
    await this.prisma.leaveDelegation.update({ where: { id }, data: { active: false } });
    await this.audit.log({
      action: 'LEAVE_DELEGATION_REVOKED',
      entityType: 'LeaveDelegation',
      entityId: id,
      userId: viewer.id,
    });
    return { message: 'Delegação revogada' };
  }

  /** Substituto activo do aprovador nesta data, ou null. */
  async activeDelegateOf(approverId: number, at = new Date()): Promise<number | null> {
    const day = toDateOnly(at.toISOString());
    const row = await this.prisma.leaveDelegation.findFirst({
      where: {
        delegatorId: approverId,
        active: true,
        startDate: { lte: day },
        endDate: { gte: day },
      },
      orderBy: { id: 'desc' },
      select: { delegateId: true },
    });
    return row?.delegateId ?? null;
  }
}

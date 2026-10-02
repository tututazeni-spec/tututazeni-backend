// src/executive-reports/executive-reports.scheduler.service.ts
// Relatórios agendados (docs §8): periodicidade, destinatários, formato, hora e
// estado. A execução reclama o agendamento de forma atómica (sem duplicados com
// várias instâncias — §12.10), revalida as permissões dos destinatários no
// momento da entrega e regista cada execução, incluindo falhas.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CurrentUserData } from '../common/decorators';
import {
  ExecutiveReportsGenerationService,
  type ReportSpec,
} from './executive-reports.generation.service';
import { SECTION_CATALOG } from './executive-reports.templates';
import type { ExecutiveFiltersDto } from './dto/executive-filters.dto';
import type { CreateScheduleDto, UpdateScheduleDto } from './dto/executive-generation.dto';

type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

const FULL_ROLES = ['ADMIN', 'RH', 'DIRECTOR'];
const RESTRICTED_ROLES = ['ADMIN', 'DIRECTOR'];
const BATCH = 20;

interface TimingFields {
  frequency: Frequency;
  hour: number;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
}

/** Próxima execução estritamente depois de `from` (hora local do servidor). */
export function computeNextRun(t: TimingFields, from: Date = new Date()): Date {
  const at = (y: number, m: number, d: number) => new Date(y, m, d, t.hour, 0, 0, 0);
  const dom = t.dayOfMonth ?? 1;

  if (t.frequency === 'WEEKLY') {
    const dow = t.dayOfWeek ?? 1;
    const d = at(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
    if (d <= from) d.setDate(d.getDate() + 7);
    return d;
  }
  if (t.frequency === 'MONTHLY') {
    let d = at(from.getFullYear(), from.getMonth(), dom);
    if (d <= from) d = at(from.getFullYear(), from.getMonth() + 1, dom);
    return d;
  }
  if (t.frequency === 'QUARTERLY') {
    const q = Math.floor(from.getMonth() / 3) * 3;
    let d = at(from.getFullYear(), q, dom);
    if (d <= from) d = at(from.getFullYear(), q + 3, dom);
    return d;
  }
  let d = at(from.getFullYear(), 0, dom);
  if (d <= from) d = at(from.getFullYear() + 1, 0, dom);
  return d;
}

/** Último período fechado da periodicidade (a 1 do mês, o relatório mensal cobre o mês anterior). */
export function lastClosedPeriod(freq: Frequency, now: Date = new Date()): ExecutiveFiltersDto {
  const iso = (d: Date) => d.toISOString();
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  let start: Date;
  let end: Date;
  if (freq === 'WEEKLY') {
    end = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
  } else if (freq === 'MONTHLY') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
  } else if (freq === 'QUARTERLY') {
    const q = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), q - 3, 1);
    end = endOfDay(new Date(now.getFullYear(), q, 0));
  } else {
    start = new Date(now.getFullYear() - 1, 0, 1);
    end = endOfDay(new Date(now.getFullYear() - 1, 11, 31));
  }
  return { period: 'custom', dateFrom: iso(start), dateTo: iso(end), compareWith: 'previous' };
}

@Injectable()
export class ExecutiveReportsSchedulerService {
  private readonly logger = new Logger(ExecutiveReportsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: ExecutiveReportsGenerationService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async list() {
    return this.prisma.read.executiveReportSchedule.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        runs: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });
  }

  async getOne(id: number) {
    const s = await this.prisma.read.executiveReportSchedule.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        runs: { orderBy: { startedAt: 'desc' }, take: 30 },
      },
    });
    if (!s) throw new NotFoundException('Agendamento não encontrado');
    return s;
  }

  private async assertRecipients(ids: number[]) {
    const unique = [...new Set(ids)];
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, active: true, fullName: true, role: { select: { name: true } } },
    });
    const problems: string[] = [];
    for (const id of unique) {
      const u = users.find(x => x.id === id);
      if (!u || !u.active) problems.push(`#${id} inexistente ou inactivo`);
      else if (!FULL_ROLES.includes(u.role?.name ?? '')) {
        problems.push(`${u.fullName} não tem perfil com acesso a relatórios executivos`);
      }
    }
    if (problems.length > 0)
      throw new BadRequestException(`Destinatários inválidos: ${problems.join('; ')}`);
    return unique;
  }

  async create(user: CurrentUserData, dto: CreateScheduleDto) {
    if (!dto.templateCode && !dto.templateId) {
      throw new BadRequestException('Indique templateCode ou templateId');
    }
    const { def } = await this.generation.resolveSpec(dto);
    if (def && !this.generation.canUseTemplate(def, user.role?.name ?? '')) {
      throw new ForbiddenException('Sem permissão para usar este modelo');
    }
    const recipientIds = await this.assertRecipients(dto.recipientIds);
    const timing: TimingFields = {
      frequency: dto.frequency,
      hour: dto.hour ?? 8,
      dayOfWeek: dto.frequency === 'WEEKLY' ? (dto.dayOfWeek ?? 1) : null,
      dayOfMonth: dto.frequency === 'WEEKLY' ? null : (dto.dayOfMonth ?? 1),
    };
    return this.prisma.executiveReportSchedule.create({
      data: {
        name: dto.name,
        templateCode: dto.templateId ? null : dto.templateCode,
        templateId: dto.templateId,
        ...timing,
        format: dto.format,
        filters: (dto.filters ?? null) as unknown as Prisma.InputJsonValue,
        recipientIds,
        active: dto.active ?? true,
        nextRunAt: computeNextRun(timing),
        createdById: user.id,
      },
    });
  }

  async update(id: number, user: CurrentUserData, dto: UpdateScheduleDto) {
    const s = await this.getOne(id);
    this.assertOwner(s.createdById, user);
    const timing: TimingFields = {
      frequency: dto.frequency ?? s.frequency,
      hour: dto.hour ?? s.hour,
      dayOfWeek: s.dayOfWeek,
      dayOfMonth: s.dayOfMonth,
    };
    if (timing.frequency === 'WEEKLY') {
      timing.dayOfWeek = dto.dayOfWeek ?? s.dayOfWeek ?? 1;
      timing.dayOfMonth = null;
    } else {
      timing.dayOfMonth = dto.dayOfMonth ?? s.dayOfMonth ?? 1;
      timing.dayOfWeek = null;
    }
    const recipientIds = dto.recipientIds
      ? await this.assertRecipients(dto.recipientIds)
      : undefined;
    const timingChanged =
      dto.frequency !== undefined ||
      dto.hour !== undefined ||
      dto.dayOfWeek !== undefined ||
      dto.dayOfMonth !== undefined;
    const reactivated = dto.active === true && !s.active;

    return this.prisma.executiveReportSchedule.update({
      where: { id },
      data: {
        name: dto.name,
        format: dto.format,
        recipientIds,
        active: dto.active,
        ...(dto.filters !== undefined
          ? { filters: dto.filters as unknown as Prisma.InputJsonValue }
          : {}),
        ...(timingChanged || reactivated ? { ...timing, nextRunAt: computeNextRun(timing) } : {}),
      },
    });
  }

  async remove(id: number, user: CurrentUserData) {
    const s = await this.getOne(id);
    this.assertOwner(s.createdById, user);
    // Os relatórios gerados ficam no arquivo (scheduleId passa a null).
    await this.prisma.executiveReportSchedule.delete({ where: { id } });
    return { message: 'Agendamento eliminado' };
  }

  private assertOwner(createdById: number, user: CurrentUserData) {
    if (createdById !== user.id && !RESTRICTED_ROLES.includes(user.role?.name ?? '')) {
      throw new ForbiddenException('Só o autor ou ADMIN/DIRECTOR podem alterar este agendamento');
    }
  }

  // ─── Execução ─────────────────────────────────────────────────────────────

  @Cron('*/15 * * * *')
  async runDue() {
    const due = await this.prisma.executiveReportSchedule.findMany({
      where: { active: true, nextRunAt: { lte: new Date() } },
      orderBy: { nextRunAt: 'asc' },
      take: BATCH,
    });
    for (const s of due) {
      const next = computeNextRun(
        {
          frequency: s.frequency,
          hour: s.hour,
          dayOfWeek: s.dayOfWeek,
          dayOfMonth: s.dayOfMonth,
        },
        new Date(),
      );
      // Reclamação atómica: só a instância que avança nextRunAt executa.
      const claim = await this.prisma.executiveReportSchedule.updateMany({
        where: { id: s.id, active: true, nextRunAt: s.nextRunAt },
        data: { nextRunAt: next },
      });
      if (claim.count !== 1) continue;
      await this.execute(s.id).catch((e: unknown) =>
        this.logger.error({
          action: 'EXECUTIVE_SCHEDULE_RUN',
          scheduleId: s.id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Erro inesperado na execução do agendamento',
        }),
      );
    }
    return { processed: due.length };
  }

  /** Execução manual ("Executar agora") — não altera a próxima execução prevista. */
  async runNow(id: number, user: CurrentUserData) {
    const s = await this.getOne(id);
    this.assertOwner(s.createdById, user);
    return this.execute(id);
  }

  private async execute(id: number) {
    const s = await this.prisma.executiveReportSchedule.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, active: true, role: { select: { name: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Agendamento não encontrado');
    const run = await this.prisma.executiveReportScheduleRun.create({
      data: { scheduleId: id, status: 'RUNNING' },
    });

    try {
      if (!s.createdBy.active || !FULL_ROLES.includes(s.createdBy.role?.name ?? '')) {
        throw new Error('O autor do agendamento já não tem permissão para gerar este relatório');
      }
      const author = {
        id: s.createdBy.id,
        role: { name: s.createdBy.role?.name ?? '' },
      } as unknown as CurrentUserData;

      const { spec } = await this.generation.resolveSpec({
        templateCode: s.templateCode,
        templateId: s.templateId,
      });
      const filters = (s.filters as ExecutiveFiltersDto | null) ?? lastClosedPeriod(s.frequency);
      const report = await this.generation.run(author, spec as ReportSpec, {
        scheduleId: id,
        filters,
        title: undefined,
      });

      const { delivered, rejected } = await this.deliver(
        s.recipientIds,
        report.id,
        report.title,
        spec.sections.map(k => SECTION_CATALOG[k]),
        s.format,
      );

      const status =
        delivered.length === 0 ? 'NO_RECIPIENTS' : rejected.length ? 'PARTIAL' : 'SUCCESS';
      await this.prisma.executiveReportScheduleRun.update({
        where: { id: run.id },
        data: { status, finishedAt: new Date(), reportId: report.id, delivered, rejected },
      });
      await this.prisma.executiveReportSchedule.update({
        where: { id },
        data: {
          lastRunAt: new Date(),
          lastStatus: status,
          lastError: null,
          lastReportId: report.id,
        },
      });
      return { runId: run.id, reportId: report.id, status, delivered, rejected };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.executiveReportScheduleRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message.slice(0, 1000) },
      });
      await this.prisma.executiveReportSchedule.update({
        where: { id },
        data: { lastRunAt: new Date(), lastStatus: 'FAILED', lastError: message.slice(0, 1000) },
      });
      await this.notifications
        .sendToUser(s.createdById, {
          title: 'Falha no relatório agendado',
          message: `O agendamento "${s.name}" falhou: ${message}`,
          type: 'EXECUTIVE_REPORT_FAILED',
          metadata: { scheduleId: id },
        })
        .catch(() => undefined);
      return { runId: run.id, status: 'FAILED', error: message };
    }
  }

  /**
   * Revalida cada destinatário no momento da entrega (§8): activo, perfil com
   * acesso e, se o relatório tiver secções restritas, perfil ADMIN/DIRECTOR.
   */
  private async deliver(
    recipientIds: number[],
    reportId: number,
    title: string,
    sections: (typeof SECTION_CATALOG)[keyof typeof SECTION_CATALOG][],
    format: string,
  ) {
    const needsRestricted = sections.some(s => s.restricted);
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, active: true, role: { select: { name: true } } },
    });
    const delivered: number[] = [];
    const rejected: number[] = [];
    for (const id of recipientIds) {
      const u = users.find(x => x.id === id);
      const role = u?.role?.name ?? '';
      const ok =
        !!u?.active &&
        FULL_ROLES.includes(role) &&
        (!needsRestricted || RESTRICTED_ROLES.includes(role));
      if (!ok) {
        rejected.push(id);
        continue;
      }
      try {
        await this.notifications.sendToUser(id, {
          title: 'Relatório executivo disponível',
          message: `${title} (${format})`,
          type: 'EXECUTIVE_REPORT',
          metadata: {
            reportId,
            format,
            link: `/executive-reports?tab=history&reportId=${reportId}`,
          },
        });
        delivered.push(id);
      } catch (e) {
        this.logger.warn({
          action: 'EXECUTIVE_REPORT_DELIVERY',
          recipientId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao entregar relatório agendado',
        });
        rejected.push(id);
      }
    }
    return { delivered, rejected };
  }
}

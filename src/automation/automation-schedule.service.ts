// src/automation/automation-schedule.service.ts
// Agendamentos (docs/modulo_automation.md §6): execuções programadas de uma
// automação por data, hora, periodicidade ou cron, com política para
// execuções perdidas durante períodos de indisponibilidade.

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationService } from './automation.service';
import { CreateScheduleDto, ScheduleFilterDto, UpdateScheduleDto } from './automation.dto';
import {
  computeNextRun,
  isValidTimezone,
  parseCron,
  parseTime,
  previewRuns,
  ScheduleSpec,
} from './automation-schedule.util';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

/** Atraso a partir do qual uma execução conta como "perdida" (a aplicação esteve parada). */
const MISSED_GRACE_MS = 5 * 60_000;
/** Máximo de execuções recuperadas de uma só vez na política RUN_ALL. */
const MAX_CATCH_UP = 24;
const DUE_BATCH = 50;

type ScheduleRow = Prisma.AutomationScheduleGetPayload<object>;

const parseDays = (json?: string | null): number[] | null => {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.map(Number) : null;
  } catch {
    return null;
  }
};

const toSpec = (s: ScheduleRow): ScheduleSpec => ({
  type: s.type,
  startDate: s.startDate,
  endDate: s.endDate,
  time: s.time,
  timezone: s.timezone,
  daysOfWeek: parseDays(s.daysOfWeek),
  dayOfMonth: s.dayOfMonth,
  cronExpression: s.cronExpression,
});

@Injectable()
export class AutomationScheduleService {
  private readonly logger = new Logger(AutomationScheduleService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
  ) {}

  // ─── Validação ────────────────────────────────────────────────

  private buildSpec(input: {
    type: string;
    startDate: string | Date;
    endDate?: string | Date | null;
    time: string;
    timezone?: string | null;
    daysOfWeek?: number[] | null;
    dayOfMonth?: number | null;
    cronExpression?: string | null;
  }): ScheduleSpec {
    const timezone = input.timezone || 'Africa/Luanda';
    if (!isValidTimezone(timezone))
      throw new BadRequestException(`Fuso horário "${timezone}" inválido`);
    if (!parseTime(input.time))
      throw new BadRequestException('A hora tem de estar no formato HH:mm');
    const startDate = new Date(input.startDate);
    const endDate = input.endDate ? new Date(input.endDate) : null;
    if (endDate && endDate < startDate) {
      throw new BadRequestException('A data de fim é anterior à data de início');
    }
    if (input.type === 'WEEKLY' && !input.daysOfWeek?.length) {
      throw new BadRequestException('Escolha pelo menos um dia da semana');
    }
    if (input.type === 'MONTHLY' && !input.dayOfMonth) {
      throw new BadRequestException('Indique o dia do mês');
    }
    if (input.type === 'CUSTOM' && !(input.cronExpression && parseCron(input.cronExpression))) {
      throw new BadRequestException(
        'Expressão cron inválida (5 campos: minuto hora dia-do-mês mês dia-da-semana)',
      );
    }
    return {
      type: input.type,
      startDate,
      endDate,
      time: input.time,
      timezone,
      daysOfWeek: input.daysOfWeek ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      cronExpression: input.cronExpression ?? null,
    };
  }

  private async assertRule(ruleId: number) {
    const rule = await this.prisma.read.automationRule.findUnique({
      where: { id: ruleId },
      select: { id: true },
    });
    if (!rule) throw new NotFoundException('Automação não encontrada');
  }

  // ─── CRUD ─────────────────────────────────────────────────────

  async list(f: ScheduleFilterDto = {}) {
    const { page = 1, limit = 30, status, type, ruleId, search } = f;
    const where: Prisma.AutomationScheduleWhereInput = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(ruleId ? { ruleId } : {}),
      ...(search?.trim() ? { name: { contains: search.trim(), mode: 'insensitive' } } : {}),
    };
    const { skip, take } = calculatePagination(page, limit);
    const [rows, total] = await Promise.all([
      this.prisma.read.automationSchedule.findMany({
        where,
        orderBy: [{ status: 'asc' }, { nextRunAt: 'asc' }],
        skip,
        take,
        include: {
          rule: {
            select: { id: true, name: true, code: true, module: true, active: true, draft: true },
          },
        },
      }),
      this.prisma.read.automationSchedule.count({ where }),
    ]);

    const ownerIds = [...new Set(rows.map(r => r.ownerId ?? r.createdBy))]
      .filter((v): v is string => !!v && /^\d+$/.test(v))
      .map(Number);
    const owners = ownerIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const ownerName = new Map(owners.map(u => [String(u.id), u.fullName]));

    return buildPaginatedResponse(
      rows.map(r => ({
        ...r,
        daysOfWeek: parseDays(r.daysOfWeek),
        ownerName: ownerName.get(r.ownerId ?? r.createdBy ?? '') ?? null,
      })),
      total,
      page,
      limit,
    );
  }

  async get(id: string) {
    const row = await this.prisma.read.automationSchedule.findUnique({
      where: { id },
      include: {
        rule: { select: { id: true, name: true, code: true, active: true, draft: true } },
      },
    });
    if (!row) throw new NotFoundException('Agendamento não encontrado');
    return {
      ...row,
      daysOfWeek: parseDays(row.daysOfWeek),
      upcoming: row.status === 'ACTIVE' ? previewRuns(toSpec(row), 5) : [],
    };
  }

  async create(dto: CreateScheduleDto, userId: number) {
    await this.assertRule(dto.ruleId);
    const spec = this.buildSpec(dto);
    const nextRunAt = computeNextRun(spec, new Date());
    if (!nextRunAt) {
      throw new BadRequestException(
        spec.type === 'ONCE'
          ? 'A data e hora da execução única já passaram'
          : 'Este agendamento não tem nenhuma execução futura',
      );
    }
    return this.prisma.automationSchedule.create({
      data: {
        ruleId: dto.ruleId,
        name: dto.name,
        type: dto.type,
        startDate: spec.startDate,
        endDate: spec.endDate,
        time: dto.time,
        timezone: spec.timezone,
        daysOfWeek: dto.daysOfWeek ? JSON.stringify(dto.daysOfWeek) : null,
        dayOfMonth: dto.dayOfMonth,
        cronExpression: dto.cronExpression,
        missedPolicy: dto.missedPolicy ?? 'RUN_ONCE',
        nextRunAt,
        ownerId: dto.ownerId ?? String(userId),
        createdBy: String(userId),
      },
    });
  }

  async update(id: string, dto: UpdateScheduleDto) {
    const current = await this.prisma.automationSchedule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Agendamento não encontrado');
    if (dto.ruleId && dto.ruleId !== current.ruleId) await this.assertRule(dto.ruleId);

    const merged = {
      type: dto.type ?? current.type,
      startDate: dto.startDate ?? current.startDate,
      endDate: dto.endDate ?? current.endDate,
      time: dto.time ?? current.time,
      timezone: dto.timezone ?? current.timezone,
      daysOfWeek: dto.daysOfWeek ?? parseDays(current.daysOfWeek),
      dayOfMonth: dto.dayOfMonth ?? current.dayOfMonth,
      cronExpression: dto.cronExpression ?? current.cronExpression,
    };
    const spec = this.buildSpec(merged);
    const nextRunAt = computeNextRun(spec, new Date());
    // Reabre um agendamento concluído se a nova configuração voltar a ter execuções futuras.
    const status = current.status === 'PAUSED' ? 'PAUSED' : nextRunAt ? 'ACTIVE' : 'COMPLETED';
    return this.prisma.automationSchedule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.ruleId !== undefined ? { ruleId: dto.ruleId } : {}),
        type: merged.type,
        startDate: spec.startDate,
        endDate: spec.endDate,
        time: merged.time,
        timezone: spec.timezone,
        daysOfWeek: merged.daysOfWeek ? JSON.stringify(merged.daysOfWeek) : null,
        dayOfMonth: merged.dayOfMonth,
        cronExpression: merged.cronExpression,
        ...(dto.missedPolicy !== undefined ? { missedPolicy: dto.missedPolicy } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
        nextRunAt,
        status,
        lastError: null,
      },
    });
  }

  async pause(id: string) {
    const row = await this.prisma.automationSchedule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Agendamento não encontrado');
    return this.prisma.automationSchedule.update({ where: { id }, data: { status: 'PAUSED' } });
  }

  /** Retoma um agendamento. As ocorrências durante a pausa não são recuperadas. */
  async resume(id: string) {
    const row = await this.prisma.automationSchedule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Agendamento não encontrado');
    const nextRunAt = computeNextRun(toSpec(row), new Date());
    return this.prisma.automationSchedule.update({
      where: { id },
      data: { status: nextRunAt ? 'ACTIVE' : 'COMPLETED', nextRunAt, lastError: null },
    });
  }

  async remove(id: string) {
    const row = await this.prisma.automationSchedule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Agendamento não encontrado');
    await this.prisma.automationSchedule.delete({ where: { id } });
    return { message: 'Agendamento removido' };
  }

  /** Pré-visualização das próximas ocorrências antes de guardar (formulário). */
  preview(
    dto:
      CreateScheduleDto | (UpdateScheduleDto & { type: string; startDate: string; time: string }),
    count = 5,
  ) {
    const spec = this.buildSpec(dto);
    return { runs: previewRuns(spec, Math.min(Math.max(count, 1), 20)), timezone: spec.timezone };
  }

  /** Executa já, sem alterar a próxima ocorrência. */
  async runNow(id: string, userId: number) {
    const row = await this.prisma.automationSchedule.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Agendamento não encontrado');
    return this.runOne(row, new Date(), userId, `manual:${Date.now()}`);
  }

  // ─── Execução periódica ───────────────────────────────────────

  @Cron('* * * * *')
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (e: unknown) {
      this.logger.error({
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha no ciclo dos agendamentos de automação',
      });
    } finally {
      this.running = false;
    }
  }

  /** Um ciclo completo (público para testes / execução manual). */
  async run(now = new Date()) {
    const schedules = await this.runDue(now);
    const resumed = await this.automation.resumeDueFlows();
    return { schedules, ...resumed };
  }

  async runDue(now = new Date()) {
    const due = await this.prisma.automationSchedule.findMany({
      where: { status: 'ACTIVE', nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: DUE_BATCH,
    });
    let executed = 0;
    let skipped = 0;
    for (const s of due) {
      if (!s.nextRunAt) continue;
      const spec = toSpec(s);
      const scheduledFor = s.nextRunAt;
      const next = computeNextRun(spec, now);

      // Reclamação atómica: só uma réplica avança a próxima ocorrência.
      const claimed = await this.prisma.automationSchedule.updateMany({
        where: { id: s.id, status: 'ACTIVE', nextRunAt: scheduledFor },
        data: { nextRunAt: next, status: next ? 'ACTIVE' : 'COMPLETED' },
      });
      if (claimed.count === 0) continue;

      const missed = now.getTime() - scheduledFor.getTime() > MISSED_GRACE_MS;
      const occurrences: Date[] = [];
      if (!missed || s.missedPolicy === 'RUN_ONCE') {
        occurrences.push(missed ? now : scheduledFor);
      } else if (s.missedPolicy === 'RUN_ALL') {
        let cursor = new Date(scheduledFor.getTime() - 1);
        while (occurrences.length < MAX_CATCH_UP) {
          const occ = computeNextRun(spec, cursor);
          if (!occ || occ > now) break;
          occurrences.push(occ);
          cursor = occ;
        }
      }
      if (!occurrences.length) {
        skipped++;
        await this.prisma.automationSchedule.update({
          where: { id: s.id },
          data: {
            lastRunStatus: 'SKIPPED',
            lastError: 'Execução perdida ignorada (política SKIP)',
          },
        });
        continue;
      }
      for (const occ of occurrences) {
        await this.runOne(s, occ, undefined, `schedule:${s.id}:${occ.getTime()}`);
        executed++;
      }
    }
    return { due: due.length, executed, skipped };
  }

  private async runOne(s: ScheduleRow, scheduledFor: Date, userId?: number, dedupeKey?: string) {
    const rule = await this.prisma.automationRule.findUnique({ where: { id: s.ruleId } });
    let status: string;
    let error: string | null = null;
    if (!rule) {
      status = 'FAILED';
      error = 'A automação associada já não existe';
    } else if (rule.draft || !rule.active) {
      status = 'SKIPPED';
      error = rule.draft ? 'A automação é um rascunho' : 'A automação está pausada';
    } else {
      try {
        const out = await this.automation.runRule(
          rule.id,
          {
            dedupeKey,
            schedule: { id: s.id, name: s.name, scheduledFor: scheduledFor.toISOString() },
          },
          userId ?? (s.ownerId && /^\d+$/.test(s.ownerId) ? Number(s.ownerId) : undefined),
          { scheduleId: s.id },
        );
        status = out.status;
        if (out.status === 'FAILED') error = out.message ?? 'A execução falhou';
      } catch (e: unknown) {
        status = 'FAILED';
        error = e instanceof Error ? e.message : String(e);
        this.logger.error({
          scheduleId: s.id,
          ruleId: s.ruleId,
          err: { message: error },
          msg: 'Falha ao executar o agendamento',
        });
      }
    }
    await this.prisma.automationSchedule.update({
      where: { id: s.id },
      data: {
        lastRunAt: new Date(),
        lastRunStatus: status,
        lastError: error,
        runCount: { increment: 1 },
      },
    });
    return { status, error };
  }
}

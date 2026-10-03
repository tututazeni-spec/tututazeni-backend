// src/process-standard/process-reports.service.ts
// Aba "Indicadores e Relatórios" (docs/Modulo_Processes.md §12): indicadores
// operacionais com definições explícitas, agrupamento, detalhe dos registos que
// originaram cada indicador e exportação (CSV, Excel, PDF). Só leitura.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { ProcessStandardService } from './process-standard.service';
import {
  buildIndicators,
  groupInstances,
  GroupBy,
  GroupRow,
  INDICATOR_DEFINITIONS,
  indicatorSets,
  OPEN_TASK_STATUSES,
  ReportInstance,
} from './process-reports';
import {
  ProcessReportExportDto,
  ProcessReportFilterDto,
  ProcessReportRecordsDto,
} from './process-standard.dto';

const COHORT_LIMIT = 10_000;
const EXPORT_LIMIT = 5_000;
const OPEN_INSTANCE: Array<'IN_PROGRESS' | 'ON_HOLD'> = ['IN_PROGRESS', 'ON_HOLD'];
const NON_TASK_TYPES = ['START', 'END', 'GATEWAY', 'PARALLEL'] as const;
const user3 = { select: { id: true, fullName: true } } as const;

const INSTANCE_SELECT = {
  id: true,
  code: true,
  title: true,
  status: true,
  priority: true,
  startedAt: true,
  completedAt: true,
  slaDeadline: true,
  sourceModule: true,
  currentResponsible: user3,
  process: {
    select: {
      id: true,
      code: true,
      title: true,
      category: true,
      department: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ProcessInstanceSelect;

export interface ReportRecord {
  kind: 'INSTANCE' | 'TASK' | 'APPROVAL' | 'EXECUTION';
  id: string;
  code: string;
  title: string;
  status: string;
  owner: string | null;
  startedAt: Date | null;
  dueAt: Date | null;
  completedAt: Date | null;
  instanceId: number | null;
  detail: string | null;
}

@Injectable()
export class ProcessReportsService {
  private readonly logger = new Logger(ProcessReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processes: ProcessStandardService,
  ) {}

  // ─── Filtros ──────────────────────────────────────────────────────────────

  private range(f: ProcessReportFilterDto, now: Date) {
    const to = f.to
      ? (() => {
          const d = new Date(f.to);
          if (!f.to.includes('T')) d.setUTCHours(23, 59, 59, 999);
          return d;
        })()
      : now;
    const from = f.from
      ? new Date(f.from)
      : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 5, 1));
    if (from > to) throw new BadRequestException('O intervalo de datas é inválido');
    return { from, to };
  }

  /** Dimensões (sem período): departamento, unidade, modelo, tipo, módulo, prioridade, responsável. */
  private dims(f: ProcessReportFilterDto): Prisma.ProcessInstanceWhereInput {
    const where: Prisma.ProcessInstanceWhereInput = {};
    const process: Prisma.ProcessStandardWhereInput = {};
    if (f.departmentId) process.departmentId = f.departmentId;
    if (f.unitId) process.department = { unitId: f.unitId };
    if (f.category) process.category = f.category;
    if (f.templateId) where.processId = f.templateId;
    if (Object.keys(process).length) where.process = process;
    if (f.sourceModule) where.sourceModule = f.sourceModule;
    if (f.priority) where.priority = f.priority;
    if (f.responsibleId) where.currentResponsibleId = f.responsibleId;
    return where;
  }

  private cohort(
    f: ProcessReportFilterDto,
    from: Date,
    to: Date,
  ): Prisma.ProcessInstanceWhereInput {
    return { ...this.dims(f), startedAt: { gte: from, lte: to } };
  }

  // ─── Carregamento ─────────────────────────────────────────────────────────

  private async load(f: ProcessReportFilterDto, now: Date) {
    const { from, to } = this.range(f, now);
    const where = this.cohort(f, from, to);

    const instances: ReportInstance[] = await this.prisma.read.processInstance.findMany({
      where,
      select: INSTANCE_SELECT,
      orderBy: { startedAt: 'desc' },
      take: COHORT_LIMIT,
    });
    const [steps, approvals, reopened] = await Promise.all([
      this.prisma.read.stepProgress.findMany({
        where: { instance: where, step: { type: { notIn: [...NON_TASK_TYPES] } } },
        select: {
          instanceId: true,
          status: true,
          startedAt: true,
          completedAt: true,
          returnCount: true,
          step: { select: { title: true } },
        },
        take: COHORT_LIMIT * 5,
      }),
      this.prisma.read.processApproval.findMany({
        where: { instance: where },
        select: { instanceId: true, status: true },
        take: COHORT_LIMIT * 5,
      }),
      this.prisma.read.processAuditLog.findMany({
        where: { action: 'STEP_REOPENED', instanceId: { not: null }, createdAt: { gte: from } },
        select: { instanceId: true },
        distinct: ['instanceId'],
      }),
    ]);
    return {
      from,
      to,
      instances,
      steps: steps.map(s => ({
        instanceId: s.instanceId,
        status: s.status,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        returnCount: s.returnCount,
        stepTitle: s.step.title,
      })),
      approvals,
      reopenedInstanceIds: new Set(reopened.map(r => r.instanceId as number)),
      truncated: instances.length >= COHORT_LIMIT,
    };
  }

  // ─── Visão geral ──────────────────────────────────────────────────────────

  async overview(f: ProcessReportFilterDto) {
    const now = new Date();
    const data = await this.load(f, now);
    const dims = this.dims(f);
    const openInstanceWhere: Prisma.ProcessInstanceWhereInput = {
      ...dims,
      status: { in: OPEN_INSTANCE },
      archivedAt: null,
    };
    const openTaskWhere: Prisma.StepProgressWhereInput = {
      status: { in: OPEN_TASK_STATUSES as never },
      step: { type: { notIn: [...NON_TASK_TYPES] } },
      instance: openInstanceWhere,
    };

    const [
      backlogInstances,
      backlogTasks,
      overdueInstances,
      overdueTasks,
      pendingApprovals,
      workloadRows,
      overdueByAssignee,
      executions,
    ] = await Promise.all([
      this.prisma.read.processInstance.count({ where: openInstanceWhere }),
      this.prisma.read.stepProgress.count({ where: openTaskWhere }),
      this.prisma.read.processInstance.count({
        where: { ...dims, status: 'IN_PROGRESS', archivedAt: null, slaDeadline: { lt: now } },
      }),
      this.prisma.read.stepProgress.count({
        where: { ...openTaskWhere, slaDeadline: { lt: now } },
      }),
      this.prisma.read.processApproval.count({
        where: {
          status: { in: ['PENDING', 'INFO_REQUESTED', 'ESCALATED'] },
          instance: { ...dims, status: 'IN_PROGRESS' },
        },
      }),
      this.prisma.read.stepProgress.groupBy({
        by: ['assigneeId'],
        where: { ...openTaskWhere, assigneeId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.read.stepProgress.groupBy({
        by: ['assigneeId'],
        where: { ...openTaskWhere, assigneeId: { not: null }, slaDeadline: { lt: now } },
        _count: { _all: true },
      }),
      this.prisma.read.automationExecution.groupBy({
        by: ['status'],
        where: {
          startedAt: { gte: data.from, lte: data.to },
          rule: { module: 'PROCESSES' },
        },
        _count: { _all: true },
      }),
    ]);

    const assigneeIds = workloadRows.map(w => w.assigneeId).filter((v): v is number => v != null);
    const users = assigneeIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map(u => [u.id, u.fullName]));
    const overdueMap = new Map(overdueByAssignee.map(o => [o.assigneeId, o._count._all]));

    const failed = executions.find(e => e.status === 'FAILED')?._count._all ?? 0;
    const totalExec = executions.reduce((a, e) => a + e._count._all, 0);
    const groupBy = (f.groupBy ?? 'department') as GroupBy;

    return {
      range: { from: data.from, to: data.to },
      truncated: data.truncated,
      indicators: buildIndicators(data, now),
      snapshot: {
        backlogInstances,
        backlogTasks,
        overdueInstances,
        overdueTasks,
        pendingApprovals,
      },
      workload: workloadRows
        .map(w => ({
          assigneeId: w.assigneeId as number,
          fullName: names.get(w.assigneeId as number) ?? `#${w.assigneeId}`,
          open: w._count._all,
          overdue: overdueMap.get(w.assigneeId) ?? 0,
        }))
        .sort((a, b) => b.open - a.open)
        .slice(0, 15),
      automation: {
        total: totalExec,
        failed,
        failureRate: totalExec ? Math.round((failed / totalExec) * 1000) / 10 : null,
      },
      groupBy,
      groups: groupInstances(data.instances, groupBy, now),
      definitions: INDICATOR_DEFINITIONS,
    };
  }

  // ─── Detalhe dos registos ─────────────────────────────────────────────────

  private instanceRecord(i: {
    id: number;
    code: string | null;
    title: string | null;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    slaDeadline: Date | null;
    currentResponsible: { fullName: string } | null;
    process: { title: string };
  }): ReportRecord {
    return {
      kind: 'INSTANCE',
      id: String(i.id),
      code: i.code ?? `PROC-${i.id}`,
      title: i.title ?? i.process.title,
      status: i.status,
      owner: i.currentResponsible?.fullName ?? null,
      startedAt: i.startedAt,
      dueAt: i.slaDeadline,
      completedAt: i.completedAt,
      instanceId: i.id,
      detail: i.process.title,
    };
  }

  async records(f: ProcessReportRecordsDto) {
    const now = new Date();
    const { page = 1, limit = 20 } = f;
    const dims = this.dims(f);
    const openInstanceWhere: Prisma.ProcessInstanceWhereInput = {
      ...dims,
      status: { in: OPEN_INSTANCE },
      archivedAt: null,
    };
    const paged = <T>(rows: T[], total: number) => ({
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
    const skip = (page - 1) * limit;

    switch (f.indicator) {
      case 'overdue': {
        const where: Prisma.ProcessInstanceWhereInput = {
          ...dims,
          status: 'IN_PROGRESS',
          archivedAt: null,
          slaDeadline: { lt: now },
        };
        const [rows, total] = await Promise.all([
          this.prisma.read.processInstance.findMany({
            where,
            select: INSTANCE_SELECT,
            orderBy: { slaDeadline: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.read.processInstance.count({ where }),
        ]);
        return paged(
          rows.map(r => this.instanceRecord(r)),
          total,
        );
      }
      case 'backlogInstances': {
        const [rows, total] = await Promise.all([
          this.prisma.read.processInstance.findMany({
            where: openInstanceWhere,
            select: INSTANCE_SELECT,
            orderBy: { startedAt: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.read.processInstance.count({ where: openInstanceWhere }),
        ]);
        return paged(
          rows.map(r => this.instanceRecord(r)),
          total,
        );
      }
      case 'backlogTasks':
      case 'workload': {
        const where: Prisma.StepProgressWhereInput = {
          status: { in: OPEN_TASK_STATUSES as never },
          step: { type: { notIn: [...NON_TASK_TYPES] } },
          instance: openInstanceWhere,
          ...(f.indicator === 'workload' && f.assigneeId ? { assigneeId: f.assigneeId } : {}),
        };
        const [rows, total] = await Promise.all([
          this.prisma.read.stepProgress.findMany({
            where,
            select: {
              instanceId: true,
              stepId: true,
              status: true,
              startedAt: true,
              slaDeadline: true,
              assignee: user3,
              step: { select: { title: true } },
              instance: {
                select: { code: true, title: true, process: { select: { title: true } } },
              },
            },
            orderBy: [{ slaDeadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
            skip,
            take: limit,
          }),
          this.prisma.read.stepProgress.count({ where }),
        ]);
        return paged(
          rows.map((r): ReportRecord => ({
            kind: 'TASK',
            id: `${r.instanceId}-${r.stepId}`,
            code: r.instance.code ?? `PROC-${r.instanceId}`,
            title: r.step.title,
            status: r.status,
            owner: r.assignee?.fullName ?? null,
            startedAt: r.startedAt,
            dueAt: r.slaDeadline,
            completedAt: null,
            instanceId: r.instanceId,
            detail: r.instance.title ?? r.instance.process.title,
          })),
          total,
        );
      }
      case 'pendingApprovals': {
        const where: Prisma.ProcessApprovalWhereInput = {
          status: { in: ['PENDING', 'INFO_REQUESTED', 'ESCALATED'] },
          instance: { ...dims, status: 'IN_PROGRESS' },
        };
        const [rows, total] = await Promise.all([
          this.prisma.read.processApproval.findMany({
            where,
            select: {
              id: true,
              code: true,
              instanceId: true,
              status: true,
              submittedAt: true,
              dueAt: true,
              approver: user3,
              instance: { select: { title: true, process: { select: { title: true } } } },
            },
            orderBy: { submittedAt: 'asc' },
            skip,
            take: limit,
          }),
          this.prisma.read.processApproval.count({ where }),
        ]);
        return paged(
          rows.map((r): ReportRecord => ({
            kind: 'APPROVAL',
            id: String(r.id),
            code: r.code,
            title: r.instance.title ?? r.instance.process.title,
            status: r.status,
            owner: r.approver?.fullName ?? null,
            startedAt: r.submittedAt,
            dueAt: r.dueAt,
            completedAt: null,
            instanceId: r.instanceId,
            detail: null,
          })),
          total,
        );
      }
      case 'automationFailures': {
        const { from, to } = this.range(f, now);
        const where: Prisma.AutomationExecutionWhereInput = {
          status: 'FAILED',
          startedAt: { gte: from, lte: to },
          rule: { module: 'PROCESSES' },
        };
        const [rows, total] = await Promise.all([
          this.prisma.read.automationExecution.findMany({
            where,
            select: {
              id: true,
              startedAt: true,
              finishedAt: true,
              errorMessage: true,
              attempt: true,
              rule: { select: { name: true, code: true } },
            },
            orderBy: { startedAt: 'desc' },
            skip,
            take: limit,
          }),
          this.prisma.read.automationExecution.count({ where }),
        ]);
        return paged(
          rows.map((r): ReportRecord => ({
            kind: 'EXECUTION',
            id: r.id,
            code: r.rule.code ?? r.rule.name,
            title: r.rule.name,
            status: 'FAILED',
            owner: null,
            startedAt: r.startedAt,
            dueAt: null,
            completedAt: r.finishedAt,
            instanceId: null,
            detail: `${r.errorMessage ?? 'Erro desconhecido'} (tentativa ${r.attempt})`,
          })),
          total,
        );
      }
      default: {
        // Indicadores sobre a coorte do período: total, completed, onTime, late, returned, rejected, reopened.
        const data = await this.load(f, now);
        const sets = indicatorSets(data, now);
        const ids = sets[f.indicator];
        const picked = data.instances.filter(i => ids.has(i.id));
        const slice = picked.slice(skip, skip + limit);
        return paged(
          slice.map(i =>
            this.instanceRecord({
              ...i,
              currentResponsible: i.currentResponsible,
            }),
          ),
          picked.length,
        );
      }
    }
  }

  // ─── Exportação ───────────────────────────────────────────────────────────

  async export(f: ProcessReportExportDto, user: CurrentUserData) {
    const now = new Date();
    const overview = await this.overview(f);
    const { from, to } = overview.range;
    const rows = await this.prisma.read.processInstance.findMany({
      where: this.cohort(f, from, to),
      select: INSTANCE_SELECT,
      orderBy: { startedAt: 'desc' },
      take: EXPORT_LIMIT,
    });
    const stamp = now.toISOString().slice(0, 10);
    const indicatorRows = this.indicatorTable(overview);
    const recordRows = rows.map(r => [
      r.code ?? `PROC-${r.id}`,
      r.title ?? r.process.title,
      r.process.category ?? '',
      r.process.department?.name ?? '',
      r.sourceModule ?? '',
      r.currentResponsible?.fullName ?? '',
      r.priority,
      r.status,
      r.startedAt,
      r.slaDeadline,
      r.completedAt,
    ]);
    const recordHeader = [
      'Código',
      'Nome',
      'Tipo',
      'Departamento',
      'Módulo de origem',
      'Responsável',
      'Prioridade',
      'Estado',
      'Início',
      'Prazo',
      'Conclusão',
    ];

    await this.processes.writeAuditLog({
      userId: user.id,
      action: 'REPORT_EXPORTED',
      meta: { format: f.format, from, to, rows: rows.length, filters: this.describeFilters(f) },
    });

    if (f.format === 'csv') {
      const esc = (v: unknown) => {
        let t = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
        // Evita injecção de fórmulas ao abrir no Excel.
        if (/^[=+\-@]/.test(t)) t = `'${t}`;
        return /[",;\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      };
      const csv = '﻿' + [recordHeader, ...recordRows].map(r => r.map(esc).join(',')).join('\r\n');
      return {
        buffer: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `relatorio-processos-${stamp}.csv`,
      };
    }

    if (f.format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const s1 = wb.addWorksheet('Indicadores');
      s1.columns = [
        { header: 'Indicador', width: 34 },
        { header: 'Valor', width: 18 },
        { header: 'Definição', width: 90 },
      ];
      indicatorRows.forEach(r => s1.addRow(r));
      const s2 = wb.addWorksheet('Agrupamento');
      s2.columns = [
        { header: 'Grupo', width: 40 },
        { header: 'Total', width: 10 },
        { header: 'Concluídos', width: 12 },
        { header: 'Cancelados', width: 12 },
        { header: 'Em atraso', width: 12 },
        { header: 'Taxa de conclusão (%)', width: 22 },
        { header: 'Cumprimento de prazo (%)', width: 24 },
        { header: 'Duração média (h)', width: 18 },
      ];
      overview.groups.forEach((g: GroupRow) =>
        s2.addRow([
          g.label,
          g.total,
          g.completed,
          g.cancelled,
          g.overdue,
          g.completionRate,
          g.onTimeRate,
          g.avgHours,
        ]),
      );
      const s3 = wb.addWorksheet('Processos');
      s3.columns = recordHeader.map(h => ({ header: h, width: 20 }));
      recordRows.forEach(r => s3.addRow(r));
      [s1, s2, s3].forEach(s => (s.getRow(1).font = { bold: true }));
      return {
        buffer: Buffer.from(await wb.xlsx.writeBuffer()),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `relatorio-processos-${stamp}.xlsx`,
      };
    }

    return {
      buffer: await this.toPdf(overview, indicatorRows, f, user, now),
      contentType: 'application/pdf',
      filename: `relatorio-processos-${stamp}.pdf`,
    };
  }

  private describeFilters(f: ProcessReportFilterDto) {
    const { from, to, groupBy, ...rest } = f;
    return { from, to, groupBy, ...rest };
  }

  private fmtPct(v: number | null) {
    return v == null ? '—' : `${v}%`;
  }

  private indicatorTable(o: Awaited<ReturnType<ProcessReportsService['overview']>>) {
    const i = o.indicators;
    const d = o.definitions;
    const pctOf = (x: { value: number | null; numerator: number; denominator: number }) =>
      x.value == null ? '—' : `${x.value}% (${x.numerator}/${x.denominator})`;
    return [
      ['Volume de processos', i.volume.value, d.volume],
      ['Taxa de conclusão', pctOf(i.completionRate), d.completionRate],
      ['Taxa de cumprimento de prazo', pctOf(i.onTimeRate), d.onTimeRate],
      ['Tempo médio de conclusão (h)', i.avgCompletionHours.value ?? '—', d.avgCompletionHours],
      ['Taxa de rejeição', pctOf(i.rejectionRate), d.rejectionRate],
      ['Taxa de devolução', pctOf(i.returnRate), d.returnRate],
      ['Taxa de reabertura', pctOf(i.reopenRate), d.reopenRate],
      [
        'Backlog (processos / tarefas)',
        `${o.snapshot.backlogInstances} / ${o.snapshot.backlogTasks}`,
        d.backlog,
      ],
      ['Processos em atraso', o.snapshot.overdueInstances, d.overdue],
      ['Aprovações pendentes', o.snapshot.pendingApprovals, d.pendingApprovals],
      [
        'Falhas de automação',
        `${o.automation.failed} / ${o.automation.total}`,
        d.automationFailures,
      ],
    ] as Array<[string, string | number, string]>;
  }

  private toPdf(
    o: Awaited<ReturnType<ProcessReportsService['overview']>>,
    indicators: Array<[string, string | number, string]>,
    f: ProcessReportFilterDto,
    user: CurrentUserData,
    now: Date,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fmt = (d: Date) => d.toLocaleDateString('pt-PT');
      doc.font('Helvetica-Bold').fontSize(16).text('INNOVA — Indicadores de Processos');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#666666')
        .text(
          `Período: ${fmt(o.range.from)} a ${fmt(o.range.to)} · Gerado em ${fmt(now)} por utilizador #${user.id}`,
        );
      const filters = Object.entries(this.describeFilters(f)).filter(
        ([k, v]) => v != null && v !== '' && !['from', 'to'].includes(k),
      );
      if (filters.length) {
        doc.text(`Filtros: ${filters.map(([k, v]) => `${k}=${String(v)}`).join(', ')}`);
      }
      doc.moveDown().fillColor('#000000');

      doc.font('Helvetica-Bold').fontSize(12).text('Indicadores').moveDown(0.3);
      for (const [name, value, def] of indicators) {
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(`${name}: ${String(value)}`);
        doc.font('Helvetica').fontSize(8).fillColor('#555555').text(def).fillColor('#000000');
        doc.moveDown(0.3);
      }

      doc
        .moveDown()
        .font('Helvetica-Bold')
        .fontSize(12)
        .text(`Agrupamento por ${o.groupBy}`)
        .moveDown(0.3);
      for (const g of o.groups.slice(0, 30)) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .text(
            `${g.label} — total ${g.total}, concluídos ${g.completed}, em atraso ${g.overdue}, ` +
              `conclusão ${this.fmtPct(g.completionRate)}, prazo ${this.fmtPct(g.onTimeRate)}, ` +
              `duração média ${g.avgHours ?? '—'}h`,
          );
      }
      if (o.truncated) {
        doc
          .moveDown()
          .fontSize(8)
          .fillColor('#aa0000')
          .text(
            `Atenção: a coorte foi limitada a ${COHORT_LIMIT} processos; restrinja os filtros.`,
          );
      }
      doc.end();
    });
  }
}

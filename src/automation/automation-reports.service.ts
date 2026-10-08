// src/automation/automation-reports.service.ts
// §9 — Relatórios e indicadores filtráveis e exportáveis. O tempo poupado é
// sempre uma ESTIMATIVA (parâmetro por regra ou por relatório), nunca uma medição.
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OverviewGranularity, ReportFilterDto } from './automation.dto';
import {
  MANUAL_MINUTES_PER_EXECUTION,
  bucketKey,
  classifyFailure,
  failureCode,
} from './automation.service';
import { moduleOfTrigger } from './automation-events.catalog';
import { toCsv } from './automation-csv.util';

const EXEC_CAP = 50000;
/** Uma execução RUNNING há mais do que isto considera-se bloqueada. */
const BLOCKED_AFTER_MS = 15 * 60_000;
const RULE_AUDIT_ACTIONS = [
  'AUTOMATION_RULE_CREATED',
  'AUTOMATION_RULE_UPDATED',
  'AUTOMATION_RULE_PUBLISHED',
  'AUTOMATION_RULE_ACTIVATED',
  'AUTOMATION_RULE_PAUSED',
  'AUTOMATION_RULE_DELETED',
];

export const REPORT_SECTIONS = [
  'timeline',
  'by-module',
  'top-failures',
  'errors',
  'pending',
  'approvals',
  'departments',
  'changes',
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

const pct = (n: number, d: number) => (d > 0 ? +((n / d) * 100).toFixed(1) : null);
const sortDesc = (m: Map<string, number>) =>
  [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

@Injectable()
export class AutomationReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(f: ReportFilterDto = {}) {
    const to = f.to ? new Date(f.to) : new Date();
    const from = f.from ? new Date(f.from) : new Date(to.getTime() - 30 * 24 * 3_600_000);
    const granularity = f.granularity ?? OverviewGranularity.DAY;
    const defaultMinutes = f.minutesPerExecution ?? MANUAL_MINUTES_PER_EXECUTION;

    const ruleWhere: Prisma.AutomationRuleWhereInput = {
      ...(f.module ? { module: f.module } : {}),
      ...(f.category ? { category: f.category } : {}),
      ...(f.ruleId ? { id: f.ruleId } : {}),
    };

    let deptUserIds: string[] | undefined;
    if (f.departmentId) {
      const users = await this.prisma.read.user.findMany({
        where: { departmentId: f.departmentId },
        select: { id: true },
      });
      deptUserIds = users.map(u => String(u.id));
    }

    const execWhere: Prisma.AutomationExecutionWhereInput = {
      startedAt: { gte: from, lte: to },
      ...(Object.keys(ruleWhere).length ? { rule: ruleWhere } : {}),
      ...(deptUserIds ? { targetUserId: { in: deptUserIds } } : {}),
    };

    const rows = await this.prisma.automationExecution.findMany({
      where: execWhere,
      select: {
        id: true,
        ruleId: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        errorMessage: true,
        errorCode: true,
        resumeAt: true,
        nextRetryAt: true,
        targetUserId: true,
        rule: {
          select: {
            name: true,
            module: true,
            category: true,
            trigger: true,
            manualMinutesSaved: true,
          },
        },
      },
      orderBy: { startedAt: 'asc' },
      take: EXEC_CAP + 1,
    });
    const truncated = rows.length > EXEC_CAP;
    const execs = truncated ? rows.slice(0, EXEC_CAP) : rows;
    const modOf = (e: (typeof execs)[number]) =>
      e.rule.module ?? e.rule.category ?? moduleOfTrigger(e.rule.trigger);

    const byStatus = new Map<string, number>();
    const timeline = new Map<
      string,
      { total: number; success: number; failed: number; rules: Set<number> }
    >();
    const byModule = new Map<string, Record<string, number>>();
    const failuresByRule = new Map<number, { name: string; failed: number; total: number }>();
    const errorsByType = new Map<string, number>();
    const errorsByCode = new Map<string, number>();
    const errorsByModule = new Map<string, Map<string, number>>();
    let durationSum = 0;
    let durationCount = 0;
    const durations: number[] = [];
    let savedMinutes = 0;
    let successCount = 0;
    let failedCount = 0;

    for (const e of execs) {
      byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
      const mod = modOf(e);

      const key = bucketKey(e.startedAt, granularity);
      const b = timeline.get(key) ?? { total: 0, success: 0, failed: 0, rules: new Set<number>() };
      b.total++;
      b.rules.add(e.ruleId);
      timeline.set(key, b);

      const m = byModule.get(mod) ?? {};
      m.total = (m.total ?? 0) + 1;
      m[e.status] = (m[e.status] ?? 0) + 1;
      byModule.set(mod, m);

      const fr = failuresByRule.get(e.ruleId) ?? { name: e.rule.name, failed: 0, total: 0 };
      fr.total++;

      if (e.status === 'SUCCESS') {
        successCount++;
        b.success++;
        savedMinutes += e.rule.manualMinutesSaved ?? defaultMinutes;
      } else if (e.status === 'FAILED') {
        failedCount++;
        b.failed++;
        fr.failed++;
        const type = classifyFailure(e.errorMessage);
        errorsByType.set(type, (errorsByType.get(type) ?? 0) + 1);
        const code = e.errorCode ?? failureCode(e.errorMessage);
        errorsByCode.set(code, (errorsByCode.get(code) ?? 0) + 1);
        const em = errorsByModule.get(mod) ?? new Map<string, number>();
        em.set(type, (em.get(type) ?? 0) + 1);
        errorsByModule.set(mod, em);
      }
      failuresByRule.set(e.ruleId, fr);

      if ((e.status === 'SUCCESS' || e.status === 'FAILED') && e.finishedAt) {
        const d = e.finishedAt.getTime() - e.startedAt.getTime();
        durationSum += d;
        durationCount++;
        durations.push(d);
      }
    }

    durations.sort((a, b) => a - b);
    const finished = successCount + failedCount;

    const [pending, approvals, departments, changes] = await Promise.all([
      this.pendingExecutions(execWhere),
      this.approvals(from, to, f),
      this.departmentVolume(execs.map(e => ({ targetUserId: e.targetUserId, status: e.status }))),
      this.ruleChanges(from, to, f.ruleId),
    ]);

    return {
      period: { from, to, granularity },
      filters: {
        module: f.module ?? null,
        category: f.category ?? null,
        ruleId: f.ruleId ?? null,
        departmentId: f.departmentId ?? null,
      },
      totals: {
        executions: execs.length,
        success: successCount,
        failed: failedCount,
        successRate: pct(successCount, finished),
        failureRate: pct(failedCount, finished),
      },
      byStatus: sortDesc(byStatus),
      timeline: [...timeline.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          date,
          total: v.total,
          success: v.success,
          failed: v.failed,
          activeRules: v.rules.size,
          successRate: pct(v.success, v.success + v.failed),
        })),
      byModule: [...byModule.entries()]
        .map(([module, v]) => ({ module, ...v, total: v.total ?? 0 }))
        .sort((a, b) => b.total - a.total),
      avgDuration: {
        ms: durationCount ? Math.round(durationSum / durationCount) : null,
        p95Ms: durations.length
          ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]
          : null,
        sample: durationCount,
      },
      topFailures: [...failuresByRule.entries()]
        .filter(([, v]) => v.failed > 0)
        .map(([ruleId, v]) => ({
          ruleId,
          name: v.name,
          failed: v.failed,
          total: v.total,
          failureRate: pct(v.failed, v.total),
        }))
        .sort((a, b) => b.failed - a.failed)
        .slice(0, 10),
      errors: {
        byType: sortDesc(errorsByType),
        byCode: sortDesc(errorsByCode),
        byModule: [...errorsByModule.entries()].flatMap(([module, m]) =>
          [...m.entries()].map(([type, count]) => ({ module, type, count })),
        ),
      },
      pending,
      approvals,
      departments,
      timeSaved: {
        minutes: savedMinutes,
        hours: +(savedMinutes / 60).toFixed(1),
        estimate: true,
        basis: `Estimativa: ${defaultMinutes} min por execução bem-sucedida (ou o valor definido em cada automação).`,
        defaultMinutesPerExecution: defaultMinutes,
      },
      changes,
      truncated,
      generatedAt: new Date(),
    };
  }

  /** Execuções pendentes ou bloqueadas — não dependem do período, só dos filtros de regra. */
  private async pendingExecutions(execWhere: Prisma.AutomationExecutionWhereInput) {
    const { startedAt: _ignored, ...filters } = execWhere;
    const now = Date.now();
    const rows = await this.prisma.automationExecution.findMany({
      where: {
        ...filters,
        OR: [
          { status: { in: ['PENDING', 'RUNNING', 'WAITING_APPROVAL'] } },
          { status: 'FAILED', nextRetryAt: { not: null } },
        ],
      },
      orderBy: { startedAt: 'asc' },
      take: 200,
      select: {
        id: true,
        status: true,
        startedAt: true,
        resumeAt: true,
        nextRetryAt: true,
        currentStep: true,
        rule: { select: { id: true, name: true } },
      },
    });
    const items = rows.map(r => {
      const ageMs = now - r.startedAt.getTime();
      const reason =
        r.status === 'WAITING_APPROVAL'
          ? 'Aguarda decisão humana'
          : r.status === 'PENDING'
            ? r.resumeAt
              ? 'Em atraso programado'
              : 'Na fila'
            : r.status === 'FAILED'
              ? 'Repetição agendada'
              : ageMs > BLOCKED_AFTER_MS
                ? 'Bloqueada: em execução há demasiado tempo'
                : 'Em execução';
      return {
        id: r.id,
        automation: r.rule,
        status: r.status,
        currentStep: r.currentStep,
        startedAt: r.startedAt,
        ageMinutes: Math.round(ageMs / 60_000),
        blocked: r.status === 'RUNNING' && ageMs > BLOCKED_AFTER_MS,
        reason,
      };
    });
    return {
      total: items.length,
      blocked: items.filter(i => i.blocked).length,
      waitingApproval: items.filter(i => i.status === 'WAITING_APPROVAL').length,
      items,
    };
  }

  /** Aprovações dentro e fora do prazo (+ pendentes já em atraso). */
  private async approvals(from: Date, to: Date, f: ReportFilterDto) {
    const tasks = await this.prisma.automationTask.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        ...(f.ruleId ? { ruleId: f.ruleId } : {}),
        ...(f.module ? { module: f.module } : {}),
      },
      select: { status: true, dueAt: true, decidedAt: true, escalatedAt: true },
      take: EXEC_CAP,
    });
    const now = new Date();
    let onTime = 0;
    let late = 0;
    let noDeadline = 0;
    let pendingOverdue = 0;
    let pending = 0;
    let escalated = 0;
    for (const t of tasks) {
      if (t.escalatedAt) escalated++;
      if (t.status === 'PENDING') {
        pending++;
        if (t.dueAt && t.dueAt < now) pendingOverdue++;
        continue;
      }
      if (!t.dueAt) {
        noDeadline++;
        continue;
      }
      if (t.status !== 'EXPIRED' && t.decidedAt && t.decidedAt <= t.dueAt) onTime++;
      else late++;
    }
    return {
      total: tasks.length,
      pending,
      pendingOverdue,
      escalated,
      onTime,
      late,
      noDeadline,
      onTimeRate: pct(onTime, onTime + late),
      byStatus: sortDesc(
        tasks.reduce(
          (m, t) => m.set(t.status, (m.get(t.status) ?? 0) + 1),
          new Map<string, number>(),
        ),
      ),
    };
  }

  /** Volume de acções automáticas por departamento do utilizador visado. */
  private async departmentVolume(execs: Array<{ targetUserId: string | null; status: string }>) {
    const counts = new Map<number, { total: number; success: number }>();
    const ids = [
      ...new Set(execs.map(e => e.targetUserId).filter((x): x is string => !!x && /^\d+$/.test(x))),
    ].map(Number);
    const users = ids.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, departmentId: true, department: { select: { name: true } } },
        })
      : [];
    const deptOf = new Map(
      users.map(u => [
        String(u.id),
        { id: u.departmentId ?? 0, name: u.department?.name ?? 'Sem departamento' },
      ]),
    );
    const names = new Map<number, string>();
    let noTarget = 0;
    for (const e of execs) {
      const d = e.targetUserId ? deptOf.get(e.targetUserId) : undefined;
      if (!d) {
        noTarget++;
        continue;
      }
      names.set(d.id, d.name);
      const c = counts.get(d.id) ?? { total: 0, success: 0 };
      c.total++;
      if (e.status === 'SUCCESS') c.success++;
      counts.set(d.id, c);
    }
    return {
      items: [...counts.entries()]
        .map(([departmentId, c]) => ({
          departmentId: departmentId || null,
          department: names.get(departmentId) ?? 'Sem departamento',
          ...c,
        }))
        .sort((a, b) => b.total - a.total),
      withoutTargetUser: noTarget,
    };
  }

  /** Histórico de activação, alteração e desactivação das regras (auditoria). */
  private async ruleChanges(from: Date, to: Date, ruleId?: number) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entity: 'AutomationRule',
        action: { in: RULE_AUDIT_ACTIONS },
        createdAt: { gte: from, lte: to },
        ...(ruleId ? { entityId: ruleId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        action: true,
        entityId: true,
        userId: true,
        changes: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
    });
    const ruleIds = [...new Set(logs.map(l => l.entityId).filter((x): x is number => !!x))];
    const rules = ruleIds.length
      ? await this.prisma.read.automationRule.findMany({
          where: { id: { in: ruleIds } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(rules.map(r => [r.id, r.name]));
    return logs.map(l => {
      let detail: Record<string, unknown> = {};
      try {
        detail = l.changes ? (JSON.parse(l.changes) as Record<string, unknown>) : {};
      } catch {
        detail = {};
      }
      return {
        id: l.id,
        at: l.createdAt,
        action: l.action.replace('AUTOMATION_RULE_', ''),
        ruleId: l.entityId,
        ruleName:
          (l.entityId && names.get(l.entityId)) || (detail.name as string | undefined) || null,
        by: l.userId ? { id: l.userId, name: l.user?.fullName ?? null } : null,
        version: (detail.version as number | undefined) ?? null,
        note: (detail.note as string | undefined) ?? null,
      };
    });
  }

  // ─── Exportação ───────────────────────────────────────────────

  async exportCsv(section: ReportSection, f: ReportFilterDto = {}) {
    if (!REPORT_SECTIONS.includes(section)) {
      throw new BadRequestException(`Secção desconhecida. Use: ${REPORT_SECTIONS.join(', ')}`);
    }
    const r = await this.build(f);
    switch (section) {
      case 'timeline':
        return toCsv(
          ['Data', 'Execuções', 'Sucesso', 'Falha', 'Automações activas', 'Taxa de sucesso (%)'],
          r.timeline.map(t => [t.date, t.total, t.success, t.failed, t.activeRules, t.successRate]),
        );
      case 'by-module':
        return toCsv(
          ['Módulo', 'Total', 'Sucesso', 'Falhadas', 'Canceladas', 'A aguardar aprovação'],
          r.byModule.map(m => {
            const x = m as Record<string, unknown>;
            return [
              m.module,
              m.total,
              x.SUCCESS ?? 0,
              x.FAILED ?? 0,
              x.CANCELLED ?? 0,
              x.WAITING_APPROVAL ?? 0,
            ];
          }),
        );
      case 'top-failures':
        return toCsv(
          ['Automação', 'Falhas', 'Execuções', 'Taxa de falha (%)'],
          r.topFailures.map(t => [t.name, t.failed, t.total, t.failureRate]),
        );
      case 'errors':
        return toCsv(
          ['Módulo', 'Tipo de erro', 'Ocorrências'],
          r.errors.byModule.map(e => [e.module, e.type, e.count]),
        );
      case 'pending':
        return toCsv(
          ['Execução', 'Automação', 'Estado', 'Etapa', 'Início', 'Idade (min)', 'Situação'],
          r.pending.items.map(p => [
            p.id,
            p.automation.name,
            p.status,
            p.currentStep,
            p.startedAt,
            p.ageMinutes,
            p.reason,
          ]),
        );
      case 'approvals':
        return toCsv(
          [
            'Total',
            'Pendentes',
            'Pendentes em atraso',
            'Escaladas',
            'Dentro do prazo',
            'Fora do prazo',
            'Sem prazo',
            'Cumprimento (%)',
          ],
          [
            [
              r.approvals.total,
              r.approvals.pending,
              r.approvals.pendingOverdue,
              r.approvals.escalated,
              r.approvals.onTime,
              r.approvals.late,
              r.approvals.noDeadline,
              r.approvals.onTimeRate,
            ],
          ],
        );
      case 'departments':
        return toCsv(
          ['Departamento', 'Execuções', 'Com sucesso'],
          r.departments.items.map(d => [d.department, d.total, d.success]),
        );
      case 'changes':
        return toCsv(
          ['Data', 'Acção', 'Automação', 'Por', 'Versão', 'Nota'],
          r.changes.map(c => [
            c.at,
            c.action,
            c.ruleName,
            c.by?.name ?? c.by?.id,
            c.version,
            c.note,
          ]),
        );
    }
  }
}

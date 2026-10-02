// src/executive-reports/executive-reports.alerts.service.ts
// Alertas executivos (docs/Executive_Reports.md §9): regras com limiares
// configuráveis (aprovados por ADMIN/DIRECTOR), deteção periódica a partir dos
// módulos de origem, e ciclo de vida com responsável, prazo, estado e histórico.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CurrentUserData } from '../common/decorators';
import { ExecutiveReportsMetricsService } from './executive-reports.metrics.service';
import { ExecutiveReportsChartsService } from './executive-reports.charts.service';
import { KPI_CATALOG } from './executive-reports.kpi-catalog';
import type {
  AlertActionDto,
  AlertAssignDto,
  AlertFilterDto,
  UpdateAlertRuleDto,
} from './dto/executive-alerts.dto';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Prazo de tratamento por gravidade (dias) quando a origem não traz prazo próprio. */
const SLA_DAYS: Record<Severity, number> = { CRITICAL: 2, HIGH: 5, MEDIUM: 10, LOW: 20 };

export interface AlertRuleDefault {
  code: string;
  name: string;
  sourceModule: string;
  description: string;
  /** Condição de exemplo do documento §9, com a unidade do limiar. */
  condition: string;
  threshold: number | null;
  unit: string | null;
  severity: Severity;
  /** false = sem fonte de dados na plataforma (nunca gera alertas inventados). */
  available: boolean;
  link: string;
}

export const ALERT_RULE_DEFAULTS: AlertRuleDefault[] = [
  {
    code: 'TRAINING_TARGET_LATE',
    name: 'Meta de formação em atraso',
    sourceModule: 'trainings',
    description: 'Taxa de conclusão de formação abaixo do limiar',
    condition: 'Taxa de conclusão < limiar (%)',
    threshold: KPI_CATALOG.TRAINING_COMPLETION.warningThreshold,
    unit: '%',
    severity: 'MEDIUM',
    available: true,
    link: '/trainings',
  },
  {
    code: 'ABSENCE_INCREASE',
    name: 'Aumento de faltas',
    sourceModule: 'attendance',
    description: 'Absentismo de um departamento acima do limite configurado',
    condition: 'Absentismo do departamento > limiar (%)',
    threshold: 100 - (KPI_CATALOG.ATTENDANCE.warningThreshold as number),
    unit: '%',
    severity: 'MEDIUM',
    available: true,
    link: '/attendance',
  },
  {
    code: 'TURNOVER_HIGH',
    name: 'Rotatividade elevada',
    sourceModule: 'users',
    description: 'Rotatividade de um departamento acima do limite configurado',
    condition: 'Rotatividade do departamento > limiar (%)',
    threshold: KPI_CATALOG.TURNOVER.warningThreshold,
    unit: '%',
    severity: 'MEDIUM',
    available: true,
    link: '/users',
  },
  {
    code: 'PDI_OVERDUE',
    name: 'PDI atrasado',
    sourceModule: 'development-plans',
    description: 'Acções de PDI com prazo ultrapassado e não concluídas',
    condition: 'Acções em atraso por 100 colaboradores ≥ limiar',
    threshold: 5,
    unit: 'por 100 colab.',
    severity: 'MEDIUM',
    available: true,
    link: '/development-plans',
  },
  {
    code: 'MANDATORY_TRAINING_OVERDUE',
    name: 'Formações obrigatórias em atraso',
    sourceModule: 'enrollments',
    description: 'Inscrições obrigatórias com prazo ultrapassado',
    condition: 'Inscrições obrigatórias em atraso por 100 colaboradores ≥ limiar',
    threshold: 5,
    unit: 'por 100 colab.',
    severity: 'HIGH',
    available: true,
    link: '/enrollments',
  },
  {
    code: 'REVIEWS_PENDING',
    name: 'Avaliações pendentes',
    sourceModule: 'performance',
    description: 'Ciclo de avaliação próximo do fecho com avaliações por concluir',
    condition: 'Ciclo activo a terminar em ≤ limiar dias com avaliações por concluir',
    threshold: 14,
    unit: 'dias',
    severity: 'MEDIUM',
    available: true,
    link: '/evaluation',
  },
  {
    code: 'ONBOARDING_INCOMPLETE',
    name: 'Integração incompleta',
    sourceModule: 'onboarding',
    description: 'Tarefas obrigatórias de onboarding vencidas',
    condition: 'Tarefas de onboarding vencidas > limiar',
    threshold: 0,
    unit: 'tarefas',
    severity: 'MEDIUM',
    available: true,
    link: '/onboarding',
  },
  {
    code: 'APPROVALS_PENDING',
    name: 'Aprovações pendentes',
    sourceModule: 'leave',
    description: 'Pedidos por aprovar há mais do que o prazo definido, e processos fora do SLA',
    condition: 'Pedido pendente há mais de limiar dias / processo com SLA ultrapassado',
    threshold: 7,
    unit: 'dias',
    severity: 'MEDIUM',
    available: true,
    link: '/leave',
  },
  {
    code: 'COST_DEVIATION',
    name: 'Desvio de custos',
    sourceModule: 'payroll',
    description: 'Custo real superior ao orçamento autorizado',
    condition: 'Custo real > orçamento (%)',
    threshold: 10,
    unit: '%',
    severity: 'HIGH',
    available: false,
    link: '/payroll',
  },
  {
    code: 'SYNC_FAILURE',
    name: 'Falha de sincronização',
    sourceModule: 'API Integration',
    description: 'Integração com erro ou sem actualização dentro do prazo esperado',
    condition:
      'Estado ERROR / última sincronização falhada / sem sincronizar há mais de limiar horas',
    threshold: 48,
    unit: 'horas',
    severity: 'HIGH',
    available: true,
    link: '/api-integrations',
  },
  {
    code: 'DOCUMENTS_EXPIRING',
    name: 'Documentos a vencer',
    sourceModule: 'document-repository',
    description: 'Documentos de colaboradores dentro da janela de aviso',
    condition: 'Documento com validade ≤ limiar dias',
    threshold: 30,
    unit: 'dias',
    severity: 'MEDIUM',
    available: true,
    link: '/employees',
  },
];

interface Candidate {
  ruleCode: string;
  fingerprint: string;
  title: string;
  description: string;
  severity: Severity;
  sourceModule: string;
  sourceType?: string;
  sourceId?: number;
  link: string;
  value?: number | null;
  departmentId?: number | null;
  dueDate?: Date | null;
}

interface RuleRow {
  code: string;
  threshold: number | null;
  severity: Severity;
  ownerId: number | null;
  active: boolean;
}

const FULL_ROLES = ['ADMIN', 'RH', 'DIRECTOR'];
const APPROVER_ROLES = ['ADMIN', 'DIRECTOR'];
const MANAGER_ROLES = ['GESTOR', 'LIDER'];

@Injectable()
export class ExecutiveReportsAlertsService {
  private readonly logger = new Logger(ExecutiveReportsAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: ExecutiveReportsMetricsService,
    private readonly charts: ExecutiveReportsChartsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Regras ───────────────────────────────────────────────────────────────

  /** Garante que cada regra por omissão tem linha editável na BD. */
  private async ensureRules(): Promise<Map<string, RuleRow>> {
    const existing = await this.prisma.executiveAlertRule.findMany();
    const have = new Set(existing.map(r => r.code));
    const missing = ALERT_RULE_DEFAULTS.filter(d => !have.has(d.code));
    if (missing.length > 0) {
      await this.prisma.executiveAlertRule.createMany({
        data: missing.map(d => ({
          code: d.code,
          name: d.name,
          sourceModule: d.sourceModule,
          description: d.description,
          threshold: d.threshold,
          unit: d.unit,
          severity: d.severity,
          active: d.available,
        })),
        skipDuplicates: true,
      });
    }
    const rows = await this.prisma.executiveAlertRule.findMany();
    return new Map(
      rows.map(r => [
        r.code,
        {
          code: r.code,
          threshold: r.threshold,
          severity: r.severity as Severity,
          ownerId: r.ownerId,
          active: r.active,
        },
      ]),
    );
  }

  async listRules() {
    await this.ensureRules();
    const rows = await this.prisma.read.executiveAlertRule.findMany({
      include: { owner: { select: { id: true, fullName: true } } },
    });
    const byCode = new Map(rows.map(r => [r.code, r]));
    return ALERT_RULE_DEFAULTS.map(d => {
      const r = byCode.get(d.code);
      return {
        code: d.code,
        name: d.name,
        sourceModule: d.sourceModule,
        description: d.description,
        condition: d.condition,
        unit: d.unit,
        available: d.available,
        defaultThreshold: d.threshold,
        threshold: r?.threshold ?? d.threshold,
        severity: r?.severity ?? d.severity,
        active: d.available ? (r?.active ?? true) : false,
        owner: r?.owner ?? null,
        approvedAt: r?.approvedAt ?? null,
        approvedById: r?.approvedById ?? null,
      };
    });
  }

  /** Limiares só mudam com aprovação explícita de ADMIN/DIRECTOR (§9). */
  async updateRule(code: string, dto: UpdateAlertRuleDto, user: CurrentUserData) {
    const def = ALERT_RULE_DEFAULTS.find(d => d.code === code);
    if (!def) throw new NotFoundException('Regra de alerta não encontrada');
    if (!APPROVER_ROLES.includes(user.role?.name ?? '')) {
      throw new ForbiddenException('Só ADMIN/DIRECTOR aprovam limiares de alertas');
    }
    if (!def.available && dto.active) {
      throw new BadRequestException(
        'Esta regra não tem fonte de dados na plataforma e não pode ser activada',
      );
    }
    if (dto.ownerId !== undefined) await this.assertValidOwner(dto.ownerId);
    await this.ensureRules();
    await this.prisma.executiveAlertRule.update({
      where: { code },
      data: {
        threshold: dto.threshold,
        severity: dto.severity,
        ownerId: dto.ownerId,
        active: dto.active,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });
    return (await this.listRules()).find(r => r.code === code);
  }

  private async assertValidOwner(ownerId: number) {
    const owner = await this.prisma.read.user.findUnique({
      where: { id: ownerId },
      select: { active: true, role: { select: { name: true } } },
    });
    const roleName = owner?.role?.name ?? '';
    if (!owner?.active || ![...FULL_ROLES, ...MANAGER_ROLES].includes(roleName)) {
      throw new BadRequestException('Responsável inválido: tem de ser um gestor activo');
    }
  }

  // ─── Deteção ──────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledScan() {
    try {
      await this.scan();
    } catch (e) {
      this.logger.error({
        action: 'EXECUTIVE_ALERTS_SCAN',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha na deteção periódica de alertas executivos',
      });
    }
  }

  /**
   * Avalia todas as regras activas, cria/actualiza alertas e resolve
   * automaticamente os que deixaram de se verificar.
   */
  async scan() {
    const rules = await this.ensureRules();
    const defs = ALERT_RULE_DEFAULTS.filter(d => d.available && rules.get(d.code)?.active);
    const evaluated = new Set<string>();
    const candidates: Candidate[] = [];

    const f = this.metrics.resolveFilters({ period: 'year' });
    const cache: { risks?: Awaited<ReturnType<ExecutiveReportsChartsService['risks']>> } = {};
    const risks = async () => (cache.risks ??= await this.charts.risks(f));

    for (const def of defs) {
      const rule = rules.get(def.code) as RuleRow;
      try {
        candidates.push(...(await this.evaluate(def, rule, f, risks)));
        evaluated.add(def.code);
      } catch (e) {
        // Uma regra a falhar não pode impedir as restantes nem resolver os seus alertas.
        this.logger.warn({
          action: 'EXECUTIVE_ALERT_RULE_FAILED',
          ruleCode: def.code,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao avaliar regra de alerta',
        });
      }
    }

    let created = 0;
    let updated = 0;
    const seen = new Set(candidates.map(c => c.fingerprint));
    for (const c of candidates) {
      const rule = rules.get(c.ruleCode);
      const result = await this.upsertAlert(c, rule?.ownerId ?? null);
      if (result === 'created') created++;
      else if (result === 'updated') updated++;
    }

    const stale = await this.prisma.executiveAlert.findMany({
      where: {
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
        ruleCode: { in: [...evaluated] },
        fingerprint: { notIn: [...seen] },
      },
      select: { id: true },
    });
    for (const s of stale) {
      await this.prisma.executiveAlert.update({
        where: { id: s.id },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      await this.addEvent(s.id, null, 'AUTO_RESOLVED', 'A condição deixou de se verificar');
    }

    return { evaluatedRules: evaluated.size, created, updated, autoResolved: stale.length };
  }

  private async upsertAlert(c: Candidate, ownerId: number | null): Promise<'created' | 'updated'> {
    const dueDate = c.dueDate ?? new Date(Date.now() + SLA_DAYS[c.severity] * DAY_MS);
    const existing = await this.prisma.executiveAlert.findUnique({
      where: { fingerprint: c.fingerprint },
    });

    if (!existing) {
      try {
        const alert = await this.prisma.executiveAlert.create({
          data: {
            ruleCode: c.ruleCode,
            fingerprint: c.fingerprint,
            title: c.title,
            description: c.description,
            severity: c.severity,
            sourceModule: c.sourceModule,
            sourceType: c.sourceType,
            sourceId: c.sourceId,
            link: c.link,
            value: c.value ?? null,
            departmentId: c.departmentId ?? null,
            ownerId,
            dueDate,
          },
        });
        await this.addEvent(alert.id, null, 'DETECTED', c.description);
        await this.notifyOwner(ownerId, c);
        return 'created';
      } catch (e) {
        // Outra instância (HA) criou o mesmo alerta entre o findUnique e o create.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        return 'updated';
      }
    }

    const reopen = existing.status === 'RESOLVED';
    await this.prisma.executiveAlert.update({
      where: { id: existing.id },
      data: {
        title: c.title,
        description: c.description,
        severity: c.severity,
        value: c.value ?? null,
        lastSeenAt: new Date(),
        ...(reopen ? { status: 'OPEN', resolvedAt: null, dueDate } : {}),
        ...(existing.dueDate ? {} : { dueDate }),
      },
    });
    if (reopen) {
      await this.addEvent(existing.id, null, 'REOPENED', 'A condição voltou a verificar-se');
      await this.notifyOwner(existing.ownerId, c);
    }
    // DISMISSED mantém-se dispensado: a decisão humana não é revertida pela deteção.
    return 'updated';
  }

  private async notifyOwner(ownerId: number | null, c: Candidate) {
    if (!ownerId || (c.severity !== 'HIGH' && c.severity !== 'CRITICAL')) return;
    await this.notifications
      .sendToUser(ownerId, {
        title: `Alerta executivo: ${c.title}`,
        message: c.description,
        type: 'EXECUTIVE_ALERT',
        metadata: { ruleCode: c.ruleCode, link: c.link },
      })
      .catch((e: unknown) =>
        this.logger.warn({
          action: 'EXECUTIVE_ALERT_NOTIFY',
          ownerId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar o responsável pelo alerta',
        }),
      );
  }

  private escalate(base: Severity, value: number, threshold: number): Severity {
    return threshold > 0 && value >= threshold * 2 ? 'CRITICAL' : base;
  }

  private async evaluate(
    def: AlertRuleDefault,
    rule: RuleRow,
    f: ReturnType<ExecutiveReportsMetricsService['resolveFilters']>,
    risks: () => Promise<Awaited<ReturnType<ExecutiveReportsChartsService['risks']>>>,
  ): Promise<Candidate[]> {
    const now = new Date();
    const thr = rule.threshold ?? def.threshold ?? 0;
    const base = { ruleCode: def.code, sourceModule: def.sourceModule, link: def.link };
    const out: Candidate[] = [];

    switch (def.code) {
      case 'TRAINING_TARGET_LATE': {
        const [kpi] = await this.metrics.computeKpis(f, ['TRAINING_COMPLETION']);
        if (kpi && kpi.value !== null && kpi.value < thr) {
          const crit = KPI_CATALOG.TRAINING_COMPLETION.criticalThreshold ?? 0;
          out.push({
            ...base,
            fingerprint: `${def.code}:ALL`,
            title: def.name,
            description: `Taxa de conclusão de formação em ${kpi.value}% (limiar ${thr}%, meta ${kpi.target}%)`,
            severity: kpi.value < crit ? 'HIGH' : rule.severity,
            value: kpi.value,
          });
        }
        break;
      }

      case 'ABSENCE_INCREASE':
      case 'TURNOVER_HIGH':
      case 'PDI_OVERDUE':
      case 'MANDATORY_TRAINING_OVERDUE': {
        const { heatmap } = await risks();
        for (const d of heatmap) {
          const cell =
            def.code === 'ABSENCE_INCREASE'
              ? d.cells.absenteeism
              : def.code === 'TURNOVER_HIGH'
                ? d.cells.turnover
                : def.code === 'PDI_OVERDUE'
                  ? d.cells.overduePdi
                  : d.cells.overdueMandatory;
          const value =
            'rate' in cell ? (cell.rate as number | null) : (cell.value as number | null);
          const raw = cell.value as number | null;
          const isCount = def.code === 'PDI_OVERDUE' || def.code === 'MANDATORY_TRAINING_OVERDUE';
          const over = value !== null && (isCount ? value >= thr : value > thr);
          if (!over || !raw || raw <= 0) continue;
          out.push({
            ...base,
            fingerprint: `${def.code}:DEPT:${d.id}`,
            title: `${def.name} — ${d.name}`,
            description: isCount
              ? `${d.name}: ${raw} (${value} por 100 colaboradores; limiar ${thr})`
              : `${d.name}: ${value}% (limiar ${thr}%)`,
            severity: this.escalate(rule.severity, value as number, thr),
            value,
            departmentId: d.id,
            sourceType: 'Department',
            sourceId: d.id,
          });
        }
        break;
      }

      case 'REVIEWS_PENDING': {
        const horizon = new Date(now.getTime() + thr * DAY_MS);
        const cycles = await this.prisma.read.performanceCycle.findMany({
          where: { status: 'ACTIVE', endDate: { lte: horizon } },
          select: { id: true, name: true, endDate: true },
        });
        for (const c of cycles) {
          const pending = await this.prisma.read.performanceReview.count({
            where: { cycleId: c.id, status: { notIn: ['PUBLISHED', 'FINALIZED'] } },
          });
          if (pending === 0) continue;
          const days = Math.ceil((c.endDate.getTime() - now.getTime()) / DAY_MS);
          out.push({
            ...base,
            fingerprint: `${def.code}:CYCLE:${c.id}`,
            title: `${def.name} — ${c.name}`,
            description:
              days >= 0
                ? `${pending} avaliações por concluir; o ciclo fecha em ${days} dia(s)`
                : `${pending} avaliações por concluir; o ciclo devia ter fechado há ${-days} dia(s)`,
            severity: days <= 3 ? 'HIGH' : rule.severity,
            value: pending,
            dueDate: c.endDate > now ? c.endDate : null,
            sourceType: 'PerformanceCycle',
            sourceId: c.id,
          });
        }
        break;
      }

      case 'ONBOARDING_INCOMPLETE': {
        const overdue = await this.prisma.read.onboardingTaskInstance.count({
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED'] },
            dueDate: { lt: now },
            plan: { status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
          },
        });
        if (overdue > thr) {
          out.push({
            ...base,
            fingerprint: `${def.code}:ALL`,
            title: def.name,
            description: `${overdue} tarefas de onboarding com prazo ultrapassado (limiar ${thr})`,
            severity: rule.severity,
            value: overdue,
          });
        }
        break;
      }

      case 'APPROVALS_PENDING': {
        const cutoff = new Date(now.getTime() - thr * DAY_MS);
        const [leaves, processes] = await Promise.all([
          this.prisma.read.leaveRequest.count({
            where: { status: 'PENDING', createdAt: { lt: cutoff } },
          }),
          this.prisma.read.processInstance.count({
            where: { status: 'IN_PROGRESS', slaDeadline: { lt: now } },
          }),
        ]);
        if (leaves > 0) {
          out.push({
            ...base,
            fingerprint: `${def.code}:leave`,
            title: `${def.name} — pedidos de ausência`,
            description: `${leaves} pedidos por aprovar há mais de ${thr} dias`,
            severity: rule.severity,
            value: leaves,
          });
        }
        if (processes > 0) {
          out.push({
            ...base,
            sourceModule: 'processes',
            link: '/processes',
            fingerprint: `${def.code}:processes`,
            title: `${def.name} — processos fora do SLA`,
            description: `${processes} processos em curso com o prazo (SLA) ultrapassado`,
            severity: rule.severity,
            value: processes,
          });
        }
        break;
      }

      case 'SYNC_FAILURE': {
        const stale = new Date(now.getTime() - thr * HOUR_MS);
        const integrations = await this.prisma.read.integrationConfig.findMany({
          where: {
            isActive: true,
            OR: [
              { status: 'ERROR' },
              { lastSyncStatus: 'FAILED' },
              { syncFrequency: { not: 'MANUAL' }, lastSyncAt: { lt: stale } },
            ],
          },
          select: { id: true, name: true, status: true, lastSyncStatus: true, lastSyncAt: true },
        });
        for (const i of integrations) {
          const failed = i.status === 'ERROR' || i.lastSyncStatus === 'FAILED';
          out.push({
            ...base,
            fingerprint: `${def.code}:${i.id}`,
            title: `${def.name} — ${i.name}`,
            description: failed
              ? `A integração está em erro ou a última sincronização falhou`
              : `Sem sincronização há mais de ${thr} horas (última: ${i.lastSyncAt?.toISOString() ?? 'nunca'})`,
            severity: failed ? rule.severity : 'MEDIUM',
            sourceType: 'IntegrationConfig',
            sourceId: i.id,
          });
        }
        break;
      }

      case 'DOCUMENTS_EXPIRING': {
        const horizon = new Date(now.getTime() + thr * DAY_MS);
        const where = { status: 'ACTIVE' as const, deletedAt: null, expiresAt: { lte: horizon } };
        const [total, expired] = await Promise.all([
          this.prisma.read.employeeDocument.count({ where }),
          this.prisma.read.employeeDocument.count({
            where: { ...where, expiresAt: { lt: now } },
          }),
        ]);
        if (total > 0) {
          out.push({
            ...base,
            fingerprint: `${def.code}:ALL`,
            title: def.name,
            description: `${total} documentos a vencer em ${thr} dias (${expired} já vencidos)`,
            severity: expired > 0 ? 'HIGH' : rule.severity,
            value: total,
          });
        }
        break;
      }

      default:
        break;
    }
    return out;
  }

  // ─── Consulta ─────────────────────────────────────────────────────────────

  private async visibility(user: CurrentUserData): Promise<Prisma.ExecutiveAlertWhereInput> {
    const role = user.role?.name ?? '';
    if (FULL_ROLES.includes(role)) return {};
    if (MANAGER_ROLES.includes(role)) {
      const me = await this.prisma.read.user.findUnique({
        where: { id: user.id },
        select: { departmentId: true },
      });
      // Sem departamento só vê os alertas de que é responsável.
      return {
        OR: [
          { ownerId: user.id },
          ...(me?.departmentId ? [{ departmentId: me.departmentId }] : []),
        ],
      };
    }
    throw new ForbiddenException('Sem permissão para consultar alertas executivos');
  }

  async list(user: CurrentUserData, filters: AlertFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const visible = await this.visibility(user);
    const where: Prisma.ExecutiveAlertWhereInput = {
      AND: [
        visible,
        {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.severity ? { severity: filters.severity } : {}),
          ...(filters.sourceModule ? { sourceModule: filters.sourceModule } : {}),
          ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
          ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        },
      ],
    };

    const [data, total, bySeverity, byStatus] = await Promise.all([
      this.prisma.read.executiveAlert.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }],
        include: { owner: { select: { id: true, fullName: true } } },
      }),
      this.prisma.read.executiveAlert.count({ where }),
      this.prisma.read.executiveAlert.groupBy({
        by: ['severity'],
        where: { AND: [visible, { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }] },
        _count: true,
      }),
      this.prisma.read.executiveAlert.groupBy({ by: ['status'], where: visible, _count: true }),
    ]);

    const now = new Date();
    return {
      data: data.map(a => ({
        ...a,
        overdue:
          (a.status === 'OPEN' || a.status === 'ACKNOWLEDGED') && !!a.dueDate && a.dueDate < now,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        activeBySeverity: Object.fromEntries(bySeverity.map(s => [s.severity, s._count])),
        byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
      },
    };
  }

  async getOne(id: number, user: CurrentUserData) {
    const alert = await this.prisma.read.executiveAlert.findFirst({
      where: { AND: [{ id }, await this.visibility(user)] },
      include: {
        owner: { select: { id: true, fullName: true } },
        events: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });
    if (!alert) throw new NotFoundException('Alerta não encontrado');
    return alert;
  }

  /** Alertas activos mais graves, para o relatório e para o dashboard. */
  async topActive(user: CurrentUserData | null, take = 15) {
    const where: Prisma.ExecutiveAlertWhereInput = {
      AND: [user ? await this.visibility(user) : {}, { status: { in: ['OPEN', 'ACKNOWLEDGED'] } }],
    };
    const rows = await this.prisma.read.executiveAlert.findMany({
      where,
      take: 200,
      orderBy: { detectedAt: 'desc' },
      include: { owner: { select: { fullName: true } } },
    });
    const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return rows.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, take);
  }

  // ─── Acções e histórico ───────────────────────────────────────────────────

  private async addEvent(alertId: number, userId: number | null, action: string, comment?: string) {
    await this.prisma.executiveAlertEvent.create({
      data: { alertId, userId, action, comment: comment?.slice(0, 1000) },
    });
  }

  async acknowledge(id: number, user: CurrentUserData, dto: AlertActionDto) {
    const a = await this.getOne(id, user);
    if (a.status !== 'OPEN')
      throw new BadRequestException('Só alertas abertos podem ser reconhecidos');
    await this.prisma.executiveAlert.update({ where: { id }, data: { status: 'ACKNOWLEDGED' } });
    await this.addEvent(id, user.id, 'ACKNOWLEDGED', dto.comment);
    return this.getOne(id, user);
  }

  async assign(id: number, user: CurrentUserData, dto: AlertAssignDto) {
    await this.getOne(id, user);
    if (dto.ownerId === undefined && !dto.dueDate) {
      throw new BadRequestException('Indique o responsável e/ou o novo prazo');
    }
    if (dto.ownerId !== undefined) await this.assertValidOwner(dto.ownerId);
    await this.prisma.executiveAlert.update({
      where: { id },
      data: {
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
        ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
      },
    });
    const parts = [
      dto.ownerId !== undefined ? `responsável #${dto.ownerId}` : null,
      dto.dueDate ? `prazo ${dto.dueDate}` : null,
      dto.comment ?? null,
    ].filter(Boolean);
    await this.addEvent(id, user.id, 'ASSIGNED', parts.join(' · '));
    return this.getOne(id, user);
  }

  async resolve(id: number, user: CurrentUserData, dto: AlertActionDto) {
    const a = await this.getOne(id, user);
    if (a.status === 'RESOLVED' || a.status === 'DISMISSED') {
      throw new BadRequestException('O alerta já está encerrado');
    }
    await this.prisma.executiveAlert.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    await this.addEvent(id, user.id, 'RESOLVED', dto.comment);
    return this.getOne(id, user);
  }

  async dismiss(id: number, user: CurrentUserData, dto: AlertActionDto) {
    const a = await this.getOne(id, user);
    if (!dto.comment?.trim()) throw new BadRequestException('Indique o motivo para dispensar');
    if (a.status === 'RESOLVED' || a.status === 'DISMISSED') {
      throw new BadRequestException('O alerta já está encerrado');
    }
    await this.prisma.executiveAlert.update({
      where: { id },
      data: { status: 'DISMISSED', resolvedAt: new Date() },
    });
    await this.addEvent(id, user.id, 'DISMISSED', dto.comment);
    return this.getOne(id, user);
  }

  async reopen(id: number, user: CurrentUserData, dto: AlertActionDto) {
    const a = await this.getOne(id, user);
    if (a.status !== 'RESOLVED' && a.status !== 'DISMISSED') {
      throw new BadRequestException('Só alertas encerrados podem ser reabertos');
    }
    await this.prisma.executiveAlert.update({
      where: { id },
      data: { status: 'OPEN', resolvedAt: null },
    });
    await this.addEvent(id, user.id, 'REOPENED', dto.comment);
    return this.getOne(id, user);
  }
}

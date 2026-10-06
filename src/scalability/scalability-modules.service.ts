// modulo_scalability.md §25-26 — utilização por módulo e integração com módulos técnicos.
//
// §25: para cada módulo da INNOVA devolve o volume total e o volume criado nas
// últimas 24h / 7d / 30d, lido directamente das tabelas do módulo (nenhum módulo
// tem de implementar lógica própria de infraestrutura). A métrica "volume" é
// declarada por módulo (ex.: Attendance = marcações, AI Tutor = sessões).
// Tokens/custos do AI Tutor não são contados: não existe campo fiável.
// §26: estado de cada módulo técnico ligado ao Scalability (Audit, Processes,
// Automations, Analytics, Executive Reports, Notifications) e um resumo
// consumível por Analytics/Executive Reports.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityCapacityService } from './scalability-capacity.service';

type Counter = (since?: Date) => Promise<number>;

interface ModuleDef {
  key: string;
  label: string;
  metric: string;
  count: Counter;
}

const H = 3_600_000;

@Injectable()
export class ScalabilityModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: ScalabilityCapacityService,
  ) {}

  private defs(): ModuleDef[] {
    const r = this.prisma.read;
    const ca = (s?: Date) => (s ? { gte: s } : undefined);
    return [
      {
        key: 'users',
        label: 'Users',
        metric: 'utilizadores',
        count: s => r.user.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'departments',
        label: 'Departments',
        metric: 'departamentos',
        count: s => r.department.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'employees',
        label: 'Employees/RH',
        metric: 'colaboradores',
        count: s => r.employee.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'payroll',
        label: 'Payroll & Payslips',
        metric: 'recibos',
        count: s => r.payslip.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'attendance',
        label: 'Attendance',
        metric: 'marcações',
        count: s => r.attendanceRecord.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'leave',
        label: 'Leave',
        metric: 'pedidos',
        count: s => r.leaveRequest.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'courses',
        label: 'Courses',
        metric: 'cursos',
        count: s => r.course.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'training',
        label: 'Training',
        metric: 'participantes',
        count: s => r.trainingParticipant.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'enrollments',
        label: 'Enrollments',
        metric: 'inscrições',
        count: s => r.enrollment.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'assessments',
        label: 'Assessments',
        metric: 'submissões',
        count: s => r.assessmentAttempt.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'performance',
        label: 'Performance',
        metric: 'avaliações',
        count: s => r.performanceReview.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'competencies',
        label: 'Competencies',
        metric: 'modelos',
        count: s => r.competencyModel.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'eval360',
        label: '360º',
        metric: 'avaliadores',
        count: s => r.evaluatorAssignment.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'onboarding',
        label: 'Onboarding',
        metric: 'tarefas',
        count: s => r.onboardingTaskInstance.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'development-plans',
        label: 'Development Plans',
        metric: 'ações',
        count: s => r.developmentPlanAction.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'career-plans',
        label: 'Career Plans',
        metric: 'planos',
        count: s => r.userCareerPlan.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'documents',
        label: 'Document Repository',
        metric: 'downloads',
        count: s => r.docDownload.count({ where: { downloadedAt: ca(s) } }),
      },
      {
        key: 'library',
        label: 'Content Library',
        metric: 'acessos',
        count: s => r.libraryAccess.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'ai-tutor',
        label: 'AI Tutor',
        metric: 'sessões',
        count: s => r.aiTutorSession.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'avatar-training',
        label: 'Avatar Training',
        metric: 'sessões',
        count: s => r.avatarTrainingSession.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'processes',
        label: 'Processes',
        metric: 'instâncias',
        count: s => r.processInstance.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'automations',
        label: 'Automations',
        metric: 'execuções',
        count: s => r.automationExecution.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'notifications',
        label: 'Notifications',
        metric: 'notificações',
        count: s => r.notificationLog.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'events',
        label: 'Events',
        metric: 'eventos',
        count: s => r.event.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'integrations',
        label: 'Integrations',
        metric: 'sincronizações',
        count: s => r.integrationSyncLog.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'executive-reports',
        label: 'Executive Reports',
        metric: 'relatórios',
        count: s => r.executiveReport.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'audit',
        label: 'Audit',
        metric: 'eventos',
        count: s => r.auditLog.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'history',
        label: 'History',
        metric: 'registos',
        count: s => r.historyRecord.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'api',
        label: 'API',
        metric: 'chamadas de integração',
        count: s => r.apiIntegrationLog.count({ where: { createdAt: ca(s) } }),
      },
    ];
  }

  private round1(n: number) {
    return Math.round(n * 10) / 10;
  }

  /** §25 — volume e crescimento por módulo. Um módulo que falha não derruba os restantes. */
  async getModuleUsage() {
    const now = Date.now();
    const s24 = new Date(now - 24 * H);
    const s7 = new Date(now - 7 * 24 * H);
    const s30 = new Date(now - 30 * 24 * H);

    const modules = await Promise.all(
      this.defs().map(async d => {
        try {
          const [total, last24h, last7d, last30d] = await Promise.all([
            d.count(),
            d.count(s24),
            d.count(s7),
            d.count(s30),
          ]);
          const before30 = total - last30d;
          return {
            key: d.key,
            module: d.label,
            metric: d.metric,
            total,
            last24h,
            last7d,
            last30d,
            // crescimento dos últimos 30d face ao stock anterior; null sem base de comparação
            growth30dPercent: before30 > 0 ? this.round1((last30d / before30) * 100) : null,
            available: true,
          };
        } catch {
          return {
            key: d.key,
            module: d.label,
            metric: d.metric,
            total: null,
            last24h: null,
            last7d: null,
            last30d: null,
            growth30dPercent: null,
            available: false,
          };
        }
      }),
    );

    const ok = modules.filter(m => m.available);
    const top = [...ok].sort((a, b) => (b.last7d ?? 0) - (a.last7d ?? 0)).slice(0, 5);
    return {
      generatedAt: new Date(now).toISOString(),
      summary: {
        modules: modules.length,
        unavailable: modules.length - ok.length,
        totalRecords: ok.reduce((s, m) => s + (m.total ?? 0), 0),
        records24h: ok.reduce((s, m) => s + (m.last24h ?? 0), 0),
        topModules7d: top.map(m => ({ key: m.key, module: m.module, last7d: m.last7d })),
      },
      modules,
    };
  }

  /** §26 — estado dos módulos técnicos ligados ao Scalability. */
  async getTechnicalIntegrations() {
    const since = new Date(Date.now() - 24 * H);
    const r = this.prisma.read;
    const [
      auditScal24h,
      audit24h,
      procActive,
      procOnHold,
      procStarted24h,
      autoRunning,
      autoFailed24h,
      autoTotal24h,
      alertsOpen,
      alertsNotified,
      notif24h,
      execReports24h,
      snapshots24h,
    ] = await Promise.all([
      r.auditLog.count({
        where: { createdAt: { gte: since }, entity: { startsWith: 'Scalability' } },
      }),
      r.auditLog.count({ where: { createdAt: { gte: since } } }),
      r.processInstance.count({ where: { status: 'IN_PROGRESS' } }),
      r.processInstance.count({ where: { status: 'ON_HOLD' } }),
      r.processInstance.count({ where: { startedAt: { gte: since } } }),
      r.automationExecution.count({ where: { status: { in: ['RUNNING', 'PENDING'] } } }),
      r.automationExecution.count({ where: { startedAt: { gte: since }, status: 'FAILED' } }),
      r.automationExecution.count({ where: { startedAt: { gte: since } } }),
      r.systemAlert.count({ where: { isResolved: false } }),
      r.systemAlert.count({
        where: { createdAt: { gte: since }, NOT: { notifiedVia: { isEmpty: true } } },
      }),
      r.notificationLog.count({ where: { createdAt: { gte: since } } }),
      r.executiveReport.count({ where: { createdAt: { gte: since } } }),
      r.scalabilitySnapshot.count({ where: { createdAt: { gte: since } } }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      integrations: [
        {
          module: 'Audit',
          direction: 'Scalability → Audit',
          description: 'Regista alterações às configurações do Scalability',
          last24h: { scalabilityEvents: auditScal24h, totalPlatformEvents: audit24h },
        },
        {
          module: 'Processes',
          direction: 'Processes → Scalability',
          description: 'Processos cujo volume pode impactar a capacidade',
          last24h: { started: procStarted24h },
          current: { inProgress: procActive, onHold: procOnHold },
        },
        {
          module: 'Automations',
          direction: 'Automations → Scalability',
          description: 'Jobs e execuções monitorizados',
          last24h: {
            executions: autoTotal24h,
            failed: autoFailed24h,
            failureRatePercent: autoTotal24h
              ? this.round1((autoFailed24h / autoTotal24h) * 100)
              : null,
          },
          current: { runningOrPending: autoRunning },
        },
        {
          module: 'Notifications',
          direction: 'Scalability → Notifications',
          description: 'Envia alertas de capacidade',
          last24h: { alertsNotified, platformNotifications: notif24h },
          current: { openAlerts: alertsOpen },
        },
        {
          module: 'Analytics',
          direction: 'Analytics → Scalability',
          description: 'Consome métricas via GET /scalability/capacity-summary',
          last24h: { snapshotsStored: snapshots24h },
        },
        {
          module: 'Executive Reports',
          direction: 'Executive Reports → Scalability',
          description: 'Consome indicadores de capacidade via GET /scalability/capacity-summary',
          last24h: { reportsGenerated: execReports24h },
        },
      ],
    };
  }

  /** §26 — resumo estável para Analytics / Executive Reports consumirem. */
  async getCapacitySummary() {
    const [capacity, usage] = await Promise.all([
      this.capacity.getCapacityMetrics(),
      this.getModuleUsage(),
    ]);
    return { generatedAt: new Date().toISOString(), capacity, usage: usage.summary };
  }
}

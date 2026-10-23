// modulo_monitoring.md §2 — Monitorização de Módulos.
//
// Para cada módulo da INNOVA: disponibilidade (uma sonda à BD cronometrada),
// operações recentes, volume, erros e dependências. "Erros" só existem onde o
// módulo regista falhas de forma fiável (processos, automações, integrações,
// notificações, API); nos restantes fica null — nunca inventamos 0%.
// O estado (Normal/Atenção/Degradado/Crítico/Indisponível) vem de
// monitoring-status.ts.

import { swallow } from '../common/logging/swallow';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  applyDependencies,
  classifyStatus,
  MonitoringStatus,
  percent,
  STATUS_LABEL,
  StatusResult,
  worstStatus,
} from './monitoring-status';

type Counter = (since: Date) => Promise<number>;

interface ModuleDef {
  key: string;
  label: string;
  /** o que `ops` conta (ex.: "marcações") */
  metric: string;
  dependsOn: string[];
  ops: Counter;
  errors?: Counter;
  /** itens em atraso/bloqueados (opcional) */
  backlog?: () => Promise<number>;
}

const H = 3_600_000;

@Injectable()
export class MonitoringModulesService {
  constructor(private readonly prisma: PrismaService) {}

  private defs(): ModuleDef[] {
    const r = this.prisma.read;
    const ca = (s: Date) => ({ gte: s });
    return [
      {
        key: 'users',
        label: 'Utilizadores',
        metric: 'utilizadores criados',
        dependsOn: [],
        ops: s => r.user.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'departments',
        label: 'Departamentos',
        metric: 'departamentos criados',
        dependsOn: ['users'],
        ops: s => r.department.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'employees',
        label: 'Colaboradores/RH',
        metric: 'colaboradores criados',
        dependsOn: ['users', 'departments'],
        ops: s => r.employee.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'payroll',
        label: 'Folha Salarial e Recibos',
        metric: 'recibos',
        dependsOn: ['employees'],
        ops: s => r.payslip.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'attendance',
        label: 'Assiduidade',
        metric: 'marcações',
        dependsOn: ['employees'],
        ops: s => r.attendanceRecord.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'leave',
        label: 'Licenças',
        metric: 'pedidos',
        dependsOn: ['employees', 'processes'],
        ops: s => r.leaveRequest.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'courses',
        label: 'Cursos',
        metric: 'cursos criados',
        dependsOn: ['users'],
        ops: s => r.course.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'enrollments',
        label: 'Inscrições',
        metric: 'inscrições',
        dependsOn: ['courses', 'users'],
        ops: s => r.enrollment.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'training',
        label: 'Formação',
        metric: 'participantes',
        dependsOn: ['users', 'competencies'],
        ops: s => r.trainingParticipant.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'assessments',
        label: 'Avaliações',
        metric: 'submissões',
        dependsOn: ['courses'],
        ops: s => r.assessmentAttempt.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'performance',
        label: 'Desempenho',
        metric: 'avaliações',
        dependsOn: ['employees', 'competencies'],
        ops: s => r.performanceReview.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'competencies',
        label: 'Competências',
        metric: 'modelos criados',
        dependsOn: ['users'],
        ops: s => r.competencyModel.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'onboarding',
        label: 'Onboarding',
        metric: 'tarefas',
        dependsOn: ['employees', 'processes'],
        ops: s => r.onboardingTaskInstance.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'development-plans',
        label: 'Planos de Desenvolvimento',
        metric: 'ações',
        dependsOn: ['employees', 'competencies'],
        ops: s => r.developmentPlanAction.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'processes',
        label: 'Processos',
        metric: 'instâncias iniciadas',
        dependsOn: ['users', 'automations'],
        ops: s => r.processInstance.count({ where: { startedAt: ca(s) } }),
        errors: s =>
          r.processIntegrationLog.count({ where: { createdAt: ca(s), status: 'FAILED' } }),
        backlog: () =>
          r.processInstance.count({
            where: { status: 'IN_PROGRESS', slaDeadline: { lt: new Date() } },
          }),
      },
      {
        key: 'automations',
        label: 'Automações',
        metric: 'execuções',
        dependsOn: ['notifications'],
        ops: s => r.automationExecution.count({ where: { startedAt: ca(s) } }),
        errors: s => r.automationExecution.count({ where: { startedAt: ca(s), status: 'FAILED' } }),
      },
      {
        key: 'notifications',
        label: 'Notificações',
        metric: 'notificações',
        dependsOn: [],
        ops: s => r.notificationLog.count({ where: { createdAt: ca(s) } }),
        errors: s => r.notificationLog.count({ where: { createdAt: ca(s), success: false } }),
      },
      {
        key: 'integrations',
        label: 'Integrações',
        metric: 'sincronizações',
        dependsOn: [],
        ops: s => r.integrationSyncLog.count({ where: { startedAt: ca(s) } }),
        errors: s => r.integrationSyncLog.count({ where: { startedAt: ca(s), status: 'FAILED' } }),
      },
      {
        key: 'api',
        label: 'API',
        metric: 'chamadas de integração',
        dependsOn: ['integrations'],
        ops: s => r.apiIntegrationLog.count({ where: { createdAt: ca(s) } }),
        errors: s => r.apiIntegrationLog.count({ where: { createdAt: ca(s), status: 'ERROR' } }),
      },
      {
        key: 'events',
        label: 'Eventos',
        metric: 'eventos criados',
        dependsOn: ['users', 'notifications'],
        ops: s => r.event.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'documents',
        label: 'Repositório de Documentos',
        metric: 'downloads',
        dependsOn: ['users'],
        ops: s => r.docDownload.count({ where: { downloadedAt: ca(s) } }),
      },
      {
        key: 'library',
        label: 'Biblioteca de Conteúdos',
        metric: 'acessos',
        dependsOn: ['users'],
        ops: s => r.libraryAccess.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'ai-tutor',
        label: 'Tutor IA',
        metric: 'sessões',
        dependsOn: ['courses'],
        ops: s => r.aiTutorSession.count({ where: { startedAt: ca(s) } }),
      },
      {
        key: 'executive-reports',
        label: 'Relatórios Executivos',
        metric: 'relatórios',
        dependsOn: ['audit', 'processes'],
        ops: s => r.executiveReport.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'audit',
        label: 'Auditoria',
        metric: 'eventos',
        dependsOn: [],
        ops: s => r.auditLog.count({ where: { createdAt: ca(s) } }),
      },
      {
        key: 'history',
        label: 'Histórico',
        metric: 'registos',
        dependsOn: ['audit'],
        ops: s => r.historyRecord.count({ where: { createdAt: ca(s) } }),
      },
    ];
  }

  /** Executa `fn` e devolve resultado + duração; `ok=false` se lançar. */
  private async timed<T>(
    fn: () => Promise<T>,
  ): Promise<{ ok: boolean; value: T | null; ms: number }> {
    const t0 = Date.now();
    try {
      const value = await fn();
      return { ok: true, value, ms: Date.now() - t0 };
    } catch {
      return { ok: false, value: null, ms: Date.now() - t0 };
    }
  }

  /** §2 — estado de cada módulo (um módulo que falha não derruba os restantes). */
  async getModules() {
    const now = Date.now();
    const s24 = new Date(now - 24 * H);
    const sPrev = new Date(now - 48 * H);
    const s7 = new Date(now - 7 * 24 * H);

    const defs = this.defs();
    const raw = await Promise.all(
      defs.map(async d => {
        // a sonda de disponibilidade/latência é a contagem das últimas 24h
        const probe = await this.timed(() => d.ops(s24));
        if (!probe.ok) {
          return {
            d,
            ok: false,
            ms: probe.ms,
            ops24h: null,
            opsPrev24h: null,
            ops7d: null,
            err24h: null,
            backlog: 0,
          };
        }
        const [opsSince48, ops7d, err24h, backlog] = await Promise.all([
          d
            .ops(sPrev)
            .catch(
              swallow(
                'monitoring-modules.service',
                'operação auxiliar falhou — a usar valor por omissão',
                null,
              ),
            ),
          d
            .ops(s7)
            .catch(
              swallow(
                'monitoring-modules.service',
                'operação auxiliar falhou — a usar valor por omissão',
                null,
              ),
            ),
          d.errors
            ? d
                .errors(s24)
                .catch(
                  swallow(
                    'monitoring-modules.service',
                    'operação auxiliar falhou — a usar valor por omissão',
                    null,
                  ),
                )
            : Promise.resolve(null),
          d.backlog ? d.backlog().catch(() => 0) : Promise.resolve(0),
        ]);
        const ops24h = probe.value;
        return {
          d,
          ok: true,
          ms: probe.ms,
          ops24h,
          // "48h" inclui as últimas 24h — subtrai para ter só o dia anterior
          opsPrev24h: opsSince48 === null ? null : Math.max(0, opsSince48 - ops24h),
          ops7d,
          err24h,
          backlog,
        };
      }),
    );

    // 1.ª passagem: estado próprio; 2.ª: efeito das dependências
    const own = new Map<string, StatusResult>();
    for (const x of raw) {
      const errRate = x.err24h === null || x.ops24h === null ? null : percent(x.err24h, x.ops24h);
      own.set(
        x.d.key,
        classifyStatus({
          available: x.ok,
          errorRatePercent: errRate,
          latencyMs: x.ok ? x.ms : null,
          backlog: x.backlog,
        }),
      );
    }

    const modules = raw.map(x => {
      const ownRes = own.get(x.d.key);
      const deps = x.d.dependsOn.map(k => ({ key: k, status: own.get(k)?.status ?? 'NORMAL' }));
      const res = applyDependencies(ownRes, deps);
      return {
        key: x.d.key,
        module: x.d.label,
        metric: x.d.metric,
        status: res.status,
        statusLabel: STATUS_LABEL[res.status],
        reasons: res.reasons,
        availability: x.ok,
        latencyMs: x.ok ? x.ms : null,
        operations: { last24h: x.ops24h, previous24h: x.opsPrev24h, last7d: x.ops7d },
        errors: {
          last24h: x.err24h,
          ratePercent: x.err24h === null || x.ops24h === null ? null : percent(x.err24h, x.ops24h),
          tracked: !!x.d.errors,
        },
        backlog: x.backlog,
        dependencies: deps.map(d => ({
          key: d.key,
          module: defs.find(m => m.key === d.key)?.label ?? d.key,
          status: d.status,
        })),
      };
    });

    const counts: Record<MonitoringStatus, number> = {
      NORMAL: 0,
      ATENCAO: 0,
      DEGRADADO: 0,
      CRITICO: 0,
      INDISPONIVEL: 0,
    };
    for (const m of modules) counts[m.status]++;

    return {
      generatedAt: new Date(now).toISOString(),
      summary: {
        modules: modules.length,
        overall: worstStatus(modules.map(m => m.status)),
        counts,
        avgLatencyMs: Math.round(
          modules.reduce((s, m) => s + (m.latencyMs ?? 0), 0) /
            Math.max(1, modules.filter(m => m.latencyMs !== null).length),
        ),
      },
      modules,
    };
  }
}

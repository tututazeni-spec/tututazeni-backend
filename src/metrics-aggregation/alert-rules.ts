// src/metrics-aggregation/alert-rules.ts
//
// Catálogo canónico de regras de alerta da Fase H (nota
// docs/superpowers/plans/notes/fase-h-metrics-variants.md §4.6 — 13 regras,
// união de §4.1 `dashboard.getAlerts` + §4.2 `dashboard.buildManagerAlerts` +
// §4.3 `dashboard-rh.getAlerts` + §4.4 `analytics.getRiskAlerts`).
//
// Cada regra é uma função pura `evaluateRule_<KEY>(...)` que recebe os números já
// lidos da BD e devolve um `MetricAlert` ou `null` (não dispara). Zero acesso a
// Prisma aqui — o `MetricsAggregationService.alerts()` faz as leituras uma vez e
// compõe as regras aplicáveis ao `scope`.
//
// ── key → type (bucket de domínio) ────────────────────────────────
// O catálogo §4.6 não tem coluna `type`; o mapa abaixo é derivado nesta task a
// partir dos buckets do comentário de `MetricAlert.type` em metrics.types.ts
// (PERFORMANCE | COMPLIANCE | PDI | ENGAGEMENT | TRAINING | SURVEY | EVALUATION |
// RISK). É um rótulo estável de agrupamento, não lógica de decisão.
//   SURVEYS_PENDING            → SURVEY       (survey pessoal por responder)
//   EVAL_360_PENDING           → EVALUATION   (avaliação 360° pendente)
//   PDI_ACTIONS_OVERDUE        → PDI
//   MANDATORY_TRAINING_PENDING → COMPLIANCE   (formação obrigatória = compliance;
//                                             §4.3 já usava 'COMPLIANCE', §4.1 'TRAINING')
//   TEAM_PERFORMANCE_AT_RISK   → PERFORMANCE
//   MANAGER_TEAM_RISK          → PERFORMANCE
//   MANDATORY_RATE_LOW         → COMPLIANCE   (mesma família de MANDATORY_TRAINING_PENDING)
//   PDP_COVERAGE_LOW           → PDI
//   PERFORMANCE_CRITICAL       → PERFORMANCE
//   SURVEY_PARTICIPATION_LOW   → SURVEY
//   INACTIVE_COLLABORATORS     → RISK
//   PDI_PLAN_OVERDUE           → PDI
//   PDI_ACTION_CRITICAL        → PDI

import { MetricAlert, MetricAlertScope, MetricAlertSeverity } from './metrics.types';

export type AlertRuleKey =
  | 'SURVEYS_PENDING'
  | 'EVAL_360_PENDING'
  | 'PDI_ACTIONS_OVERDUE'
  | 'MANDATORY_TRAINING_PENDING'
  | 'TEAM_PERFORMANCE_AT_RISK'
  | 'MANAGER_TEAM_RISK'
  | 'MANDATORY_RATE_LOW'
  | 'PDP_COVERAGE_LOW'
  | 'PERFORMANCE_CRITICAL'
  | 'SURVEY_PARTICIPATION_LOW'
  | 'INACTIVE_COLLABORATORS'
  | 'PDI_PLAN_OVERDUE'
  | 'PDI_ACTION_CRITICAL';

export const ALERT_TYPE: Record<AlertRuleKey, string> = {
  SURVEYS_PENDING: 'SURVEY',
  EVAL_360_PENDING: 'EVALUATION',
  PDI_ACTIONS_OVERDUE: 'PDI',
  MANDATORY_TRAINING_PENDING: 'COMPLIANCE',
  TEAM_PERFORMANCE_AT_RISK: 'PERFORMANCE',
  MANAGER_TEAM_RISK: 'PERFORMANCE',
  MANDATORY_RATE_LOW: 'COMPLIANCE',
  PDP_COVERAGE_LOW: 'PDI',
  PERFORMANCE_CRITICAL: 'PERFORMANCE',
  SURVEY_PARTICIPATION_LOW: 'SURVEY',
  INACTIVE_COLLABORATORS: 'RISK',
  PDI_PLAN_OVERDUE: 'PDI',
  PDI_ACTION_CRITICAL: 'PDI',
};

// actionUrl canónico por regra — só as 5 regras de §4.1 (dashboard.getAlerts)
// tinham um; §4.2/§4.3/§4.4 não expõem actionUrl.
const ACTION_URL: Partial<Record<AlertRuleKey, string>> = {
  SURVEYS_PENDING: '/engagement',
  EVAL_360_PENDING: '/evaluations/pending',
  PDI_ACTIONS_OVERDUE: '/talent-development/plans',
  MANDATORY_TRAINING_PENDING: '/content-library/mandatory',
  TEAM_PERFORMANCE_AT_RISK: '/evaluations',
};

const SEVERITY_ORDER: Record<MetricAlertSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Ordena por severidade (HIGH→MEDIUM→LOW) e, em empate, por `key` ascendente. */
export function sortAlerts(list: MetricAlert[]): MetricAlert[] {
  return [...list].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.key.localeCompare(b.key),
  );
}

function mk(
  key: AlertRuleKey,
  scope: MetricAlertScope,
  severity: MetricAlertSeverity,
  message: string,
  count?: number,
): MetricAlert {
  const alert: MetricAlert = { key, type: ALERT_TYPE[key], severity, message, scope };
  if (count != null) alert.count = count;
  const url = ACTION_URL[key];
  if (url) alert.actionUrl = url;
  return alert;
}

// ══════════════════════════════════════════════════════════════════
// As 13 regras (numeração = §4.6)
// ══════════════════════════════════════════════════════════════════

/** #1 SURVEYS_PENDING — scope user. Surveys ACTIVE sem resposta do próprio. (§4.1) */
export function evaluateRule_SURVEYS_PENDING(pendingSurveys: number): MetricAlert | null {
  if (pendingSurveys <= 0) return null;
  return mk(
    'SURVEYS_PENDING',
    'user',
    'MEDIUM',
    `${pendingSurveys} survey(s) por responder`,
    pendingSurveys,
  );
}

/** #2 EVAL_360_PENDING — scope user|team. `evaluationRequest{evaluatorId, PENDING}`. (§4.1/§4.2) */
export function evaluateRule_EVAL_360_PENDING(
  pendingEvals: number,
  scope: 'user' | 'team',
): MetricAlert | null {
  if (pendingEvals <= 0) return null;
  return mk(
    'EVAL_360_PENDING',
    scope,
    'HIGH',
    `${pendingEvals} avaliação(ões) 360° pendentes`,
    pendingEvals,
  );
}

/**
 * #3 PDI_ACTIONS_OVERDUE — scope user|organization. Acções PDI não
 * concluídas/canceladas com `dueDate < now`. user → plan.userId = me / HIGH;
 * organization → global / MEDIUM. (§4.1 + §4.3)
 */
export function evaluateRule_PDI_ACTIONS_OVERDUE(
  overdueActions: number,
  scope: 'user' | 'organization',
): MetricAlert | null {
  if (overdueActions <= 0) return null;
  return mk(
    'PDI_ACTIONS_OVERDUE',
    scope,
    scope === 'user' ? 'HIGH' : 'MEDIUM',
    `${overdueActions} acção(ões) de PDI em atraso`,
    overdueActions,
  );
}

/**
 * #4 MANDATORY_TRAINING_PENDING — scope user|organization. user → cursos
 * `mandatory` sem enrollment COMPLETED do próprio / MEDIUM; organization →
 * `enrollment{course.mandatory, status≠COMPLETED}` / HIGH. (§4.1 + §4.3)
 */
export function evaluateRule_MANDATORY_TRAINING_PENDING(
  pending: number,
  scope: 'user' | 'organization',
): MetricAlert | null {
  if (pending <= 0) return null;
  return mk(
    'MANDATORY_TRAINING_PENDING',
    scope,
    scope === 'user' ? 'MEDIUM' : 'HIGH',
    `${pending} formação(ões) obrigatória(s) por concluir`,
    pending,
  );
}

/**
 * #5 TEAM_PERFORMANCE_AT_RISK — scope team. Só habilitada se
 * `roleCode ∈ {ADMIN,RH,LIDER}`; conta membros com alguma review `score < 2.5`. (§4.1 ramo gestor)
 */
export function evaluateRule_TEAM_PERFORMANCE_AT_RISK(
  roleCode: string | undefined,
  teamAtRisk: number,
): MetricAlert | null {
  if (!roleCode || !['ADMIN', 'RH', 'LIDER'].includes(roleCode)) return null;
  if (teamAtRisk <= 0) return null;
  return mk(
    'TEAM_PERFORMANCE_AT_RISK',
    'team',
    'HIGH',
    `${teamAtRisk} membro(s) da equipa com performance abaixo da média`,
    teamAtRisk,
  );
}

/**
 * #6 MANAGER_TEAM_RISK — scope team. `atRisk` = membros cuja última review tem
 * `score < 2.5` OU (0 conclusões e >0 inscrições). (§4.2)
 */
export function evaluateRule_MANAGER_TEAM_RISK(atRisk: number): MetricAlert | null {
  if (atRisk <= 0) return null;
  return mk(
    'MANAGER_TEAM_RISK',
    'team',
    'HIGH',
    `${atRisk} colaborador(es) em risco de performance`,
    atRisk,
  );
}

/** #7 MANDATORY_RATE_LOW — scope team. `mandatoryRate < 80`. (§4.2) */
export function evaluateRule_MANDATORY_RATE_LOW(mandatoryRate: number): MetricAlert | null {
  if (!(mandatoryRate < 80)) return null;
  return mk(
    'MANDATORY_RATE_LOW',
    'team',
    'MEDIUM',
    `Taxa de formações obrigatórias abaixo de 80% (${mandatoryRate}%)`,
  );
}

/** #8 PDP_COVERAGE_LOW — scope team. `pdpCoverage < 50`. (§4.2) */
export function evaluateRule_PDP_COVERAGE_LOW(pdpCoverage: number): MetricAlert | null {
  if (!(pdpCoverage < 50)) return null;
  return mk(
    'PDP_COVERAGE_LOW',
    'team',
    'MEDIUM',
    `Apenas ${pdpCoverage}% da equipa tem PDI activo`,
  );
}

/** #9 PERFORMANCE_CRITICAL — scope organization. `performanceReview{score<2, PUBLISHED}`. (§4.3) */
export function evaluateRule_PERFORMANCE_CRITICAL(atRiskPerf: number): MetricAlert | null {
  if (atRiskPerf <= 0) return null;
  return mk(
    'PERFORMANCE_CRITICAL',
    'organization',
    'HIGH',
    `${atRiskPerf} colaborador(es) com performance crítica`,
    atRiskPerf,
  );
}

/**
 * #10 SURVEY_PARTICIPATION_LOW — scope organization. Respostas do mês / activos
 * `< 0.30` (e activos > 0). (§4.3)
 */
export function evaluateRule_SURVEY_PARTICIPATION_LOW(
  responsesThisMonth: number,
  activeUsers: number,
): MetricAlert | null {
  if (!(activeUsers > 0 && responsesThisMonth / activeUsers < 0.3)) return null;
  return mk(
    'SURVEY_PARTICIPATION_LOW',
    'organization',
    'MEDIUM',
    'Taxa de participação em surveys abaixo de 30%',
  );
}

/**
 * #11 INACTIVE_COLLABORATORS — scope organization|team. Activos sem nenhuma
 * inscrição nos últimos 60 dias. (§4.4)
 */
export function evaluateRule_INACTIVE_COLLABORATORS(
  inactiveCount: number,
  scope: 'team' | 'organization',
): MetricAlert | null {
  if (inactiveCount <= 0) return null;
  return mk(
    'INACTIVE_COLLABORATORS',
    scope,
    'MEDIUM',
    `${inactiveCount} colaborador(es) sem actividade de formação há 60+ dias`,
    inactiveCount,
  );
}

/** #12 PDI_PLAN_OVERDUE — scope organization|team. `developmentPlan{ACTIVE, endDate<now}`. (§4.4) */
export function evaluateRule_PDI_PLAN_OVERDUE(
  overduePlans: number,
  scope: 'team' | 'organization',
): MetricAlert | null {
  if (overduePlans <= 0) return null;
  return mk(
    'PDI_PLAN_OVERDUE',
    scope,
    'MEDIUM',
    `${overduePlans} PDI(s) além do prazo`,
    overduePlans,
  );
}

/**
 * #13 PDI_ACTION_CRITICAL — scope organization|team. Acções de PDI (plano ACTIVE)
 * não concluídas com `dueDate < now - 14d`. (§4.4)
 */
export function evaluateRule_PDI_ACTION_CRITICAL(
  criticalActions: number,
  scope: 'team' | 'organization',
): MetricAlert | null {
  if (criticalActions <= 0) return null;
  return mk(
    'PDI_ACTION_CRITICAL',
    scope,
    'HIGH',
    `${criticalActions} acção(ões) de PDI críticas (>14 dias em atraso)`,
    criticalActions,
  );
}

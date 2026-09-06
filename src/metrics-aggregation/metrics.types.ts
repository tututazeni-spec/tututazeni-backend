// src/metrics-aggregation/metrics.types.ts
//
// Tipos partilhados do MetricsAggregationService (Fase H).
//
// Fonte canónica: docs/superpowers/plans/notes/fase-h-metrics-variants.md §7.
// Transcritos verbatim da nota da Task 1. As interfaces de `turnover`,
// `trainingRoi`, `alerts` e `managerDashboard` ficam aqui já completas ainda que
// só sejam consumidas nas Tasks 3-5 — é intencional (este ficheiro não volta a
// ser tocado nessas tasks).

// ─────────────────────────────────────────────────────────────
// Parâmetros partilhados
// ─────────────────────────────────────────────────────────────

/** Janela temporal fechada. Default de cada método: trailing 12 meses até `to`. */
export interface MetricPeriod {
  from: Date;
  to: Date;
}

/** Filtro de população, comum a headcount / turnover / trainingRoi. */
export interface MetricScopeFilter {
  departmentId?: number;
  managerId?: number;
  positionId?: number;
}

export type DashboardPeriodKey = 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';

// ─────────────────────────────────────────────────────────────
// headcount
// ─────────────────────────────────────────────────────────────

export interface HeadcountParams extends MetricScopeFilter {
  from?: Date; // default: to - 12 meses
  to?: Date; // default: agora
}

export interface HeadcountBreakdownEntry {
  id: number;
  name: string;
  level?: number; // só em byPosition
  count: number; // scoped a active:true
}

export interface HeadcountResult {
  total: number; // toda a população do filtro (activos + inactivos)
  active: number; // active === true
  inactive: number; // total - active
  newHires: number; // hireDate ∈ [from, to]
  newHiresPrev: number; // janela anterior de igual duração
  newHiresTrend: number; // % var. vs janela anterior, 1 dp
  avgTenureMonths: number; // média sobre activos, base hireDate ?? createdAt
  byTenure: { '<1yr': number; '1-2yr': number; '2-5yr': number; '5+yr': number };
  byDepartment: HeadcountBreakdownEntry[]; // desc por count
  byPosition: HeadcountBreakdownEntry[]; // top 10 desc por count
  period: MetricPeriod;
  generatedAt: Date;
}

// ─────────────────────────────────────────────────────────────
// headcountTrend
// ─────────────────────────────────────────────────────────────

export interface HeadcountTrendParams extends MetricScopeFilter {
  months?: number; // default 6
}

export interface HeadcountTrendPoint {
  month: string; // 'YYYY-MM'
  headcount: number; // activos ponto-a-ponto no fim do mês (hireDate <= fim && (exitDate == null || exitDate > fim))
  new: number; // hireDate no mês
  left: number; // exitDate no mês
}

// ─────────────────────────────────────────────────────────────
// turnover
// ─────────────────────────────────────────────────────────────

export interface TurnoverParams extends MetricScopeFilter {
  from?: Date; // default: to - 12 meses
  to?: Date; // default: agora
}

export interface TurnoverResult {
  leavers: number; // exitDate ∈ [from, to]
  avgHeadcount: number; // (headcountStart + headcountEnd) / 2
  turnoverRate: number; // leavers / avgHeadcount * 100, 1 dp
  retentionRate: number; // 100 - turnoverRate
  turnoverRatePrev: number; // janela anterior
  turnoverTrend: number; // turnoverRate - turnoverRatePrev, 1 dp
  newHires: number; // hireDate ∈ [from, to]
  netHeadcountChange: number; // newHires - leavers
  avgTenureMonths: number; // média sobre activos
  period: MetricPeriod;
}

// ─────────────────────────────────────────────────────────────
// trainingRoi
// ─────────────────────────────────────────────────────────────

export interface TrainingRoiParams {
  from?: Date; // default: to - 12 meses
  to?: Date; // default: agora
  departmentId?: number;
  courseId?: number;
  costPerEnrollment?: number; // default 200 (USD)
  benefitPerCompletion?: number; // default 500 (USD)
}

export interface TrainingRoiResult {
  enrollments: number;
  completed: number;
  completionRate: number; // %, 1 dp
  costPerEnrollment: number; // eco do input / default
  benefitPerCompletion: number;
  totalCost: number; // enrollments * costPerEnrollment
  grossBenefit: number; // completed * benefitPerCompletion
  netBenefit: number; // grossBenefit - totalCost
  roiPct: number; // (grossBenefit - totalCost) / totalCost * 100, 1 dp
  bcr: number; // grossBenefit / totalCost, 2 dp
  paybackMonths: number; // totalCost / (grossBenefit / 12), 1 dp
  trainingHours: number; // Σ Course.workloadHours das inscrições concluídas na janela
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  period: MetricPeriod;
}

// ─────────────────────────────────────────────────────────────
// alerts
// ─────────────────────────────────────────────────────────────

export type MetricAlertScope = 'user' | 'team' | 'organization';
export type MetricAlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AlertParams {
  scope: MetricAlertScope;
  userId?: number; // obrigatório p/ 'user' | 'team'
  roleCode?: string; // habilita TEAM_PERFORMANCE_AT_RISK
  departmentId?: number;
}

export interface MetricAlert {
  key: string; // id estável da regra (secção 4.6), ex. 'MANDATORY_TRAINING_PENDING'
  type: string; // bucket de domínio: PERFORMANCE|COMPLIANCE|PDI|ENGAGEMENT|TRAINING|SURVEY|EVALUATION|RISK
  severity: MetricAlertSeverity;
  message: string;
  count?: number;
  actionUrl?: string;
  scope: MetricAlertScope;
}

// ─────────────────────────────────────────────────────────────
// managerDashboard
// ─────────────────────────────────────────────────────────────

export interface ManagerDashboardParams {
  userId: number;
  period?: DashboardPeriodKey; // default 'MONTH'
  departmentId?: number;
}

export interface ManagerDashboardTeamMember {
  user: {
    id: number;
    fullName: string;
    avatarUrl: string | null;
    position: { name: string } | null;
    department?: { name: string } | null;
  };
  xp: number;
  enrollment: { completed: number; inProgress: number };
  plan: { progress: number; status: string } | null;
  lastScore: number | null;
  atRisk: boolean;
}

export interface ManagerDashboardKpis {
  pdpCoverage: number; // ≡ pdiAdoptionRate
  activePlans: number; // ≡ activePDIs
  completedPlans: number;
  inProgress: number; // inscrições em progresso (agregado da equipa)
  completedEnrollments: number; // concluídas na janela
  enrollmentsTotal: number; // contagem bruta (de analytics)
  completions: number; // contagem bruta (de analytics)
  completionRate: number;
  avgScore: number | null; // ≡ avgPerformance
  scoreTrend: number | null;
  mandatoryRate: number;
  engagementResponses: number;
  avatarSessions: number;
  pendingEvals: number;
  overdueActions: number; // de analytics
}

export interface ManagerDashboardCompetencyGap {
  name: string;
  totalGap: number;
  count: number;
  avgGap: number;
}

export interface ManagerDashboardNineBoxEntry {
  userId: number;
  fullName: string;
  avatarUrl: string | null;
  performanceAxis: string;
  potentialAxis: string;
  quadrant: string; // `${performanceAxis}-${potentialAxis}`
}

export interface ManagerDashboardResult {
  teamSize: number;
  team: ManagerDashboardTeamMember[];
  kpis: ManagerDashboardKpis;
  competencyGaps: ManagerDashboardCompetencyGap[]; // top 5 por totalGap
  nineBox: ManagerDashboardNineBoxEntry[];
  alerts: MetricAlert[]; // scope 'team'
}

// ─────────────────────────────────────────────────────────────
// As 6 assinaturas de método do MetricsAggregationService
// (leituras sempre via this.prisma.read.*)
// ─────────────────────────────────────────────────────────────

export interface IMetricsAggregationService {
  headcount(params: HeadcountParams): Promise<HeadcountResult>;
  headcountTrend(params: HeadcountTrendParams): Promise<HeadcountTrendPoint[]>;
  turnover(params: TurnoverParams): Promise<TurnoverResult>;
  trainingRoi(params: TrainingRoiParams): Promise<TrainingRoiResult>;
  alerts(params: AlertParams): Promise<MetricAlert[]>;
  managerDashboard(params: ManagerDashboardParams): Promise<ManagerDashboardResult>;
}

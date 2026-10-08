// src/executive-reports/executive-reports.kpi-catalog.ts
// Catálogo único de KPIs executivos (docs/Executive_Reports.md §3 e §12.1).
// Cada KPI tem UMA definição (fórmula, fonte, unidade, meta e limiares) usada
// em todos os separadores e relatórios. As metas/limiares aqui são os valores
// por omissão; um modelo ExecutiveKPIDefinition (§11) poderá sobrepô-los mais
// tarde sem alterar a fórmula.

export type KpiCode =
  'HEADCOUNT' | 'PERFORMANCE' | 'TRAINING_COMPLETION' | 'ATTENDANCE' | 'TURNOVER' | 'PDI_OVERDUE';

export type KpiDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NEUTRAL';

export interface KpiDefinition {
  code: KpiCode;
  name: string;
  /** Rótulo curto do cartão (§3.1, coluna "Indicador"). */
  shortLabel: string;
  description: string;
  formula: string;
  unit: '%' | 'pessoas' | 'acções';
  direction: KpiDirection;
  sourceModules: string[];
  /** Meta por omissão (null = sem meta). */
  target: number | null;
  /**
   * Limiares: para HIGHER_IS_BETTER, `warning`/`critical` são mínimos
   * (valor < warning ⇒ alerta; valor < critical ⇒ crítico). Para
   * LOWER_IS_BETTER são máximos (valor > warning ⇒ alerta; > critical ⇒ crítico).
   */
  warningThreshold: number | null;
  criticalThreshold: number | null;
}

export const KPI_CATALOG: Record<KpiCode, KpiDefinition> = {
  HEADCOUNT: {
    code: 'HEADCOUNT',
    name: 'Quadro de pessoal',
    shortLabel: 'Quadro de pessoal',
    description: 'Colaboradores activos no fim do período, com variação face à comparação.',
    formula:
      'Utilizadores com data de admissão ≤ fim do período e sem data de saída anterior ao fim do período (activos, se sem data de saída).',
    unit: 'pessoas',
    direction: 'NEUTRAL',
    sourceModules: ['users', 'departments'],
    target: null,
    warningThreshold: null,
    criticalThreshold: null,
  },
  PERFORMANCE: {
    code: 'PERFORMANCE',
    name: 'Desempenho — metas alcançadas',
    shortLabel: 'Desempenho',
    description:
      'Progresso médio das metas de desempenho dos ciclos que intersectam o período (realizado vs. objectivo).',
    formula:
      'Média de min(progresso, 100) das metas (PerformanceGoal) de ciclos que intersectam o período.',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    sourceModules: ['performance'],
    target: 80,
    warningThreshold: 70,
    criticalThreshold: 50,
  },
  TRAINING_COMPLETION: {
    code: 'TRAINING_COMPLETION',
    name: 'Formação — taxa de conclusão',
    shortLabel: 'Formação',
    description: 'Inscrições elegíveis no período que foram concluídas.',
    formula:
      'Inscrições concluídas ÷ inscrições elegíveis (criadas no período, excluindo canceladas e pendentes de aprovação) × 100.',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    sourceModules: ['enrollments', 'courses', 'trainings'],
    target: 70,
    warningThreshold: 60,
    criticalThreshold: 30,
  },
  ATTENDANCE: {
    code: 'ATTENDANCE',
    name: 'Assiduidade — taxa de presença',
    shortLabel: 'Assiduidade',
    description: 'Presenças registadas face às presenças esperadas no período.',
    formula:
      'Registos PRESENT/LATE/REMOTE/PARTIAL/meio-dia ÷ registos esperados (exclui ON_LEAVE, HOLIDAY e RECORDED) × 100.',
    unit: '%',
    direction: 'HIGHER_IS_BETTER',
    sourceModules: ['attendance', 'leave'],
    target: 95,
    warningThreshold: 92,
    criticalThreshold: 85,
  },
  TURNOVER: {
    code: 'TURNOVER',
    name: 'Rotatividade',
    shortLabel: 'Rotatividade',
    description: 'Saídas no período face ao efectivo médio.',
    formula: 'Saídas no período ÷ ((efectivo no início + efectivo no fim) ÷ 2) × 100.',
    unit: '%',
    direction: 'LOWER_IS_BETTER',
    sourceModules: ['users'],
    target: 5,
    warningThreshold: 5,
    criticalThreshold: 10,
  },
  PDI_OVERDUE: {
    code: 'PDI_OVERDUE',
    name: 'Desenvolvimento — acções de PDI atrasadas',
    shortLabel: 'Desenvolvimento',
    description: 'Acções de PDI com prazo ultrapassado e ainda não concluídas.',
    formula:
      'Acções (DevelopmentPlanAction) não concluídas nem canceladas com prazo < fim do período (e não concluídas até essa data).',
    unit: 'acções',
    direction: 'LOWER_IS_BETTER',
    sourceModules: ['development-plans'],
    target: 0,
    warningThreshold: 5,
    criticalThreshold: 20,
  },
};

export const PRIMARY_KPI_CODES: KpiCode[] = [
  'HEADCOUNT',
  'PERFORMANCE',
  'TRAINING_COMPLETION',
  'ATTENDANCE',
  'TURNOVER',
  'PDI_OVERDUE',
];

export type KpiState = 'ON_TARGET' | 'WARNING' | 'CRITICAL' | 'NO_TARGET' | 'NO_DATA';

export function evaluateKpiState(def: KpiDefinition, value: number | null): KpiState {
  if (value === null) return 'NO_DATA';
  if (def.direction === 'NEUTRAL' || def.target === null) return 'NO_TARGET';
  const { warningThreshold: w, criticalThreshold: c } = def;
  if (def.direction === 'HIGHER_IS_BETTER') {
    if (c !== null && value < c) return 'CRITICAL';
    if (w !== null && value < w) return 'WARNING';
    return 'ON_TARGET';
  }
  if (c !== null && value > c) return 'CRITICAL';
  if (w !== null && value > w) return 'WARNING';
  return 'ON_TARGET';
}

// ─── Separadores (docs/Executive_Reports.md §2) ──────────────────────────────

export type ExecutiveTabId =
  | 'overview'
  | 'strategic'
  | 'hr'
  | 'training'
  | 'performance'
  | 'attendance'
  | 'costs'
  | 'departments'
  | 'projects'
  | 'risks'
  | 'custom'
  | 'scheduled'
  | 'history';

export interface ExecutiveTabDef {
  id: ExecutiveTabId;
  label: string;
  hint: string;
  /** Papéis com acesso (nomes reais de Role.name). */
  roles: string[];
}

const FULL = ['ADMIN', 'RH', 'DIRECTOR'];
const MGMT = [...FULL, 'GESTOR', 'LIDER'];

export const EXECUTIVE_TABS: ExecutiveTabDef[] = [
  { id: 'overview', label: 'Visão Executiva', hint: 'Resumo geral da organização', roles: MGMT },
  {
    id: 'strategic',
    label: 'Indicadores Estratégicos',
    hint: 'KPIs, metas e desvios',
    roles: MGMT,
  },
  {
    id: 'hr',
    label: 'Recursos Humanos',
    hint: 'Dados consolidados dos colaboradores',
    roles: MGMT,
  },
  { id: 'training', label: 'Formação & Academia', hint: 'Formação e aprendizagem', roles: MGMT },
  {
    id: 'performance',
    label: 'Desempenho & Talento',
    hint: 'Avaliações, PDI e carreira',
    roles: MGMT,
  },
  {
    id: 'attendance',
    label: 'Assiduidade & Ausências',
    hint: 'Presenças, férias e licenças',
    roles: MGMT,
  },
  {
    id: 'costs',
    label: 'Custos & Orçamento',
    hint: 'Pessoal e formação (acesso restrito)',
    roles: ['ADMIN', 'DIRECTOR'],
  },
  {
    id: 'departments',
    label: 'Departamentos & Unidades',
    hint: 'Comparação entre áreas',
    roles: MGMT,
  },
  {
    id: 'projects',
    label: 'Projectos & Planos',
    hint: 'Planos, iniciativas e objectivos',
    roles: MGMT,
  },
  { id: 'risks', label: 'Riscos & Alertas', hint: 'Desvios, pendências e prazos', roles: MGMT },
  { id: 'custom', label: 'Relatórios Personalizados', hint: 'Construção com filtros', roles: FULL },
  { id: 'scheduled', label: 'Relatórios Agendados', hint: 'Envio recorrente', roles: FULL },
  {
    id: 'history',
    label: 'Histórico & Arquivo',
    hint: 'Relatórios gerados e versões',
    roles: FULL,
  },
];

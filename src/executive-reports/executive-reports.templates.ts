// src/executive-reports/executive-reports.templates.ts
// Modelos predefinidos (docs/Executive_Reports.md §7) e catálogo de secções que
// os relatórios personalizados (§8) podem combinar. Cada relatório gerado guarda
// o código + versão do modelo e a versão das fórmulas (§12.4).
import type { KpiCode } from './executive-reports.kpi-catalog';

/** Incrementar quando uma fórmula do catálogo de KPIs mudar (§12.4). */
export const FORMULA_VERSION = '1';

export type SectionKey =
  | 'kpis'
  | 'goals'
  | 'workforce'
  | 'movements'
  | 'training'
  | 'performance'
  | 'competencies'
  | 'pdi'
  | 'onboarding'
  | 'attendance'
  | 'leave'
  | 'costs'
  | 'departments'
  | 'processes'
  | 'compliance'
  | 'integrations'
  | 'alerts';

export interface SectionDef {
  key: SectionKey;
  title: string;
  sourceModules: string[];
  /** Dados sensíveis: só ADMIN/DIRECTOR (§4 "Importante"). */
  restricted?: boolean;
  /** Dados que não podem ser limitados ao departamento do utilizador. */
  organizationWide?: boolean;
}

export const SECTION_CATALOG: Record<SectionKey, SectionDef> = {
  kpis: {
    key: 'kpis',
    title: 'Indicadores-chave',
    sourceModules: ['users', 'performance', 'enrollments', 'attendance', 'development-plans'],
  },
  goals: {
    key: 'goals',
    title: 'Metas e execução',
    sourceModules: ['performance', 'enrollments', 'development-plans', 'onboarding'],
  },
  workforce: {
    key: 'workforce',
    title: 'Quadro de pessoal',
    sourceModules: ['users', 'departments'],
  },
  movements: { key: 'movements', title: 'Admissões e saídas', sourceModules: ['users'] },
  training: {
    key: 'training',
    title: 'Formação',
    sourceModules: ['enrollments', 'courses', 'trainings'],
  },
  performance: { key: 'performance', title: 'Desempenho', sourceModules: ['performance'] },
  competencies: { key: 'competencies', title: 'Competências', sourceModules: ['competencies'] },
  pdi: { key: 'pdi', title: 'PDI e desenvolvimento', sourceModules: ['development-plans'] },
  onboarding: { key: 'onboarding', title: 'Onboarding', sourceModules: ['onboarding'] },
  attendance: { key: 'attendance', title: 'Assiduidade', sourceModules: ['attendance'] },
  leave: { key: 'leave', title: 'Férias e licenças', sourceModules: ['leave'] },
  costs: {
    key: 'costs',
    title: 'Custos de pessoal',
    sourceModules: ['payroll / payslips'],
    restricted: true,
  },
  departments: {
    key: 'departments',
    title: 'Departamentos',
    sourceModules: ['departments', 'users'],
  },
  processes: {
    key: 'processes',
    title: 'Processos',
    sourceModules: ['processes'],
    organizationWide: true,
  },
  compliance: {
    key: 'compliance',
    title: 'Conformidade',
    sourceModules: ['document-repository', 'enrollments', 'leave'],
    organizationWide: true,
  },
  integrations: {
    key: 'integrations',
    title: 'Integrações',
    sourceModules: ['API Integration'],
    restricted: true,
    organizationWide: true,
  },
  alerts: { key: 'alerts', title: 'Alertas em aberto', sourceModules: ['executive-reports'] },
};

export const SECTION_KEYS = Object.keys(SECTION_CATALOG) as SectionKey[];

export type TemplateCategory =
  'EXECUTIVE' | 'HR' | 'LEARNING' | 'PERFORMANCE' | 'OPERATIONS' | 'CUSTOM';

export interface TemplateDef {
  code: string;
  name: string;
  description: string;
  category: TemplateCategory;
  version: number;
  /** Valor de ReportType usado ao persistir. */
  reportType: 'FLASH' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'CUSTOM' | 'AUDIT';
  period: 'month' | 'quarter' | 'year';
  sections: SectionKey[];
  /** Restringe os KPIs apresentados na secção `kpis` (omissão: todos). */
  kpiCodes?: KpiCode[];
  /** Papéis autorizados (nomes de Role.name); omissão: todos os papéis do módulo. */
  roles?: string[];
}

const RESTRICTED_ROLES = ['ADMIN', 'DIRECTOR'];

export const REPORT_TEMPLATES: TemplateDef[] = [
  {
    code: 'EXEC_MONTHLY',
    name: 'Relatório Executivo Mensal',
    description: 'KPIs globais, variações, metas, alertas e principais ocorrências',
    category: 'EXECUTIVE',
    version: 1,
    reportType: 'MONTHLY',
    period: 'month',
    sections: ['kpis', 'goals', 'movements', 'alerts'],
  },
  {
    code: 'HR_QUARTERLY',
    name: 'Relatório Trimestral de RH',
    description: 'Evolução do quadro de pessoal, admissões, saídas, ausências e desempenho',
    category: 'HR',
    version: 1,
    reportType: 'QUARTERLY',
    period: 'quarter',
    sections: ['kpis', 'workforce', 'movements', 'attendance', 'leave', 'performance'],
  },
  {
    code: 'HR_ANNUAL',
    name: 'Relatório Anual de RH',
    description: 'Evolução anual, composição do pessoal, custos e resultados',
    category: 'HR',
    version: 1,
    reportType: 'ANNUAL',
    period: 'year',
    sections: ['kpis', 'workforce', 'movements', 'performance', 'training', 'costs'],
  },
  {
    code: 'TRAINING',
    name: 'Relatório de Formação',
    description: 'Plano executado, participantes, conclusões, horas, custos e avaliações',
    category: 'LEARNING',
    version: 1,
    reportType: 'CUSTOM',
    period: 'year',
    sections: ['training', 'goals', 'compliance'],
    kpiCodes: ['TRAINING_COMPLETION'],
  },
  {
    code: 'PERFORMANCE',
    name: 'Relatório de Desempenho',
    description: 'Avaliações realizadas, objectivos e distribuição dos resultados',
    category: 'PERFORMANCE',
    version: 1,
    reportType: 'CUSTOM',
    period: 'year',
    sections: ['kpis', 'performance', 'departments'],
    kpiCodes: ['PERFORMANCE'],
  },
  {
    code: 'COMPETENCIES',
    name: 'Relatório de Competências',
    description: 'Competências existentes, lacunas e necessidades de desenvolvimento',
    category: 'PERFORMANCE',
    version: 1,
    reportType: 'CUSTOM',
    period: 'year',
    sections: ['competencies', 'pdi'],
  },
  {
    code: 'PDI_CAREER',
    name: 'Relatório de PDI e Carreira',
    description: 'Planos activos, progresso, atrasos e evolução profissional',
    category: 'PERFORMANCE',
    version: 1,
    reportType: 'CUSTOM',
    period: 'year',
    sections: ['kpis', 'pdi', 'goals'],
    kpiCodes: ['PDI_OVERDUE'],
  },
  {
    code: 'ONBOARDING',
    name: 'Relatório de Onboarding',
    description: 'Admissões, planos de integração, tarefas concluídas e pendências',
    category: 'HR',
    version: 1,
    reportType: 'CUSTOM',
    period: 'quarter',
    sections: ['movements', 'onboarding'],
  },
  {
    code: 'ATTENDANCE',
    name: 'Relatório de Assiduidade',
    description: 'Presenças, faltas, atrasos e tendências de ausência',
    category: 'HR',
    version: 1,
    reportType: 'CUSTOM',
    period: 'month',
    sections: ['kpis', 'attendance', 'departments'],
    kpiCodes: ['ATTENDANCE'],
  },
  {
    code: 'LEAVE',
    name: 'Relatório de Férias e Licenças',
    description: 'Dias utilizados, pedidos, aprovações e ausências planeadas',
    category: 'HR',
    version: 1,
    reportType: 'CUSTOM',
    period: 'year',
    sections: ['leave', 'attendance'],
  },
  {
    code: 'PERSONNEL_COSTS',
    name: 'Relatório de Custos de Pessoal',
    description: 'Remunerações, encargos e variação dos custos, com acesso restrito',
    category: 'EXECUTIVE',
    version: 1,
    reportType: 'CUSTOM',
    period: 'year',
    sections: ['costs'],
    roles: RESTRICTED_ROLES,
  },
  {
    code: 'UNITS_DEPARTMENTS',
    name: 'Relatório de Unidades e Departamentos',
    description: 'Comparação de indicadores por estrutura organizacional',
    category: 'EXECUTIVE',
    version: 1,
    reportType: 'CUSTOM',
    period: 'year',
    sections: ['workforce', 'departments', 'goals'],
  },
  {
    code: 'PROCESSES',
    name: 'Relatório de Processos',
    description: 'Volume, duração, atrasos e taxa de conclusão',
    category: 'OPERATIONS',
    version: 1,
    reportType: 'CUSTOM',
    period: 'quarter',
    sections: ['processes'],
    roles: ['ADMIN', 'RH', 'DIRECTOR'],
  },
  {
    code: 'COMPLIANCE',
    name: 'Relatório de Conformidade',
    description: 'Documentos, obrigações, prazos e pendências registadas',
    category: 'OPERATIONS',
    version: 1,
    reportType: 'AUDIT',
    period: 'year',
    sections: ['compliance', 'alerts'],
    roles: ['ADMIN', 'RH', 'DIRECTOR'],
  },
  {
    code: 'INTEGRATIONS',
    name: 'Relatório de Integrações',
    description: 'Estado das sincronizações, falhas e última execução',
    category: 'OPERATIONS',
    version: 1,
    reportType: 'AUDIT',
    period: 'month',
    sections: ['integrations'],
    roles: RESTRICTED_ROLES,
  },
];

export const CUSTOM_TEMPLATE_CODE = 'CUSTOM';

export function findTemplate(code: string): TemplateDef | undefined {
  return REPORT_TEMPLATES.find(t => t.code === code);
}

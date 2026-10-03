// src/process-standard/process-integrations.ts
// Matriz de integração do módulo Processes com os restantes módulos da INNOVA
// (docs/Modulo_Processes.md §15). O catálogo descreve a integração funcional
// pretendida; o estado real de cada módulo é calculado a partir da actividade
// (processos iniciados, modelos que o referenciam, eventos recebidos).

export interface CatalogEntry {
  key: string;
  label: string;
  description: string;
  /** Outros nomes com que o módulo pode aparecer em `sourceModule`/`involvedModules`. */
  aliases?: string[];
  /** Nota do doc: módulo fundido/removido da interface (só a implementação efectiva conta). */
  note?: string;
}

export const normalizeModule = (v: string | null | undefined) =>
  (v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

export const INTEGRATION_CATALOG: CatalogEntry[] = [
  {
    key: 'Auth',
    label: 'Auth',
    description: 'Autenticação, sessões e validação do acesso aos processos.',
  },
  {
    key: 'Users',
    label: 'Users',
    description: 'Solicitantes, responsáveis, aprovadores, substitutos e participantes.',
    aliases: ['Utilizadores'],
  },
  {
    key: 'Departments',
    label: 'Departments',
    description: 'Responsabilidade departamental, distribuição e encaminhamento.',
    aliases: ['Departamentos'],
  },
  {
    key: 'Organization',
    label: 'Organization',
    description: 'Unidades, hierarquia, chefias e regras organizacionais.',
  },
  {
    key: 'Roles',
    label: 'Roles / Permissions',
    description: 'Permissões por função, acção e âmbito organizacional.',
    aliases: ['Permissions', 'RolesPermissions'],
  },
  {
    key: 'Courses',
    label: 'Courses',
    description: 'Aprovação, publicação, revisão e actualização de cursos.',
    aliases: ['Cursos'],
  },
  {
    key: 'CourseModules',
    label: 'Course Modules',
    description: 'Revisão de módulos, conteúdos e etapas de publicação.',
  },
  {
    key: 'LearningPaths',
    label: 'Learning Paths',
    description: 'Aprovação e acompanhamento de percursos de aprendizagem.',
  },
  {
    key: 'Enrollments',
    label: 'Enrollments',
    description: 'Aprovação de inscrições e resolução de excepções.',
    aliases: ['Matriculas'],
  },
  {
    key: 'Evaluation',
    label: 'Assessments / Evaluation',
    description: 'Validação de avaliações, revisão de resultados e pedidos de correcção.',
    aliases: ['Assessments', 'Avaliacao'],
  },
  {
    key: 'Competencies',
    label: 'Competencies',
    description: 'Aprovação de matrizes, actualização de competências e validação de avaliações.',
    aliases: ['Competencias'],
  },
  {
    key: 'Performance',
    label: 'Performance',
    description: 'Ciclos de avaliação, validação e encerramento.',
  },
  {
    key: 'Evaluation360',
    label: 'Evaluation 360º',
    description: 'Convites, validação de participantes, fecho e tratamento de pendências.',
    aliases: ['360'],
  },
  {
    key: 'CompetencyMap',
    label: 'Competency Map',
    description: 'Revisão e aprovação de actualizações do mapa de competências.',
  },
  {
    key: 'DevelopmentPlans',
    label: 'Development Plans / PDI',
    description: 'Aprovação de planos, acções, metas, revisões e conclusão.',
    aliases: ['PDI', 'DevPlans'],
  },
  {
    key: 'CareerPlans',
    label: 'Career Plans',
    description: 'Aprovação de planos de carreira e respectivas etapas.',
    aliases: ['Career', 'Carreira'],
  },
  {
    key: 'TalentDevelopment',
    label: 'Talent Development',
    description: 'Selecção para programas, validação de planos e acompanhamento.',
  },
  {
    key: 'Leadership',
    label: 'Leadership',
    description: 'Programas de liderança, nomeações e aprovação de acções.',
    aliases: ['Lideranca'],
  },
  {
    key: 'Succession',
    label: 'Succession',
    description:
      'Aprovações de planos sucessórios, caso esta funcionalidade esteja integrada em Carreira.',
    note: 'Integrado em Carreira na interface — usar o módulo efectivo.',
  },
  {
    key: 'Onboarding',
    label: 'Onboarding',
    description: 'Admissão, documentação, tarefas de integração e acompanhamento.',
  },
  {
    key: 'Trainings',
    label: 'Trainings',
    description: 'Planeamento, aprovação e execução de formações, turmas e sessões.',
    aliases: ['Formacoes'],
  },
  {
    key: 'Attendance',
    label: 'Attendance',
    description: 'Tratamento de faltas, correcções de presenças e validações excepcionais.',
    aliases: ['Presencas'],
  },
  {
    key: 'AITutor',
    label: 'AI Tutor',
    description:
      'Encaminhamento de tarefas de aprendizagem e recomendações que necessitem de validação humana.',
  },
  {
    key: 'AvatarTraining',
    label: 'Avatar Training',
    description: 'Aprovação, publicação e acompanhamento de formações com avatar.',
  },
  {
    key: 'MicroLearning',
    label: 'Micro-learning',
    description: 'Aprovação de conteúdos e campanhas de microaprendizagem.',
  },
  {
    key: 'Knowledge',
    label: 'Knowledge',
    description: 'Revisão, validação e publicação de conteúdos de conhecimento.',
    aliases: ['Conhecimento'],
  },
  {
    key: 'ContentLibrary',
    label: 'Content Library',
    description: 'Aprovação e publicação de materiais de aprendizagem.',
  },
  {
    key: 'Instructor',
    label: 'Instructor / Formadores',
    description: 'Validação de formadores, atribuições, documentação e requisitos.',
    aliases: ['Formadores', 'Instructors'],
  },
  {
    key: 'Feedback360',
    label: '360 Feedback',
    description:
      'Fluxos de convite, recolha, validação e encerramento, caso exista um módulo separado.',
  },
  {
    key: 'Leave',
    label: 'Leave / Férias e Licenças',
    description:
      'Encaminhamento e aprovação de pedidos, respeitando o módulo responsável pelo pedido e pelas regras de saldo.',
    aliases: ['Ferias', 'Licencas', 'LeaveRequest'],
  },
  {
    key: 'Payroll',
    label: 'Payroll & Payslips',
    description:
      'Validação de alterações e excepções autorizadas, sem duplicar o processamento salarial.',
    aliases: ['Payslips', 'Salarios'],
    note: 'Payroll e Payslips estão fundidos — uma só integração.',
  },
  {
    key: 'WorkDeclaration',
    label: 'Work Declaration',
    description: 'Emissão, validação, assinatura e arquivo das declarações.',
    aliases: ['Declarations', 'Declaracoes'],
  },
  {
    key: 'Documents',
    label: 'Document Repository',
    description: 'Documentos, versões, evidências e arquivo.',
    aliases: ['DocumentRepository', 'Documentos'],
  },
  {
    key: 'Library',
    label: 'Biblioteca',
    description: 'Revisão e aprovação de normas, circulares, regulamentos e ordens de serviço.',
    aliases: ['Biblioteca'],
  },
  {
    key: 'Notifications',
    label: 'Notifications',
    description:
      'Alertas de atribuição, aprovação, atraso, devolução e conclusão através do sistema existente.',
    aliases: ['Notificacoes'],
  },
  {
    key: 'History',
    label: 'History',
    description: 'Consulta ou ligação ao histórico central e aos eventos do processo.',
    aliases: ['Audit', 'Auditoria'],
  },
  {
    key: 'Automation',
    label: 'Automações',
    description: 'Execução e monitorização de regras automáticas, sem duplicar o motor.',
    aliases: ['Automations', 'Automacoes'],
  },
  {
    key: 'Events',
    label: 'Events',
    description: 'Inscrições, aprovações, organização e tarefas associadas a eventos.',
    aliases: ['Eventos'],
  },
  {
    key: 'Engagement',
    label: 'Engagement',
    description:
      'Encaminhamento de iniciativas e acções de envolvimento, se o módulo estiver activo.',
  },
  {
    key: 'ExecutiveReports',
    label: 'Executive Reports',
    description: 'Indicadores, tempos, atrasos, volumes e resultados dos processos.',
  },
  {
    key: 'Analytics',
    label: 'Analytics',
    description: 'Dados analíticos sobre etapas, desempenho, carga de trabalho e tendências.',
  },
  {
    key: 'Monitoring',
    label: 'Monitoring / Indicators',
    description:
      'Eventos e métricas, mantendo o modelo de dados mesmo que o módulo de interface seja removido.',
    aliases: ['Indicators'],
    note: 'Módulo de interface removido — apenas o modelo de dados.',
  },
  {
    key: 'ApiIntegration',
    label: 'API Integration',
    description:
      'Recepção de eventos externos e comunicação com ERP, SSO e outros sistemas autorizados.',
    aliases: ['API', 'ERP', 'SSO', 'Integrations'],
  },
  {
    key: 'CrmBeneficiaries',
    label: 'CRM — Beneficiários',
    description: 'Aprovação de registos, actualizações e procedimentos relativos a beneficiários.',
    aliases: ['Beneficiarios'],
  },
  {
    key: 'CrmPartners',
    label: 'CRM — Parceiros',
    description: 'Validação de parceiros, documentação e alterações de registo.',
    aliases: ['Parceiros'],
  },
  {
    key: 'CrmFunders',
    label: 'CRM — Financiadores',
    description:
      'Revisão de informação, documentação e processos de relacionamento com financiadores.',
    aliases: ['Financiadores'],
  },
  {
    key: 'Processes',
    label: 'Processes',
    description: 'Execução dos próprios fluxos, tarefas, aprovações e subprocessos.',
    aliases: ['Processos'],
  },
];

/** Indexa o catálogo por nome normalizado (chave, rótulo e aliases). */
export function catalogIndex(catalog: CatalogEntry[] = INTEGRATION_CATALOG) {
  const idx = new Map<string, CatalogEntry>();
  for (const c of catalog) {
    for (const n of [c.key, c.label, ...(c.aliases ?? [])]) idx.set(normalizeModule(n), c);
  }
  return idx;
}

export type IntegrationStatus = 'ACTIVE' | 'CONFIGURED' | 'NO_ACTIVITY' | 'ERRORS';

export interface IntegrationMetrics {
  instances: number;
  openInstances: number;
  templates: number;
  events: number;
  failedEvents: number;
  lastActivityAt: Date | null;
}

/** ACTIVE = já iniciou processos/eventos; CONFIGURED = só há modelos; ERRORS = falhas por tratar. */
export function integrationStatus(m: IntegrationMetrics): IntegrationStatus {
  if (m.failedEvents > 0) return 'ERRORS';
  if (m.instances > 0 || m.events > 0) return 'ACTIVE';
  if (m.templates > 0) return 'CONFIGURED';
  return 'NO_ACTIVITY';
}

export const emptyMetrics = (): IntegrationMetrics => ({
  instances: 0,
  openInstances: 0,
  templates: 0,
  events: 0,
  failedEvents: 0,
  lastActivityAt: null,
});

export const laterOf = (a: Date | null, b: Date | null | undefined) => (b && (!a || b > a) ? b : a);

/** Chave de idempotência âmbito módulo — o mesmo evento de módulos distintos não colide. */
export const scopedIdempotencyKey = (module: string, key: string) =>
  `${normalizeModule(module)}:${key.trim()}`;

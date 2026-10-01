// src/executive-reports/executive-reports.sources.ts
// Matriz de integração por módulo (docs/Executive_Reports.md §4.1). Cada linha
// diz que dados o Executive Reports deve consumir do módulo e se essa ligação
// já existe no código (INTEGRATED) ou ainda está por fazer (PLANNED). Só as
// ligações INTEGRATED têm contagem de registos — as restantes não inventam dados.

export type SourceStatus = 'INTEGRATED' | 'PLANNED' | 'CONTEXT' | 'REPLACED';

export type SourceCounterKey =
  | 'users'
  | 'departments'
  | 'attendance'
  | 'leave'
  | 'courses'
  | 'enrollments'
  | 'performance'
  | 'competencies'
  | 'development-plans'
  | 'onboarding';

export interface SourceDefinition {
  module: string;
  consumes: string;
  status: SourceStatus;
  /** Indicadores/gráficos que já usam esta fonte. */
  usedBy: string[];
  /** Dados sensíveis: só papéis com acesso a Custos & Orçamento (ADMIN/DIRECTOR). */
  restricted?: boolean;
  /** Nota quando o estado não é óbvio (ex.: módulo removido). */
  note?: string;
  counter?: SourceCounterKey;
}

export const SOURCE_MATRIX: SourceDefinition[] = [
  {
    module: 'users',
    consumes:
      'Total de colaboradores, activos/inactivos, admissões, perfil profissional, unidade, cargo e departamento',
    status: 'INTEGRATED',
    usedBy: ['Quadro de pessoal', 'Rotatividade', 'Distribuição e composição'],
    counter: 'users',
  },
  {
    module: 'departments',
    consumes: 'Estrutura organizacional, dimensão dos departamentos, distribuição de pessoal',
    status: 'INTEGRATED',
    usedBy: ['Comparação entre departamentos', 'Mapa de calor de riscos'],
    counter: 'departments',
  },
  {
    module: 'organization',
    consumes: 'Unidades, hierarquia, estrutura, distribuição e consolidação organizacional',
    status: 'REPLACED',
    usedBy: ['Filtro de unidade'],
    note: 'O módulo organization foi removido do backend; as unidades vêm de users/departments.',
  },
  {
    module: 'attendance',
    consumes: 'Presenças, faltas, atrasos, trabalho remoto e horas registadas',
    status: 'INTEGRATED',
    usedBy: ['Assiduidade', 'Absentismo por departamento'],
    counter: 'attendance',
  },
  {
    module: 'leave',
    consumes: 'Férias, licenças, dias de ausência, pedidos pendentes e aprovações',
    status: 'INTEGRATED',
    usedBy: ['Licenças pendentes/em curso', 'Aprovações em atraso'],
    counter: 'leave',
  },
  {
    module: 'payroll / payslips',
    consumes: 'Remuneração, custos de pessoal, encargos, totais mensais e evolução salarial',
    status: 'PLANNED',
    usedBy: [],
    restricted: true,
  },
  {
    module: 'work-declaration',
    consumes: 'Declarações emitidas, pendentes, assinadas e por regularizar',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'trainings',
    consumes: 'Plano de formação, acções, turmas, sessões, participantes, formadores e custos',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'courses',
    consumes: 'Catálogo de cursos, cursos activos, inscrições, conclusão e avaliação',
    status: 'INTEGRATED',
    usedBy: ['Horas de formação', 'Filtro de curso'],
    counter: 'courses',
  },
  {
    module: 'course-modules',
    consumes: 'Progresso por módulo, conteúdos concluídos e dificuldades de aprendizagem',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'enrollments',
    consumes: 'Inscrições, estados, desistências, conclusões e taxas de conclusão',
    status: 'INTEGRATED',
    usedBy: ['Formação — taxa de conclusão', 'Formações obrigatórias em atraso'],
    counter: 'enrollments',
  },
  {
    module: 'assessments',
    consumes: 'Resultados de avaliações, classificações e aproveitamento',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'competencies',
    consumes: 'Competências avaliadas, níveis de proficiência e lacunas identificadas',
    status: 'INTEGRATED',
    usedBy: ['Competências avaliadas', 'Lacunas de competências'],
    counter: 'competencies',
  },
  {
    module: 'competency-map',
    consumes: 'Mapa de competências por cargo, departamento e unidade',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'performance',
    consumes: 'Resultados das avaliações, objectivos, metas e ciclos de desempenho',
    status: 'INTEGRATED',
    usedBy: ['Desempenho — metas alcançadas', 'Avaliações concluídas'],
    counter: 'performance',
  },
  {
    module: '360 feedback',
    consumes: 'Taxa de participação, avaliações concluídas e resultados agregados de feedback',
    status: 'PLANNED',
    usedBy: [],
    restricted: true,
  },
  {
    module: 'development-plans',
    consumes: 'PDI, acções planeadas, execução, progresso e acções atrasadas',
    status: 'INTEGRATED',
    usedBy: ['Desenvolvimento — acções de PDI atrasadas', 'Execução de planos'],
    counter: 'development-plans',
  },
  {
    module: 'career-plans',
    consumes: 'Mobilidade interna, progressão de carreira e planos de evolução profissional',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'talent-development',
    consumes: 'Talentos identificados, programas de desenvolvimento e evolução de competências',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'onboarding',
    consumes: 'Novas admissões, tarefas de integração, conclusão de planos e pendências',
    status: 'INTEGRATED',
    usedBy: ['Onboarding em curso/concluído', 'Execução de planos'],
    counter: 'onboarding',
  },
  {
    module: 'leadership',
    consumes: 'Programas de liderança, participação, conclusão e avaliação',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'micro-learning',
    consumes: 'Microformações, utilização, conclusão e resultados de aprendizagem',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'learning-paths',
    consumes: 'Percursos atribuídos, progresso, conclusão e abandono',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'knowledge',
    consumes: 'Consultas, conteúdos utilizados e participação na partilha de conhecimento',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'content-library',
    consumes: 'Conteúdos publicados, visualizações, utilização e estado de publicação',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'document-repository',
    consumes: 'Documentos registados, pendentes de validação, vencimentos e acessos autorizados',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'engagement',
    consumes: 'Resultados de inquéritos, participação e evolução dos indicadores de envolvimento',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'succession',
    consumes: 'Cobertura de posições críticas e planos de sucessão',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'instructor',
    consumes: 'Formadores activos, carga formativa, avaliações e disponibilidade registada',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'events',
    consumes: 'Eventos realizados, inscrições, participação e resultados registados',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'processes',
    consumes: 'Processos em curso, concluídos, atrasados e tempos de execução',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'automations',
    consumes: 'Execuções, falhas, tarefas automatizadas e resultados dos fluxos',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'notifications',
    consumes: 'Notificações emitidas, entregues, falhadas e pendentes',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'history',
    consumes: 'Histórico de alterações, operações relevantes e rastreabilidade',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'API Integration',
    consumes: 'Estado das integrações, sincronizações, falhas e última sincronização',
    status: 'PLANNED',
    usedBy: [],
  },
  {
    module: 'auth',
    consumes:
      'Contexto de autenticação e identidade para autorizar o acesso (não calcula indicadores)',
    status: 'CONTEXT',
    usedBy: ['Permissões por papel', 'Âmbito de gestor/líder'],
  },
];

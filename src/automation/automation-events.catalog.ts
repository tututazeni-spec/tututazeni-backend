// src/automation/automation-events.catalog.ts
// Catálogo de eventos por módulo (docs/modulo_automation.md §5). Um evento só é
// `implemented` quando existe como TriggerType — i.e. uma regra o consegue
// escolher como gatilho. Os restantes são a especificação proposta: ficam
// visíveis mas por emitir, e têm de ser ligados no backend do módulo respectivo.

import { TriggerType } from './automation.dto';

export interface CatalogEvent {
  key: string;
  label: string;
  /** Valor de TriggerType quando o evento já pode ser usado como gatilho. */
  trigger?: TriggerType;
}

export interface CatalogModule {
  module: string;
  label: string;
  events: CatalogEvent[];
  actions: string[];
}

const T = TriggerType;

export const EVENT_CATALOG: CatalogModule[] = [
  {
    module: 'USERS',
    label: 'Utilizadores',
    events: [
      { key: 'employee.created', label: 'Novo utilizador', trigger: T.EMPLOYEE_CREATED },
      { key: 'employee.updated', label: 'Alteração de perfil', trigger: T.EMPLOYEE_UPDATED },
      { key: 'employee.deactivated', label: 'Conta desactivada', trigger: T.EMPLOYEE_DEACTIVATED },
    ],
    actions: ['Notificar', 'Iniciar onboarding', 'Ajustar tarefas de acesso'],
  },
  {
    module: 'DEPARTMENTS',
    label: 'Departamentos / Organização',
    events: [
      { key: 'department.changed', label: 'Departamento alterado', trigger: T.DEPARTMENT_CHANGED },
    ],
    actions: ['Actualizar circuitos de aprovação', 'Actualizar responsáveis'],
  },
  {
    module: 'ROLES',
    label: 'Funções e Permissões',
    events: [{ key: 'role.changed', label: 'Função alterada', trigger: T.ROLE_CHANGED }],
    actions: ['Solicitar validação', 'Alertar administradores'],
  },
  {
    module: 'COURSES',
    label: 'Cursos e Matrículas',
    events: [
      { key: 'course.enrolled', label: 'Inscrição criada', trigger: T.COURSE_ENROLLED },
      { key: 'course.completed', label: 'Curso concluído', trigger: T.COURSE_COMPLETED },
      {
        key: 'course.not_completed',
        label: 'Curso não concluído',
        trigger: T.COURSE_NOT_COMPLETED,
      },
      { key: 'course.published', label: 'Curso publicado' },
    ],
    actions: ['Notificar inscritos', 'Gerar tarefas', 'Actualizar estados relacionados'],
  },
  {
    module: 'LEARNING_PATHS',
    label: 'Percursos de Aprendizagem',
    events: [
      { key: 'learning_path.assigned', label: 'Percurso atribuído' },
      { key: 'learning_path.step_completed', label: 'Etapa concluída' },
    ],
    actions: ['Libertar a etapa seguinte', 'Actualizar progresso'],
  },
  {
    module: 'EVALUATION',
    label: 'Avaliações / Desempenho',
    events: [
      {
        key: 'evaluation.submitted',
        label: 'Avaliação submetida',
        trigger: T.EVALUATION_SUBMITTED,
      },
      { key: 'objective.overdue', label: 'Objectivo em atraso', trigger: T.OBJECTIVE_OVERDUE },
    ],
    actions: ['Solicitar correcção', 'Alertar avaliador', 'Criar tarefas de acompanhamento'],
  },
  {
    module: 'COMPETENCIES',
    label: 'Competências',
    events: [
      {
        key: 'competency.below_expected',
        label: 'Competência abaixo do esperado',
        trigger: T.COMPETENCY_BELOW_EXPECTED,
      },
    ],
    actions: ['Sugerir formação', 'Criar acção de desenvolvimento'],
  },
  {
    module: 'PDI',
    label: 'Planos de Desenvolvimento (PDI)',
    events: [
      { key: 'pdi.created', label: 'Plano criado', trigger: T.PDI_CREATED },
      { key: 'pdi.approved', label: 'Plano aprovado', trigger: T.PDI_APPROVED },
      { key: 'pdi.at_risk', label: 'Plano em risco', trigger: T.PDI_AT_RISK },
      { key: 'pdi.completed', label: 'Plano concluído', trigger: T.PDI_COMPLETED },
    ],
    actions: ['Alertar colaborador e gestor', 'Actualizar acompanhamento'],
  },
  {
    module: 'CAREER',
    label: 'Carreira e Sucessão',
    events: [
      { key: 'career_plan.created', label: 'Plano de carreira criado' },
      { key: 'succession.reviewed', label: 'Plano de sucessão revisto' },
    ],
    actions: ['Notificar colaborador e responsável', 'Agendar revisão'],
  },
  {
    module: 'ONBOARDING',
    label: 'Onboarding',
    events: [
      {
        key: 'hire_date.reached',
        label: 'Data de admissão atingida',
        trigger: T.HIRE_DATE_REACHED,
      },
      { key: 'onboarding.step_pending', label: 'Etapa pendente' },
    ],
    actions: ['Criar tarefas', 'Atribuir conteúdos', 'Enviar lembretes'],
  },
  {
    module: 'ATTENDANCE',
    label: 'Assiduidade',
    events: [
      { key: 'absence.registered', label: 'Falta registada', trigger: T.ABSENCE_REGISTERED },
    ],
    actions: ['Alertar responsáveis', 'Encaminhar para validação'],
  },
  {
    module: 'LEAVE',
    label: 'Férias e Licenças',
    events: [
      { key: 'leave.approved', label: 'Pedido aprovado', trigger: T.LEAVE_APPROVED },
      {
        key: 'PENDING_LEAVE_3_DAYS',
        label: 'Pedido pendente há 3 dias',
        trigger: T.PENDING_LEAVE_3_DAYS,
      },
    ],
    actions: ['Encaminhar aprovação', 'Notificar colaborador', 'Actualizar calendário'],
  },
  {
    module: 'PAYROLL',
    label: 'Payroll e Recibos',
    events: [{ key: 'PAYSLIP_DUE', label: 'Recibos por emitir', trigger: T.PAYSLIP_DUE }],
    actions: ['Notificar colaborador', 'Gerar alertas de processamento'],
  },
  {
    module: 'CERTIFICATION',
    label: 'Certificações e Badges',
    events: [
      {
        key: 'certification.expiring',
        label: 'Certificação a expirar',
        trigger: T.CERTIFICATION_EXPIRING,
      },
      { key: 'badge.awarded', label: 'Badge atribuído', trigger: T.BADGE_AWARDED },
      { key: 'ENROLLMENT_EXPIRING', label: 'Inscrição a expirar', trigger: T.ENROLLMENT_EXPIRING },
    ],
    actions: ['Notificar públicos autorizados', 'Solicitar revisão'],
  },
  {
    module: 'AVATAR_TRAINING',
    label: 'Formação com Avatar',
    events: [
      {
        key: 'avatar_training.session_completed',
        label: 'Sessão concluída',
        trigger: T.AVATAR_SESSION_COMPLETED,
      },
      {
        key: 'avatar_training.session_failed',
        label: 'Sessão falhada',
        trigger: T.AVATAR_SESSION_FAILED,
      },
    ],
    actions: ['Notificar participantes', 'Encaminhar resultados para o AI Tutor'],
  },
  {
    module: 'PROCESSES',
    label: 'Processos',
    events: [
      { key: 'process.created', label: 'Processo iniciado', trigger: T.PROCESS_CREATED },
      { key: 'process.completed', label: 'Processo concluído', trigger: T.PROCESS_COMPLETED },
      { key: 'process.cancelled', label: 'Processo cancelado', trigger: T.PROCESS_CANCELLED },
      { key: 'process.overdue', label: 'Prazo ultrapassado', trigger: T.PROCESS_OVERDUE },
      { key: 'task.assigned', label: 'Tarefa atribuída', trigger: T.TASK_ASSIGNED },
      { key: 'task.completed', label: 'Tarefa concluída', trigger: T.TASK_COMPLETED },
      { key: 'task.near_deadline', label: 'Tarefa perto do prazo', trigger: T.TASK_NEAR_DEADLINE },
      { key: 'task.overdue', label: 'Tarefa em atraso', trigger: T.TASK_OVERDUE },
      { key: 'approval.requested', label: 'Aprovação pedida', trigger: T.APPROVAL_REQUESTED },
      { key: 'approval.decided', label: 'Aprovação decidida', trigger: T.APPROVAL_DECIDED },
      {
        key: 'process.integration_requested',
        label: 'Integração pedida',
        trigger: T.PROCESS_INTEGRATION_REQUESTED,
      },
      {
        key: 'process.integration_failed',
        label: 'Integração falhada',
        trigger: T.PROCESS_INTEGRATION_FAILED,
      },
    ],
    actions: ['Encaminhar etapa', 'Escalar pendência', 'Actualizar estado'],
  },
  {
    module: 'SCHEDULED',
    label: 'Agendados',
    events: [
      { key: 'cron.daily', label: 'Diário', trigger: T.CRON_DAILY },
      { key: 'cron.weekly', label: 'Semanal', trigger: T.CRON_WEEKLY },
      { key: 'cron.monthly', label: 'Mensal', trigger: T.CRON_MONTHLY },
      { key: 'deadline.reached', label: 'Prazo atingido', trigger: T.DEADLINE_REACHED },
      { key: 'BIRTHDAY_TODAY', label: 'Aniversário', trigger: T.BIRTHDAY_TODAY },
    ],
    actions: ['Notificar', 'Executar fluxo'],
  },
  // Especificação proposta (§5) — ainda sem emissor nem gatilho no backend.
  {
    module: 'EVENTS',
    label: 'Eventos',
    events: [
      { key: 'event.created', label: 'Evento criado' },
      { key: 'event.updated', label: 'Evento alterado' },
      { key: 'event.upcoming', label: 'Evento próximo' },
    ],
    actions: ['Enviar convites', 'Enviar lembretes'],
  },
  {
    module: 'TRAININGS',
    label: 'Formações e Sessões',
    events: [
      { key: 'training.scheduled', label: 'Formação agendada' },
      { key: 'training.session_upcoming', label: 'Sessão próxima' },
      { key: 'training.session_completed', label: 'Sessão concluída' },
    ],
    actions: ['Notificar participantes e formadores', 'Actualizar assiduidade'],
  },
  {
    module: 'DOCUMENTS',
    label: 'Documentos e Biblioteca',
    events: [
      { key: 'document.published', label: 'Documento publicado' },
      { key: 'document.expiring', label: 'Documento a expirar' },
    ],
    actions: ['Notificar públicos autorizados', 'Solicitar revisão'],
  },
  {
    module: 'INTEGRATIONS',
    label: 'Integrações / API',
    events: [
      { key: 'integration.webhook_received', label: 'Webhook recebido' },
      { key: 'integration.sync_failed', label: 'Sincronização falhada' },
    ],
    actions: ['Executar fluxo', 'Repetir sincronização', 'Alertar suporte'],
  },
  {
    module: 'AUTOMATION',
    label: 'Automações',
    events: [
      {
        key: 'automation.execution_failed',
        label: 'Falhas repetidas numa automação',
        trigger: T.AUTOMATION_EXECUTION_FAILED,
      },
      { key: 'automation.rule_changed', label: 'Regra alterada' },
    ],
    actions: ['Alertar administradores', 'Iniciar recuperação controlada'],
  },
];

/** Módulo a que pertence um gatilho (para registar o evento quando o emissor não o indica). */
export function moduleOfTrigger(trigger: string): string {
  for (const m of EVENT_CATALOG) {
    if (m.events.some(e => e.trigger === trigger || e.key === trigger)) return m.module;
  }
  return 'OTHER';
}

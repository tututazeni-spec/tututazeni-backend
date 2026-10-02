// src/process-standard/process-automation-catalog.ts
// Catálogo da aba «Automações» (docs/Modulo_Processes.md §9): eventos que os
// processos emitem (e os de outros módulos que os podem iniciar), acções
// disponíveis, destinatários, campos do payload para condições e modelos de
// regras de exemplo. Dados estáticos — a execução vive no módulo de Automações.

export interface CatalogEvent {
  value: string;
  label: string;
  module: string;
  entity: string;
  description: string;
}

export const PROCESS_EVENTS: CatalogEvent[] = [
  {
    value: 'process.created',
    label: 'Processo criado',
    module: 'Processos',
    entity: 'Processo',
    description: 'Quando uma instância de processo é iniciada.',
  },
  {
    value: 'process.completed',
    label: 'Processo concluído',
    module: 'Processos',
    entity: 'Processo',
    description: 'Quando todas as etapas de um processo terminam.',
  },
  {
    value: 'process.cancelled',
    label: 'Processo cancelado',
    module: 'Processos',
    entity: 'Processo',
    description: 'Quando um processo é cancelado.',
  },
  {
    value: 'process.overdue',
    label: 'Processo em atraso',
    module: 'Processos',
    entity: 'Processo',
    description: 'Quando o prazo do processo é ultrapassado (verificado de 5 em 5 minutos).',
  },
  {
    value: 'task.assigned',
    label: 'Tarefa atribuída',
    module: 'Processos',
    entity: 'Tarefa',
    description: 'Quando uma tarefa fica activa e atribuída a alguém.',
  },
  {
    value: 'task.completed',
    label: 'Tarefa concluída',
    module: 'Processos',
    entity: 'Tarefa',
    description: 'Quando uma tarefa é concluída.',
  },
  {
    value: 'task.near_deadline',
    label: 'Tarefa próxima do prazo',
    module: 'Processos',
    entity: 'Tarefa',
    description: 'Quando faltam menos de 24 horas para o prazo da tarefa.',
  },
  {
    value: 'task.overdue',
    label: 'Tarefa em atraso',
    module: 'Processos',
    entity: 'Tarefa',
    description: 'Quando o prazo da tarefa é ultrapassado.',
  },
  {
    value: 'approval.requested',
    label: 'Aprovação solicitada',
    module: 'Processos',
    entity: 'Aprovação',
    description: 'Quando um pedido de aprovação fica pendente de decisão.',
  },
  {
    value: 'approval.decided',
    label: 'Aprovação decidida',
    module: 'Processos',
    entity: 'Aprovação',
    description: 'Quando um aprovador decide (aprovar, rejeitar, devolver).',
  },
  {
    value: 'process.integration_requested',
    label: 'Integração solicitada',
    module: 'Processos',
    entity: 'Integração',
    description: 'Quando uma etapa de integração pede trabalho a outro módulo.',
  },
  {
    value: 'process.integration_failed',
    label: 'Integração falhou',
    module: 'Processos',
    entity: 'Integração',
    description: 'Quando uma etapa automática de integração falha.',
  },
];

/** Eventos de outros módulos que fazem sentido para iniciar/alimentar processos. */
export const EXTERNAL_EVENTS: CatalogEvent[] = [
  {
    value: 'employee.created',
    label: 'Colaborador admitido',
    module: 'Utilizadores',
    entity: 'Colaborador',
    description: 'Quando um colaborador é criado.',
  },
  {
    value: 'course.completed',
    label: 'Formação concluída',
    module: 'Formações',
    entity: 'Matrícula',
    description: 'Quando um colaborador conclui uma formação.',
  },
  {
    value: 'leave.approved',
    label: 'Ausência aprovada',
    module: 'Férias e Ausências',
    entity: 'Ausência',
    description: 'Quando um pedido de ausência é aprovado.',
  },
  {
    value: 'evaluation.submitted',
    label: 'Avaliação submetida',
    module: 'Avaliação',
    entity: 'Avaliação',
    description: 'Quando uma avaliação é submetida.',
  },
];

export interface CatalogActionParam {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface CatalogAction {
  value: string;
  label: string;
  description: string;
  params: CatalogActionParam[];
  needsRecipients?: boolean;
}

const PRIORITIES = [
  { value: 'LOW', label: 'Baixa' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'URGENT', label: 'Urgente' },
];

export const PROCESS_ACTIONS: CatalogAction[] = [
  {
    value: 'send_notification',
    label: 'Enviar notificação',
    description: 'Notificação interna aos destinatários (aceita {{campo}} do evento na mensagem).',
    needsRecipients: true,
    params: [{ key: 'message', label: 'Mensagem', type: 'textarea', required: true }],
  },
  {
    value: 'send_email',
    label: 'Enviar email',
    description: 'Email ao colaborador-alvo do evento.',
    params: [
      { key: 'subject', label: 'Assunto', type: 'text' },
      { key: 'message', label: 'Mensagem', type: 'textarea', required: true },
    ],
  },
  {
    value: 'process_start',
    label: 'Iniciar um processo',
    description:
      'Inicia uma instância de um modelo activo para o colaborador do evento (sem duplicar).',
    params: [
      { key: 'processCode', label: 'Código do modelo', type: 'text', required: true },
      { key: 'priority', label: 'Prioridade', type: 'select', options: PRIORITIES },
    ],
  },
  {
    value: 'process_assign_responsible',
    label: 'Atribuir responsável',
    description:
      'Atribui a primeira tarefa activa sem responsável a um utilizador ou a quem tiver a função.',
    params: [
      { key: 'assigneeId', label: 'ID do utilizador', type: 'number' },
      { key: 'roleCode', label: 'ou código da função (ex.: RH)', type: 'text' },
    ],
  },
  {
    value: 'process_set_priority',
    label: 'Alterar prioridade do processo',
    description: 'Altera a prioridade da instância do evento.',
    params: [
      { key: 'priority', label: 'Prioridade', type: 'select', required: true, options: PRIORITIES },
    ],
  },
  {
    value: 'process_escalate_task',
    label: 'Escalar tarefa',
    description: 'Marca a tarefa como escalada e avisa o gestor, o dono do modelo e o solicitante.',
    params: [],
  },
  {
    value: 'process_retry_step',
    label: 'Repetir etapa bloqueada',
    description:
      'Desbloqueia as etapas bloqueadas da instância (ex.: integração falhada) e volta a executá-las.',
    params: [],
  },
  {
    value: 'notify_manager',
    label: 'Notificar o gestor',
    description: 'Notifica o gestor do colaborador-alvo.',
    params: [{ key: 'message', label: 'Mensagem', type: 'text' }],
  },
  {
    value: 'notify_hr',
    label: 'Notificar RH',
    description: 'Notifica os utilizadores com a função RH.',
    params: [{ key: 'message', label: 'Mensagem', type: 'text' }],
  },
  {
    value: 'webhook',
    label: 'Chamar webhook (integração externa)',
    description: 'Pedido HTTP a um sistema externo.',
    params: [
      { key: 'url', label: 'URL', type: 'text', required: true },
      { key: 'method', label: 'Método', type: 'text' },
    ],
  },
  {
    value: 'log',
    label: 'Registar apenas',
    description: 'Regista a execução, sem efeito (útil para testar condições).',
    params: [{ key: 'message', label: 'Mensagem', type: 'text' }],
  },
];

export const RECIPIENT_TOKENS = [
  { value: 'ASSIGNEE', label: 'Responsável da tarefa' },
  { value: 'TARGET', label: 'Colaborador-alvo' },
  { value: 'REQUESTER', label: 'Solicitante' },
  { value: 'MANAGER', label: 'Gestor do colaborador' },
  { value: 'OWNER', label: 'Dono do modelo' },
  { value: 'RESPONSIBLE', label: 'Responsável actual do processo' },
  { value: 'ROLE:RH', label: 'Equipa de RH' },
  { value: 'ROLE:ADMIN', label: 'Administradores' },
];

export const PAYLOAD_FIELDS = [
  { value: 'priority', label: 'Prioridade do processo' },
  { value: 'sourceModule', label: 'Módulo de origem' },
  { value: 'processCode', label: 'Código do modelo' },
  { value: 'status', label: 'Estado do processo' },
  { value: 'departmentId', label: 'Departamento do colaborador' },
  { value: 'stepType', label: 'Tipo da etapa' },
  { value: 'stepTitle', label: 'Nome da etapa' },
  { value: 'decision', label: 'Decisão da aprovação' },
  { value: 'integrationModule', label: 'Módulo da integração' },
];

export const CONDITION_OPERATOR_LABELS = [
  { value: 'equals', label: 'é igual a' },
  { value: 'not_equals', label: 'é diferente de' },
  { value: 'contains', label: 'contém' },
  { value: 'not_contains', label: 'não contém' },
  { value: 'greater_than', label: 'é maior que' },
  { value: 'less_than', label: 'é menor que' },
  { value: 'is_empty', label: 'está vazio' },
  { value: 'is_not_empty', label: 'não está vazio' },
];

export interface RuleTemplate {
  key: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  actionParams: Record<string, unknown>;
  recipients?: string[];
  conditions?: {
    logic: 'AND' | 'OR';
    rows: Array<{ field: string; operator: string; value?: string }>;
  };
  maxRetries?: number;
  retryPolicy?: 'NONE' | 'FIXED' | 'EXPONENTIAL';
  errorHandling?: 'LOG' | 'NOTIFY_OWNER' | 'DISABLE_RULE';
}

/** Os exemplos do §9 que o motor consegue executar de ponta a ponta. */
export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    key: 'assign-initial-responsible',
    name: 'Atribuir responsável inicial',
    description: 'Quando um processo é criado, atribui a primeira tarefa sem responsável.',
    trigger: 'process.created',
    action: 'process_assign_responsible',
    actionParams: { roleCode: 'RH' },
  },
  {
    key: 'deadline-reminder',
    name: 'Lembrete de prazo',
    description: 'Quando uma tarefa fica próxima do prazo, envia um lembrete ao responsável.',
    trigger: 'task.near_deadline',
    action: 'send_notification',
    actionParams: { message: 'A tarefa "{{stepTitle}}" de {{instanceCode}} vence em breve.' },
    recipients: ['ASSIGNEE'],
  },
  {
    key: 'approval-unblock',
    name: 'Desbloquear etapa após aprovação',
    description: 'Quando uma aprovação é concluída, retoma as etapas bloqueadas do processo.',
    trigger: 'approval.decided',
    action: 'process_retry_step',
    actionParams: {},
    conditions: {
      logic: 'AND',
      rows: [{ field: 'decision', operator: 'equals', value: 'APPROVE' }],
    },
  },
  {
    key: 'onboarding-on-hire',
    name: 'Iniciar onboarding na admissão',
    description: 'Quando um colaborador é admitido, inicia o processo de onboarding.',
    trigger: 'employee.created',
    action: 'process_start',
    actionParams: { processCode: '' },
  },
  {
    key: 'evaluation-after-training',
    name: 'Iniciar avaliação após formação',
    description: 'Quando uma formação termina, inicia o fluxo de avaliação.',
    trigger: 'course.completed',
    action: 'process_start',
    actionParams: { processCode: '' },
  },
  {
    key: 'overdue-notify',
    name: 'Tarefa em atraso: avisar responsável e gestor',
    description: 'Quando uma tarefa fica atrasada, notifica o responsável e o gestor.',
    trigger: 'task.overdue',
    action: 'send_notification',
    actionParams: { message: 'A tarefa "{{stepTitle}}" de {{instanceCode}} está em atraso.' },
    recipients: ['ASSIGNEE', 'MANAGER'],
  },
  {
    key: 'integration-retry',
    name: 'Integração falhada: nova tentativa',
    description: 'Quando uma integração falha, regista o erro e repete a etapa (até 3 tentativas).',
    trigger: 'process.integration_failed',
    action: 'process_retry_step',
    actionParams: {},
    maxRetries: 3,
    retryPolicy: 'EXPONENTIAL',
    errorHandling: 'NOTIFY_OWNER',
  },
];

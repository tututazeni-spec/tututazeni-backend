// src/automation/automation-templates.catalog.ts
// §11 — modelos de automação pré-configurados. Cada modelo traz descrição, gatilho,
// condições, acções (fluxo), módulos envolvidos e os campos que o administrador tem
// de preencher antes de activar. Só usa gatilhos e acções que o motor executa de
// facto; quando o evento ideal ainda não é emitido, o modelo usa o mais próximo e
// declara-o em `limitations`.

import { ActionType, AutomationCategory, ConditionOperator, TriggerType } from './automation.dto';
import type { FlowDefinition, FlowConditionRow } from './automation-flow';

export type TemplateFieldType = 'text' | 'number' | 'boolean' | 'userId' | 'roleCode';

export interface TemplateField {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  default?: string | number | boolean;
  help?: string;
}

export interface AutomationTemplate {
  key: string;
  name: string;
  area: string;
  description: string;
  category: AutomationCategory;
  /** Módulo de origem do gatilho (filtro da lista de automações). */
  module: string;
  trigger: TriggerType;
  conditions: FlowConditionRow[];
  /** Fluxo com marcadores `${campo}` substituídos pelos valores dos campos. */
  flow: FlowDefinition;
  /** Módulos da INNOVA envolvidos (origem do evento e destino das acções). */
  modules: string[];
  fields: TemplateField[];
  /** O que o modelo ainda não consegue fazer (evento por emitir, canal sem entrega…). */
  limitations: string[];
  manualMinutesSaved: number;
  tags: string[];
}

const A = ActionType;
const OP = ConditionOperator;

const msg = (key: string, label: string, def: string): TemplateField => ({
  key,
  label,
  type: 'text',
  required: true,
  default: def,
});

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: 'onboarding-novo-colaborador',
    name: 'Onboarding automático de novo colaborador',
    area: 'RH',
    description:
      'Quando um utilizador é criado: dá as boas-vindas, avisa o gestor e inscreve-o na formação de integração.',
    category: AutomationCategory.HR,
    module: 'USERS',
    trigger: TriggerType.EMPLOYEE_CREATED,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Boas-vindas ao colaborador',
          action: A.SEND_NOTIFICATION,
          params: { type: 'ONBOARDING', messageTemplate: '${welcomeMessage}' },
        },
        {
          type: 'action',
          label: 'Avisar o gestor',
          action: A.NOTIFY_MANAGER,
          params: { message: '${managerMessage}' },
          onError: 'continue',
        },
        {
          type: 'action',
          label: 'Inscrever na formação de integração',
          action: A.ASSIGN_COURSE,
          params: { courseId: '${onboardingCourseId}' },
          onError: 'continue',
        },
      ],
    },
    modules: ['Users', 'Onboarding', 'Courses'],
    fields: [
      {
        key: 'onboardingCourseId',
        label: 'Curso de integração',
        type: 'number',
        required: true,
        help: 'ID do curso (publicado) em que o novo colaborador é inscrito',
      },
      msg(
        'welcomeMessage',
        'Mensagem de boas-vindas',
        'Bem-vindo(a) à INNOVA! A tua integração já começou.',
      ),
      msg(
        'managerMessage',
        'Mensagem para o gestor',
        'Um novo colaborador da tua equipa iniciou a integração.',
      ),
    ],
    limitations: [
      'O gestor só é avisado se o colaborador tiver gestor atribuído.',
      'A atribuição de tarefas de onboarding faz-se no módulo Onboarding; este modelo cobre comunicação e formação.',
    ],
    manualMinutesSaved: 20,
    tags: ['onboarding', 'rh'],
  },
  {
    key: 'lembrete-formacao-sessao',
    name: 'Lembrete de formação antes da sessão',
    area: 'Formação',
    description: 'Lembra o participante de uma sessão de formação que está a chegar.',
    category: AutomationCategory.LMS,
    module: 'SCHEDULED',
    trigger: TriggerType.DEADLINE_REACHED,
    conditions: [{ field: 'module', operator: OP.EQUALS, value: 'TRAININGS' }],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Lembrar o participante',
          action: A.SEND_NOTIFICATION,
          params: { type: 'TRAINING_REMINDER', recipient: 'TARGET', messageTemplate: '${message}' },
        },
      ],
    },
    modules: ['Trainings', 'Notifications'],
    fields: [
      msg('message', 'Mensagem do lembrete', 'Tens uma sessão de formação em breve. Prepara-te!'),
    ],
    limitations: [
      'O evento training.session_upcoming ainda não é emitido pelo módulo Formações; o modelo reage a deadline.reached com module=TRAININGS e deve passar a usar o evento próprio quando existir.',
    ],
    manualMinutesSaved: 5,
    tags: ['formacao', 'lembrete'],
  },
  {
    key: 'alerta-falta-atraso',
    name: 'Alerta de falta ou atraso',
    area: 'Assiduidade',
    description:
      'Quando uma falta é registada, avisa o gestor; se não estiver justificada, avisa também o RH.',
    category: AutomationCategory.HR,
    module: 'ATTENDANCE',
    trigger: TriggerType.ABSENCE_REGISTERED,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Avisar o gestor',
          action: A.NOTIFY_MANAGER,
          params: { message: '${managerMessage}' },
          onError: 'continue',
        },
        {
          type: 'condition',
          label: 'Falta injustificada?',
          rows: [{ field: 'justified', operator: OP.EQUALS, value: 'false' }],
          then: [
            {
              type: 'action',
              label: 'Avisar o RH',
              action: A.NOTIFY_HR,
              params: { message: '${hrMessage}' },
            },
          ],
        },
      ],
    },
    modules: ['Attendance', 'Users'],
    fields: [
      msg('managerMessage', 'Mensagem para o gestor', 'Foi registada uma falta na tua equipa.'),
      msg('hrMessage', 'Mensagem para o RH', 'Falta injustificada registada — requer validação.'),
    ],
    limitations: ['O ramo do RH exige que o evento traga o campo "justified".'],
    manualMinutesSaved: 8,
    tags: ['assiduidade'],
  },
  {
    key: 'avaliacao-pendente',
    name: 'Notificação de avaliação pendente',
    area: 'Desempenho',
    description: 'Quando uma avaliação é submetida, avisa o responsável de que tem de a rever.',
    category: AutomationCategory.PERFORMANCE,
    module: 'EVALUATION',
    trigger: TriggerType.EVALUATION_SUBMITTED,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Avisar o avaliador',
          action: A.SEND_NOTIFICATION,
          params: {
            type: 'EVALUATION_PENDING',
            recipient: 'MANAGER,RESPONSIBLE',
            messageTemplate: '${message}',
          },
        },
      ],
    },
    modules: ['Evaluation', 'Notifications'],
    fields: [msg('message', 'Mensagem', 'Tens uma avaliação submetida à espera da tua revisão.')],
    limitations: ['O destinatário resolve-se de managerId/responsibleId do evento.'],
    manualMinutesSaved: 5,
    tags: ['desempenho'],
  },
  {
    key: 'pdi-acao-atrasada',
    name: 'Alerta de acção de desenvolvimento atrasada',
    area: 'PDI',
    description: 'Quando um PDI fica em risco, avisa o colaborador e o gestor.',
    category: AutomationCategory.PERFORMANCE,
    module: 'PDI',
    trigger: TriggerType.PDI_AT_RISK,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Avisar o colaborador',
          action: A.SEND_NOTIFICATION,
          params: { type: 'PDI_AT_RISK', messageTemplate: '${employeeMessage}' },
        },
        {
          type: 'action',
          label: 'Avisar o gestor',
          action: A.NOTIFY_MANAGER,
          params: { message: '${managerMessage}' },
          onError: 'continue',
        },
      ],
    },
    modules: ['Development Plans', 'Users'],
    fields: [
      msg(
        'employeeMessage',
        'Mensagem para o colaborador',
        'O teu PDI tem acções em atraso. Actualiza o progresso.',
      ),
      msg('managerMessage', 'Mensagem para o gestor', 'Um PDI da tua equipa está em risco.'),
    ],
    limitations: [],
    manualMinutesSaved: 6,
    tags: ['pdi'],
  },
  {
    key: 'pedido-ferias-aprovacao',
    name: 'Encaminhamento de pedido para aprovação',
    area: 'Férias',
    description:
      'Pedidos de férias pendentes há 3 dias vão para aprovação humana, com escalonamento se ficarem sem resposta.',
    category: AutomationCategory.HR,
    module: 'LEAVE',
    trigger: TriggerType.PENDING_LEAVE_3_DAYS,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'approval',
          label: 'Aprovação do pedido',
          title: '${title}',
          approverId: '${approverId}' as unknown as number,
          escalateToId: '${escalateToId}' as unknown as number,
          escalateAfterHours: '${escalateAfterHours}' as unknown as number,
          dueHours: '${dueHours}' as unknown as number,
          priority: 'MEDIUM',
        },
      ],
    },
    modules: ['Leave', 'Automation (aprovações)'],
    fields: [
      { key: 'approverId', label: 'Aprovador', type: 'userId', required: true },
      { key: 'escalateToId', label: 'Escalar para', type: 'userId', required: false },
      {
        key: 'escalateAfterHours',
        label: 'Escalar após (horas)',
        type: 'number',
        required: false,
        default: 48,
      },
      {
        key: 'dueHours',
        label: 'Prazo da decisão (horas)',
        type: 'number',
        required: false,
        default: 72,
      },
      msg('title', 'Título da aprovação', 'Pedido de férias pendente de aprovação'),
    ],
    limitations: [
      'A decisão fica registada na aprovação; a actualização do pedido continua no módulo Férias.',
    ],
    manualMinutesSaved: 10,
    tags: ['ferias', 'aprovacao'],
  },
  {
    key: 'documento-vencimento',
    name: 'Aviso de documento próximo do vencimento',
    area: 'Documentos',
    description: 'Avisa o titular e o gestor quando uma certificação/documento está a expirar.',
    category: AutomationCategory.OPERATIONAL,
    module: 'CERTIFICATION',
    trigger: TriggerType.CERTIFICATION_EXPIRING,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Avisar o titular',
          action: A.SEND_NOTIFICATION,
          params: { type: 'DOCUMENT_EXPIRING', messageTemplate: '${message}' },
        },
        {
          type: 'action',
          label: 'Avisar o gestor',
          action: A.NOTIFY_MANAGER,
          params: { message: '${managerMessage}' },
          onError: 'continue',
        },
      ],
    },
    modules: ['Certification', 'Documents'],
    fields: [
      msg(
        'message',
        'Mensagem para o titular',
        'Um documento teu está perto de expirar. Renova-o a tempo.',
      ),
      msg(
        'managerMessage',
        'Mensagem para o gestor',
        'Um documento de um colaborador da tua equipa está a expirar.',
      ),
    ],
    limitations: [
      'O evento document.expiring (Biblioteca) ainda não é emitido; usa certification.expiring, que cobre certificações.',
    ],
    manualMinutesSaved: 6,
    tags: ['documentos'],
  },
  {
    key: 'recibo-vencimento-disponivel',
    name: 'Notificação de recibo de vencimento disponível',
    area: 'Payroll',
    description: 'Avisa o colaborador de que o recibo de vencimento já está disponível.',
    category: AutomationCategory.HR,
    module: 'PAYROLL',
    trigger: TriggerType.PAYSLIP_DUE,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Avisar o colaborador',
          action: A.SEND_NOTIFICATION,
          params: { type: 'PAYSLIP_AVAILABLE', messageTemplate: '${message}' },
        },
      ],
    },
    modules: ['Payroll', 'Notifications'],
    fields: [msg('message', 'Mensagem', 'O teu recibo de vencimento já está disponível.')],
    limitations: [
      'A notificação não leva valores do recibo — só o aviso (dados sensíveis ficam no Payroll).',
    ],
    manualMinutesSaved: 4,
    tags: ['payroll'],
  },
  {
    key: 'escalonamento-etapa-prazo',
    name: 'Escalonamento de etapa fora do prazo',
    area: 'Processos',
    description:
      'Quando um processo ultrapassa o prazo, avisa o responsável e, passado o tempo definido, escala para um perfil superior.',
    category: AutomationCategory.OPERATIONAL,
    module: 'PROCESSES',
    trigger: TriggerType.PROCESS_OVERDUE,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Avisar o responsável',
          action: A.SEND_NOTIFICATION,
          params: {
            type: 'PROCESS_OVERDUE',
            recipient: 'RESPONSIBLE',
            messageTemplate: '${message}',
          },
        },
        {
          type: 'delay',
          label: 'Aguardar resposta',
          minutes: '${escalationDelayMinutes}' as unknown as number,
        },
        {
          type: 'action',
          label: 'Escalar',
          action: A.SEND_NOTIFICATION,
          params: {
            type: 'PROCESS_ESCALATED',
            recipient: 'ROLE:${escalationRole}',
            messageTemplate: '${escalationMessage}',
          },
        },
      ],
    },
    modules: ['Processes', 'Notifications'],
    fields: [
      msg('message', 'Mensagem ao responsável', 'Uma etapa do teu processo está fora do prazo.'),
      {
        key: 'escalationDelayMinutes',
        label: 'Escalar após (minutos)',
        type: 'number',
        required: true,
        default: 1440,
      },
      {
        key: 'escalationRole',
        label: 'Perfil a escalar',
        type: 'roleCode',
        required: true,
        default: 'RH',
      },
      msg(
        'escalationMessage',
        'Mensagem de escalonamento',
        'Uma etapa de processo continua fora do prazo e foi escalada.',
      ),
    ],
    limitations: ['O escalonamento avisa; a reatribuição da etapa faz-se no módulo Processos.'],
    manualMinutesSaved: 10,
    tags: ['processos', 'escalonamento'],
  },
  {
    key: 'alerta-sincronizacao-falhada',
    name: 'Alerta de sincronização falhada',
    area: 'Integrações',
    description: 'Quando uma integração falha, alerta o perfil de suporte.',
    category: AutomationCategory.OPERATIONAL,
    module: 'PROCESSES',
    trigger: TriggerType.PROCESS_INTEGRATION_FAILED,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Alertar o suporte',
          action: A.CREATE_ALERT,
          params: {
            type: 'INTEGRATION_FAILED',
            recipient: 'ROLE:${supportRole}',
            messageTemplate: '${message}',
          },
        },
      ],
    },
    modules: ['Processes', 'Integrations'],
    fields: [
      {
        key: 'supportRole',
        label: 'Perfil de suporte',
        type: 'roleCode',
        required: true,
        default: 'ADMIN',
      },
      msg(
        'message',
        'Mensagem do alerta',
        'Uma integração falhou. Verifica o histórico e repete a sincronização.',
      ),
    ],
    limitations: [
      'integration.sync_failed (módulo Integrações) ainda não é emitido; usa process.integration_failed.',
    ],
    manualMinutesSaved: 8,
    tags: ['integracoes'],
  },
  {
    key: 'alerta-falhas-repetidas',
    name: 'Alerta de falhas repetidas numa automação',
    area: 'Administração',
    description:
      'Quando uma automação atinge o limite de falhas definitivas, alerta a administração (evento emitido pelo próprio motor).',
    category: AutomationCategory.OPERATIONAL,
    module: 'AUTOMATION',
    trigger: TriggerType.AUTOMATION_EXECUTION_FAILED,
    conditions: [],
    flow: {
      steps: [
        {
          type: 'action',
          label: 'Alertar a administração',
          action: A.CREATE_ALERT,
          params: {
            type: 'AUTOMATION_PERSISTENT_FAILURE',
            recipient: 'ROLE:${adminRole}',
            messageTemplate: '${message}',
          },
        },
      ],
    },
    modules: ['Automation', 'Notifications'],
    fields: [
      {
        key: 'adminRole',
        label: 'Perfil a alertar',
        type: 'roleCode',
        required: true,
        default: 'ADMIN',
      },
      msg('message', 'Mensagem', 'A automação "{{ruleName}}" está a falhar repetidamente.'),
    ],
    limitations: [
      'O motor já notifica o responsável e os ADMIN por omissão; este modelo permite ajustar destinatário e texto.',
    ],
    manualMinutesSaved: 10,
    tags: ['administracao', 'monitorizacao'],
  },
];

export const templateByKey = (key: string) => AUTOMATION_TEMPLATES.find(t => t.key === key);

// ─── Instanciação ───────────────────────────────────────────────

const TOKEN = /\$\{(\w+)\}/g;
const WHOLE = /^\$\{(\w+)\}$/;

/** Substitui `${campo}` em todo o fluxo; um marcador sem valor remove a propriedade. */
export function resolveTemplateValues<T>(node: T, values: Record<string, unknown>): T {
  if (typeof node === 'string') {
    const whole = WHOLE.exec(node);
    if (whole) return values[whole[1]] as T;
    return node.replace(TOKEN, (_m, k: string) => String(values[k] ?? '')) as T;
  }
  if (Array.isArray(node)) {
    return node.map(n => resolveTemplateValues(n, values)) as T;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const r = resolveTemplateValues(v, values);
      if (r !== undefined) out[k] = r;
    }
    return out as T;
  }
  return node;
}

/** Valida e normaliza os valores dos campos; devolve os erros em linguagem do utilizador. */
export function coerceTemplateValues(
  t: AutomationTemplate,
  input: Record<string, unknown> = {},
): { values: Record<string, unknown>; errors: string[] } {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const f of t.fields) {
    const raw = input[f.key] ?? f.default;
    const empty = raw === undefined || raw === null || raw === '';
    if (empty) {
      if (f.required) errors.push(`Preencha "${f.label}".`);
      continue;
    }
    if (f.type === 'number' || f.type === 'userId') {
      const n = Number(raw);
      if (!Number.isFinite(n) || (f.type === 'userId' && (!Number.isInteger(n) || n < 1))) {
        errors.push(`"${f.label}" tem de ser um número válido.`);
      } else values[f.key] = n;
    } else if (f.type === 'boolean') {
      values[f.key] = raw === true || raw === 'true';
    } else if (f.type === 'roleCode') {
      if (!/^[A-Z_]{2,30}$/.test(String(raw)))
        errors.push(`"${f.label}" tem de ser um código de perfil (ex.: RH).`);
      else values[f.key] = String(raw);
    } else {
      values[f.key] = String(raw).slice(0, 500);
    }
  }
  return { values, errors };
}

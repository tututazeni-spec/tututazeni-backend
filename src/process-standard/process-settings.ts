// src/process-standard/process-settings.ts
// Aba "Configurações" (docs/Modulo_Processes.md §14): definição das 16 secções,
// valores por omissão e validação/normalização de cada uma. Lógica pura.
//
// `enforced` indica se o motor já aplica a secção em runtime (true) ou se é
// uma política declarativa consultada por outras partes/auditoria (false) —
// a interface mostra essa diferença ao utilizador.
import { BadRequestException } from '@nestjs/common';

export const PROCESS_STATUSES = ['DRAFT', 'IN_REVIEW', 'ACTIVE', 'ARCHIVED'] as const;
export const PRIORITY_CODES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export const CONFIDENTIALITY = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'] as const;
export const NOTIFICATION_EVENTS = [
  'TASK_ASSIGNED',
  'APPROVAL_REQUESTED',
  'TASK_OVERDUE',
  'APPROVAL_RETURNED',
  'PROCESS_COMPLETED',
] as const;
export const ACCESS_SCOPES = ['ALL', 'DEPARTMENT', 'OWN'] as const;
export const ACCESS_ROLES = [
  'ADMIN',
  'RH',
  'GESTOR',
  'AUDITOR',
  'LIDER',
  'DIRECTOR',
  'COLABORADOR',
] as const;

export interface SettingMeta {
  key: SettingKey;
  title: string;
  description: string;
  enforced: boolean;
}

export const SETTING_KEYS = [
  'categories',
  'statuses',
  'priorities',
  'assignmentRules',
  'approvalMatrix',
  'defaultDeadlines',
  'workCalendar',
  'escalation',
  'notifications',
  'accessRules',
  'confidentiality',
  'retention',
  'numbering',
  'integrations',
  'automationLimits',
  'indicators',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_META: SettingMeta[] = [
  {
    key: 'categories',
    title: 'Categorias e tipos de processos',
    description: 'Lista de categorias oferecidas ao criar modelos.',
    enforced: false,
  },
  {
    key: 'statuses',
    title: 'Estados e transições permitidas',
    description: 'Transições possíveis entre estados do modelo de processo.',
    enforced: false,
  },
  {
    key: 'priorities',
    title: 'Prioridades',
    description: 'Rótulos e factor de prazo por prioridade (prazo = SLA × factor).',
    enforced: true,
  },
  {
    key: 'assignmentRules',
    title: 'Regras de atribuição',
    description: 'Quem recebe a responsabilidade quando o modelo não indica responsável.',
    enforced: false,
  },
  {
    key: 'approvalMatrix',
    title: 'Matriz de aprovações',
    description: 'Aprovador exigido por categoria e nível de risco.',
    enforced: false,
  },
  {
    key: 'defaultDeadlines',
    title: 'Prazos padrão por tipo de processo',
    description: 'SLA (horas) usado quando o modelo não define o seu.',
    enforced: true,
  },
  {
    key: 'workCalendar',
    title: 'Calendários de trabalho e feriados',
    description: 'Dias úteis e feriados usados nos prazos em dias úteis.',
    enforced: true,
  },
  {
    key: 'escalation',
    title: 'Regras de escalonamento',
    description: 'Escalonamento por omissão para etapas sem regra própria.',
    enforced: false,
  },
  {
    key: 'notifications',
    title: 'Modelos de notificações',
    description: 'Assunto e corpo das notificações do módulo.',
    enforced: false,
  },
  {
    key: 'accessRules',
    title: 'Acesso por função, unidade e departamento',
    description: 'Âmbito de visibilidade dos processos por função.',
    enforced: false,
  },
  {
    key: 'confidentiality',
    title: 'Níveis de confidencialidade',
    description: 'Rótulos e nível por omissão dos documentos e modelos.',
    enforced: false,
  },
  {
    key: 'retention',
    title: 'Políticas de retenção',
    description:
      'Anos de conservação por tipo de registo (a auditoria nunca é apagada manualmente).',
    enforced: false,
  },
  {
    key: 'numbering',
    title: 'Numeração e identificação',
    description: 'Prefixo, ano e preenchimento do código dos processos.',
    enforced: true,
  },
  {
    key: 'integrations',
    title: 'Configuração das integrações',
    description: 'Módulos autorizados a iniciar processos por evento.',
    enforced: true,
  },
  {
    key: 'automationLimits',
    title: 'Limites e repetição das automações',
    description:
      'Tentativas máximas de repetição (aplicado às integrações falhadas) e intervalo entre repetições.',
    enforced: true,
  },
  {
    key: 'indicators',
    title: 'Definições dos indicadores',
    description: 'Metas e limiares usados nos indicadores.',
    enforced: false,
  },
];

export const DEFAULT_SETTINGS: Record<SettingKey, unknown> = {
  categories: ['Recursos Humanos', 'Formação', 'Compliance', 'Financeiro', 'Operações'],
  statuses: {
    DRAFT: ['IN_REVIEW', 'ARCHIVED'],
    IN_REVIEW: ['ACTIVE', 'DRAFT'],
    ACTIVE: ['ARCHIVED'],
    ARCHIVED: ['DRAFT'],
  },
  priorities: [
    { code: 'LOW', label: 'Baixa', slaFactor: 1 },
    { code: 'NORMAL', label: 'Normal', slaFactor: 1 },
    { code: 'HIGH', label: 'Alta', slaFactor: 1 },
    { code: 'URGENT', label: 'Urgente', slaFactor: 1 },
  ],
  assignmentRules: [],
  approvalMatrix: [],
  defaultDeadlines: [],
  workCalendar: { workDays: [1, 2, 3, 4, 5], startHour: 9, endHour: 18, holidays: [] },
  escalation: { afterHours: 24, toRole: 'RH', repeatEveryHours: 24, maxEscalations: 3 },
  notifications: NOTIFICATION_EVENTS.map(event => ({
    event,
    enabled: true,
    subject: '',
    body: '',
  })),
  accessRules: [
    { role: 'ADMIN', scope: 'ALL' },
    { role: 'RH', scope: 'ALL' },
    { role: 'AUDITOR', scope: 'ALL' },
    { role: 'GESTOR', scope: 'DEPARTMENT' },
    { role: 'COLABORADOR', scope: 'OWN' },
  ],
  confidentiality: {
    default: 'INTERNAL',
    labels: {
      PUBLIC: 'Público',
      INTERNAL: 'Interno',
      CONFIDENTIAL: 'Confidencial',
      RESTRICTED: 'Restrito',
    },
  },
  retention: { auditYears: 10, closedInstanceYears: 5, documentYears: 10, integrationLogYears: 2 },
  numbering: { prefix: 'PROC', includeYear: true, padding: 4 },
  integrations: { inboundEnabled: true, enabledModules: [], maxPayloadKb: 16 },
  automationLimits: { maxRetries: 3, retryBackoffMinutes: 15, maxExecutionsPerHour: 500 },
  indicators: { onTimeTargetPct: 90, atRiskThresholdPct: 20, maxCycleDays: 30 },
};

// ─── Validação ───────────────────────────────────────────────────────────────
const bad = (msg: string): never => {
  throw new BadRequestException(msg);
};
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

function text(v: unknown, label: string, max = 120, required = true): string {
  if (typeof v !== 'string') return required ? bad(`${label}: texto obrigatório`) : '';
  const t = v.trim();
  if (required && !t) bad(`${label}: texto obrigatório`);
  if (t.length > max) bad(`${label}: máximo ${max} caracteres`);
  return t;
}
function num(v: unknown, label: string, min: number, max: number): number {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
    bad(`${label}: número entre ${min} e ${max}`);
  }
  return n as number;
}
const int = (v: unknown, label: string, min: number, max: number) =>
  Math.round(num(v, label, min, max));
function pick<T extends string>(v: unknown, label: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    bad(`${label}: valor inválido (${allowed.join(', ')})`);
  }
  return v as T;
}
function list(v: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(v)) return bad(`${label}: tem de ser uma lista`);
  if (v.length > max) bad(`${label}: máximo ${max} entradas`);
  return v;
}
function objOf(v: unknown, label: string): Record<string, unknown> {
  return isObj(v) ? v : bad(`${label}: objecto obrigatório`);
}
function unique<T>(items: T[], key: (t: T) => string, label: string) {
  const seen = new Set<string>();
  for (const i of items) {
    const k = key(i).toLowerCase();
    if (seen.has(k)) bad(`${label}: "${key(i)}" repetido`);
    seen.add(k);
  }
}

const VALIDATORS: Record<SettingKey, (v: unknown) => unknown> = {
  categories(v) {
    const items = list(v, 'Categorias', 50).map((c, i) => text(c, `Categoria ${i + 1}`, 60));
    unique(items, s => s, 'Categorias');
    return items;
  },
  statuses(v) {
    const o = objOf(v, 'Estados');
    const out: Record<string, string[]> = {};
    for (const s of PROCESS_STATUSES) {
      const to = list(o[s] ?? [], `Transições de ${s}`, PROCESS_STATUSES.length).map(t =>
        pick(t, `Transição de ${s}`, PROCESS_STATUSES),
      );
      if (to.includes(s)) bad(`Estados: ${s} não pode transitar para si próprio`);
      out[s] = [...new Set(to)];
    }
    return out;
  },
  priorities(v) {
    const items = list(v, 'Prioridades', PRIORITY_CODES.length).map((p, i) => {
      const o = objOf(p, `Prioridade ${i + 1}`);
      return {
        code: pick(o.code, 'Código da prioridade', PRIORITY_CODES),
        label: text(o.label, 'Rótulo da prioridade', 40),
        slaFactor: Math.round(num(o.slaFactor, 'Factor de prazo', 0.1, 10) * 100) / 100,
      };
    });
    unique(items, p => p.code, 'Prioridades');
    if (items.length !== PRIORITY_CODES.length) bad('Têm de existir as 4 prioridades');
    return items;
  },
  assignmentRules(v) {
    return list(v, 'Regras de atribuição', 50).map((r, i) => {
      const o = objOf(r, `Regra ${i + 1}`);
      const userId =
        o.userId == null || o.userId === '' ? null : int(o.userId, 'Utilizador', 1, 2_147_483_647);
      const role = text(o.role, 'Função', 40, false);
      if (!userId && !role) bad(`Regra ${i + 1}: indique utilizador ou função`);
      return {
        name: text(o.name, 'Nome da regra', 80),
        category: text(o.category, 'Categoria', 60, false) || null,
        sourceModule: text(o.sourceModule, 'Módulo de origem', 60, false) || null,
        userId,
        role: role || null,
      };
    });
  },
  approvalMatrix(v) {
    return list(v, 'Matriz de aprovações', 50).map((r, i) => {
      const o = objOf(r, `Linha ${i + 1}`);
      return {
        category: text(o.category, 'Categoria', 60, false) || null,
        minRiskLevel: pick(o.minRiskLevel ?? 'LOW', 'Nível de risco', [
          'LOW',
          'MEDIUM',
          'HIGH',
          'CRITICAL',
        ] as const),
        approverRole: pick(o.approverRole, 'Função do aprovador', ACCESS_ROLES),
        mode: pick(o.mode ?? 'SEQUENTIAL', 'Modo', ['SEQUENTIAL', 'PARALLEL', 'ANY'] as const),
      };
    });
  },
  defaultDeadlines(v) {
    const items = list(v, 'Prazos padrão', 50).map((r, i) => {
      const o = objOf(r, `Prazo ${i + 1}`);
      return {
        category: text(o.category, 'Categoria', 60),
        hours: num(o.hours, 'Horas', 1, 24 * 365),
      };
    });
    unique(items, d => d.category, 'Prazos padrão');
    return items;
  },
  workCalendar(v) {
    const o = objOf(v, 'Calendário');
    const workDays = [
      ...new Set(list(o.workDays, 'Dias úteis', 7).map(d => int(d, 'Dia útil', 0, 6))),
    ].sort();
    if (!workDays.length) bad('Calendário: indique pelo menos um dia útil');
    const startHour = int(o.startHour, 'Hora de início', 0, 23);
    const endHour = int(o.endHour, 'Hora de fim', 1, 24);
    if (endHour <= startHour) bad('Calendário: a hora de fim tem de ser posterior à de início');
    const holidays = list(o.holidays ?? [], 'Feriados', 400).map((h, i) => {
      const ho = objOf(h, `Feriado ${i + 1}`);
      const date = text(ho.date, 'Data do feriado', 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
        bad(`Feriado ${i + 1}: data inválida (AAAA-MM-DD)`);
      }
      return { date, name: text(ho.name, 'Nome do feriado', 80) };
    });
    unique(holidays, h => h.date, 'Feriados');
    return { workDays, startHour, endHour, holidays };
  },
  escalation(v) {
    const o = objOf(v, 'Escalonamento');
    return {
      afterHours:
        o.afterHours == null || o.afterHours === ''
          ? null
          : num(o.afterHours, 'Escalar após (h)', 1, 24 * 90),
      toRole: pick(o.toRole, 'Função de destino', ACCESS_ROLES),
      repeatEveryHours: num(o.repeatEveryHours, 'Repetir a cada (h)', 1, 24 * 30),
      maxEscalations: int(o.maxEscalations, 'Máximo de escalonamentos', 1, 10),
    };
  },
  notifications(v) {
    const items = list(v, 'Notificações', NOTIFICATION_EVENTS.length).map((n, i) => {
      const o = objOf(n, `Notificação ${i + 1}`);
      return {
        event: pick(o.event, 'Evento', NOTIFICATION_EVENTS),
        enabled: o.enabled !== false,
        subject: text(o.subject, 'Assunto', 150, false),
        body: text(o.body, 'Corpo', 2000, false),
      };
    });
    unique(items, n => n.event, 'Notificações');
    return items;
  },
  accessRules(v) {
    const items = list(v, 'Regras de acesso', ACCESS_ROLES.length).map((r, i) => {
      const o = objOf(r, `Regra ${i + 1}`);
      return {
        role: pick(o.role, 'Função', ACCESS_ROLES),
        scope: pick(o.scope, 'Âmbito', ACCESS_SCOPES),
      };
    });
    unique(items, r => r.role, 'Regras de acesso');
    return items;
  },
  confidentiality(v) {
    const o = objOf(v, 'Confidencialidade');
    const labelsIn = objOf(o.labels, 'Rótulos');
    const labels: Record<string, string> = {};
    for (const l of CONFIDENTIALITY) labels[l] = text(labelsIn[l], `Rótulo de ${l}`, 40);
    return { default: pick(o.default, 'Nível por omissão', CONFIDENTIALITY), labels };
  },
  retention(v) {
    const o = objOf(v, 'Retenção');
    // A auditoria nunca pode ficar abaixo do mínimo legal assumido (5 anos).
    return {
      auditYears: int(o.auditYears, 'Auditoria (anos)', 5, 50),
      closedInstanceYears: int(o.closedInstanceYears, 'Processos encerrados (anos)', 1, 50),
      documentYears: int(o.documentYears, 'Documentos (anos)', 1, 50),
      integrationLogYears: int(o.integrationLogYears, 'Registos de integração (anos)', 1, 50),
    };
  },
  numbering(v) {
    const o = objOf(v, 'Numeração');
    const prefix = text(o.prefix, 'Prefixo', 10).toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(prefix))
      bad('Prefixo: 2 a 10 letras ou dígitos (sem espaços nem "-")');
    return {
      prefix,
      includeYear: o.includeYear !== false,
      padding: int(o.padding, 'Preenchimento', 3, 8),
    };
  },
  integrations(v) {
    const o = objOf(v, 'Integrações');
    const modules = list(o.enabledModules ?? [], 'Módulos', 80).map(m => text(m, 'Módulo', 60));
    return {
      inboundEnabled: o.inboundEnabled !== false,
      enabledModules: [...new Set(modules)],
      maxPayloadKb: int(o.maxPayloadKb, 'Tamanho máximo (KB)', 1, 256),
    };
  },
  automationLimits(v) {
    const o = objOf(v, 'Limites das automações');
    return {
      maxRetries: int(o.maxRetries, 'Tentativas máximas', 0, 10),
      retryBackoffMinutes: int(o.retryBackoffMinutes, 'Intervalo (min)', 1, 1440),
      maxExecutionsPerHour: int(o.maxExecutionsPerHour, 'Execuções por hora', 1, 100_000),
    };
  },
  indicators(v) {
    const o = objOf(v, 'Indicadores');
    return {
      onTimeTargetPct: num(o.onTimeTargetPct, 'Meta de cumprimento (%)', 1, 100),
      atRiskThresholdPct: num(o.atRiskThresholdPct, 'Limiar de risco (%)', 1, 100),
      maxCycleDays: num(o.maxCycleDays, 'Duração máxima (dias)', 1, 365),
    };
  },
};

export const isSettingKey = (k: string): k is SettingKey =>
  (SETTING_KEYS as readonly string[]).includes(k);

export function validateSetting(key: SettingKey, value: unknown): unknown {
  return VALIDATORS[key](value);
}

// ─── Aplicação em runtime ────────────────────────────────────────────────────
export interface NumberingConfig {
  prefix: string;
  includeYear: boolean;
  padding: number;
}
export interface WorkCalendarConfig {
  workDays: number[];
  startHour: number;
  endHour: number;
  holidays: Array<{ date: string; name: string }>;
}

export const DEFAULT_NUMBERING = DEFAULT_SETTINGS.numbering as NumberingConfig;

/** Prefixo das séries de código, ex.: `PROC-2026-` ou `PROC-`. */
export const codePrefix = (cfg: NumberingConfig, year: number) =>
  cfg.includeYear ? `${cfg.prefix}-${year}-` : `${cfg.prefix}-`;

export const formatCode = (cfg: NumberingConfig, year: number, seq: number) =>
  `${codePrefix(cfg, year)}${String(seq).padStart(cfg.padding, '0')}`;

export function sequenceOf(cfg: NumberingConfig, year: number, code: string | null | undefined) {
  const prefix = codePrefix(cfg, year);
  if (!code || !code.startsWith(prefix)) return 0;
  const m = /^\d+$/.exec(code.slice(prefix.length));
  return m ? parseInt(m[0], 10) : 0;
}

/** Horas de prazo: SLA do modelo → prazo padrão da categoria; × factor da prioridade. */
export function resolveSlaHours(input: {
  templateHours: number | null | undefined;
  category: string | null | undefined;
  priority: string;
  deadlines: Array<{ category: string; hours: number }>;
  priorities: Array<{ code: string; slaFactor: number }>;
}): number | null {
  const category = input.category?.trim().toLowerCase();
  const base =
    input.templateHours ||
    input.deadlines.find(d => d.category.toLowerCase() === category)?.hours ||
    null;
  if (!base) return null;
  const factor = input.priorities.find(p => p.code === input.priority)?.slaFactor ?? 1;
  return Math.round(base * factor * 100) / 100;
}

export function isHoliday(d: Date, cal: WorkCalendarConfig) {
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return cal.holidays.some(h => h.date === iso);
}

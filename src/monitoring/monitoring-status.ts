// modulo_monitoring.md §2 — classificação de estado e agregação.
// Funções puras: sem acesso a BD, para serem fáceis de testar.

export type MonitoringStatus = 'NORMAL' | 'ATENCAO' | 'DEGRADADO' | 'CRITICO' | 'INDISPONIVEL';

/** Ordem de gravidade crescente — usada para "pior estado" e dependências. */
export const STATUS_RANK: Record<MonitoringStatus, number> = {
  NORMAL: 0,
  ATENCAO: 1,
  DEGRADADO: 2,
  CRITICO: 3,
  INDISPONIVEL: 4,
};

export const STATUS_LABEL: Record<MonitoringStatus, string> = {
  NORMAL: 'Normal',
  ATENCAO: 'Atenção',
  DEGRADADO: 'Degradado',
  CRITICO: 'Crítico',
  INDISPONIVEL: 'Indisponível',
};

export function worstStatus(statuses: MonitoringStatus[]): MonitoringStatus {
  return statuses.reduce<MonitoringStatus>(
    (worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst),
    'NORMAL',
  );
}

export interface StatusInput {
  /** false quando a sonda ao módulo falhou (a BD não respondeu). */
  available: boolean;
  /** percentagem 0–100 de operações recentes falhadas; null sem operações. */
  errorRatePercent: number | null;
  /** duração da sonda ao módulo, em ms. */
  latencyMs: number | null;
  /** itens em atraso / bloqueados que merecem atenção (0 se não aplicável). */
  backlog?: number;
}

export interface StatusResult {
  status: MonitoringStatus;
  reasons: string[];
}

const LATENCY = { atencao: 800, degradado: 2000, critico: 5000 };
const ERRORS = { atencao: 2, degradado: 10, critico: 25 };

export function classifyStatus(input: StatusInput): StatusResult {
  if (!input.available) {
    return { status: 'INDISPONIVEL', reasons: ['Sem resposta da base de dados'] };
  }
  const reasons: string[] = [];
  let status: MonitoringStatus = 'NORMAL';
  const raise = (to: MonitoringStatus, reason: string) => {
    reasons.push(reason);
    if (STATUS_RANK[to] > STATUS_RANK[status]) status = to;
  };

  const err = input.errorRatePercent;
  if (err !== null) {
    if (err >= ERRORS.critico) raise('CRITICO', `Taxa de erros ${err}%`);
    else if (err >= ERRORS.degradado) raise('DEGRADADO', `Taxa de erros ${err}%`);
    else if (err >= ERRORS.atencao) raise('ATENCAO', `Taxa de erros ${err}%`);
  }

  const lat = input.latencyMs;
  if (lat !== null) {
    if (lat >= LATENCY.critico) raise('CRITICO', `Latência ${lat}ms`);
    else if (lat >= LATENCY.degradado) raise('DEGRADADO', `Latência ${lat}ms`);
    else if (lat >= LATENCY.atencao) raise('ATENCAO', `Latência ${lat}ms`);
  }

  if ((input.backlog ?? 0) > 0) raise('ATENCAO', `${input.backlog} item(ns) em atraso/bloqueados`);

  return { status, reasons };
}

/**
 * Uma dependência em mau estado nunca deixa o módulo "Normal": degrada-o para,
 * no mínimo, Atenção (a falha é da dependência, não do módulo, por isso não
 * propaga a gravidade total).
 */
export function applyDependencies(
  own: StatusResult,
  deps: { key: string; status: MonitoringStatus }[],
): StatusResult {
  const bad = deps.filter(d => STATUS_RANK[d.status] >= STATUS_RANK.DEGRADADO);
  if (!bad.length) return own;
  const reasons = [
    ...own.reasons,
    ...bad.map(d => `Dependência ${d.key} ${d.status.toLowerCase()}`),
  ];
  const status = STATUS_RANK[own.status] >= STATUS_RANK.ATENCAO ? own.status : 'ATENCAO';
  return { status, reasons };
}

export function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

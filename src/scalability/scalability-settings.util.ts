// modulo_scalability.md §24 — valores por omissão e leitura tolerante das
// definições guardadas em ScalabilityInfraSettings (JSON em colunas de texto).

export const ALERT_THRESHOLD_DEFAULTS = {
  cpu: 85,
  ram: 90,
  storage: 85,
  dbConnections: 80,
  queuePending: 1000,
  p95Ms: 1500,
  p99Ms: 3000,
  errorRate: 1,
  slowEndpoints: 1,
  slowQueryShare: 5,
  growthFactor: 2,
  storageGrowthFactor: 1.5,
  usersNearLimitMonths: 3,
} as const;

export type AlertThresholds = { -readonly [K in keyof typeof ALERT_THRESHOLD_DEFAULTS]: number };
export type ThresholdKey = keyof AlertThresholds;

export const THRESHOLD_KEYS = Object.keys(ALERT_THRESHOLD_DEFAULTS) as ThresholdKey[];

/** Intervalos aceites por limiar (validação no servidor). */
export const THRESHOLD_RANGES: Record<ThresholdKey, [number, number]> = {
  cpu: [1, 100],
  ram: [1, 100],
  storage: [1, 100],
  dbConnections: [1, 100],
  queuePending: [1, 10_000_000],
  p95Ms: [1, 600_000],
  p99Ms: [1, 600_000],
  errorRate: [0.01, 100],
  slowEndpoints: [1, 1000],
  slowQueryShare: [0.1, 100],
  growthFactor: [1.1, 100],
  storageGrowthFactor: [1.1, 100],
  usersNearLimitMonths: [1, 120],
};

export interface MaintenanceWindow {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
}

export function parseJson<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/** Padrões + o que o administrador alterou (ignora chaves desconhecidas / valores inválidos). */
export function resolveThresholds(json: string | null | undefined): AlertThresholds {
  const stored = parseJson<Record<string, unknown>>(json, {});
  const out: AlertThresholds = { ...ALERT_THRESHOLD_DEFAULTS };
  for (const k of THRESHOLD_KEYS) {
    const v = stored[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function parseWindows(json: string | null | undefined): MaintenanceWindow[] {
  const v = parseJson<unknown>(json, []);
  return Array.isArray(v) ? (v as MaintenanceWindow[]) : [];
}

export function activeWindow(
  windows: MaintenanceWindow[],
  at: Date = new Date(),
): MaintenanceWindow | null {
  const t = at.getTime();
  return (
    windows.find(w => new Date(w.startsAt).getTime() <= t && t < new Date(w.endsAt).getTime()) ??
    null
  );
}

// NPS = % promotores (9-10) − % detratores (0-6); passivos (7-8) só contam no total.
export function computeNps(scores: number[]): {
  nps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
} {
  const total = scores.length;
  const promoters = scores.filter(s => s >= 9).length;
  const detractors = scores.filter(s => s <= 6).length;
  const passives = total - promoters - detractors;
  const nps = total === 0 ? null : Math.round(((promoters - detractors) / total) * 100);
  return { nps, promoters, passives, detractors, total };
}

// Normaliza o caminho para agregar por ecrã: tira query/hash e troca ids (numéricos ou uuid) por ":id".
export function normalizePath(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const base = raw.split(/[?#]/)[0].slice(0, 200);
  if (!base.startsWith('/')) return null;
  return base
    .split('/')
    .map(seg => (/^\d+$/.test(seg) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(seg) ? ':id' : seg))
    .join('/');
}

export const NPS_COOLDOWN_DAYS = 90;
export const NPS_MIN_ACCOUNT_AGE_DAYS = 7;

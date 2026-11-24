// src/settings/career-settings.ts
// Limiares dos Critérios de Promoção — guardados em
// TenantConfig.careerSettingsJson. Lógica pura: sem acesso à BD.
// Consumidos por CareerService.checkPromotionEligibility.

export interface CareerSettings {
  /** Meses mínimos desde a admissão (User.hireDate) para ser elegível. */
  minMonthsInRole: number;
  /** Score médio mínimo nas avaliações de performance (escala 0–5). */
  minPerformanceScore: number;
  /** % mínima de competências do cargo cumpridas para ser elegível. */
  minCompetenciesPct: number;
  /** % mínima de competências para a recomendação "pronto em 12 meses". */
  readyIn12mCompetenciesPct: number;
}

export const DEFAULT_CAREER_SETTINGS: CareerSettings = {
  minMonthsInRole: 12,
  minPerformanceScore: 3.5,
  minCompetenciesPct: 80,
  readyIn12mCompetenciesPct: 60,
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

/** Lê o JSON guardado; valores em falta ou inválidos voltam ao valor por omissão. */
export function parseCareerSettings(raw: string | null | undefined): CareerSettings {
  const d = DEFAULT_CAREER_SETTINGS;
  if (!raw) return { ...d };
  try {
    const p = JSON.parse(raw) as Partial<Record<keyof CareerSettings, unknown>>;
    return {
      minMonthsInRole: num(p.minMonthsInRole, d.minMonthsInRole, 0, 240),
      minPerformanceScore: num(p.minPerformanceScore, d.minPerformanceScore, 0, 5),
      minCompetenciesPct: num(p.minCompetenciesPct, d.minCompetenciesPct, 0, 100),
      readyIn12mCompetenciesPct: num(
        p.readyIn12mCompetenciesPct,
        d.readyIn12mCompetenciesPct,
        0,
        100,
      ),
    };
  } catch {
    return { ...d };
  }
}

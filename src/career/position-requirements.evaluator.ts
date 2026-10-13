// Lógica pura de comparação colaborador ↔ requisitos do cargo. Sem Prisma, sem
// Nest — recebe dados já carregados e devolve um check por requisito.

export const ACADEMIC_ORDER = [
  'TECNICO',
  'BACHARELATO',
  'LICENCIATURA',
  'POS_GRADUACAO',
  'MESTRADO',
  'DOUTORAMENTO',
] as const;

export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type RequirementCategoryName = 'ACADEMIC' | 'EXPERIENCE' | 'LANGUAGE' | 'CERTIFICATION';
export type RequirementStatus = 'MET' | 'NOT_MET' | 'NO_DATA';

export interface RequirementInput {
  id: number;
  category: RequirementCategoryName;
  title: string;
  level: string | null;
  minYears: number | null;
  mandatory: boolean;
}

export interface CandidateProfile {
  qualifications: Array<{ degree: string; course: string }>;
  languages: Array<{ language: string; level: string }>;
  externalCertifications: Array<{ name: string; expiresAt: Date | null }>;
  platformCertificates: Array<{ title: string | null; expiresAt: Date | null; revoked: boolean }>;
  priorExperienceYears: number | null;
  hireDate: Date | null;
  now: Date;
}

export interface RequirementCheck {
  requirementId: number;
  category: RequirementCategoryName;
  title: string;
  mandatory: boolean;
  status: RequirementStatus;
  required: string;
  actual: string | null;
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function rank(order: readonly string[], value: string): number {
  return order.indexOf(value);
}

function isValid(expiresAt: Date | null, now: Date): boolean {
  return !expiresAt || expiresAt.getTime() > now.getTime();
}

function base(req: RequirementInput) {
  return {
    requirementId: req.id,
    category: req.category,
    title: req.title,
    mandatory: req.mandatory,
  };
}

// O curso do colaborador combina com o do requisito quando um contém o outro
// (normalizados). Sem isto "Direito, licenciatura" cumpria "Informática, licenciatura".
function courseMatches(requirementTitle: string, course: string): boolean {
  const wanted = normalizeText(requirementTitle);
  const have = normalizeText(course);
  if (!wanted || !have) return false;
  return have.includes(wanted) || wanted.includes(have);
}

function evalAcademic(req: RequirementInput, p: CandidateProfile): RequirementCheck {
  const required = req.level ?? 'Qualquer grau';
  if (p.qualifications.length === 0) {
    return { ...base(req), status: 'NO_DATA', required, actual: null };
  }
  const bestOf = (list: CandidateProfile['qualifications']) =>
    list.reduce((a, b) =>
      rank(ACADEMIC_ORDER, b.degree) > rank(ACADEMIC_ORDER, a.degree) ? b : a,
    );
  const sameCourse = p.qualifications.filter(q => courseMatches(req.title, q.course));
  if (sameCourse.length === 0) {
    return { ...base(req), status: 'NOT_MET', required, actual: bestOf(p.qualifications).degree };
  }
  const best = bestOf(sameCourse);
  const met =
    req.level === null || rank(ACADEMIC_ORDER, best.degree) >= rank(ACADEMIC_ORDER, req.level);
  return { ...base(req), status: met ? 'MET' : 'NOT_MET', required, actual: best.degree };
}

function evalExperience(req: RequirementInput, p: CandidateProfile): RequirementCheck {
  const min = req.minYears ?? 0;
  const required = `${min} anos`;
  // null = o colaborador nunca preencheu a experiência anterior (≠ ter preenchido 0).
  const filled = p.priorExperienceYears !== null;
  const tenure = p.hireDate
    ? Math.max(0, (p.now.getTime() - p.hireDate.getTime()) / MS_PER_YEAR)
    : 0;
  const total = Math.round(((p.priorExperienceYears ?? 0) + tenure) * 10) / 10;
  if (total >= min) {
    return { ...base(req), status: 'MET', required, actual: `${total} anos` };
  }
  // Sem experiência anterior preenchida não dá para afirmar que não cumpre.
  if (!filled) return { ...base(req), status: 'NO_DATA', required, actual: null };
  return { ...base(req), status: 'NOT_MET', required, actual: `${total} anos` };
}

function evalLanguage(req: RequirementInput, p: CandidateProfile): RequirementCheck {
  const required = req.level ? `${req.title} ${req.level}` : req.title;
  if (p.languages.length === 0) {
    return { ...base(req), status: 'NO_DATA', required, actual: null };
  }
  const found = p.languages.find(l => normalizeText(l.language) === normalizeText(req.title));
  if (!found) return { ...base(req), status: 'NOT_MET', required, actual: null };
  const met = req.level === null || rank(CEFR_ORDER, found.level) >= rank(CEFR_ORDER, req.level);
  return {
    ...base(req),
    status: met ? 'MET' : 'NOT_MET',
    required,
    actual: `${found.language} ${found.level}`,
  };
}

function evalCertification(req: RequirementInput, p: CandidateProfile): RequirementCheck {
  const required = req.title;
  // Certificados da plataforma sem título utilizável não permitem comparar, logo
  // não contam como "dados" (senão NO_DATA virava NOT_MET sem culpa do colaborador).
  const namedPlatform = p.platformCertificates.filter(c => c.title !== null);
  if (p.externalCertifications.length === 0 && namedPlatform.length === 0) {
    return { ...base(req), status: 'NO_DATA', required, actual: null };
  }
  const wanted = normalizeText(req.title);
  const external = p.externalCertifications.find(
    c => normalizeText(c.name) === wanted && isValid(c.expiresAt, p.now),
  );
  if (external) return { ...base(req), status: 'MET', required, actual: external.name };
  const platform = p.platformCertificates.find(
    c =>
      c.title !== null &&
      normalizeText(c.title) === wanted &&
      !c.revoked &&
      isValid(c.expiresAt, p.now),
  );
  if (platform) return { ...base(req), status: 'MET', required, actual: platform.title };
  return { ...base(req), status: 'NOT_MET', required, actual: null };
}

export function evaluateRequirement(
  req: RequirementInput,
  profile: CandidateProfile,
): RequirementCheck {
  switch (req.category) {
    case 'ACADEMIC':
      return evalAcademic(req, profile);
    case 'EXPERIENCE':
      return evalExperience(req, profile);
    case 'LANGUAGE':
      return evalLanguage(req, profile);
    case 'CERTIFICATION':
      return evalCertification(req, profile);
  }
}

export function evaluateRequirements(
  reqs: RequirementInput[],
  profile: CandidateProfile,
): RequirementCheck[] {
  return reqs.map(r => evaluateRequirement(r, profile));
}

// Score = (competências cumpridas + requisitos obrigatórios cumpridos) /
// (competências + requisitos obrigatórios com dados). Diferenciais e NO_DATA
// ficam fora da nota e são contados à parte.
export function computeReadiness(
  competencyMet: number,
  competencyTotal: number,
  checks: RequirementCheck[],
): { readinessScore: number; optionalMet: number; optionalTotal: number; noData: number } {
  const scored = checks.filter(c => c.mandatory && c.status !== 'NO_DATA');
  const metMandatory = scored.filter(c => c.status === 'MET').length;
  const denominator = competencyTotal + scored.length;
  const optional = checks.filter(c => !c.mandatory && c.status !== 'NO_DATA');
  return {
    readinessScore:
      denominator > 0 ? Math.round(((competencyMet + metMandatory) / denominator) * 100) : 100,
    optionalMet: optional.filter(c => c.status === 'MET').length,
    optionalTotal: optional.length,
    noData: checks.filter(c => c.status === 'NO_DATA').length,
  };
}

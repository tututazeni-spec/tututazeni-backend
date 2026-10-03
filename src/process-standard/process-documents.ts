// src/process-standard/process-documents.ts
// Regras puras da aba "Documentos" (docs/Modulo_Processes.md §11): estado
// efectivo (validade), avaliação dos documentos obrigatórios, versões,
// retenção e renderização de modelos. Sem acesso à BD.

export const VALIDATION_STATUSES = ['REQUESTED', 'PENDING', 'APPROVED', 'REJECTED'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];
export const EXPIRING_DAYS = 30;
/** Retenção mínima aplicada ao arquivar quando o documento ainda não tem prazo próprio. */
export const DEFAULT_RETENTION_YEARS = 5;
const DAY_MS = 86_400_000;

export type EffectiveStatus = ValidationStatus | 'EXPIRED';

export interface DocLike {
  name: string;
  docType: string;
  validationStatus: string;
  validUntil: Date | null;
  archivedAt: Date | null;
}

/** `EXPIRED` é derivado: documento aprovado cuja validade já passou. */
export function effectiveStatus(
  doc: Pick<DocLike, 'validationStatus' | 'validUntil'>,
  now: Date = new Date(),
): EffectiveStatus {
  if (doc.validationStatus === 'APPROVED' && doc.validUntil && doc.validUntil < now) {
    return 'EXPIRED';
  }
  return doc.validationStatus as ValidationStatus;
}

export function expiryInfo(validUntil: Date | null, now: Date = new Date()) {
  if (!validUntil) return { expired: false, expiringSoon: false, daysLeft: null as number | null };
  const daysLeft = Math.ceil((validUntil.getTime() - now.getTime()) / DAY_MS);
  return {
    expired: daysLeft < 0,
    expiringSoon: daysLeft >= 0 && daysLeft <= EXPIRING_DAYS,
    daysLeft,
  };
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** O documento (nome/tipo) satisfaz algum dos tipos exigidos pelo modelo? */
export function matchesRequired(required: string[], name: string, docType: string): boolean {
  const n = norm(name);
  const t = norm(docType);
  return required.some(r => {
    const k = norm(r);
    return !!k && (k === n || k === t);
  });
}

export type RequirementState = 'OK' | 'MISSING' | 'REQUESTED' | 'PENDING' | 'REJECTED' | 'EXPIRED';

export interface Requirement {
  name: string;
  state: RequirementState;
  documentId: number | null;
}

const RANK: Record<RequirementState, number> = {
  OK: 5,
  PENDING: 4,
  EXPIRED: 3,
  REJECTED: 2,
  REQUESTED: 1,
  MISSING: 0,
};

/**
 * Avalia os documentos obrigatórios do modelo (`requiredDocuments`) face aos
 * documentos do processo. Um requisito casa por tipo ou nome (sem acentos nem
 * maiúsculas); fica com o melhor estado entre os documentos que o satisfazem.
 */
export function evaluateRequirements(
  required: string[],
  docs: Array<DocLike & { id: number }>,
  now: Date = new Date(),
): Requirement[] {
  const live = docs.filter(d => !d.archivedAt);
  return [...new Set(required.map(r => r.trim()).filter(Boolean))].map(name => {
    const key = norm(name);
    const matches = live.filter(d => norm(d.docType) === key || norm(d.name) === key);
    let best: { state: RequirementState; id: number | null } = { state: 'MISSING', id: null };
    for (const d of matches) {
      const eff = effectiveStatus(d, now);
      const state: RequirementState =
        eff === 'APPROVED'
          ? 'OK'
          : eff === 'EXPIRED'
            ? 'EXPIRED'
            : eff === 'REJECTED'
              ? 'REJECTED'
              : eff === 'REQUESTED'
                ? 'REQUESTED'
                : 'PENDING';
      if (RANK[state] > RANK[best.state]) best = { state, id: d.id };
    }
    return { name, state: best.state, documentId: best.id };
  });
}

/** Próxima versão: incrementa a parte principal ("1.0" → "2.0"). */
export function nextDocVersion(current: string): string {
  const major = parseInt(current.split('.')[0], 10);
  return `${Number.isNaN(major) ? 1 : major + 1}.0`;
}

export function retentionDate(
  existing: Date | null,
  from: Date = new Date(),
  years: number = DEFAULT_RETENTION_YEARS,
): Date {
  const min = new Date(from.getTime());
  min.setUTCFullYear(min.getUTCFullYear() + years);
  return existing && existing > min ? existing : min;
}

/** DocSensitivity do repositório → nível de confidencialidade do processo. */
export function confidentialityFromSensitivity(s: string | null | undefined): string {
  switch (s) {
    case 'PUBLIC':
      return 'PUBLIC';
    case 'CONFIDENTIAL':
      return 'CONFIDENTIAL';
    case 'RESTRICTED':
    case 'SECRET':
      return 'RESTRICTED';
    default:
      return 'INTERNAL';
  }
}

const LEVEL = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];
/** Nunca baixa a confidencialidade abaixo da do documento de origem. */
export function maxConfidentiality(a: string, b: string): string {
  return LEVEL.indexOf(a) >= LEVEL.indexOf(b) ? a : b;
}

const stripHtml = (s: string) =>
  s
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Substitui `{{variavel}}` pelo contexto; devolve o texto e as variáveis sem valor. */
export function renderTemplate(body: string, vars: Record<string, string | null | undefined>) {
  const unresolved = new Set<string>();
  const text = stripHtml(body).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    if (v == null || v === '') {
      unresolved.add(key);
      return `[${key}]`;
    }
    return v;
  });
  return { text, unresolved: [...unresolved] };
}

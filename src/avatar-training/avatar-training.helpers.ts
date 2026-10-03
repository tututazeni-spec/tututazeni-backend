// src/avatar-training/avatar-training.helpers.ts
import { Role } from '../auth/enums/role.enum';
import { AvatarStepType, SessionRulesDto, SessionStepDto } from './dto/avatar-training.dto';

/** Gestão de avatares, aprovação/publicação, revisão de tentativas e leitura global. */
export const AVATAR_ADMIN_ROLES = [Role.ADMIN, Role.RH];
/** Criação/edição de formações, sessões e avaliações. */
export const AVATAR_AUTHOR_ROLES = [Role.ADMIN, Role.RH, Role.INSTRUCTOR];
/** Atribuição a colaboradores (GESTOR/LIDER só sobre subordinados directos). */
export const AVATAR_ASSIGN_ROLES = [Role.ADMIN, Role.RH, Role.DIRECTOR, Role.GESTOR, Role.LIDER];
/** Leitura de progresso alargada (restrita à equipa para GESTOR/LIDER). */
export const AVATAR_PROGRESS_ROLES = [...AVATAR_ASSIGN_ROLES, Role.AUDITOR, Role.INSTRUCTOR];

export interface StoredStep extends Omit<SessionStepDto, 'question'> {
  question?: SessionStepDto['question'];
}

export function parseSteps(contentConfig: string | null | undefined): StoredStep[] {
  if (!contentConfig) return [];
  try {
    const parsed = JSON.parse(contentConfig) as { steps?: StoredStep[] };
    return Array.isArray(parsed.steps) ? parsed.steps : [];
  } catch {
    return [];
  }
}

export function parseRules(contentConfig: string | null | undefined): SessionRulesDto {
  if (!contentConfig) return {};
  try {
    const parsed = JSON.parse(contentConfig) as { rules?: SessionRulesDto };
    return parsed.rules ?? {};
  } catch {
    return {};
  }
}

export function serializeSteps(steps: SessionStepDto[], rules: SessionRulesDto = {}): string {
  return JSON.stringify(Object.keys(rules).length ? { steps, rules } : { steps });
}

/** Remove correctAnswer, ramificações e reforço — o formando nunca vê o gabarito, o caminho nem a regra. */
export function stripAnswers(steps: StoredStep[]): StoredStep[] {
  return steps.map(({ branches: _branches, reinforcement: _reinforcement, ...s }) =>
    s.question ? { ...s, question: { ...s.question, correctAnswer: undefined } } : s,
  );
}

/**
 * Chave da etapa seguinte pedida pelas ramificações, ou null para seguir em sequência.
 * `correct` é null quando a etapa não tem gabarito (ex.: cenário de role-play).
 */
export function branchTarget(
  step: StoredStep,
  answer: string,
  correct: boolean | null,
): string | null {
  const b = step.branches;
  if (!b) return null;
  const byOption = b.byOption?.[answer.trim()];
  if (byOption) return byOption;
  if (correct === true) return b.onCorrect ?? null;
  if (correct === false) return b.onIncorrect ?? null;
  return null;
}

export function isGradedStep(step: StoredStep): boolean {
  return step.type === AvatarStepType.QUESTION && !!step.question?.correctAnswer;
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase();
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Reforço e repetição (docs/Avatar_Training.md §7) ─────────────────────────

const DEFAULT_MAX_RETRIES = 2;

export interface StepReinforcementPayload {
  message: string | null;
  reviewStepKey: string | null;
  reviewStepTitle: string | null;
  resourceUrl: string | null;
  /** Verdadeiro quando a etapa deve ser repetida antes de avançar. */
  retry: boolean;
  retriesLeft: number;
}

/**
 * Reforço a apresentar após uma resposta errada. `previousAnswers` é o número de
 * respostas já dadas a esta etapa (sem contar a actual). Null quando a etapa não
 * tem regra de reforço.
 */
export function stepReinforcement(
  step: StoredStep,
  steps: StoredStep[],
  previousAnswers: number,
): StepReinforcementPayload | null {
  const r = step.reinforcement;
  if (!r) return null;
  const max = r.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retry = !!r.retryOnIncorrect && previousAnswers < max;
  const review = r.reviewStepKey ? steps.find(s => s.key === r.reviewStepKey) : undefined;
  return {
    message: r.message ?? null,
    reviewStepKey: review?.key ?? null,
    reviewStepTitle: review?.title ?? null,
    resourceUrl: r.resourceUrl ?? null,
    retry,
    retriesLeft: retry ? max - previousAnswers : 0,
  };
}

/** Sumário para o formando que ficou abaixo da nota mínima: etapas fracas + regra da sessão. */
export function failureReinforcement(
  steps: StoredStep[],
  breakdown: { stepKey: string; correct: boolean; answered: boolean }[],
  rules: SessionRulesDto,
) {
  const weakSteps = breakdown
    .filter(b => !b.correct)
    .map(b => steps.find(s => s.key === b.stepKey))
    .filter((s): s is StoredStep => !!s)
    .map(s => ({
      stepKey: s.key,
      title: s.title,
      message: s.reinforcement?.message ?? null,
      reviewStepKey: s.reinforcement?.reviewStepKey ?? null,
      resourceUrl: s.reinforcement?.resourceUrl ?? null,
    }));
  const fail = rules.onFail;
  if (!weakSteps.length && !fail) return null;
  return {
    message: fail?.message ?? null,
    resourceUrl: fail?.resourceUrl ?? null,
    recommendSessionId: fail?.recommendSessionId ?? null,
    weakSteps,
  };
}

// ── Personalização por nível (docs/Avatar_Training.md §1) ────────────────────

export const DIFFICULTY_ORDER = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
export type LevelFit = 'MATCH' | 'EASIER' | 'HARDER';

/** Mínimo de tentativas avaliadas para subir de nível; antes disso o formando é tratado como iniciante. */
const MIN_ATTEMPTS_FOR_LEVEL = 3;

/** Nível do formando inferido das notas das suas tentativas terminadas (0 = iniciante). */
export function learnerLevelIndex(scores: number[]): number {
  if (scores.length < MIN_ATTEMPTS_FOR_LEVEL) return 0;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (mean >= 90) return 2;
  if (mean >= 75) return 1;
  return 0;
}

/** MATCH: igual ou um degrau acima do nível; EASIER: abaixo; HARDER: dois ou mais degraus acima. */
export function levelFit(difficulty: string, learnerIndex: number): LevelFit {
  const idx = DIFFICULTY_ORDER.indexOf(difficulty as (typeof DIFFICULTY_ORDER)[number]);
  const diff = (idx < 0 ? 0 : idx) - learnerIndex;
  if (diff < 0) return 'EASIER';
  return diff >= 2 ? 'HARDER' : 'MATCH';
}

const FIT_RANK: Record<LevelFit, number> = { MATCH: 0, EASIER: 1, HARDER: 2 };
export const levelFitRank = (fit: LevelFit) => FIT_RANK[fit];

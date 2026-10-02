// src/avatar-training/avatar-training.helpers.ts
import { Role } from '../auth/enums/role.enum';
import { AvatarStepType, SessionStepDto } from './dto/avatar-training.dto';

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

export function serializeSteps(steps: SessionStepDto[]): string {
  return JSON.stringify({ steps });
}

/** Remove correctAnswer — o formando nunca vê o gabarito. */
export function stripAnswers(steps: StoredStep[]): StoredStep[] {
  return steps.map(s =>
    s.question ? { ...s, question: { ...s.question, correctAnswer: undefined } } : s,
  );
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

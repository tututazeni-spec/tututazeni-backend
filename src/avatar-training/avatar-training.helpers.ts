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

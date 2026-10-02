// src/avatar-training/avatar-training-assessments.service.ts
// Avaliação de conhecimentos (automática, por etapa) e de simulações (rubrica
// revista por um humano). A avaliação formal continua em Assessments — aqui só
// se consulta o resultado.
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CriterionScoreDto, RubricCriterionDto } from './dto/avatar-training.dto';
import { StoredStep, isGradedStep, normalizeAnswer, parseJson } from './avatar-training.helpers';

export interface SessionAssessmentConfig {
  assessmentId: number | null;
  rubric: RubricCriterionDto[];
  passingScore: number;
  maxAttempts: number;
  requireFormalAssessment: boolean;
}

export interface KnowledgeBreakdownItem {
  stepKey: string;
  correct: boolean;
  weight: number;
  answered: boolean;
}

export const DEFAULT_PASSING_SCORE = 70;

@Injectable()
export class AvatarTrainingAssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(sessionId: number): Promise<SessionAssessmentConfig> {
    const row = await this.prisma.avatarTrainingAssessment.findUnique({ where: { sessionId } });
    return {
      assessmentId: row?.assessmentId ?? null,
      rubric: parseJson<RubricCriterionDto[]>(row?.rubricConfig, []),
      passingScore: row?.passingScore ?? DEFAULT_PASSING_SCORE,
      maxAttempts: row?.maxAttempts ?? 0,
      requireFormalAssessment: row?.requireFormalAssessment ?? false,
    };
  }

  /** Corrige uma resposta isolada; null quando a etapa não é avaliável. */
  gradeAnswer(step: StoredStep, answer: string): { correct: boolean; explanation?: string } | null {
    if (!isGradedStep(step) || !step.question) return null;
    const correct = normalizeAnswer(answer) === normalizeAnswer(step.question.correctAnswer ?? '');
    return { correct, explanation: step.question.explanation };
  }

  /** Nota 0-100 ponderada pelo peso das perguntas; null se não há perguntas avaliáveis. */
  gradeKnowledge(
    steps: StoredStep[],
    answers: Map<string, string>,
    /** Etapas saltadas por uma ramificação — não contam para a nota. */
    skipped: ReadonlySet<string> = new Set(),
  ): { score: number | null; breakdown: KnowledgeBreakdownItem[] } {
    const graded = steps.filter(s => isGradedStep(s) && !skipped.has(s.key));
    if (!graded.length) return { score: null, breakdown: [] };
    let total = 0;
    let earned = 0;
    const breakdown = graded.map(s => {
      const weight = s.question?.weight ?? 1;
      const given = answers.get(s.key);
      const correct = given !== undefined && !!this.gradeAnswer(s, given)?.correct;
      total += weight;
      if (correct) earned += weight;
      return { stepKey: s.key, correct, weight, answered: given !== undefined };
    });
    const score = total > 0 ? Math.round((earned / total) * 1000) / 10 : 0;
    return { score, breakdown };
  }

  /** Nota 0-100 da rubrica; exige exactamente os critérios configurados. */
  scoreRubric(rubric: RubricCriterionDto[], criteria: CriterionScoreDto[]) {
    if (!rubric.length) throw new BadRequestException('Esta sessão não tem rubrica configurada');
    const byKey = new Map(criteria.map(c => [c.key, c]));
    if (byKey.size !== criteria.length) throw new BadRequestException('Critérios repetidos');
    const unknown = criteria.filter(c => !rubric.some(r => r.key === c.key));
    if (unknown.length) {
      throw new BadRequestException(
        `Critérios desconhecidos: ${unknown.map(u => u.key).join(', ')}`,
      );
    }
    const missing = rubric.filter(r => !byKey.has(r.key));
    if (missing.length) {
      throw new BadRequestException(`Faltam critérios: ${missing.map(m => m.label).join(', ')}`);
    }
    const weightTotal = rubric.reduce((a, r) => a + r.weight, 0) || 100;
    const score = rubric.reduce((a, r) => a + (byKey.get(r.key).score * r.weight) / weightTotal, 0);
    return {
      score: Math.round(score * 10) / 10,
      breakdown: rubric.map(r => ({
        key: r.key,
        label: r.label,
        weight: r.weight,
        score: byKey.get(r.key).score,
        comment: byKey.get(r.key).comment,
      })),
    };
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EvaluationService {
  constructor(private prisma: PrismaService) {}

  // Criar avaliação
  createEvaluation(data: Prisma.EvaluationCreateInput) {
    return this.prisma.evaluation.create({ data });
  }

  // Criar pergunta
  createQuestion(data: Prisma.EvaluationQuestionCreateInput) {
    return this.prisma.evaluationQuestion.create({ data });
  }

  // Listar avaliações por curso
  findByCourse(courseId: number) {
    return this.prisma.evaluation.findMany({
      where: { courseId },
      include: { questions: true },
    });
  }

  // Registrar tentativa
  createAttempt(data: Prisma.EvaluationAttemptCreateInput) {
    return this.prisma.evaluationAttempt.create({ data });
  }

  // Buscar tentativas por matrícula
  findAttemptsByEnrollment(enrollmentId: number) {
    return this.prisma.evaluationAttempt.findMany({
      where: { enrollmentId },
      include: {
        evaluation: true,
      },
      orderBy: { attemptedAt: 'desc' },
    });
  }

  // 🔥 FINALIZAR TENTATIVA COM CÁLCULO AUTOMÁTICO
  async finalizeAttempt(
    attemptId: number,
    answers: { questionId: number; selectedIndex: number }[],
  ) {
    const attempt = await this.prisma.evaluationAttempt.findUnique({
      where: { id: attemptId },
      include: {
        evaluation: {
          include: { questions: true },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Tentativa não encontrada');
    }

    if (!answers || answers.length === 0) {
      throw new BadRequestException('Respostas não fornecidas');
    }

    const questions = attempt.evaluation.questions;

    if (questions.length === 0) {
      throw new BadRequestException('Avaliação não possui perguntas');
    }

    let correctCount = 0;

    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);

      if (!question) continue;

      const isCorrect = question.correctIndex === answer.selectedIndex;

      if (isCorrect) correctCount++;

      await this.prisma.evaluationAttemptAnswer.create({
        data: {
          attemptId,
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
          isCorrect,
        },
      });
    }

    const scorePercent = (correctCount / questions.length) * 100;
    const passed = scorePercent >= 70;

    return this.prisma.evaluationAttempt.update({
      where: { id: attemptId },
      data: {
        scorePercent,
        passed,
        finishedAt: new Date(),
      },
    });
  }
}
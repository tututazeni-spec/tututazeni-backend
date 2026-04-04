import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAssessmentDto, UpdateAssessmentDto,
  SubmitAssessmentDto, SubmitEvaluationDto,
} from './assessments.dto';
 
@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService) {}
 
  // ─── ASSESSMENT (Quizzes por curso) ──────────────────────────────────────
 
  async create(dto: CreateAssessmentDto) {
    const { questions, ...assessmentData } = dto;
    return this.prisma.assessment.create({
      data: {
        ...assessmentData,
        questions: { create: questions },
      },
      include: { questions: true },
    });
  }
 
  async findByCourse(courseId: number) {
    return this.prisma.assessment.findMany({
      where: { courseId },
      include: { questions: true, _count: { select: { assessmentAttempts: true } } },
    });
  }
 
  async findOne(id: number) {
    const a = await this.prisma.assessment.findUnique({
      where: { id }, include: { questions: true },
    });
    if (!a) throw new NotFoundException('Avaliação não encontrada');
    return a;
  }
 
  async update(id: number, dto: UpdateAssessmentDto) {
    await this.findOne(id);
    const { questions, ...data } = dto;
    if (questions) {
      await this.prisma.assessmentQuestion.deleteMany({ where: { assessmentId: id } });
      await this.prisma.assessmentQuestion.createMany({
        data: questions.map(q => ({ ...q, assessmentId: id })),
      });
    }
    return this.prisma.assessment.update({ where: { id }, data });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.assessment.delete({ where: { id } });
    return { message: 'Avaliação removida' };
  }
 
  async submit(userId: number, dto: SubmitAssessmentDto) {
    const assessment = await this.findOne(dto.assessmentId);
    if (dto.answers.length !== assessment.questions.length) {
      throw new BadRequestException('Número de respostas não coincide');
    }
 
    let correct = 0;
    let totalWeight = 0;
    for (let i = 0; i < assessment.questions.length; i++) {
      const q = assessment.questions[i];
      totalWeight += q.weight;
      if (dto.answers[i] === q.correctIndex) correct += q.weight;
    }
 
    const score = totalWeight > 0 ? Math.round((correct / totalWeight) * 100) : 0;
    const passed = score >= assessment.passScore;
 
    const attempt = await this.prisma.assessmentAttempt.create({
      data: { assessmentId: dto.assessmentId, userId, score, passed },
    });
 
    if (passed) {
      await this.prisma.userPoints.upsert({
        where: { userId },
        create: { userId, points: 50 },
        update: { points: { increment: 50 } },
      });
    }
 
    return { ...attempt, score, passed, correctAnswers: correct, total: assessment.questions.length };
  }
 
  async getUserAttempts(userId: number, assessmentId?: number) {
    return this.prisma.assessmentAttempt.findMany({
      where: { userId, ...(assessmentId && { assessmentId }) },
      include: { assessment: true },
      orderBy: { createdAt: 'desc' },
    });
  }
 
  // ─── EVALUATIONS (Avaliações detalhadas por curso) ───────────────────────
 
  async submitEvaluation(dto: SubmitEvaluationDto) {
    const evaluation = await this.prisma.evaluation.findFirst({
      where: { id: dto.evaluationId },
      include: { questions: true },
    });
    if (!evaluation) throw new NotFoundException('Avaliação não encontrada');
 
    const code = `EVA-${Date.now()}`;
    const attempt = await this.prisma.evaluationAttempt.create({
      data: {
        enrollmentId: dto.enrollmentId,
        evaluationId: dto.evaluationId,
        validationCode: code,
        startedAt: new Date(),
      },
    });
 
    let correct = 0;
    const answers = await Promise.all(
      dto.answers.map(async (ans) => {
        const question = evaluation.questions.find(q => q.id === ans.questionId);
        const isCorrect = question?.correctIndex === ans.selectedIndex;
        if (isCorrect) correct++;
        return this.prisma.evaluationAttemptAnswer.create({
          data: {
            attemptId: attempt.id,
            questionId: ans.questionId,
            selectedIndex: ans.selectedIndex,
            isCorrect: isCorrect ?? false,
          },
        });
      }),
    );
 
    const scorePercent = evaluation.questions.length
      ? Math.round((correct / evaluation.questions.length) * 100)
      : 0;
    const passed = scorePercent >= 70;
 
    await this.prisma.evaluationAttempt.update({
      where: { id: attempt.id },
      data: { scorePercent, passed, finishedAt: new Date() },
    });
 
    return { attemptId: attempt.id, scorePercent, passed, correctAnswers: correct, answers };
  }
 
  async getEvaluationAttempts(enrollmentId: number) {
    return this.prisma.evaluationAttempt.findMany({
      where: { enrollmentId },
      include: { evaluation: true, answers: { include: { question: true } } },
      orderBy: { attemptedAt: 'desc' },
    });
  }
}
 

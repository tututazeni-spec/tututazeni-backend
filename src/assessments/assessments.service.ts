// src/assessments/assessments.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAssessmentDto,
  UpdateAssessmentDto,
  AssessmentFilterDto,
  StartAttemptDto,
  SubmitAttemptDto,
  AutoSaveDto,
  ReviewAnswerDto,
} from './assessments.dto';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CRUD Assessments ─────────────────────────────────────────────────────

  async create(dto: CreateAssessmentDto) {
    const { questions, ...data } = dto;

    const assessment = await this.prisma.assessment.create({
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        status: data.status ?? 'DRAFT',
        courseId: data.courseId,
        moduleId: data.moduleId,
        learningPathId: data.learningPathId,
        passingScore: data.passingScore ?? 70,
        maxAttempts: data.maxAttempts ?? 0,
        cooldownHours: data.cooldownHours ?? 0,
        timeLimitMinutes: data.timeLimitMinutes ?? 0,
        feedbackMode: data.feedbackMode ?? 'ON_SUBMIT',
        randomizeQuestions: data.randomizeQuestions ?? false,
        randomizeOptions: data.randomizeOptions ?? false,
        allowReview: data.allowReview ?? true,
      },
    });

    if (questions?.length) {
      await this.prisma.assessmentQuestion.createMany({
        data: questions.map(q => ({
          assessmentId: assessment.id,
          type: q.type,
          questionText: q.questionText,
          mediaUrl: q.mediaUrl,
          options: q.options ? JSON.stringify(q.options) : null,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          weight: q.weight,
          mandatory: q.mandatory ?? false,
          difficulty: q.difficulty ?? 1,
          tags: q.tags ?? [],
          seq: q.seq,
        })),
      });
    }

    return this.findOne(assessment.id);
  }

  async findAll(filters: AssessmentFilterDto) {
    const where: any = {};
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.moduleId) where.moduleId = filters.moduleId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;

    return this.prisma.assessment.findMany({
      where,
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, forUser = false) {
    const a = await this.prisma.assessment.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { seq: 'asc' },
        },
        _count: { select: { attempts: true } },
      },
    });
    if (!a) throw new NotFoundException('Avaliação não encontrada');

    // Para utilizador: não expor respostas correctas (a menos que feedback imediato)
    if (forUser && (a as any).feedbackMode !== 'IMMEDIATE') {
      const questions = (a.questions as any[]).map(q => {
        const opts = q.options ? JSON.parse(q.options) : null;
        const sanitizedOpts = opts?.map((o: any) => ({ text: o.text }));
        return {
          ...q,
          options: sanitizedOpts ? JSON.stringify(sanitizedOpts) : null,
          correctAnswer: undefined,
          explanation: undefined,
        };
      });
      return { ...a, questions };
    }

    return a;
  }

  async update(id: number, dto: UpdateAssessmentDto) {
    await this.findOne(id);
    const { questions, ...data } = dto;

    if (questions) {
      await this.prisma.assessmentQuestion.deleteMany({ where: { assessmentId: id } });
      await this.prisma.assessmentQuestion.createMany({
        data: questions.map(q => ({
          assessmentId: id,
          type: q.type,
          questionText: q.questionText,
          mediaUrl: q.mediaUrl,
          options: q.options ? JSON.stringify(q.options) : null,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          weight: q.weight,
          mandatory: q.mandatory ?? false,
          difficulty: q.difficulty ?? 1,
          tags: q.tags ?? [],
          seq: q.seq,
        })),
      });
    }

    return this.prisma.assessment.update({ where: { id }, data });
  }

  async publish(id: number) {
    const a = (await this.findOne(id)) as any;
    if (a._count.questions === 0) {
      throw new BadRequestException('Avaliação sem perguntas não pode ser publicada');
    }
    return this.prisma.assessment.update({ where: { id }, data: { status: 'PUBLISHED' } });
  }

  async archive(id: number) {
    return this.prisma.assessment.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async duplicate(id: number) {
    const original = (await this.findOne(id)) as any;
    const { id: _, questions, _count, createdAt, updatedAt, ...data } = original;

    const clone = await this.prisma.assessment.create({
      data: { ...data, title: `${data.title} (cópia)`, status: 'DRAFT' },
    });

    if (questions.length) {
      await this.prisma.assessmentQuestion.createMany({
        data: questions.map((q: any) => ({
          assessmentId: clone.id,
          type: q.type,
          questionText: q.questionText,
          mediaUrl: q.mediaUrl,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          weight: q.weight,
          mandatory: q.mandatory,
          difficulty: q.difficulty,
          tags: q.tags,
          seq: q.seq,
        })),
      });
    }

    return this.findOne(clone.id);
  }

  async remove(id: number) {
    const a = (await this.findOne(id)) as any;
    if (a._count.attempts > 0 && a.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Avaliação publicada com tentativas não pode ser eliminada. Archive-a primeiro.',
      );
    }
    await this.prisma.assessment.delete({ where: { id } });
    return { message: 'Avaliação eliminada' };
  }

  // ─── Perguntas individuais ────────────────────────────────────────────────

  async addQuestion(assessmentId: number, dto: any) {
    await this.findOne(assessmentId);
    return this.prisma.assessmentQuestion.create({
      data: {
        assessmentId,
        type: dto.type,
        questionText: dto.questionText,
        mediaUrl: dto.mediaUrl,
        options: dto.options ? JSON.stringify(dto.options) : null,
        correctAnswer: dto.correctAnswer,
        explanation: dto.explanation,
        weight: dto.weight ?? 1,
        mandatory: dto.mandatory ?? false,
        difficulty: dto.difficulty ?? 1,
        tags: dto.tags ?? [],
        seq: dto.seq ?? 0,
      },
    });
  }

  async removeQuestion(questionId: number) {
    return this.prisma.assessmentQuestion.delete({ where: { id: questionId } });
  }

  // ─── TENTATIVAS ───────────────────────────────────────────────────────────

  async startAttempt(userId: number, dto: StartAttemptDto) {
    const assessment = (await this.findOne(dto.assessmentId, true)) as any;

    if (assessment.status !== 'PUBLISHED') {
      throw new BadRequestException('Avaliação não está publicada');
    }

    // Verificar tentativas máximas
    if (assessment.maxAttempts > 0) {
      const totalAttempts = await this.prisma.assessmentAttempt.count({
        where: { assessmentId: dto.assessmentId, userId },
      });
      if (totalAttempts >= assessment.maxAttempts) {
        throw new ForbiddenException(`Limite de ${assessment.maxAttempts} tentativa(s) atingido`);
      }
    }

    // Verificar cooldown
    if (assessment.cooldownHours > 0) {
      const lastAttempt = await this.prisma.assessmentAttempt.findFirst({
        where: { assessmentId: dto.assessmentId, userId },
        orderBy: { startedAt: 'desc' },
      });
      if (lastAttempt) {
        const cooldownMs = assessment.cooldownHours * 3600 * 1000;
        const timeSinceLast = Date.now() - new Date((lastAttempt as any).startedAt).getTime();
        if (timeSinceLast < cooldownMs) {
          const hoursLeft = Math.ceil((cooldownMs - timeSinceLast) / 3600000);
          throw new ForbiddenException(
            `Cooldown activo. Nova tentativa disponível em ${hoursLeft}h`,
          );
        }
      }
    }

    // Verificar tentativa em progresso
    const inProgress = await this.prisma.assessmentAttempt.findFirst({
      where: { assessmentId: dto.assessmentId, userId, status: 'IN_PROGRESS' },
    });
    if (inProgress) {
      return inProgress; // Retomar tentativa existente
    }

    // Calcular deadline da tentativa
    const deadline =
      assessment.timeLimitMinutes > 0
        ? new Date(Date.now() + assessment.timeLimitMinutes * 60 * 1000)
        : null;

    // Preparar ordem das perguntas (randomização)
    let questionOrder = assessment.questions.map((q: any) => q.id);
    if (assessment.randomizeQuestions) {
      questionOrder = questionOrder.sort(() => Math.random() - 0.5);
    }

    const attempt = await this.prisma.assessmentAttempt.create({
      data: {
        assessmentId: dto.assessmentId,
        userId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        deadline,
        questionOrder: JSON.stringify(questionOrder),
        savedAnswers: '{}',
      },
    });

    return {
      ...attempt,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        timeLimitMinutes: assessment.timeLimitMinutes,
        totalQuestions: assessment.questions.length,
        feedbackMode: assessment.feedbackMode,
      },
    };
  }

  async autoSave(userId: number, dto: AutoSaveDto) {
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { id: dto.attemptId, userId, status: 'IN_PROGRESS' },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada ou já submetida');

    return this.prisma.assessmentAttempt.update({
      where: { id: dto.attemptId },
      data: { savedAnswers: JSON.stringify(dto.answers), lastSavedAt: new Date() },
    });
  }

  async submitAttempt(userId: number, dto: SubmitAttemptDto) {
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { id: dto.attemptId, userId },
      include: { assessment: { include: { questions: true } } },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');
    if ((attempt as any).status !== 'IN_PROGRESS') {
      throw new ConflictException('Tentativa já foi submetida');
    }

    // Verificar timeout
    if ((attempt as any).deadline && new Date() > new Date((attempt as any).deadline)) {
      await this.prisma.assessmentAttempt.update({
        where: { id: dto.attemptId },
        data: { status: 'EXPIRED', submittedAt: new Date() },
      });
      throw new ForbiddenException('Tempo esgotado. Tentativa marcada como expirada.');
    }

    const questions: any[] = (attempt as any).assessment.questions;
    const assessment: any = (attempt as any).assessment;

    let totalWeight = 0;
    let earnedWeight = 0;
    const results: any[] = [];
    const needsManualReview: number[] = [];

    for (const q of questions) {
      totalWeight += q.weight ?? 1;
      const answer = dto.answers.find(a => a.questionId === q.id);
      let isCorrect: boolean | null = null;
      let earnedPoints = 0;

      if (q.type === 'MULTIPLE_CHOICE_SINGLE' || q.type === 'TRUE_FALSE') {
        const opts = q.options ? JSON.parse(q.options) : [];
        const correctIdx = opts.findIndex((o: any) => o.isCorrect);
        isCorrect = answer?.selectedIndices?.[0] === correctIdx;
        if (isCorrect) {
          earnedPoints = q.weight ?? 1;
          earnedWeight += earnedPoints;
        }
      } else if (q.type === 'MULTIPLE_CHOICE_MULTI') {
        const opts = q.options ? JSON.parse(q.options) : [];
        const correctIndices = opts
          .map((o: any, i: number) => (o.isCorrect ? i : -1))
          .filter((i: number) => i >= 0);
        const selected = answer?.selectedIndices ?? [];
        isCorrect = JSON.stringify(selected.sort()) === JSON.stringify(correctIndices.sort());
        if (isCorrect) {
          earnedPoints = q.weight ?? 1;
          earnedWeight += earnedPoints;
        }
      } else if (q.type === 'OPEN_TEXT' || q.type === 'FILE_UPLOAD') {
        // Correção manual — guarda para revisão
        needsManualReview.push(q.id);
        isCorrect = null;
      } else if (q.type === 'ORDERING') {
        const correctOrder = q.correctAnswer ? JSON.parse(q.correctAnswer) : [];
        isCorrect = JSON.stringify(answer?.selectedIndices) === JSON.stringify(correctOrder);
        if (isCorrect) {
          earnedPoints = q.weight ?? 1;
          earnedWeight += earnedPoints;
        }
      }

      // Guardar resposta
      await this.prisma.assessmentAttemptAnswer.create({
        data: {
          attemptId: dto.attemptId,
          questionId: q.id,
          selectedIndices: answer?.selectedIndices ? JSON.stringify(answer.selectedIndices) : null,
          textAnswer: answer?.textAnswer,
          fileUrl: answer?.fileUrl,
          isCorrect,
          earnedPoints,
          needsReview: needsManualReview.includes(q.id),
        },
      });

      results.push({
        questionId: q.id,
        questionText: q.questionText,
        isCorrect,
        earnedPoints,
        correctAnswer: assessment.feedbackMode !== 'RESULT_ONLY' ? q.correctAnswer : undefined,
        explanation: assessment.feedbackMode !== 'RESULT_ONLY' ? q.explanation : undefined,
        options:
          assessment.feedbackMode !== 'RESULT_ONLY'
            ? q.options
              ? JSON.parse(q.options)
              : null
            : undefined,
      });
    }

    // Calcular score final (excluindo questões de revisão manual)
    const autoGradableWeight = questions
      .filter(q => !needsManualReview.includes(q.id))
      .reduce((s, q) => s + (q.weight ?? 1), 0);

    const score =
      autoGradableWeight > 0 ? Math.round((earnedWeight / autoGradableWeight) * 100) : 0;

    const passed = needsManualReview.length === 0 ? score >= assessment.passingScore : null;

    const timeSpent = Math.round(
      (Date.now() - new Date((attempt as any).startedAt).getTime()) / 60000,
    );

    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: dto.attemptId },
      data: {
        status: needsManualReview.length > 0 ? 'SUBMITTED' : passed ? 'PASSED' : 'FAILED',
        submittedAt: new Date(),
        score,
        passed,
        timeSpentMinutes: timeSpent,
        needsManualReview: needsManualReview.length > 0,
      },
    });

    // Gamificação
    if (passed) {
      await this.prisma.userPoints
        .upsert({
          where: { userId },
          create: { userId, points: 50 },
          update: { points: { increment: 50 } },
        })
        .catch(() => {});

      await this.prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'ASSESSMENT_PASSED',
            message: `Aprovado na avaliação "${assessment.title}" com ${score}%`,
            metadata: JSON.stringify({ assessmentId: assessment.id, score }),
          },
        })
        .catch(() => {});
    } else if (passed === false) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'ASSESSMENT_FAILED',
            message: `Reprovado na avaliação "${assessment.title}" com ${score}%`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return {
      attempt: updated,
      score,
      passed,
      totalQuestions: questions.length,
      correctAnswers: results.filter(r => r.isCorrect === true).length,
      needsManualReview: needsManualReview.length > 0,
      results: assessment.feedbackMode !== 'RESULT_ONLY' ? results : undefined,
    };
  }

  async getAttemptDetail(attemptId: number, userId: number) {
    const attempt = await this.prisma.assessmentAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            allowReview: true,
            feedbackMode: true,
          },
        },
        answers: {
          include: { question: true },
          orderBy: { question: { seq: 'asc' } },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');

    const a = attempt as any;
    if (!a.assessment.allowReview && a.status !== 'IN_PROGRESS') {
      throw new ForbiddenException('Revisão não permitida para esta avaliação');
    }

    return attempt;
  }

  // ─── Revisão manual ───────────────────────────────────────────────────────

  async reviewAnswer(dto: ReviewAnswerDto, reviewerId: number) {
    const answer = await this.prisma.assessmentAttemptAnswer.findUnique({
      where: { id: dto.attemptAnswerId },
      include: { attempt: { include: { assessment: true } } },
    });
    if (!answer) throw new NotFoundException('Resposta não encontrada');

    await this.prisma.assessmentAttemptAnswer.update({
      where: { id: dto.attemptAnswerId },
      data: {
        manualScore: dto.score,
        reviewComment: dto.reviewComment,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        needsReview: false,
        isCorrect: dto.score >= 50, // aprovado se >= 50%
      },
    });

    // Verificar se todas as questões manuais foram revistas
    const attempt = (answer as any).attempt;
    const pendingReview = await this.prisma.assessmentAttemptAnswer.count({
      where: { attemptId: attempt.id, needsReview: true },
    });

    if (pendingReview === 0) {
      // Recalcular score final
      const allAnswers = await this.prisma.assessmentAttemptAnswer.findMany({
        where: { attemptId: attempt.id },
      });
      const totalEarned = allAnswers.reduce((s, a) => {
        const pts =
          (a as any).manualScore !== null
            ? ((a as any).manualScore / 100) * ((a as any).earnedPoints || 1)
            : (a as any).earnedPoints || 0;
        return s + pts;
      }, 0);

      const totalWeight = allAnswers.length;
      const score = totalWeight > 0 ? Math.round((totalEarned / totalWeight) * 100) : 0;
      const passed = score >= attempt.assessment.passingScore;

      await this.prisma.assessmentAttempt.update({
        where: { id: attempt.id },
        data: { score, passed, status: passed ? 'PASSED' : 'FAILED', needsManualReview: false },
      });
    }

    return { message: 'Resposta avaliada', pendingReview };
  }

  async getPendingReviews() {
    return this.prisma.assessmentAttemptAnswer.findMany({
      where: { needsReview: true },
      include: {
        attempt: {
          include: { user: { select: { id: true, fullName: true } } },
        },
        question: { select: { questionText: true, type: true } },
      },
      orderBy: { attempt: { submittedAt: 'asc' } },
    });
  }

  // ─── Histórico ────────────────────────────────────────────────────────────

  async getUserAttempts(userId: number, assessmentId?: number) {
    const where: any = { userId };
    if (assessmentId) where.assessmentId = assessmentId;

    return this.prisma.assessmentAttempt.findMany({
      where,
      include: {
        assessment: { select: { id: true, title: true, type: true, passingScore: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics(assessmentId: number) {
    await this.findOne(assessmentId);

    const [totalAttempts, passed, failed, avgScore, questions] = await Promise.all([
      this.prisma.assessmentAttempt.count({
        where: { assessmentId, status: { not: 'IN_PROGRESS' } },
      }),
      this.prisma.assessmentAttempt.count({ where: { assessmentId, status: 'PASSED' } }),
      this.prisma.assessmentAttempt.count({ where: { assessmentId, status: 'FAILED' } }),
      this.prisma.assessmentAttempt.aggregate({
        where: { assessmentId, status: { not: 'IN_PROGRESS' } },
        _avg: { score: true, timeSpentMinutes: true },
      }),
      this.prisma.assessmentQuestion.findMany({ where: { assessmentId } }),
    ]);

    // Análise por pergunta
    const questionStats = await Promise.all(
      questions.map(async q => {
        const [total, correct] = await Promise.all([
          this.prisma.assessmentAttemptAnswer.count({ where: { questionId: q.id } }),
          this.prisma.assessmentAttemptAnswer.count({
            where: { questionId: q.id, isCorrect: true },
          }),
        ]);
        const errorRate = total > 0 ? Math.round(((total - correct) / total) * 100) : 0;
        return {
          questionId: q.id,
          questionText: (q as any).questionText,
          difficulty: (q as any).difficulty,
          totalAnswers: total,
          correctCount: correct,
          errorRate,
          isProblemQuestion: errorRate > 70,
        };
      }),
    );

    return {
      assessmentId,
      attempts: {
        total: totalAttempts,
        passed,
        failed,
        inProgress: totalAttempts - passed - failed,
      },
      passRate: totalAttempts > 0 ? Math.round((passed / totalAttempts) * 100) : 0,
      avgScore: Math.round(avgScore._avg.score ?? 0),
      avgTimeMinutes: Math.round(avgScore._avg.timeSpentMinutes ?? 0),
      questionStats,
      problemQuestions: questionStats.filter(q => q.isProblemQuestion),
    };
  }
}

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
import { Prisma } from '@prisma/client';
import {
  CreateAssessmentDto,
  UpdateAssessmentDto,
  AssessmentFilterDto,
  StartAttemptDto,
  SubmitAttemptDto,
  AutoSaveDto,
  ReviewAnswerDto,
  CreateQuestionDto,
} from './assessments.dto';

interface QuestionOption {
  text: string;
  isCorrect?: boolean;
}

export interface GradedResult {
  questionId: number;
  questionText: string;
  isCorrect: boolean | null;
  earnedPoints: number;
  correctAnswer?: string | null;
  explanation?: string | null;
  options?: QuestionOption[] | null;
}

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Rótulo qualitativo & nota escalada ──────────────────────────────────
  // Limiares por defeito, ajustáveis — não há hoje nenhum util de "score →
  // rótulo" partilhado no código (cada módulo hardcoda os seus próprios).
  private qualitativeLabel(score: number | null): string | null {
    if (score === null || score === undefined) return null;
    if (score < 50) return 'Mau';
    if (score < 70) return 'Regular';
    if (score < 85) return 'Bom';
    return 'Excelente';
  }

  // Converte o score interno (0-100%) para a escala de apresentação definida
  // pelo criador (`maxGrade`, ex: 20, 10, 100). Puramente de apresentação —
  // não altera a correcção/aprovação, que continua baseada em `score`.
  private toDisplayGrade(score: number | null, maxGrade: number): number | null {
    if (score === null || score === undefined) return null;
    return Math.round((score / 100) * maxGrade * 100) / 100;
  }

  // ─── CRUD Assessments ─────────────────────────────────────────────────────

  async create(dto: CreateAssessmentDto) {
    const { questions, ...data } = dto;
    this.assertValidAvailabilityWindow(data.availableFrom, data.availableUntil);

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
        targetDepartmentIds: data.targetDepartmentIds ?? [],
        availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
        availableUntil: data.availableUntil ? new Date(data.availableUntil) : null,
        maxGrade: data.maxGrade ?? 20,
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
    const where: Prisma.AssessmentWhereInput = {};
    if (filters.courseId) where.courseId = filters.courseId;
    if (filters.moduleId) where.moduleId = filters.moduleId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.excludeType) where.type = { not: filters.excludeType };

    return this.prisma.read.assessment.findMany({
      where,
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Avaliações formais (EXAM) publicadas, dentro da janela de disponibilidade,
  // e visíveis para o departamento do utilizador (array vazio = todos).
  async getAvailableForUser(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    const now = new Date();

    return this.prisma.read.assessment.findMany({
      where: {
        type: 'EXAM',
        status: 'PUBLISHED',
        OR: [
          { targetDepartmentIds: { isEmpty: true } },
          ...(user?.departmentId != null
            ? [{ targetDepartmentIds: { has: user.departmentId } }]
            : []),
        ],
        AND: [
          { OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] },
          { OR: [{ availableUntil: null }, { availableUntil: { gte: now } }] },
        ],
      },
      include: {
        _count: { select: { questions: true, attempts: true } },
      },
      orderBy: { availableUntil: 'asc' },
    });
  }

  async findOne(id: number, forUser = false) {
    const a = await this.prisma.read.assessment.findUnique({
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
    if (forUser && a.feedbackMode !== 'IMMEDIATE') {
      const questions = a.questions.map(q => {
        const opts: QuestionOption[] | null = q.options ? JSON.parse(q.options) : null;
        const sanitizedOpts = opts?.map(o => ({ text: o.text }));
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
    const { questions, availableFrom, availableUntil, ...data } = dto;
    this.assertValidAvailabilityWindow(availableFrom, availableUntil);

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

    return this.prisma.assessment.update({
      where: { id },
      data: {
        ...data,
        ...(availableFrom !== undefined && {
          availableFrom: availableFrom ? new Date(availableFrom) : null,
        }),
        ...(availableUntil !== undefined && {
          availableUntil: availableUntil ? new Date(availableUntil) : null,
        }),
      },
    });
  }

  // Garante que a janela de disponibilidade (quando ambas as pontas são
  // definidas) tem fim depois do início.
  private assertValidAvailabilityWindow(availableFrom?: string, availableUntil?: string) {
    if (availableFrom && availableUntil && new Date(availableUntil) <= new Date(availableFrom)) {
      throw new BadRequestException(
        'A data/hora de fim da disponibilidade tem de ser posterior à de início',
      );
    }
  }

  async publish(id: number) {
    // FIX: _count só selecciona `attempts` (não `questions`) — a._count.questions
    // era sempre undefined, esta validação nunca disparava.
    const a = await this.findOne(id);
    if (a.questions.length === 0) {
      throw new BadRequestException('Avaliação sem perguntas não pode ser publicada');
    }
    return this.prisma.assessment.update({ where: { id }, data: { status: 'PUBLISHED' } });
  }

  async archive(id: number) {
    return this.prisma.assessment.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async duplicate(id: number) {
    const original = await this.findOne(id);
    const { id: _, questions, _count, createdAt, updatedAt, ...data } = original;

    const clone = await this.prisma.assessment.create({
      data: { ...data, title: `${data.title} (cópia)`, status: 'DRAFT' },
    });

    if (questions.length) {
      await this.prisma.assessmentQuestion.createMany({
        data: questions.map(q => ({
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
    const a = await this.findOne(id);
    if (a._count.attempts > 0 && a.status === 'PUBLISHED') {
      throw new ForbiddenException(
        'Avaliação publicada com tentativas não pode ser eliminada. Archive-a primeiro.',
      );
    }
    await this.prisma.assessment.delete({ where: { id } });
    return { message: 'Avaliação eliminada' };
  }

  // ─── Perguntas individuais ────────────────────────────────────────────────

  async addQuestion(assessmentId: number, dto: CreateQuestionDto) {
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
    const assessment = await this.findOne(dto.assessmentId, true);

    if (assessment.status !== 'PUBLISHED') {
      throw new BadRequestException('Avaliação não está publicada');
    }

    // Verificar janela de disponibilidade (avaliações formais/EXAM)
    const now = new Date();
    if (assessment.availableFrom && now < new Date(assessment.availableFrom)) {
      throw new BadRequestException(
        `Avaliação ainda não está disponível. Abre a ${new Date(assessment.availableFrom).toLocaleString('pt-PT')}.`,
      );
    }
    if (assessment.availableUntil && now > new Date(assessment.availableUntil)) {
      throw new BadRequestException('Avaliação encerrada. O prazo de disponibilidade terminou.');
    }

    // Verificar tentativas máximas
    if (assessment.maxAttempts > 0) {
      const totalAttempts = await this.prisma.read.assessmentAttempt.count({
        where: { assessmentId: dto.assessmentId, userId },
      });
      if (totalAttempts >= assessment.maxAttempts) {
        throw new ForbiddenException(`Limite de ${assessment.maxAttempts} tentativa(s) atingido`);
      }
    }

    // Verificar cooldown
    if (assessment.cooldownHours > 0) {
      const lastAttempt = await this.prisma.read.assessmentAttempt.findFirst({
        where: { assessmentId: dto.assessmentId, userId },
        orderBy: { startedAt: 'desc' },
      });
      if (lastAttempt) {
        const cooldownMs = assessment.cooldownHours * 3600 * 1000;
        const timeSinceLast = Date.now() - new Date(lastAttempt.startedAt).getTime();
        if (timeSinceLast < cooldownMs) {
          const hoursLeft = Math.ceil((cooldownMs - timeSinceLast) / 3600000);
          throw new ForbiddenException(
            `Cooldown activo. Nova tentativa disponível em ${hoursLeft}h`,
          );
        }
      }
    }

    // Verificar tentativa em progresso
    const inProgress = await this.prisma.read.assessmentAttempt.findFirst({
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
    let questionOrder = assessment.questions.map(q => q.id);
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
    const attempt = await this.prisma.read.assessmentAttempt.findFirst({
      where: { id: dto.attemptId, userId, status: 'IN_PROGRESS' },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada ou já submetida');

    return this.prisma.assessmentAttempt.update({
      where: { id: dto.attemptId },
      data: { savedAnswers: JSON.stringify(dto.answers), lastSavedAt: new Date() },
    });
  }

  async submitAttempt(userId: number, dto: SubmitAttemptDto) {
    const attempt = await this.prisma.read.assessmentAttempt.findFirst({
      where: { id: dto.attemptId, userId },
      include: { assessment: { include: { questions: true } } },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');
    if (attempt.status !== 'IN_PROGRESS') {
      throw new ConflictException('Tentativa já foi submetida');
    }

    // Verificar timeout
    if (attempt.deadline && new Date() > new Date(attempt.deadline)) {
      await this.prisma.assessmentAttempt.update({
        where: { id: dto.attemptId },
        data: { status: 'EXPIRED', submittedAt: new Date() },
      });
      throw new ForbiddenException('Tempo esgotado. Tentativa marcada como expirada.');
    }

    const questions = attempt.assessment.questions;
    const assessment = attempt.assessment;

    let earnedWeight = 0;
    const results: GradedResult[] = [];
    const needsManualReview: number[] = [];

    for (const q of questions) {
      const answer = dto.answers.find(a => a.questionId === q.id);
      let isCorrect: boolean | null = null;
      let earnedPoints = 0;

      if (q.type === 'MULTIPLE_CHOICE_SINGLE' || q.type === 'TRUE_FALSE') {
        const opts: QuestionOption[] = q.options ? JSON.parse(q.options) : [];
        const correctIdx = opts.findIndex(o => o.isCorrect);
        isCorrect = answer?.selectedIndices?.[0] === correctIdx;
        if (isCorrect) {
          earnedPoints = q.weight ?? 1;
          earnedWeight += earnedPoints;
        }
      } else if (q.type === 'MULTIPLE_CHOICE_MULTI') {
        const opts: QuestionOption[] = q.options ? JSON.parse(q.options) : [];
        const correctIndices = opts.map((o, i) => (o.isCorrect ? i : -1)).filter(i => i >= 0);
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

    // Calcular score final (excluindo questões de revisão manual). Este é o
    // denominador correcto — soma dos pesos só das perguntas auto-corrigidas.
    // (Havia um `totalWeight` acumulado no loop acima com o peso de TODAS as
    // perguntas, incluindo as de revisão manual — nunca chegou a ser lido;
    // usá-lo teria penalizado o score sempre que há perguntas por rever.)
    const autoGradableWeight = questions
      .filter(q => !needsManualReview.includes(q.id))
      .reduce((s, q) => s + (q.weight ?? 1), 0);

    const score =
      autoGradableWeight > 0 ? Math.round((earnedWeight / autoGradableWeight) * 100) : 0;

    const passed = needsManualReview.length === 0 ? score >= assessment.passingScore : null;

    const timeSpent = Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 60000);

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
        .catch(e => {
          this.logger.warn({
            userId,
            assessmentId: assessment.id,
            action: 'AWARD_ASSESSMENT_PASSED_XP',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao atribuir XP por aprovação em avaliação',
          });
        });

      await this.prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'ASSESSMENT_PASSED',
            message: `Aprovado na avaliação "${assessment.title}" com ${score}%`,
            metadata: JSON.stringify({ assessmentId: assessment.id, score }),
          },
        })
        .catch(e => {
          this.logger.warn({
            userId,
            assessmentId: assessment.id,
            action: 'NOTIFY_ASSESSMENT_PASSED',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao notificar utilizador sobre aprovação em avaliação',
          });
        });
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
        .catch(e => {
          this.logger.warn({
            userId,
            assessmentId: assessment.id,
            action: 'NOTIFY_ASSESSMENT_FAILED',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao notificar utilizador sobre reprovação em avaliação',
          });
        });
    }

    return {
      attempt: updated,
      score,
      passed,
      totalQuestions: questions.length,
      correctAnswers: results.filter(r => r.isCorrect === true).length,
      needsManualReview: needsManualReview.length > 0,
      results: assessment.feedbackMode !== 'RESULT_ONLY' ? results : undefined,
      qualitativeLabel: this.qualitativeLabel(score),
      displayGrade: this.toDisplayGrade(score, assessment.maxGrade),
    };
  }

  async getAttemptDetail(attemptId: number, userId: number) {
    const attempt = await this.prisma.read.assessmentAttempt.findFirst({
      where: { id: attemptId, userId },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            allowReview: true,
            feedbackMode: true,
            maxGrade: true,
          },
        },
        answers: {
          include: { question: true },
          orderBy: { question: { seq: 'asc' } },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');

    if (!attempt.assessment.allowReview && attempt.status !== 'IN_PROGRESS') {
      throw new ForbiddenException('Revisão não permitida para esta avaliação');
    }

    return {
      ...attempt,
      qualitativeLabel: this.qualitativeLabel(attempt.score),
      displayGrade: this.toDisplayGrade(attempt.score, attempt.assessment.maxGrade),
    };
  }

  // Variante privilegiada de getAttemptDetail para os criadores de
  // avaliações formais: vê a tentativa de QUALQUER utilizador (sem filtro
  // userId) e ignora o gate `allowReview` (esse protege a experiência do
  // próprio participante, não o criador que está a rever/corrigir).
  async getAttemptDetailForReviewer(attemptId: number) {
    const attempt = await this.prisma.read.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            allowReview: true,
            feedbackMode: true,
            maxGrade: true,
          },
        },
        user: { select: { id: true, fullName: true } },
        answers: {
          include: { question: true },
          orderBy: { question: { seq: 'asc' } },
        },
      },
    });
    if (!attempt) throw new NotFoundException('Tentativa não encontrada');

    return {
      ...attempt,
      qualitativeLabel: this.qualitativeLabel(attempt.score),
      displayGrade: this.toDisplayGrade(attempt.score, attempt.assessment.maxGrade),
    };
  }

  // Resultados agregados de uma avaliação formal: todos os participantes,
  // nota gerada pela plataforma e rótulo qualitativo — para o separador de
  // resultados dos papéis criadores.
  async getResultsRoster(assessmentId: number) {
    const assessment = await this.findOne(assessmentId);
    const attempts = await this.prisma.read.assessmentAttempt.findMany({
      where: { assessmentId, status: { not: 'IN_PROGRESS' } },
      include: {
        user: { select: { id: true, fullName: true, department: { select: { name: true } } } },
      },
      orderBy: { score: 'desc' },
    });

    return {
      assessment: {
        id: assessment.id,
        title: assessment.title,
        maxGrade: assessment.maxGrade,
        passingScore: assessment.passingScore,
      },
      roster: attempts.map(a => ({
        attemptId: a.id,
        userId: a.userId,
        fullName: a.user.fullName,
        department: a.user.department?.name ?? null,
        score: a.score,
        displayGrade: this.toDisplayGrade(a.score, assessment.maxGrade),
        qualitativeLabel: this.qualitativeLabel(a.score),
        passed: a.passed,
        status: a.status,
        submittedAt: a.submittedAt,
      })),
    };
  }

  // ─── Revisão manual ───────────────────────────────────────────────────────

  async reviewAnswer(dto: ReviewAnswerDto, reviewerId: number) {
    const answer = await this.prisma.read.assessmentAttemptAnswer.findUnique({
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
    const attempt = answer.attempt;
    const pendingReview = await this.prisma.read.assessmentAttemptAnswer.count({
      where: { attemptId: attempt.id, needsReview: true },
    });

    if (pendingReview === 0) {
      // Recalcular score final
      const allAnswers = await this.prisma.read.assessmentAttemptAnswer.findMany({
        where: { attemptId: attempt.id },
      });
      const totalEarned = allAnswers.reduce((s, a) => {
        const pts =
          a.manualScore !== null
            ? (a.manualScore / 100) * (a.earnedPoints || 1)
            : a.earnedPoints || 0;
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
    return this.prisma.read.assessmentAttemptAnswer.findMany({
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
    const where: Prisma.AssessmentAttemptWhereInput = { userId };
    if (assessmentId) where.assessmentId = assessmentId;

    const attempts = await this.prisma.read.assessmentAttempt.findMany({
      where,
      include: {
        assessment: {
          select: { id: true, title: true, type: true, passingScore: true, maxGrade: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return attempts.map(a => ({
      ...a,
      qualitativeLabel: this.qualitativeLabel(a.score),
      displayGrade: this.toDisplayGrade(a.score, a.assessment.maxGrade),
    }));
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics(assessmentId: number) {
    await this.findOne(assessmentId);

    const [totalAttempts, passed, failed, avgScore, questions] = await Promise.all([
      this.prisma.read.assessmentAttempt.count({
        where: { assessmentId, status: { not: 'IN_PROGRESS' } },
      }),
      this.prisma.read.assessmentAttempt.count({ where: { assessmentId, status: 'PASSED' } }),
      this.prisma.read.assessmentAttempt.count({ where: { assessmentId, status: 'FAILED' } }),
      this.prisma.read.assessmentAttempt.aggregate({
        where: { assessmentId, status: { not: 'IN_PROGRESS' } },
        _avg: { score: true, timeSpentMinutes: true },
      }),
      this.prisma.read.assessmentQuestion.findMany({ where: { assessmentId } }),
    ]);

    // Análise por pergunta
    const questionStats = await Promise.all(
      questions.map(async q => {
        const [total, correct] = await Promise.all([
          this.prisma.read.assessmentAttemptAnswer.count({ where: { questionId: q.id } }),
          this.prisma.read.assessmentAttemptAnswer.count({
            where: { questionId: q.id, isCorrect: true },
          }),
        ]);
        const errorRate = total > 0 ? Math.round(((total - correct) / total) * 100) : 0;
        return {
          questionId: q.id,
          questionText: q.questionText,
          difficulty: q.difficulty,
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

// src/evaluation/evaluation.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCycleDto,
  UpdateCycleDto,
  CycleFilterDto,
  CreateFormDto,
  SubmitEvaluationDto,
  AssignEvaluatorDto,
  BulkAssignDto,
  CalibrateScoreDto,
  EvaluationAnalyticsFilterDto,
  CreateEvaluationDto,
  EvalType,
  CycleStatus,
  RequestStatus,
} from './evaluation.dto';

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/** Weighted average: { type → score } + weights config */
function weightedScore(
  scores: Record<string, number>,
  weights: { type: string; weight: number; selfEvalIncluded: boolean }[],
): number {
  let total = 0,
    totalWeight = 0;
  for (const w of weights) {
    if (w.type === EvalType.SELF && !w.selfEvalIncluded) continue;
    if (scores[w.type] !== undefined) {
      total += scores[w.type] * w.weight;
      totalWeight += w.weight;
    }
  }
  return totalWeight > 0 ? +(total / totalWeight).toFixed(2) : 0;
}

/** Remove statistical outliers (values > 2 SD from mean) */
function removeOutliers(values: number[]): number[] {
  if (values.length < 4) return values;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return values.filter(v => Math.abs(v - mean) <= 2 * sd);
}

/** Compute percentile rank of value in array */
function percentile(value: number, allValues: number[]): number {
  if (!allValues.length) return 50;
  const below = allValues.filter(v => v < value).length;
  return Math.round((below / allValues.length) * 100);
}

/** Safe model access for optional Prisma models */
const safeM = (prisma: any, name: string) =>
  prisma[name] ?? {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d.data,
    createMany: async () => ({ count: 0 }),
    upsert: async (d: any) => d.create,
    update: async (d: any) => d.data,
    delete: async () => null,
    count: async () => 0,
    groupBy: async () => [],
  };

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // CYCLES
  // ══════════════════════════════════════════════════════

  async createCycle(dto: CreateCycleDto, createdById: number) {
    const totalWeight = dto.weights.reduce((s, w) => s + w.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.5) {
      throw new BadRequestException(`A soma dos pesos deve ser 100% (actual: ${totalWeight}%)`);
    }

    const cycle = await safeM(this.prisma, 'evaluationCycle')
      .create({
        data: {
          name: dto.name,
          description: dto.description,
          model: dto.model,
          status: CycleStatus.DRAFT,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          formId: dto.formId,
          createdById,
          selfEvalIncludedInScore: dto.selfEvalIncludedInScore ?? false,
          weights: JSON.stringify(dto.weights),
          targetDeptIds: dto.targetDeptIds ?? [],
        },
      })
      .catch(async (e: unknown) => {
        // Fallback to performanceEvaluation approach if cycle model missing
        this.logger.warn({
          action: 'EVALUATION_CYCLE_CREATE',
          name: dto.name,
          createdById,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar ciclo de avaliação — a usar fallback de compatibilidade',
        });
        return {
          id: null,
          name: dto.name,
          status: 'DRAFT',
          message: 'Criado (modo compatibilidade)',
        };
      });

    return cycle;
  }

  async getCycles(filters: CycleFilterDto = {}) {
    const { page = 1, limit = 20, status } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const data = await safeM(this.prisma, 'evaluationCycle')
      .findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CYCLE_LIST',
          filters,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao listar ciclos de avaliação — a devolver lista vazia',
        });
        return [] as any[];
      });

    const total = await safeM(this.prisma, 'evaluationCycle')
      .count({ where })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CYCLE_COUNT',
          filters,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar ciclos de avaliação — a devolver 0',
        });
        return 0;
      });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getCycle(id: number) {
    const cycle = await safeM(this.prisma, 'evaluationCycle')
      .findUnique({
        where: { id },
        include: { form: true },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CYCLE_FETCH',
          cycleId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter ciclo de avaliação — a devolver null',
        });
        return null;
      });

    if (!cycle) throw new NotFoundException('Ciclo não encontrado');

    // Participation stats
    const requests = await (this.prisma as any).evaluationRequest
      .findMany({
        where: cycle.id ? { cycleId: cycle.id } : {},
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_REQUEST_LIST_BY_CYCLE',
          cycleId: cycle.id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao listar pedidos de avaliação do ciclo — a devolver lista vazia',
        });
        return [] as any[];
      });

    const total = requests.length;
    const completed = requests.filter((r: any) => r.status === 'COMPLETED').length;

    return {
      ...cycle,
      participation: {
        total,
        completed,
        rate: total > 0 ? +((completed / total) * 100).toFixed(1) : 0,
      },
    };
  }

  async updateCycle(id: number, dto: UpdateCycleDto) {
    const data: any = { ...dto };
    if (dto.endDate) data.endDate = new Date(dto.endDate);

    return safeM(this.prisma, 'evaluationCycle')
      .update({ where: { id }, data })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CYCLE_UPDATE',
          cycleId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao actualizar ciclo de avaliação — a devolver dados de compatibilidade',
        });
        return { id, message: 'Actualizado', ...dto };
      });
  }

  async publishCycle(id: number) {
    return safeM(this.prisma, 'evaluationCycle')
      .update({
        where: { id },
        data: { status: CycleStatus.PUBLISHED, publishedAt: new Date() },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CYCLE_PUBLISH',
          cycleId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao publicar ciclo de avaliação — a devolver estado de compatibilidade',
        });
        return { id, status: 'PUBLISHED' };
      });
  }

  async activateCycle(id: number) {
    const cycle = await this.getCycle(id);

    // Auto-assign evaluation requests based on team structure
    await this.autoAssignCycleRequests(id, cycle);

    const updated = await safeM(this.prisma, 'evaluationCycle')
      .update({
        where: { id },
        data: { status: CycleStatus.ACTIVE, activatedAt: new Date() },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CYCLE_ACTIVATE',
          cycleId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao activar ciclo de avaliação — a devolver estado de compatibilidade',
        });
        return { id, status: 'ACTIVE' };
      });

    // Notify all participants
    const requests = await (this.prisma as any).evaluationRequest
      .findMany({
        where: { ...(id ? { cycleId: id } : {}) },
        select: { evaluatorId: true },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_REQUEST_LIST_BY_CYCLE',
          cycleId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao listar avaliadores do ciclo para notificação — a devolver lista vazia',
        });
        return [] as any[];
      });

    const uniqueIds = [...new Set((requests as any[]).map((r: any) => r.evaluatorId))];
    await this.prisma.notificationLog
      .createMany({
        data: uniqueIds.map(uid => ({
          userId: uid,
          type: 'EVALUATION_CYCLE_STARTED',
          message: `Ciclo de avaliação "${cycle.name}" foi iniciado — tens avaliações pendentes`,
          metadata: JSON.stringify({}),
        })),
        skipDuplicates: true,
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CYCLE_NOTIFY',
          cycleId: id,
          userIds: uniqueIds,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificações de início de ciclo',
        });
      });

    return updated;
  }

  private async autoAssignCycleRequests(cycleId: number, cycle: any) {
    const weights = cycle.weights ? JSON.parse(cycle.weights ?? '[]') : [];
    const deptFilter: any = {};
    if (cycle.targetDeptIds?.length) deptFilter.departmentId = { in: cycle.targetDeptIds };

    const users = await this.prisma.read.user.findMany({
      where: { active: true, ...deptFilter },
      select: { id: true, managerId: true },
    });

    const assignments: any[] = [];

    for (const u of users) {
      const model = cycle.model ?? '360';

      // Self
      if (['180', '270', '360', 'CONTINUOUS'].includes(model)) {
        assignments.push({ cycleId, evaluatorId: u.id, evaluatedId: u.id, type: EvalType.SELF });
      }
      // Manager
      if (['90', '180', '270', '360'].includes(model) && u.managerId) {
        assignments.push({
          cycleId,
          evaluatorId: u.managerId,
          evaluatedId: u.id,
          type: EvalType.MANAGER,
        });
      }
    }

    if (assignments.length) {
      await this.prisma.evaluationRequest
        .createMany({
          data: assignments.map(a => ({
            ...a,
            status: 'PENDING',
            dueDate: new Date(cycle.endDate),
          })),
          skipDuplicates: true,
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_REQUEST_AUTO_ASSIGN',
            cycleId,
            assignmentsCount: assignments.length,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar pedidos de avaliação automáticos do ciclo',
          });
        });
    }
  }

  // ══════════════════════════════════════════════════════
  // FORMS
  // ══════════════════════════════════════════════════════

  async createForm(dto: CreateFormDto, createdById: number) {
    return safeM(this.prisma, 'evaluationForm')
      .create({
        data: {
          title: dto.title,
          description: dto.description,
          isTemplate: dto.isTemplate ?? false,
          createdById,
          questions: {
            create: dto.questions.map((q, i) => ({
              text: q.text,
              type: q.type,
              order: q.order ?? i + 1,
              required: q.required ?? true,
              scaleMax: q.scaleMax ?? 5,
              competencyId: q.competencyId,
              weight: q.weight ?? 100,
            })),
          },
        },
        include: { questions: { orderBy: { order: 'asc' } } },
      })
      .catch(async (e: unknown) => {
        // Fallback: return DTO as confirmation
        this.logger.warn({
          action: 'EVALUATION_FORM_CREATE',
          title: dto.title,
          createdById,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar formulário de avaliação — a usar fallback de compatibilidade',
        });
        return { ...dto, id: null, message: 'Formulário registado (modo compatibilidade)' };
      });
  }

  async getForms() {
    return safeM(this.prisma, 'evaluationForm')
      .findMany({
        include: { _count: { select: { questions: true } } },
        orderBy: { createdAt: 'desc' },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_FORM_LIST',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao listar formulários de avaliação — a devolver lista vazia',
        });
        return [] as any[];
      });
  }

  async getForm(id: number) {
    const form = await safeM(this.prisma, 'evaluationForm')
      .findUnique({
        where: { id },
        include: { questions: { orderBy: { order: 'asc' } } },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_FORM_FETCH',
          formId: id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter formulário de avaliação — a devolver null',
        });
        return null;
      });
    if (!form) throw new NotFoundException('Formulário não encontrado');
    return form;
  }

  // ══════════════════════════════════════════════════════
  // EVALUATOR ASSIGNMENT
  // ══════════════════════════════════════════════════════

  async assignEvaluator(dto: AssignEvaluatorDto) {
    const existing = await (this.prisma as any).evaluationRequest
      .findFirst({
        where: {
          evaluatorId: dto.evaluatorId,
          evaluatedId: dto.evaluatedId,
          type: dto.type as any,
          ...(dto.cycleId ? { cycleId: dto.cycleId } : {}),
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_REQUEST_CHECK_EXISTING',
          evaluatorId: dto.evaluatorId,
          evaluatedId: dto.evaluatedId,
          cycleId: dto.cycleId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao verificar atribuição existente de avaliador — a assumir inexistente',
        });
        return null;
      });

    if (existing) throw new ConflictException('Avaliador já atribuído para este par neste ciclo');

    const request = await (this.prisma as any).evaluationRequest.create({
      data: {
        evaluatorId: dto.evaluatorId,
        evaluatedId: dto.evaluatedId,
        type: dto.type as any,
        cycleId: dto.cycleId,
        status: RequestStatus.PENDING,
        dueDate: new Date(Date.now() + 14 * 86400000),
      },
      include: {
        evaluator: { select: { id: true, fullName: true } },
        evaluated: { select: { id: true, fullName: true, position: { select: { name: true } } } },
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.evaluatorId,
          type: 'EVALUATION_REQUEST',
          message: `Tens uma nova avaliação para preencher`,
          metadata: JSON.stringify({}),
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_REQUEST_NOTIFY',
          evaluatorId: dto.evaluatorId,
          evaluatedId: dto.evaluatedId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de nova avaliação atribuída',
        });
      });

    return request;
  }

  async bulkAssign(dto: BulkAssignDto) {
    const results = await Promise.allSettled(
      dto.assignments.map(a => this.assignEvaluator({ ...a, cycleId: dto.cycleId })),
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { total: dto.assignments.length, succeeded, failed };
  }

  // ══════════════════════════════════════════════════════
  // SUBMIT EVALUATION
  // ══════════════════════════════════════════════════════

  async submitEvaluation(evaluatorId: number, dto: SubmitEvaluationDto) {
    // EvaluationRequest não tem relação `cycle` (só o escalar cycleId) —
    // incluir a relação rebentava sempre ("Unknown field cycle").
    const request = await (this.prisma as any).evaluationRequest
      .findUnique({
        where: { id: dto.requestId },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_REQUEST_FETCH',
          requestId: dto.requestId,
          evaluatorId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter pedido de avaliação — a devolver null',
        });
        return null;
      });

    if (!request) throw new NotFoundException('Pedido de avaliação não encontrado');
    if (request.evaluatorId !== evaluatorId) {
      throw new BadRequestException('Não tens permissão para submeter esta avaliação');
    }
    if (request.status === RequestStatus.COMPLETED && !dto.isDraft) {
      throw new ConflictException('Avaliação já submetida');
    }

    const numericAnswers = dto.answers.filter(a => !a.notApplicable && a.score !== undefined);
    const avgScore = numericAnswers.length
      ? +(numericAnswers.reduce((s, a) => s + (a.score ?? 0), 0) / numericAnswers.length).toFixed(2)
      : 0;

    // Group scores by competency (questionId → competency via form)
    const competencyScores: Record<number, number[]> = {};
    if (request.cycle?.formId) {
      const questions = await safeM(this.prisma, 'evaluationQuestion')
        .findMany({
          where: { formId: request.cycle.formId, competencyId: { not: null } },
          select: { id: true, competencyId: true, weight: true },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_QUESTION_LIST',
            formId: request.cycle.formId,
            requestId: dto.requestId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao listar perguntas do formulário — a devolver lista vazia',
          });
          return [] as any[];
        });

      for (const q of questions as any[]) {
        const ans = dto.answers.find(a => a.questionId === q.id);
        if (ans && !ans.notApplicable && ans.score !== undefined) {
          if (!competencyScores[q.competencyId]) competencyScores[q.competencyId] = [];
          competencyScores[q.competencyId].push(ans.score);
        }
      }
    }

    const compAvg = Object.fromEntries(
      Object.entries(competencyScores).map(([cid, scores]) => [
        cid,
        +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
      ]),
    );

    // Create / update evaluation record
    const evalData = {
      evaluatorId,
      evaluatedId: request.evaluatedId,
      type: request.type,
      period: request.cycle?.name ?? new Date().getFullYear().toString(),
      criteria: dto.answers as any,
      overallScore: avgScore,
      competencyScores: JSON.stringify(compAvg),
      strengths: dto.strengths,
      improvements: dto.improvements,
      recommendations: dto.recommendations,
      generalComment: [dto.strengths, dto.improvements, dto.recommendations]
        .filter(Boolean)
        .join(' | '),
      isDraft: dto.isDraft ?? false,
      cycleId: request.cycleId,
    };

    // PerformanceEvaluation não tem @@unique([evaluatorId, evaluatedId, type, period]) —
    // upsert por essa chave composta rebentava sempre ("Unknown argument").
    const existingEval = await this.prisma.performanceEvaluation.findFirst({
      where: {
        evaluatorId,
        evaluatedId: request.evaluatedId,
        type: request.type,
        period: evalData.period,
      },
    });
    const evaluation = existingEval
      ? await this.prisma.performanceEvaluation.update({
          where: { id: existingEval.id },
          data: evalData as any,
          include: {
            evaluator: { select: { id: true, fullName: true } },
            evaluated: { select: { id: true, fullName: true } },
          },
        })
      : await this.prisma.performanceEvaluation.create({
          data: evalData as any,
          include: {
            evaluator: { select: { id: true, fullName: true } },
            evaluated: { select: { id: true, fullName: true } },
          },
        });

    // Mark request as completed
    if (!dto.isDraft) {
      await (this.prisma as any).evaluationRequest
        .update({
          where: { id: dto.requestId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_REQUEST_COMPLETE',
            requestId: dto.requestId,
            evaluatorId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao marcar pedido de avaliação como concluído',
          });
        });

      // XP for completing evaluation
      await this.prisma.userPoints.upsert({
        where: { userId: evaluatorId },
        create: { userId: evaluatorId, points: 20 },
        update: { points: { increment: 20 } },
      });

      // Notify evaluated when all evaluators done
      await this.checkCycleCompletion(request.evaluatedId, request.cycleId);
    }

    return evaluation;
  }

  private async checkCycleCompletion(evaluatedId: number, cycleId?: number) {
    if (!cycleId) return;
    const allRequests = await (this.prisma as any).evaluationRequest
      .findMany({
        where: { evaluatedId, cycleId },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_REQUEST_LIST_FOR_COMPLETION',
          evaluatedId,
          cycleId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao listar pedidos de avaliação para verificar conclusão do ciclo — a devolver lista vazia',
        });
        return [] as any[];
      });

    const allDone =
      (allRequests as any[]).length > 0 &&
      (allRequests as any[]).every((r: any) => r.status === 'COMPLETED');

    if (allDone) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: evaluatedId,
            type: 'EVALUATION_CYCLE_COMPLETED',
            message: `Todas as tuas avaliações do ciclo foram submetidas`,
            metadata: JSON.stringify({}),
          },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_CYCLE_COMPLETED_NOTIFY',
            evaluatedId,
            cycleId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de conclusão do ciclo',
          });
        });
    }
  }

  // ══════════════════════════════════════════════════════
  // LEGACY: Quick evaluation (backward compat)
  // ══════════════════════════════════════════════════════

  async create(evaluatorId: number, dto: CreateEvaluationDto) {
    const avgScore = dto.criteria.length
      ? +(dto.criteria.reduce((s, c) => s + c.score, 0) / dto.criteria.length).toFixed(2)
      : 0;

    return this.prisma.performanceEvaluation.create({
      data: {
        evaluatorId,
        evaluatedId: dto.evaluatedId,
        type: dto.type as any,
        period: dto.period,
        criteria: dto.criteria as any,
        generalComment: dto.generalComment,
        overallScore: avgScore,
      },
      include: {
        evaluator: { select: { id: true, fullName: true } },
        evaluated: { select: { id: true, fullName: true } },
      },
    });
  }

  // ══════════════════════════════════════════════════════
  // QUERY — PENDING / MY EVALUATIONS
  // ══════════════════════════════════════════════════════

  async getPendingEvaluations(evaluatorId: number) {
    // EvaluationRequest não tem relação `cycle` (só o escalar cycleId) — este
    // include rebentava sempre e era mascarado pelo .catch() abaixo, deixando
    // /evaluations/pending permanentemente vazio para todos os utilizadores.
    return (this.prisma as any).evaluationRequest
      .findMany({
        where: { evaluatorId, status: 'PENDING' },
        include: {
          evaluated: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              position: { select: { name: true } },
              department: { select: { name: true } },
            },
          },
        },
        orderBy: { dueDate: 'asc' },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_REQUEST_LIST_PENDING',
          evaluatorId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao listar avaliações pendentes — a devolver lista vazia',
        });
        return [] as any[];
      });
  }

  async getMyProgress(evaluatorId: number) {
    const [pending, completed] = await Promise.all([
      this.prisma.evaluationRequest
        .count({ where: { evaluatorId, status: 'PENDING' } })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_REQUEST_COUNT_PENDING',
            evaluatorId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar avaliações pendentes — a devolver 0',
          });
          return 0;
        }),
      this.prisma.evaluationRequest
        .count({ where: { evaluatorId, status: 'COMPLETED' } })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_REQUEST_COUNT_COMPLETED',
            evaluatorId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar avaliações concluídas — a devolver 0',
          });
          return 0;
        }),
    ]);
    const total = pending + completed;
    return {
      total,
      pending,
      completed,
      completionRate: total > 0 ? +((completed / total) * 100).toFixed(1) : 0,
    };
  }

  async findByUser(userId: number, period?: string) {
    const where: any = { evaluatedId: userId };
    if (period) where.period = { contains: period };

    return this.prisma.read.performanceEvaluation.findMany({
      where,
      include: { evaluator: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ══════════════════════════════════════════════════════
  // RESULTS & SCORING
  // ══════════════════════════════════════════════════════

  async getResults(evaluatedId: number, cycleId?: number) {
    const evaluated = await this.prisma.read.user.findUnique({
      where: { id: evaluatedId },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        position: { select: { name: true, level: true } },
        department: { select: { name: true } },
      },
    });
    if (!evaluated) throw new NotFoundException('Utilizador não encontrado');

    const where: any = { evaluatedId };
    if (cycleId) where.cycleId = cycleId;

    const evaluations = await this.prisma.read.performanceEvaluation.findMany({
      where,
      include: { evaluator: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!evaluations.length) return { evaluated, hasResults: false, message: 'Sem avaliações' };

    // Get cycle weights
    let weights: any[] = [];
    if (cycleId) {
      const cycle = await safeM(this.prisma, 'evaluationCycle')
        .findUnique({ where: { id: cycleId } })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_CYCLE_FETCH_WEIGHTS',
            cycleId,
            evaluatedId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter pesos do ciclo para cálculo de resultados — a devolver null',
          });
          return null;
        });
      if (cycle?.weights) weights = JSON.parse(cycle.weights);
    }

    // Group by evaluator type
    const byType: Record<string, number[]> = {};
    for (const e of evaluations) {
      const t = e.type as string;
      if (!byType[t]) byType[t] = [];
      byType[t].push(e.overallScore ?? 0);
    }

    // Avg per type (remove outliers for peer/subordinate)
    const typeAvg: Record<string, number> = {};
    for (const [type, scores] of Object.entries(byType)) {
      const cleaned = ['PEER', 'SUBORDINATE'].includes(type) ? removeOutliers(scores) : scores;
      typeAvg[type] = +(cleaned.reduce((a, b) => a + b, 0) / cleaned.length).toFixed(2);
    }

    // Weighted final score
    const selfIncluded = weights.find(w => w.type === EvalType.SELF)?.selfEvalIncluded !== false;
    const finalScore = weights.length
      ? weightedScore(
          typeAvg,
          weights.map(w => ({ ...w, selfEvalIncluded: selfIncluded })),
        )
      : +(Object.values(typeAvg).reduce((a, b) => a + b, 0) / Object.keys(typeAvg).length).toFixed(
          2,
        );

    // Competency breakdown
    const compScores: Record<string, number[]> = {};
    for (const e of evaluations) {
      if ((e as any).competencyScores) {
        const cs = JSON.parse((e as any).competencyScores ?? '{}');
        for (const [cid, score] of Object.entries(cs)) {
          if (!compScores[cid]) compScores[cid] = [];
          compScores[cid].push(score as number);
        }
      }
    }
    const compAvg = Object.fromEntries(
      Object.entries(compScores).map(([cid, scores]) => [
        cid,
        +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
      ]),
    );

    // Concordance: self vs others
    const selfScore = typeAvg[EvalType.SELF] ?? null;
    const othersAvg = Object.entries(typeAvg)
      .filter(([t]) => t !== EvalType.SELF)
      .reduce<{ sum: number; count: number }>(
        (acc, [, v]) => ({ sum: acc.sum + v, count: acc.count + 1 }),
        { sum: 0, count: 0 },
      );
    const othersScore = othersAvg.count > 0 ? +(othersAvg.sum / othersAvg.count).toFixed(2) : null;
    const concordance =
      selfScore !== null && othersScore !== null
        ? {
            selfScore,
            othersScore,
            gap: +(selfScore - othersScore).toFixed(2),
            label:
              Math.abs(selfScore - (othersScore ?? 0)) <= 0.5
                ? 'Alinhado'
                : selfScore > (othersScore ?? 0)
                  ? 'Superestima-se'
                  : 'Subestima-se',
          }
        : null;

    return {
      evaluated,
      finalScore,
      scoreLabel:
        finalScore >= 4
          ? 'Excepcional'
          : finalScore >= 3
            ? 'Acima Esperado'
            : finalScore >= 2
              ? 'Dentro do Esperado'
              : 'Abaixo do Esperado',
      byType: typeAvg,
      competencies: compAvg,
      concordance,
      totalEvaluators: evaluations.length,
      qualitative: {
        strengths: evaluations.filter(e => (e as any).strengths).map(e => (e as any).strengths),
        improvements: evaluations
          .filter(e => (e as any).improvements)
          .map(e => (e as any).improvements),
        recommendations: evaluations
          .filter(e => (e as any).recommendations)
          .map(e => (e as any).recommendations),
      },
    };
  }

  async getSummary(userId: number, period: string) {
    const evals = await this.prisma.read.performanceEvaluation.findMany({
      where: { evaluatedId: userId, period: { contains: period } },
    });
    if (!evals.length) return { userId, period, total: 0, avgScore: 0, byType: {} };

    const avgScore = +(evals.reduce((s, e) => s + (e.overallScore ?? 0), 0) / evals.length).toFixed(
      2,
    );
    const byType: Record<string, number> = {};
    for (const e of evals) byType[e.type] = e.overallScore ?? 0;

    return { userId, period, total: evals.length, avgScore, byType };
  }

  // ══════════════════════════════════════════════════════
  // CALIBRATION
  // ══════════════════════════════════════════════════════

  async getCycleForCalibration(cycleId: number) {
    const evals = await this.prisma.read.performanceEvaluation.findMany({
      where: { ...(cycleId ? ({ cycleId } as any) : {}) },
      include: {
        evaluated: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
        evaluator: { select: { id: true, fullName: true } },
      },
    });

    // Group by evaluated
    const byEval: Record<number, any> = {};
    for (const e of evals) {
      const id = e.evaluatedId;
      if (!byEval[id]) byEval[id] = { evaluated: (e as any).evaluated, scores: [], types: {} };
      byEval[id].scores.push(e.overallScore ?? 0);
      byEval[id].types[e.type] = e.overallScore;
    }

    const allScores = Object.values(byEval).map(
      b => +(b.scores.reduce((a: number, v: number) => a + v, 0) / b.scores.length).toFixed(2),
    );

    const result = Object.values(byEval)
      .map((b: any) => {
        const avg = +(
          b.scores.reduce((a: number, v: number) => a + v, 0) / b.scores.length
        ).toFixed(2);
        return {
          evaluated: b.evaluated,
          avgScore: avg,
          byType: b.types,
          percentile: percentile(avg, allScores),
          dispersion:
            b.scores.length > 1 ? +(Math.max(...b.scores) - Math.min(...b.scores)).toFixed(2) : 0,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore);

    // Detect biased evaluators
    const evaluatorStats: Record<number, number[]> = {};
    for (const e of evals) {
      if (!evaluatorStats[e.evaluatorId]) evaluatorStats[e.evaluatorId] = [];
      evaluatorStats[e.evaluatorId].push(e.overallScore ?? 0);
    }
    const globalAvg = allScores.length
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 0;
    const biasedEvaluators = Object.entries(evaluatorStats)
      .map(([evId, scores]) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return {
          evaluatorId: +evId,
          avg: +avg.toFixed(2),
          deviation: +(avg - globalAvg).toFixed(2),
        };
      })
      .filter(e => Math.abs(e.deviation) > 0.8);

    return { participants: result, globalAvg: +globalAvg.toFixed(2), biasedEvaluators };
  }

  async calibrateScore(cycleId: number, dto: CalibrateScoreDto, calibratedById: number) {
    const where: any = { evaluatedId: dto.evaluatedId };
    if (cycleId) where.cycleId = cycleId;

    await this.prisma.performanceEvaluation
      .updateMany({
        where,
        data: { overallScore: dto.calibratedScore } as any,
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CALIBRATE_SCORE',
          cycleId,
          evaluatedId: dto.evaluatedId,
          calibratedById,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao actualizar scores calibrados das avaliações',
        });
      });

    // Log calibration in audit
    await this.prisma.auditLog
      .create({
        data: {
          userId: calibratedById,
          action: 'CALIBRATION',
          entity: 'PerformanceEvaluation',
          entityId: dto.evaluatedId,
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CALIBRATE_AUDIT_LOG',
          cycleId,
          evaluatedId: dto.evaluatedId,
          calibratedById,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar auditoria de calibração de score',
        });
      });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.evaluatedId,
          type: 'EVALUATION_CALIBRATED',
          message: `A tua avaliação foi calibrada`,
          metadata: JSON.stringify({}),
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CALIBRATE_NOTIFY',
          evaluatedId: dto.evaluatedId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de calibração de score',
        });
      });

    return {
      message: 'Score calibrado',
      evaluatedId: dto.evaluatedId,
      newScore: dto.calibratedScore,
    };
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════

  async getAnalyticsDashboard(filters: EvaluationAnalyticsFilterDto = {}) {
    const { cycleId, departmentId } = filters;
    const where: any = {};
    if (cycleId) where.cycleId = cycleId;
    if (departmentId) where.evaluated = { departmentId };

    const [evals, totalRequests, completedRequests] = await Promise.all([
      this.prisma.read.performanceEvaluation.findMany({
        where,
        include: {
          evaluated: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
      (this.prisma as any).evaluationRequest
        .count({ where: cycleId ? { cycleId } : {} })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_ANALYTICS_COUNT_TOTAL_REQUESTS',
            cycleId,
            departmentId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar pedidos de avaliação totais para dashboard — a devolver 0',
          });
          return 0;
        }),
      (this.prisma as any).evaluationRequest
        .count({
          where: { ...(cycleId ? { cycleId } : {}), status: 'COMPLETED' },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_ANALYTICS_COUNT_COMPLETED_REQUESTS',
            cycleId,
            departmentId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar pedidos de avaliação concluídos para dashboard — a devolver 0',
          });
          return 0;
        }),
    ]);

    if (!evals.length)
      return { hasData: false, message: 'Sem dados para o período/ciclo seleccionado' };

    const scores = evals.map(e => e.overallScore ?? 0);
    const avgScore = +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);

    // Distribution buckets
    const dist = { exceptional: 0, above: 0, expected: 0, below: 0 };
    for (const s of scores) {
      if (s >= 4) dist.exceptional++;
      else if (s >= 3) dist.above++;
      else if (s >= 2) dist.expected++;
      else dist.below++;
    }

    // By department
    const deptMap: Record<string, number[]> = {};
    for (const e of evals) {
      const dept = (e as any).evaluated?.department?.name ?? 'N/A';
      if (!deptMap[dept]) deptMap[dept] = [];
      deptMap[dept].push(e.overallScore ?? 0);
    }
    const byDept = Object.entries(deptMap)
      .map(([dept, sc]) => ({
        department: dept,
        avgScore: +(sc.reduce((a, b) => a + b, 0) / sc.length).toFixed(2),
        count: sc.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    // Top performers
    const userAvg: Record<number, { user: any; scores: number[] }> = {};
    for (const e of evals) {
      const id = e.evaluatedId;
      if (!userAvg[id]) userAvg[id] = { user: (e as any).evaluated, scores: [] };
      userAvg[id].scores.push(e.overallScore ?? 0);
    }

    const ranked = Object.values(userAvg)
      .map(u => ({
        user: u.user,
        avgScore: +(u.scores.reduce((a, b) => a + b, 0) / u.scores.length).toFixed(2),
        evals: u.scores.length,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const allScores = ranked.map(r => r.avgScore);

    return {
      hasData: true,
      kpis: {
        totalEvaluations: evals.length,
        avgScore,
        participationRate:
          totalRequests > 0 ? +((completedRequests / totalRequests) * 100).toFixed(1) : 0,
        totalParticipants: ranked.length,
      },
      distribution: dist,
      byDepartment: byDept,
      topPerformers: ranked
        .slice(0, 10)
        .map(r => ({ ...r, percentile: percentile(r.avgScore, allScores) })),
      bottomPerformers: ranked
        .slice(-5)
        .reverse()
        .map(r => ({ ...r, percentile: percentile(r.avgScore, allScores) })),
    };
  }

  async getTeamDashboard(managerId: number, cycleId?: number) {
    const team = await this.prisma.read.user.findMany({
      where: { managerId, active: true },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (!team.length) return { team: [], message: 'Sem equipa directa' };

    const teamIds = team.map(u => u.id);
    const where: any = { evaluatedId: { in: teamIds } };
    if (cycleId) where.cycleId = cycleId;

    const evals = await this.prisma.read.performanceEvaluation.findMany({ where });

    const pending = await this.prisma.evaluationRequest
      .findMany({
        where: { evaluatorId: managerId, status: 'PENDING' },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_REQUEST_LIST_TEAM_PENDING',
          managerId,
          cycleId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao listar avaliações pendentes da equipa — a devolver lista vazia',
        });
        return [] as any[];
      });

    const enriched = team.map(u => {
      const uEvals = evals.filter(e => e.evaluatedId === u.id);
      const avg = uEvals.length
        ? +(uEvals.reduce((s, e) => s + (e.overallScore ?? 0), 0) / uEvals.length).toFixed(2)
        : null;
      const hasPending = (pending as any[]).some((r: any) => r.evaluatedId === u.id);
      return {
        user: u,
        avgScore: avg,
        evals: uEvals.length,
        hasPendingEval: hasPending,
        trend: null, // TODO: compare with previous cycle
      };
    });

    const withScores = enriched.filter(u => u.avgScore !== null).map(u => u.avgScore);
    const teamAvg = withScores.length
      ? +(withScores.reduce((a, b) => a + b, 0) / withScores.length).toFixed(2)
      : null;

    return {
      teamAvg,
      pendingCount: (pending as any[]).length,
      team: enriched.map(u => ({
        ...u,
        percentile: u.avgScore !== null ? percentile(u.avgScore, withScores) : null,
      })),
    };
  }

  async getUserEvolution(userId: number) {
    const evals = await this.prisma.read.performanceEvaluation.findMany({
      where: { evaluatedId: userId },
      orderBy: { createdAt: 'asc' },
      select: { overallScore: true, type: true, period: true, createdAt: true },
    });

    const byPeriod: Record<string, number[]> = {};
    for (const e of evals) {
      if (!byPeriod[e.period]) byPeriod[e.period] = [];
      byPeriod[e.period].push(e.overallScore ?? 0);
    }

    const evolution = Object.entries(byPeriod).map(([period, scores]) => ({
      period,
      avgScore: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
      evals: scores.length,
    }));

    const last = evolution[evolution.length - 1]?.avgScore ?? 0;
    const prev = evolution[evolution.length - 2]?.avgScore ?? null;
    const trend = prev !== null ? +(last - prev).toFixed(2) : null;

    return { userId, evolution, latestScore: last, trend };
  }

  // ══════════════════════════════════════════════════════
  // AUTO PDI TRIGGER
  // ══════════════════════════════════════════════════════

  async triggerPDIFromResults(evaluatedId: number, cycleId?: number) {
    const results = await this.getResults(evaluatedId, cycleId);
    if (!(results as any).competencies)
      return { message: 'Sem dados de competências para gerar PDI' };

    // Identify top 3 gap competencies (lowest scores)
    const gaps = Object.entries((results as any).competencies as Record<string, number>)
      .map(([cid, score]) => ({ competencyId: +cid, score }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);

    // Create notification for manager to create PDI
    const user = await this.prisma.user
      .findUnique({
        where: { id: evaluatedId },
        select: { id: true, fullName: true, managerId: true },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_PDI_TRIGGER_USER_FETCH',
          evaluatedId,
          cycleId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao obter utilizador para sugestão de PDI — a devolver null',
        });
        return null;
      });

    if (user?.managerId) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: user.managerId,
            type: 'PDI_SUGGESTED',
            message: `Sugestão de PDI gerado para ${user.fullName} com base em resultados de avaliação`,
            metadata: JSON.stringify({}),
          },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_PDI_TRIGGER_NOTIFY',
            evaluatedId,
            managerId: user.managerId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao criar notificação de sugestão de PDI para o gestor',
          });
        });
    }

    return {
      evaluatedId,
      suggestedGaps: gaps,
      recommendation: `Foco de desenvolvimento: ${gaps.length} competências identificadas com gaps`,
      pdiAutoGenerated: false,
      managerNotified: !!user?.managerId,
    };
  }
}

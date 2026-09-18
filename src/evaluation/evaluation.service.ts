// src/evaluation/evaluation.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma, EvalCampaignModel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
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
  CreateScaleDto,
  UpdateScaleDto,
  CreateCriteriaDto,
  UpdateCriteriaDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  EvaluatorWeightDto,
  EvalType,
  EvalModel,
  CycleStatus,
  RequestStatus,
} from './evaluation.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

// EvalModel usa códigos curtos ('90'/'360', contrato da API) — EvalCampaignModel
// é o enum real do Prisma ('DEG_90'/'DEG_360'). Mapeados nos dois sentidos aqui.
const MODEL_TO_PRISMA: Record<EvalModel, EvalCampaignModel> = {
  [EvalModel.DEG_90]: EvalCampaignModel.DEG_90,
  [EvalModel.DEG_180]: EvalCampaignModel.DEG_180,
  [EvalModel.DEG_270]: EvalCampaignModel.DEG_270,
  [EvalModel.DEG_360]: EvalCampaignModel.DEG_360,
  [EvalModel.CONTINUOUS]: EvalCampaignModel.CONTINUOUS,
  [EvalModel.PROJECT]: EvalCampaignModel.PROJECT,
};
const PRISMA_TO_MODEL: Record<EvalCampaignModel, EvalModel> = {
  [EvalCampaignModel.DEG_90]: EvalModel.DEG_90,
  [EvalCampaignModel.DEG_180]: EvalModel.DEG_180,
  [EvalCampaignModel.DEG_270]: EvalModel.DEG_270,
  [EvalCampaignModel.DEG_360]: EvalModel.DEG_360,
  [EvalCampaignModel.CONTINUOUS]: EvalModel.CONTINUOUS,
  [EvalCampaignModel.PROJECT]: EvalModel.PROJECT,
};

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

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // CYCLES (EvaluationCampaign)
  // ══════════════════════════════════════════════════════

  private toPublicCampaign<T extends { model: EvalCampaignModel }>(
    campaign: T,
  ): Omit<T, 'model'> & { model: EvalModel } {
    return { ...campaign, model: PRISMA_TO_MODEL[campaign.model] };
  }

  async createCycle(dto: CreateCycleDto, createdById: number) {
    const totalWeight = dto.weights.reduce((s, w) => s + w.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.5) {
      throw new BadRequestException(`A soma dos pesos deve ser 100% (actual: ${totalWeight}%)`);
    }

    const campaign = await this.prisma.evaluationCampaign.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        model: MODEL_TO_PRISMA[dto.model],
        status: CycleStatus.DRAFT,
        templateId: dto.templateId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        formId: dto.formId,
        createdById,
        targetDeptIds: dto.targetDeptIds ?? [],
        mandatory: dto.mandatory ?? false,
        confidential: dto.confidential ?? false,
        selfEvalIncludedInScore: dto.selfEvalIncludedInScore ?? false,
        weights: JSON.stringify(dto.weights),
        minScore: dto.minScore,
        maxScore: dto.maxScore,
        requireComments: dto.requireComments ?? false,
        requireEvidence: dto.requireEvidence ?? false,
        allowEdit: dto.allowEdit ?? false,
        allowContest: dto.allowContest ?? false,
        allowCalibration: dto.allowCalibration ?? true,
        resultsVisibility: dto.resultsVisibility,
        linkPdi: dto.linkPdi ?? false,
        linkCompetencies: dto.linkCompetencies ?? false,
        linkCareer: dto.linkCareer ?? false,
        linkSuccession: dto.linkSuccession ?? false,
        link9Box: dto.link9Box ?? false,
        notes: dto.notes,
      },
    });

    return this.toPublicCampaign(campaign);
  }

  async getCycles(filters: CycleFilterDto = {}) {
    const { page = 1, limit = 20, status } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.EvaluationCampaignWhereInput = { deletedAt: null };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.evaluationCampaign.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.evaluationCampaign.count({ where }),
    ]);

    return buildPaginatedResponse(
      data.map(c => this.toPublicCampaign(c)),
      total,
      page,
      limit,
    );
  }

  async getCycle(id: number) {
    const campaign = await this.prisma.evaluationCampaign.findFirst({
      where: { id, deletedAt: null },
      include: { form: true },
    });

    if (!campaign) throw new NotFoundException('Ciclo não encontrado');

    const requests = await this.prisma.evaluationRequest.findMany({ where: { cycleId: id } });
    const total = requests.length;
    const completed = requests.filter(r => r.status === 'COMPLETED').length;

    return {
      ...this.toPublicCampaign(campaign),
      participation: {
        total,
        completed,
        rate: total > 0 ? +((completed / total) * 100).toFixed(1) : 0,
      },
    };
  }

  async updateCycle(id: number, dto: UpdateCycleDto) {
    await this.assertCampaignExists(id);
    const { endDate, ...rest } = dto;
    const campaign = await this.prisma.evaluationCampaign.update({
      where: { id },
      data: { ...rest, ...(endDate ? { endDate: new Date(endDate) } : {}) },
    });
    return this.toPublicCampaign(campaign);
  }

  async publishCycle(id: number) {
    await this.assertCampaignExists(id);
    const campaign = await this.prisma.evaluationCampaign.update({
      where: { id },
      data: { status: CycleStatus.PUBLISHED },
    });
    return this.toPublicCampaign(campaign);
  }

  async activateCycle(id: number) {
    const campaign = await this.assertCampaignExists(id);

    // Auto-assign evaluation requests based on team structure
    await this.autoAssignCycleRequests(id, campaign);

    const updated = await this.prisma.evaluationCampaign.update({
      where: { id },
      data: { status: CycleStatus.ACTIVE },
    });

    // Notify all participants
    const requests = await this.prisma.evaluationRequest.findMany({
      where: { cycleId: id },
      select: { evaluatorId: true },
    });

    const uniqueIds = [...new Set(requests.map(r => r.evaluatorId))];
    await this.prisma.notificationLog
      .createMany({
        data: uniqueIds.map(uid => ({
          userId: uid,
          type: 'EVALUATION_CYCLE_STARTED',
          message: `Ciclo de avaliação "${campaign.name}" foi iniciado — tens avaliações pendentes`,
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

    return this.toPublicCampaign(updated);
  }

  private async assertCampaignExists(id: number) {
    const campaign = await this.prisma.evaluationCampaign.findFirst({
      where: { id, deletedAt: null },
    });
    if (!campaign) throw new NotFoundException('Ciclo não encontrado');
    return campaign;
  }

  private async autoAssignCycleRequests(
    cycleId: number,
    campaign: Prisma.EvaluationCampaignGetPayload<object>,
  ) {
    // FIX (parcial): `campaign.weights` é lido mas a atribuição automática só
    // cria pedidos SELF e MANAGER abaixo — nunca houve lógica para escolher
    // avaliadores PEER/SUBORDINATE/CLIENT (nenhum outro sítio no módulo
    // `evaluation` cria pedidos desse tipo automaticamente). `weights` parece
    // ter sido pensado para configurar quantos pares atribuir, mas essa
    // selecção (por equipa? por departamento? aleatória?) nunca foi
    // desenhada — não inventado aqui. Documentado, não implementado. Ver
    // issue #249.
    const deptFilter: Prisma.UserWhereInput = {};
    if (campaign.targetDeptIds?.length) deptFilter.departmentId = { in: campaign.targetDeptIds };

    const users = await this.prisma.read.user.findMany({
      where: { active: true, ...deptFilter },
      select: { id: true, managerId: true },
    });

    const assignments: Prisma.EvaluationRequestCreateManyInput[] = [];
    const selfModels: EvalCampaignModel[] = [
      EvalCampaignModel.DEG_180,
      EvalCampaignModel.DEG_270,
      EvalCampaignModel.DEG_360,
      EvalCampaignModel.CONTINUOUS,
    ];
    const managerModels: EvalCampaignModel[] = [
      EvalCampaignModel.DEG_90,
      EvalCampaignModel.DEG_180,
      EvalCampaignModel.DEG_270,
      EvalCampaignModel.DEG_360,
    ];

    for (const u of users) {
      if (selfModels.includes(campaign.model)) {
        assignments.push({ cycleId, evaluatorId: u.id, evaluatedId: u.id, type: EvalType.SELF });
      }
      if (managerModels.includes(campaign.model) && u.managerId) {
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
            dueDate: campaign.endDate,
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
    return this.prisma.evaluationCampaignForm.create({
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
    });
  }

  async getForms() {
    return this.prisma.evaluationCampaignForm.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { questions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForm(id: number) {
    const form = await this.prisma.evaluationCampaignForm.findFirst({
      where: { id, deletedAt: null },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!form) throw new NotFoundException('Formulário não encontrado');
    return form;
  }

  // ══════════════════════════════════════════════════════
  // SCALES (aba "Escalas" / dashboard "escalas de avaliação")
  // ══════════════════════════════════════════════════════

  async createScale(dto: CreateScaleDto) {
    return this.prisma.evaluationScale.create({
      data: {
        name: dto.name,
        description: dto.description,
        minValue: dto.minValue ?? 1,
        maxValue: dto.maxValue ?? 5,
        isDefault: dto.isDefault ?? false,
        levels: dto.levels
          ? {
              create: dto.levels.map(l => ({
                value: l.value,
                label: l.label,
                description: l.description,
              })),
            }
          : undefined,
      },
      include: { levels: { orderBy: { value: 'asc' } } },
    });
  }

  async getScales() {
    return this.prisma.evaluationScale.findMany({
      include: { levels: { orderBy: { value: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getScale(id: number) {
    const scale = await this.prisma.evaluationScale.findUnique({
      where: { id },
      include: { levels: { orderBy: { value: 'asc' } } },
    });
    if (!scale) throw new NotFoundException('Escala não encontrada');
    return scale;
  }

  async updateScale(id: number, dto: UpdateScaleDto) {
    await this.getScale(id);
    return this.prisma.evaluationScale.update({ where: { id }, data: dto });
  }

  async deleteScale(id: number) {
    await this.getScale(id);
    await this.prisma.evaluationScale.delete({ where: { id } });
    return { message: 'Escala removida' };
  }

  // ══════════════════════════════════════════════════════
  // CRITERIA (aba "Critérios")
  // ══════════════════════════════════════════════════════

  async createCriteria(dto: CreateCriteriaDto, createdById: number) {
    return this.prisma.evaluationCriteria.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        weight: dto.weight ?? 1,
        scaleId: dto.scaleId,
        competencyId: dto.competencyId,
        createdById,
      },
    });
  }

  async getCriteria(filters: { category?: string } = {}) {
    return this.prisma.evaluationCriteria.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(filters.category ? { category: filters.category } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertCriteriaExists(id: number) {
    const criteria = await this.prisma.evaluationCriteria.findFirst({
      where: { id, deletedAt: null },
    });
    if (!criteria) throw new NotFoundException('Critério não encontrado');
    return criteria;
  }

  async updateCriteria(id: number, dto: UpdateCriteriaDto) {
    await this.assertCriteriaExists(id);
    return this.prisma.evaluationCriteria.update({ where: { id }, data: dto });
  }

  async deleteCriteria(id: number) {
    await this.assertCriteriaExists(id);
    await this.prisma.evaluationCriteria.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Critério removido' };
  }

  // ══════════════════════════════════════════════════════
  // TEMPLATES (aba "Modelos")
  // ══════════════════════════════════════════════════════

  async createTemplate(dto: CreateTemplateDto, createdById: number) {
    return this.prisma.evaluationTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type ?? 'GENERIC',
        scaleId: dto.scaleId,
        isDefault: dto.isDefault ?? false,
        createdById,
        criteria: dto.criteria
          ? {
              create: dto.criteria.map((c, i) => ({
                criteriaId: c.criteriaId,
                weight: c.weight,
                seq: c.seq ?? i,
              })),
            }
          : undefined,
      },
      include: { criteria: { include: { criteria: true }, orderBy: { seq: 'asc' } } },
    });
  }

  async getTemplates() {
    return this.prisma.evaluationTemplate.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { criteria: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertTemplateExists(id: number) {
    const template = await this.prisma.evaluationTemplate.findFirst({
      where: { id, deletedAt: null },
      include: { criteria: { include: { criteria: true }, orderBy: { seq: 'asc' } } },
    });
    if (!template) throw new NotFoundException('Modelo não encontrado');
    return template;
  }

  async getTemplate(id: number) {
    return this.assertTemplateExists(id);
  }

  async updateTemplate(id: number, dto: UpdateTemplateDto) {
    await this.assertTemplateExists(id);
    return this.prisma.evaluationTemplate.update({ where: { id }, data: dto });
  }

  async deleteTemplate(id: number) {
    await this.assertTemplateExists(id);
    await this.prisma.evaluationTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Modelo removido' };
  }

  // ══════════════════════════════════════════════════════
  // EVALUATOR ASSIGNMENT
  // ══════════════════════════════════════════════════════

  async assignEvaluator(dto: AssignEvaluatorDto, user: CurrentUserData) {
    // Ownership: quem atribui tem de ser ADMIN/RH, o próprio avaliado, ou ter
    // o avaliado como reporte directo (managerId === user.id) — caso
    // contrário um LIDER/GESTOR conseguiria atribuir avaliadores a
    // colaboradores de outras equipas.
    if (!isPrivileged(user, [Role.ADMIN, Role.RH]) && user.id !== dto.evaluatedId) {
      const isTeamMember = await this.prisma.read.user.count({
        where: { id: dto.evaluatedId, managerId: user.id },
      });
      if (!isTeamMember) throw new NotFoundException('Colaborador não encontrado');
    }

    const existing = await this.prisma.evaluationRequest
      .findFirst({
        where: {
          evaluatorId: dto.evaluatorId,
          evaluatedId: dto.evaluatedId,
          type: dto.type,
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

    const request = await this.prisma.evaluationRequest.create({
      data: {
        evaluatorId: dto.evaluatorId,
        evaluatedId: dto.evaluatedId,
        type: dto.type,
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

  async bulkAssign(dto: BulkAssignDto, user: CurrentUserData) {
    const results = await Promise.allSettled(
      dto.assignments.map(a => this.assignEvaluator({ ...a, cycleId: dto.cycleId }, user)),
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { total: dto.assignments.length, succeeded, failed };
  }

  // ══════════════════════════════════════════════════════
  // SUBMIT EVALUATION
  // ══════════════════════════════════════════════════════

  async submitEvaluation(evaluatorId: number, dto: SubmitEvaluationDto) {
    const request = await this.prisma.evaluationRequest
      .findUnique({
        where: { id: dto.requestId },
        include: { cycle: true },
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

    // Group scores by competency (questionId → competency via cycle's form)
    const competencyScores: Record<number, number[]> = {};
    const cycleFormId = request.cycle?.formId ?? undefined;
    if (cycleFormId) {
      const questions = await this.prisma.evaluationCampaignQuestion
        .findMany({
          where: { formId: cycleFormId, competencyId: { not: null } },
          select: { id: true, competencyId: true, weight: true },
        })
        .catch((e: unknown) => {
          this.logger.warn({
            action: 'EVALUATION_QUESTION_LIST',
            formId: cycleFormId,
            requestId: dto.requestId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao listar perguntas do formulário — a devolver lista vazia',
          });
          return [] as { id: number; competencyId: number | null; weight: number | null }[];
        });

      for (const q of questions) {
        const ans = dto.answers.find(a => a.questionId === q.id);
        if (ans && !ans.notApplicable && ans.score !== undefined && q.competencyId !== null) {
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
      period:
        request.cycle?.startDate?.getFullYear().toString() ?? new Date().getFullYear().toString(),
      criteria: dto.answers as unknown as Prisma.InputJsonValue,
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
          data: evalData,
          include: {
            evaluator: { select: { id: true, fullName: true } },
            evaluated: { select: { id: true, fullName: true } },
          },
        })
      : await this.prisma.performanceEvaluation.create({
          data: evalData,
          include: {
            evaluator: { select: { id: true, fullName: true } },
            evaluated: { select: { id: true, fullName: true } },
          },
        });

    // Mark request as completed
    if (!dto.isDraft) {
      await this.prisma.evaluationRequest
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
    const allRequests: Prisma.EvaluationRequestGetPayload<object>[] =
      await this.prisma.evaluationRequest
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
          return [] as Prisma.EvaluationRequestGetPayload<object>[];
        });

    const allDone = allRequests.length > 0 && allRequests.every(r => r.status === 'COMPLETED');

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
        type: dto.type,
        period: dto.period,
        criteria: dto.criteria as unknown as Prisma.InputJsonValue,
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
    type PendingRequest = Prisma.EvaluationRequestGetPayload<{
      include: {
        evaluated: {
          select: {
            id: true;
            fullName: true;
            avatarUrl: true;
            position: { select: { name: true } };
            department: { select: { name: true } };
          };
        };
      };
    }>;
    const pending: PendingRequest[] = await this.prisma.evaluationRequest
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
        return [] as PendingRequest[];
      });
    return pending;
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
    const where: Prisma.PerformanceEvaluationWhereInput = { evaluatedId: userId };
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

  async getResults(evaluatedId: number, cycleId?: number, period?: string) {
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

    const where: Prisma.PerformanceEvaluationWhereInput = { evaluatedId };
    if (cycleId) where.cycleId = cycleId;
    // "2026" (ano, para "ver total" desse ano) ou "2026-03" (mês específico) —
    // mesma convenção `contains` de findByUser()/getSummary() acima.
    if (period) where.period = { contains: period };

    const evaluations = await this.prisma.read.performanceEvaluation.findMany({
      where,
      include: { evaluator: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!evaluations.length) return { evaluated, hasResults: false, message: 'Sem avaliações' };

    // Get cycle weights
    // selfEvalIncluded nunca é persistido por peso (só existe
    // dto.selfEvalIncludedInScore ao nível do ciclo) — o campo abaixo é
    // sempre undefined após o JSON.parse, comportamento pré-existente.
    let weights: (EvaluatorWeightDto & { selfEvalIncluded?: boolean })[] = [];
    if (cycleId) {
      const campaign = await this.prisma.evaluationCampaign
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
      if (campaign?.weights) weights = JSON.parse(campaign.weights);
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
      if (e.competencyScores) {
        const cs: Record<string, number> = JSON.parse(e.competencyScores ?? '{}');
        for (const [cid, score] of Object.entries(cs)) {
          if (!compScores[cid]) compScores[cid] = [];
          compScores[cid].push(score);
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
        strengths: evaluations.filter(e => e.strengths).map(e => e.strengths),
        improvements: evaluations.filter(e => e.improvements).map(e => e.improvements),
        recommendations: evaluations.filter(e => e.recommendations).map(e => e.recommendations),
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
    type CalibrationEval = Prisma.PerformanceEvaluationGetPayload<{
      include: {
        evaluated: {
          select: {
            id: true;
            fullName: true;
            avatarUrl: true;
            department: { select: { name: true } };
            position: { select: { name: true } };
          };
        };
        evaluator: { select: { id: true; fullName: true } };
      };
    }>;

    const evals: CalibrationEval[] = await this.prisma.read.performanceEvaluation.findMany({
      where: { ...(cycleId ? { cycleId } : {}) },
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
    const byEval: Record<
      number,
      { evaluated: CalibrationEval['evaluated']; scores: number[]; types: Record<string, number> }
    > = {};
    for (const e of evals) {
      const id = e.evaluatedId;
      if (!byEval[id]) byEval[id] = { evaluated: e.evaluated, scores: [], types: {} };
      byEval[id].scores.push(e.overallScore ?? 0);
      byEval[id].types[e.type] = e.overallScore;
    }

    const allScores = Object.values(byEval).map(
      b => +(b.scores.reduce((a: number, v: number) => a + v, 0) / b.scores.length).toFixed(2),
    );

    const result = Object.values(byEval)
      .map(b => {
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
    const where: Prisma.PerformanceEvaluationWhereInput = { evaluatedId: dto.evaluatedId };
    if (cycleId) where.cycleId = cycleId;

    await this.prisma.performanceEvaluation
      .updateMany({
        where,
        data: { overallScore: dto.calibratedScore },
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
    type DashboardEval = Prisma.PerformanceEvaluationGetPayload<{
      include: {
        evaluated: {
          select: {
            id: true;
            fullName: true;
            avatarUrl: true;
            department: { select: { name: true } };
          };
        };
      };
    }>;

    const { cycleId, departmentId } = filters;
    const where: Prisma.PerformanceEvaluationWhereInput = {};
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
      this.prisma.evaluationRequest
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
      this.prisma.evaluationRequest
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
      const dept = e.evaluated?.department?.name ?? 'N/A';
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
    const userAvg: Record<number, { user: DashboardEval['evaluated']; scores: number[] }> = {};
    for (const e of evals) {
      const id = e.evaluatedId;
      if (!userAvg[id]) userAvg[id] = { user: e.evaluated, scores: [] };
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
    const where: Prisma.PerformanceEvaluationWhereInput = { evaluatedId: { in: teamIds } };
    if (cycleId) where.cycleId = cycleId;

    const evals = await this.prisma.read.performanceEvaluation.findMany({ where });

    const pending: Prisma.EvaluationRequestGetPayload<object>[] =
      await this.prisma.evaluationRequest
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
          return [] as Prisma.EvaluationRequestGetPayload<object>[];
        });

    const enriched = team.map(u => {
      const uEvals = evals.filter(e => e.evaluatedId === u.id);
      const avg = uEvals.length
        ? +(uEvals.reduce((s, e) => s + (e.overallScore ?? 0), 0) / uEvals.length).toFixed(2)
        : null;
      const hasPending = pending.some(r => r.evaluatedId === u.id);
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
      pendingCount: pending.length,
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
    if (!('competencies' in results) || !results.competencies)
      return { message: 'Sem dados de competências para gerar PDI' };

    // Identify top 3 gap competencies (lowest scores)
    const gaps = Object.entries(results.competencies)
      .map(([cid, score]) => ({ competencyId: +cid, score }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);

    // Create notification for manager to create PDI
    const user: Prisma.UserGetPayload<{
      select: { id: true; fullName: true; managerId: true };
    }> | null = await this.prisma.user
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

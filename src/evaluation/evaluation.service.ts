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
import { OneOnOneService } from '../one-on-one/one-on-one.service';
import {
  CreateCycleDto,
  UpdateCycleDto,
  CycleFilterDto,
  CreateFormDto,
  SubmitEvaluationDto,
  AssignEvaluatorDto,
  BulkAssignDto,
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
  EvalStage,
  EvalPurpose,
  EvalPopulationType,
  EvaluationRequestFilterDto,
  UpdateEvaluationRequestDto,
  ScheduleOneOnOneDto,
  RegisterOneOnOneDto,
} from './evaluation.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { toJson } from '../common/helpers/prisma-json';
import { weightedScore, removeOutliers } from './evaluation-scoring';
import { EvaluationCalibrationService } from './evaluation-calibration';
import { EvaluationAnalyticsService } from './evaluation-analytics';

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

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  // Calibração e analytics/relatórios extraídos para ficheiros próprios (mesmo prisma/logger).
  private readonly calibration: EvaluationCalibrationService;
  private readonly analytics: EvaluationAnalyticsService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oneOnOne: OneOnOneService,
  ) {
    this.calibration = new EvaluationCalibrationService(prisma, this.logger, {
      toPublicCampaign: c => this.toPublicCampaign(c),
      assertCampaignExists: id => this.assertCampaignExists(id),
      advanceStage: id => this.advanceStage(id),
    });
    this.analytics = new EvaluationAnalyticsService(prisma, this.logger, {
      getPendingEvaluations: id => this.getPendingEvaluations(id),
      getMyProgress: id => this.getMyProgress(id),
    });
  }

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
        imageUrl: dto.imageUrl || null,
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
        purpose: dto.purpose,
        blocks: dto.blocks ? toJson(dto.blocks) : undefined,
        populationType: dto.populationType,
        targetUnitIds: dto.targetUnitIds ?? [],
        targetUserIds: dto.targetUserIds ?? [],
        selfEvalDueDate: dto.selfEvalDueDate ? new Date(dto.selfEvalDueDate) : undefined,
        managerEvalDueDate: dto.managerEvalDueDate ? new Date(dto.managerEvalDueDate) : undefined,
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

    // Participação por ciclo numa só query — o separador Ciclos mostra-a em cada cartão.
    const grouped = data.length
      ? await this.prisma.evaluationRequest.groupBy({
          by: ['cycleId', 'status'],
          where: { cycleId: { in: data.map(c => c.id) } },
          _count: { _all: true },
        })
      : [];
    const participationOf = (cycleId: number) => {
      const rows = grouped.filter(g => g.cycleId === cycleId);
      const cycleTotal = rows.reduce((n, g) => n + g._count._all, 0);
      const cycleDone = rows
        .filter(g => g.status === 'COMPLETED')
        .reduce((n, g) => n + g._count._all, 0);
      return {
        total: cycleTotal,
        completed: cycleDone,
        rate: cycleTotal > 0 ? +((cycleDone / cycleTotal) * 100).toFixed(1) : 0,
      };
    };

    return buildPaginatedResponse(
      data.map(c => ({ ...this.toPublicCampaign(c), participation: participationOf(c.id) })),
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
    const { endDate, selfEvalDueDate, managerEvalDueDate, blocks, ...rest } = dto;
    const campaign = await this.prisma.evaluationCampaign.update({
      where: { id },
      data: {
        ...rest,
        ...(endDate ? { endDate: new Date(endDate) } : {}),
        ...(selfEvalDueDate ? { selfEvalDueDate: new Date(selfEvalDueDate) } : {}),
        ...(managerEvalDueDate ? { managerEvalDueDate: new Date(managerEvalDueDate) } : {}),
        ...(blocks ? { blocks: toJson(blocks) } : {}),
      },
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

    const requests = await this.prisma.evaluationRequest.findMany({
      where: { cycleId: id },
      select: { evaluatorId: true },
    });
    await this.notifyParticipants(
      id,
      [...new Set(requests.map(r => r.evaluatorId))],
      'EVALUATION_CYCLE_STARTED',
      `Ciclo de avaliação "${campaign.name}" foi iniciado — tens avaliações pendentes`,
    );

    // requestsCount permite ao cliente avisar quando a activação não gerou
    // nenhum pedido (ex.: modelo só-gestor e colaboradores sem managerId).
    return { ...this.toPublicCampaign(updated), requestsCount: requests.length };
  }

  // docs/modulo_evaluation.md ponto 3 — Pausar/Encerrar/Reabrir/Enviar lembretes.
  async pauseCycle(id: number) {
    await this.assertCampaignExists(id);
    const campaign = await this.prisma.evaluationCampaign.update({
      where: { id },
      data: { status: CycleStatus.PAUSED },
    });
    return this.toPublicCampaign(campaign);
  }

  async closeCycle(id: number) {
    await this.assertCampaignExists(id);
    const campaign = await this.prisma.evaluationCampaign.update({
      where: { id },
      data: { status: CycleStatus.COMPLETED },
    });
    return this.toPublicCampaign(campaign);
  }

  /**
   * Elimina (eliminação lógica) um ciclo que ainda não tem avaliações atribuídas.
   * Com avaliações já lançadas o ciclo não se elimina — os pedidos ficariam órfãos
   * e os resultados perdidos; nesse caso encerra-se.
   */
  async deleteCycle(id: number) {
    await this.assertCampaignExists(id);
    const assigned = await this.prisma.evaluationRequest.count({ where: { cycleId: id } });
    if (assigned > 0) {
      throw new ConflictException(
        'Este ciclo já tem avaliações atribuídas e não pode ser eliminado. Encerre-o em vez disso.',
      );
    }
    await this.prisma.evaluationCampaign.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { id, deleted: true };
  }

  async reopenCycle(id: number) {
    await this.assertCampaignExists(id);
    const campaign = await this.prisma.evaluationCampaign.update({
      where: { id },
      data: { status: CycleStatus.ACTIVE },
    });
    return this.toPublicCampaign(campaign);
  }

  async remindCycleParticipants(id: number) {
    const campaign = await this.assertCampaignExists(id);
    const requests = await this.prisma.evaluationRequest.findMany({
      where: { cycleId: id, status: { in: [RequestStatus.PENDING, RequestStatus.IN_PROGRESS] } },
      select: { evaluatorId: true },
    });
    const uniqueIds = [...new Set(requests.map(r => r.evaluatorId))];
    await this.notifyParticipants(
      id,
      uniqueIds,
      'EVALUATION_REMINDER',
      `Lembrete: tens avaliações pendentes no ciclo "${campaign.name}"`,
    );
    return { notified: uniqueIds.length };
  }

  private async notifyParticipants(
    cycleId: number,
    userIds: number[],
    type: string,
    message: string,
  ) {
    if (!userIds.length) return;
    await this.prisma.notificationLog
      .createMany({
        data: userIds.map(uid => ({ userId: uid, type, message, metadata: JSON.stringify({}) })),
        skipDuplicates: true,
      })
      .catch((e: unknown) => {
        this.logger.warn({
          action: 'EVALUATION_CYCLE_NOTIFY',
          cycleId,
          userIds,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificações do ciclo',
        });
      });
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
    // docs/modulo_evaluation.md ponto 2, etapa 2 — população abrangida:
    // GROUP usa a lista explícita de utilizadores; ALL/DEPARTMENT/UNIT (ou
    // nenhum populationType, comportamento pré-existente) combinam os
    // filtros de departamento/unidade indicados.
    let users: { id: number; managerId: number | null }[];
    if (campaign.populationType === 'GROUP' && campaign.targetUserIds?.length) {
      users = await this.prisma.read.user.findMany({
        where: { active: true, id: { in: campaign.targetUserIds } },
        select: { id: true, managerId: true },
      });
    } else {
      const scopeFilter: Prisma.UserWhereInput = {};
      if (campaign.targetDeptIds?.length) scopeFilter.departmentId = { in: campaign.targetDeptIds };
      if (campaign.targetUnitIds?.length) scopeFilter.unitId = { in: campaign.targetUnitIds };
      users = await this.prisma.read.user.findMany({
        where: { active: true, ...scopeFilter },
        select: { id: true, managerId: true },
      });
    }

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
            dueDate:
              (a.type === EvalType.SELF ? campaign.selfEvalDueDate : undefined) ??
              (a.type === EvalType.MANAGER ? campaign.managerEvalDueDate : undefined) ??
              campaign.endDate,
            purpose: campaign.purpose ?? undefined,
            stage:
              a.type === EvalType.SELF
                ? EvalStage.SELF_EVAL
                : a.type === EvalType.MANAGER
                  ? EvalStage.MANAGER_EVAL
                  : undefined,
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

  // Escalas padrão criadas na primeira leitura quando a tabela está vazia —
  // sem isto os selects "Escala de avaliação" (Nova Avaliação, Modelos,
  // Critérios) aparecem vazios numa instalação nova.
  private async ensureDefaultScales() {
    if ((await this.prisma.evaluationScale.count()) > 0) return;
    const defaults = [
      {
        name: 'Escala 1–5 (Likert)',
        description: 'Escala de desempenho de cinco níveis',
        minValue: 1,
        maxValue: 5,
        isDefault: true,
        labels: ['Insuficiente', 'Abaixo do esperado', 'Cumpre', 'Acima do esperado', 'Excecional'],
      },
      {
        name: 'Escala 1–4',
        description: 'Escala de quatro níveis, sem ponto neutro',
        minValue: 1,
        maxValue: 4,
        isDefault: false,
        labels: ['Insuficiente', 'Em desenvolvimento', 'Competente', 'Excelente'],
      },
      {
        name: 'Escala 1–10',
        description: 'Escala numérica de dez pontos',
        minValue: 1,
        maxValue: 10,
        isDefault: false,
        labels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      },
    ];
    for (const { labels, ...scale } of defaults) {
      await this.prisma.evaluationScale.create({
        data: {
          ...scale,
          levels: { create: labels.map((label, i) => ({ value: scale.minValue + i, label })) },
        },
      });
    }
  }

  async getScales() {
    await this.ensureDefaultScales();
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
        code: dto.code,
        description: dto.description,
        category: dto.category,
        weight: dto.weight ?? 1,
        scaleId: dto.scaleId,
        competencyId: dto.competencyId,
        behavioralIndicators: dto.behavioralIndicators,
        createdById,
      },
      include: { scale: true, competency: true },
    });
  }

  // `includeInactive`: a aba "Critérios" (biblioteca central, docs/
  // modulo_evaluation.md pt.5) precisa de ver e reactivar critérios
  // inactivos; a etapa 4 do wizard "Nova Avaliação" só quer os activos, por
  // isso o omitir mantém o comportamento anterior.
  async getCriteria(filters: { category?: string; includeInactive?: boolean } = {}) {
    return this.prisma.evaluationCriteria.findMany({
      where: {
        deletedAt: null,
        ...(filters.includeInactive ? {} : { isActive: true }),
        ...(filters.category ? { category: filters.category } : {}),
      },
      include: { scale: true, competency: true },
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
    const { criteria, ...rest } = dto;
    return this.prisma.$transaction(async tx => {
      if (criteria) {
        await tx.evaluationTemplateCriteria.deleteMany({ where: { templateId: id } });
      }
      return tx.evaluationTemplate.update({
        where: { id },
        data: {
          ...rest,
          criteria: criteria
            ? {
                create: criteria.map((c, i) => ({
                  criteriaId: c.criteriaId,
                  weight: c.weight,
                  seq: c.seq ?? i,
                })),
              }
            : undefined,
        },
        include: { criteria: { include: { criteria: true }, orderBy: { seq: 'asc' } } },
      });
    });
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
      .catch((e: unknown): null => {
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

    // docs/modulo_evaluation.md ponto 2 — purpose/objectives/name vêm do
    // pedido; purpose por omissão herda do ciclo quando associado a um.
    let purpose = dto.purpose;
    let dueDate = new Date(Date.now() + 14 * 86400000);
    if (dto.cycleId) {
      const campaign = await this.prisma.evaluationCampaign.findFirst({
        where: { id: dto.cycleId, deletedAt: null },
        select: { purpose: true, endDate: true, selfEvalDueDate: true, managerEvalDueDate: true },
      });
      purpose = purpose ?? campaign?.purpose ?? undefined;
      const campaignDueDate =
        dto.type === EvalType.SELF
          ? campaign?.selfEvalDueDate
          : dto.type === EvalType.MANAGER
            ? campaign?.managerEvalDueDate
            : undefined;
      dueDate = campaignDueDate ?? campaign?.endDate ?? dueDate;
    }

    const request = await this.prisma.evaluationRequest.create({
      data: {
        evaluatorId: dto.evaluatorId,
        evaluatedId: dto.evaluatedId,
        type: dto.type,
        cycleId: dto.cycleId,
        status: RequestStatus.PENDING,
        dueDate,
        name: dto.name,
        purpose,
        stage:
          dto.type === EvalType.SELF
            ? EvalStage.SELF_EVAL
            : dto.type === EvalType.MANAGER
              ? EvalStage.MANAGER_EVAL
              : undefined,
        objectives: dto.objectives ? toJson(dto.objectives) : undefined,
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
  // EVALUATION REQUESTS — vista "Avaliações" (docs/modulo_evaluation.md ponto 2)
  //
  // Uma "Avaliação" da lista é uma agregação por (evaluatedId, cycleId) dos
  // vários EvaluationRequest (SELF/MANAGER/PEER/...) desse par — a linha
  // representativa é a de tipo MANAGER (ou SELF na sua ausência), que é
  // quem carrega prazo/estado/resultado mostrados na tabela.
  // ══════════════════════════════════════════════════════

  private static readonly REQUEST_INCLUDE = {
    evaluated: {
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        employeeNumber: true,
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } },
      },
    },
    evaluator: { select: { id: true, fullName: true, avatarUrl: true } },
    cycle: { select: { id: true, name: true, startDate: true, endDate: true } },
  } satisfies Prisma.EvaluationRequestInclude;

  private pickRepresentative<T extends { type: string | null }>(rows: T[]): T {
    const order: Record<string, number> = {
      MANAGER: 0,
      SELF: 1,
      PEER: 2,
      SUBORDINATE: 3,
      CLIENT: 4,
    };
    return [...rows].sort((a, b) => (order[a.type ?? ''] ?? 9) - (order[b.type ?? ''] ?? 9))[0];
  }

  async getEvaluationRequestsList(filters: EvaluationRequestFilterDto = {}) {
    const {
      page = 1,
      limit = 20,
      cycleId,
      departmentId,
      unitId,
      positionId,
      evaluatorId,
      status,
      purpose,
      period,
    } = filters;

    const where: Prisma.EvaluationRequestWhereInput = {};
    if (cycleId) where.cycleId = cycleId;
    if (evaluatorId) where.evaluatorId = evaluatorId;
    if (status) where.status = status;
    if (purpose) where.purpose = purpose;
    if (departmentId || positionId) {
      where.evaluated = {
        ...(departmentId ? { departmentId } : {}),
        ...(positionId ? { positionId } : {}),
      };
    }
    if (unitId) where.evaluated = { ...(where.evaluated as object), unitId };

    const rows = await this.prisma.read.evaluationRequest.findMany({
      where,
      include: EvaluationService.REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = `${r.evaluatedId}-${r.cycleId ?? 'none'}`;
      const group = groups.get(key);
      if (group) group.push(r);
      else groups.set(key, [r]);
    }

    // Resultados: uma única query para todo o conjunto de pares envolvidos.
    const evaluatedIds = [...new Set(rows.map(r => r.evaluatedId))];
    const results = evaluatedIds.length
      ? await this.prisma.read.performanceEvaluation.findMany({
          where: { evaluatedId: { in: evaluatedIds } },
          select: {
            evaluatorId: true,
            evaluatedId: true,
            cycleId: true,
            overallScore: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    let items = [...groups.entries()].map(([key, groupRows]) => {
      const rep = this.pickRepresentative(groupRows);
      const result = results.find(
        r =>
          r.evaluatorId === rep.evaluatorId &&
          r.evaluatedId === rep.evaluatedId &&
          r.cycleId === rep.cycleId,
      );
      const allCompleted = groupRows.every(r => r.status === 'COMPLETED');
      const anyInProgress = groupRows.some(
        r => r.status === 'IN_PROGRESS' || r.status === 'COMPLETED',
      );
      const aggregateStatus = allCompleted
        ? 'COMPLETED'
        : anyInProgress
          ? 'IN_PROGRESS'
          : 'PENDING';
      // "Progresso" — docs/modulo_evaluation.md pt.7 (Avaliações Pendentes,
      // vista do gestor): fracção de avaliadores irmãos (SELF/MANAGER/PEER/…)
      // já concluídos, não um % de perguntas respondidas dentro de cada
      // formulário (o schema não guarda progresso por pergunta).
      const progress = groupRows.length
        ? Math.round(
            (groupRows.filter(r => r.status === 'COMPLETED').length / groupRows.length) * 100,
          )
        : 0;
      const dueDate = groupRows
        .map(r => r.dueDate)
        .filter((d): d is Date => !!d)
        .sort((a, b) => a.getTime() - b.getTime())[0];

      return {
        key,
        id: rep.id,
        evaluated: rep.evaluated,
        evaluator: rep.evaluator,
        type: rep.type,
        purpose: rep.purpose ?? groupRows.find(r => r.purpose)?.purpose ?? null,
        name: rep.name,
        cycle: rep.cycle,
        period: rep.cycle ? `${new Date(rep.cycle.startDate).getFullYear()}` : null,
        status: aggregateStatus,
        progress,
        dueDate,
        stage: rep.stage,
        result: result?.overallScore ?? null,
        completedAt: rep.completedAt ?? result?.createdAt ?? null,
        evaluatorsCount: groupRows.length,
      };
    });

    if (period) items = items.filter(i => i.period === period);
    items.sort((a, b) => (b.dueDate?.getTime() ?? 0) - (a.dueDate?.getTime() ?? 0));

    const total = items.length;
    const { skip, take } = calculatePagination(page, limit);
    return buildPaginatedResponse(items.slice(skip, skip + take), total, page, limit);
  }

  async getEvaluationRequestDetail(id: number) {
    const request = await this.prisma.evaluationRequest.findUnique({
      where: { id },
      include: EvaluationService.REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Avaliação não encontrada');

    const siblings = request.cycleId
      ? await this.prisma.evaluationRequest.findMany({
          where: { evaluatedId: request.evaluatedId, cycleId: request.cycleId },
          include: EvaluationService.REQUEST_INCLUDE,
        })
      : [request];

    const result = await this.prisma.performanceEvaluation.findFirst({
      where: {
        evaluatorId: request.evaluatorId,
        evaluatedId: request.evaluatedId,
        cycleId: request.cycleId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { ...request, siblings, result };
  }

  async updateEvaluationRequest(id: number, dto: UpdateEvaluationRequestDto) {
    const request = await this.prisma.evaluationRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Avaliação não encontrada');
    if (request.status === 'COMPLETED')
      throw new BadRequestException('Não é possível editar uma avaliação já concluída');

    const { objectives, dueDate, ...rest } = dto;
    return this.prisma.evaluationRequest.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        ...(objectives ? { objectives: toJson(objectives) } : {}),
      },
    });
  }

  async remindEvaluationRequest(id: number) {
    const request = await this.prisma.evaluationRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Avaliação não encontrada');
    await this.notifyParticipants(
      request.cycleId ?? 0,
      [request.evaluatorId],
      'EVALUATION_REMINDER',
      'Lembrete: tens uma avaliação pendente para preencher',
    );
    return { notified: true };
  }

  async finishEvaluationRequest(id: number) {
    const request = await this.prisma.evaluationRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Avaliação não encontrada');
    return this.prisma.evaluationRequest.update({
      where: { id },
      data: { status: RequestStatus.COMPLETED, stage: EvalStage.DONE, completedAt: new Date() },
    });
  }

  async reopenEvaluationRequest(id: number) {
    const request = await this.prisma.evaluationRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Avaliação não encontrada');
    return this.prisma.evaluationRequest.update({
      where: { id },
      data: { status: RequestStatus.IN_PROGRESS, completedAt: null },
    });
  }

  // docs/modulo_evaluation.md ponto 2, etapa 8 — avanço manual do fluxo
  // (Autoavaliação → Gestor → RH → Calibração → 1:1 → Aprovação → Resultado).
  private static readonly STAGE_ORDER: EvalStage[] = [
    EvalStage.SELF_EVAL,
    EvalStage.MANAGER_EVAL,
    EvalStage.HR_REVIEW,
    EvalStage.CALIBRATION,
    EvalStage.ONE_ON_ONE,
    EvalStage.APPROVAL,
    EvalStage.DONE,
  ];

  async advanceStage(id: number) {
    const request = await this.prisma.evaluationRequest.findUnique({
      where: { id },
      include: { cycle: { select: { allowCalibration: true } } },
    });
    if (!request) throw new NotFoundException('Avaliação não encontrada');

    const hasSelfRequest =
      request.cycleId &&
      (await this.prisma.evaluationRequest.count({
        where: { evaluatedId: request.evaluatedId, cycleId: request.cycleId, type: EvalType.SELF },
      })) > 0;

    const currentIndex = EvaluationService.STAGE_ORDER.indexOf(
      request.stage ?? EvalStage.SELF_EVAL,
    );
    let nextIndex = currentIndex + 1;
    while (nextIndex < EvaluationService.STAGE_ORDER.length) {
      const candidate = EvaluationService.STAGE_ORDER[nextIndex];
      if (candidate === EvalStage.SELF_EVAL && !hasSelfRequest) {
        nextIndex++;
        continue;
      }
      if (candidate === EvalStage.CALIBRATION && request.cycle?.allowCalibration === false) {
        nextIndex++;
        continue;
      }
      break;
    }
    const nextStage =
      EvaluationService.STAGE_ORDER[Math.min(nextIndex, EvaluationService.STAGE_ORDER.length - 1)];

    return this.prisma.evaluationRequest.update({
      where: { id },
      data: {
        stage: nextStage,
        ...(nextStage === EvalStage.DONE
          ? { status: RequestStatus.COMPLETED, completedAt: new Date() }
          : {}),
      },
    });
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
      .catch((e: unknown): null => {
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
      criteria: toJson(dto.answers),
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
        criteria: toJson(dto.criteria),
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
    if (!evaluated) throw new NotFoundException(`Utilizador #${evaluatedId} não encontrado`);

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
        .catch((e: unknown): null => {
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

    // docs/modulo_evaluation.md ponto 8 — "Objetivos" do resultado: vêm do(s)
    // EvaluationRequest.objectives preenchidos na etapa 6 do wizard, não de
    // PerformanceEvaluation (que só guarda respostas de perguntas). Vários
    // pedidos irmãos (SELF/MANAGER/...) do mesmo par podem ter objectives —
    // achatamos todos porque tipicamente só um (MANAGER) os carrega.
    const objectiveRequests = await this.prisma.read.evaluationRequest
      .findMany({
        where: { evaluatedId, ...(cycleId ? { cycleId } : {}) },
        select: { objectives: true },
      })
      .catch(() => [] as { objectives: Prisma.JsonValue }[]);
    const objectives = objectiveRequests.flatMap(r =>
      Array.isArray(r.objectives) ? (r.objectives as Record<string, unknown>[]) : [],
    );
    const objectivesWithPct = objectives.filter(o => typeof o.percentage === 'number') as {
      percentage: number;
    }[];
    const objectivesSummary = {
      total: objectives.length,
      avgAchievement: objectivesWithPct.length
        ? +(
            objectivesWithPct.reduce((s, o) => s + o.percentage, 0) / objectivesWithPct.length
          ).toFixed(1)
        : null,
      items: objectives,
    };

    // Comentários separados por papel (docs pt.8 — "comentários do
    // gestor"/"comentários do colaborador"), a partir dos mesmos registos
    // PerformanceEvaluation já carregados acima (agrupados por `type`).
    const commentsByRole = (role: EvalType) =>
      evaluations
        .filter(e => e.type === role && e.generalComment)
        .map(e => ({ evaluatorId: e.evaluatorId, comment: e.generalComment }));

    // Evolução histórica / comparação com avaliação anterior (docs pt.8 —
    // reaproveita getUserEvolution em vez de duplicar o agrupamento por período).
    const { evolution, trend } = await this.getUserEvolution(evaluatedId);

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
      objectives: objectivesSummary,
      comments: {
        manager: commentsByRole(EvalType.MANAGER),
        self: commentsByRole(EvalType.SELF),
      },
      evolution: { history: evolution, trend },
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

  getCycleForCalibration(
    ...args: Parameters<EvaluationCalibrationService['getCycleForCalibration']>
  ) {
    return this.calibration.getCycleForCalibration(...args);
  }

  openCalibration(...args: Parameters<EvaluationCalibrationService['openCalibration']>) {
    return this.calibration.openCalibration(...args);
  }

  confirmCalibration(...args: Parameters<EvaluationCalibrationService['confirmCalibration']>) {
    return this.calibration.confirmCalibration(...args);
  }

  getCalibrationHistory(
    ...args: Parameters<EvaluationCalibrationService['getCalibrationHistory']>
  ) {
    return this.calibration.getCalibrationHistory(...args);
  }

  calibrateScore(...args: Parameters<EvaluationCalibrationService['calibrateScore']>) {
    return this.calibration.calibrateScore(...args);
  }

  // ══════════════════════════════════════════════════════
  // ANALYTICS
  // ══════════════════════════════════════════════════════

  getAnalyticsDashboard(...args: Parameters<EvaluationAnalyticsService['getAnalyticsDashboard']>) {
    return this.analytics.getAnalyticsDashboard(...args);
  }

  getOverviewDashboard(...args: Parameters<EvaluationAnalyticsService['getOverviewDashboard']>) {
    return this.analytics.getOverviewDashboard(...args);
  }

  getTeamDashboard(...args: Parameters<EvaluationAnalyticsService['getTeamDashboard']>) {
    return this.analytics.getTeamDashboard(...args);
  }

  getUserEvolution(...args: Parameters<EvaluationAnalyticsService['getUserEvolution']>) {
    return this.analytics.getUserEvolution(...args);
  }

  getReportsOverview(...args: Parameters<EvaluationAnalyticsService['getReportsOverview']>) {
    return this.analytics.getReportsOverview(...args);
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
      .catch((e: unknown): null => {
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

  // ══════════════════════════════════════════════════════
  // CONVERSA 1:1 (docs/modulo_evaluation.md ponto 10)
  //
  // OneOnOneMeeting é o dono único (Fase G4 — src/one-on-one). O evaluation
  // module só orquestra: liga o registo à EvaluationRequest representativa
  // via oneOnOneMeetingId e avança o fluxo depois da conversa registada.
  // ══════════════════════════════════════════════════════

  async getOneOnOne(requestId: number) {
    const request = await this.prisma.read.evaluationRequest.findUnique({
      where: { id: requestId },
      select: { oneOnOneMeetingId: true },
    });
    if (!request) throw new NotFoundException('Avaliação não encontrada');
    if (!request.oneOnOneMeetingId) return null;
    return this.oneOnOne.getOne(request.oneOnOneMeetingId);
  }

  async scheduleOneOnOne(requestId: number, dto: ScheduleOneOnOneDto) {
    const request = await this.prisma.evaluationRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Avaliação não encontrada');
    if (request.oneOnOneMeetingId) {
      throw new ConflictException('Já existe uma conversa 1:1 agendada para esta avaliação');
    }

    const meeting = await this.oneOnOne.schedule({
      hostId: request.evaluatorId,
      participantId: request.evaluatedId,
      scheduledAt: dto.scheduledAt,
      agenda: dto.agenda,
    });

    await this.prisma.evaluationRequest.update({
      where: { id: requestId },
      data: { oneOnOneMeetingId: meeting.id },
    });

    return meeting;
  }

  // "Registar a conversa" — docs pt.10 pede Pontos discutidos/Pontos
  // fortes/Áreas de desenvolvimento/Compromissos/Objetivos definidos/Ações/
  // Próxima reunião/Observações. OneOnOneMeeting só tem campos genéricos
  // (minutes/actionItems/nextMeetingDate) — os sub-campos estruturados vão
  // como JSON dentro de `minutes`, mesmo padrão que NotificationLog.metadata
  // usa para dados semi-estruturados sem duplicar colunas no dono único.
  async registerOneOnOne(requestId: number, dto: RegisterOneOnOneDto) {
    const request = await this.prisma.evaluationRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Avaliação não encontrada');

    let meetingId = request.oneOnOneMeetingId;
    if (!meetingId) {
      const meeting = await this.oneOnOne.schedule({
        hostId: request.evaluatorId,
        participantId: request.evaluatedId,
        scheduledAt: new Date(),
      });
      meetingId = meeting.id;
      await this.prisma.evaluationRequest.update({
        where: { id: requestId },
        data: { oneOnOneMeetingId: meetingId },
      });
    }

    const minutes = JSON.stringify({
      discussionPoints: dto.discussionPoints,
      strengths: dto.strengths,
      developmentAreas: dto.developmentAreas,
      commitments: dto.commitments,
      objectivesSet: dto.objectivesSet,
      observations: dto.observations,
    });

    const meeting = await this.oneOnOne.complete(meetingId, {
      minutes,
      actionItems: dto.actions,
      nextMeetingDate: dto.nextMeetingDate,
    });

    // "Isto conecta directamente Evaluation com PDI" (docs pt.10) — avança o
    // fluxo da avaliação para a etapa seguinte (Aprovação) assim que a
    // conversa fica registada.
    if (request.stage === EvalStage.ONE_ON_ONE) {
      await this.advanceStage(requestId);
    }

    return meeting;
  }

  // ══════════════════════════════════════════════════════
  // RELATÓRIOS (docs/modulo_evaluation.md ponto 11)
  // ══════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════
  // CONFIGURAÇÕES (docs/modulo_evaluation.md ponto 12)
  //
  // Agregador de leitura sobre a configuração já existente por peça
  // (Escalas/Critérios/Modelos têm CRUD próprio acima) mais as listas fixas
  // dos enums do domínio — não inventa mecanismos novos de config para
  // "Fluxos de aprovação"/"Tipos"/"Estados", que já são código (STAGE_ORDER,
  // EvalType, CycleStatus) em vez de dados configuráveis.
  // ══════════════════════════════════════════════════════

  async getSettings() {
    const [scales, criteriaCount, templatesCount] = await Promise.all([
      this.prisma.read.evaluationScale.findMany({
        include: { levels: { orderBy: { value: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.evaluationCriteria.count({ where: { deletedAt: null } }),
      this.prisma.read.evaluationTemplate.count({ where: { deletedAt: null } }),
    ]);

    return {
      scales,
      criteriaCount,
      templatesCount,
      evalTypes: Object.values(EvalType),
      evalPurposes: Object.values(EvalPurpose),
      populationTypes: Object.values(EvalPopulationType),
      cycleStatuses: Object.values(CycleStatus),
      approvalFlow: EvaluationService.STAGE_ORDER,
      resultsVisibilityOptions: ['MANAGER_ONLY', 'SELF_AND_MANAGER', 'HR_ONLY', 'ALL'],
    };
  }
}

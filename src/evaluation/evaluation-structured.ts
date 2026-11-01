// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO — PONTOS FORTES / ÁREAS DE MELHORIA / RECOMENDAÇÕES
// Registos estruturados ligados a uma PerformanceEvaluation
// (docs/avaliacao_desempenho_robusta_claude_code.md §4-6).
// Colaborador interno do EvaluationService: mesmo prisma/logger, não é provider Nest.
// ============================================================

import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { ADMIN_RH_ROLES } from '../auth/enums/role-groups';
import type { CurrentUserData } from '../common/decorators';
import type { DevelopmentPlansService } from '../development-plans/development-plans.service';
import type {
  ImprovementItemDto,
  RecommendationItemDto,
  StrengthItemDto,
  UpdateRecommendationDto,
} from './evaluation.dto';

export interface StructuredItemsInput {
  strengthItems?: StrengthItemDto[];
  improvementItems?: ImprovementItemDto[];
  recommendationItems?: RecommendationItemDto[];
}

export interface StructuredValidationOptions {
  /** Ciclo exige evidência para notas altas (EvaluationCampaign.requireEvidence). */
  requireEvidence?: boolean;
  /** Referência para validar prazos (injectável nos testes). */
  today?: Date;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

function findDuplicate(items: { competencyId?: number; competency: string }[]): string | null {
  const seen = new Set<string>();
  for (const it of items) {
    const key = it.competencyId ? `id:${it.competencyId}` : `n:${norm(it.competency)}`;
    if (seen.has(key)) return it.competency;
    seen.add(key);
  }
  return null;
}

const blank = (s?: string) => !s || !s.trim();

/** Validações de negócio dos registos estruturados; lança BadRequestException com todos os problemas. */
export function validateStructuredItems(
  input: StructuredItemsInput,
  opts: StructuredValidationOptions = {},
): void {
  const errors: string[] = [];
  const strengths = input.strengthItems ?? [];
  const improvements = input.improvementItems ?? [];
  const recs = input.recommendationItems ?? [];

  const dupS = findDuplicate(strengths);
  if (dupS) errors.push(`Ponto forte duplicado para a competência "${dupS}"`);
  const dupI = findDuplicate(improvements);
  if (dupI) errors.push(`Área de melhoria duplicada para a competência "${dupI}"`);

  strengths.forEach((s, i) => {
    if (opts.requireEvidence && s.score >= 4 && blank(s.evidence)) {
      errors.push(
        `Ponto forte "${s.competency}": nota ${s.score} exige evidência ou exemplo concreto`,
      );
    }
  });

  const refs = new Set<string>();
  for (const a of improvements) {
    if (!a.ref) continue;
    if (refs.has(a.ref)) errors.push(`Referência de área de melhoria repetida: "${a.ref}"`);
    refs.add(a.ref);
  }

  const today = new Date(opts.today ?? new Date());
  today.setHours(0, 0, 0, 0);
  recs.forEach((r, i) => {
    if (r.improvementRef && !refs.has(r.improvementRef)) {
      errors.push(`Recomendação ${i + 1}: a área de melhoria associada não existe neste registo`);
    }
    if (r.dueDate) {
      const d = new Date(r.dueDate);
      if (Number.isNaN(d.getTime())) errors.push(`Recomendação ${i + 1}: prazo inválido`);
      else if (d < today) errors.push(`Recomendação ${i + 1}: o prazo não pode estar no passado`);
    }
  });

  if (errors.length) throw new BadRequestException({ message: errors, error: 'Bad Request' });
}

/** Coerência entre estado e percentagem de conclusão de uma recomendação. */
export function normalizeRecommendationProgress(
  status: string,
  progressPct?: number,
): { status: string; progressPct: number } {
  if (status === 'CONCLUIDA') return { status, progressPct: 100 };
  if (status === 'PENDENTE') return { status, progressPct: 0 };
  const pct = progressPct ?? 0;
  if (status === 'EM_CURSO' && pct >= 100) {
    throw new BadRequestException(
      'Uma ação em curso não pode ter 100% — marque-a como concluída para a fechar',
    );
  }
  return { status, progressPct: pct };
}

const PDI_TO_REC_STATUS: Record<string, string> = {
  TODO: 'PENDENTE',
  IN_PROGRESS: 'EM_CURSO',
  BLOCKED: 'EM_CURSO',
  OVERDUE: 'EM_CURSO',
  COMPLETED: 'CONCLUIDA',
  CANCELLED: 'CANCELADA',
};

/** Tipo de acção da recomendação → tipo de acção do PDI (ActionType). */
export const PDI_ACTION_TYPE: Record<string, string> = {
  FORMACAO: 'COURSE',
  MENTORIA: 'MENTORING',
  ACOMPANHAMENTO: 'FEEDBACK',
  COACHING: 'COACHING',
  PROJETO_PRATICO: 'PROJECT',
  ALTERACAO_PROCESSO: 'PROJECT',
  OUTRA: 'PROJECT',
};

export interface RecommendationStateInput {
  status: string;
  dueDate: Date | null;
  progressPct?: number;
}
export interface PdiActionStateInput {
  status: string;
  progress: number;
  completedAt: Date | null;
}

/**
 * Estado efectivo de uma recomendação. Se tem acção de PDI ligada, o PDI é a
 * única fonte de verdade (estado e progresso nunca se duplicam); caso contrário
 * vale o registo da própria recomendação. `overdue` = prazo ultrapassado sem fecho.
 */
export function effectiveRecommendationState(
  rec: RecommendationStateInput,
  pdiAction: PdiActionStateInput | null | undefined,
  now: Date = new Date(),
): { status: string; progressPct: number; overdue: boolean; source: 'PDI' | 'RECOMENDACAO' } {
  const status = pdiAction ? (PDI_TO_REC_STATUS[pdiAction.status] ?? rec.status) : rec.status;
  const progressPct = pdiAction ? pdiAction.progress : (rec.progressPct ?? 0);
  const closed = status === 'CONCLUIDA' || status === 'CANCELADA';
  return {
    status,
    progressPct,
    overdue: !closed && !!rec.dueDate && rec.dueDate < now,
    source: pdiAction ? 'PDI' : 'RECOMENDACAO',
  };
}

const RECOMMENDATION_ADMIN_ROLES: Role[] = [...ADMIN_RH_ROLES];

export interface Actor {
  id: number;
  role?: { name: string } | null;
}

export class EvaluationStructuredService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
    /** Dono único do PDI (Fase G3) — nunca se escreve DevelopmentPlan* directamente. */
    private readonly plans?: DevelopmentPlansService,
  ) {}

  /** Formações indicadas têm de existir e não podem estar arquivadas ou canceladas. */
  async assertTrainingsExist(recs: RecommendationItemDto[] | undefined): Promise<void> {
    const ids = [...new Set((recs ?? []).map(r => r.trainingId).filter((v): v is number => !!v))];
    if (!ids.length) return;
    const found = await this.prisma.training.findMany({
      where: { id: { in: ids }, status: { notIn: ['ARCHIVED', 'CANCELLED'] } },
      select: { id: true },
    });
    const missing = ids.filter(id => !found.some(t => t.id === id));
    if (missing.length) {
      throw new BadRequestException(`Formação inexistente ou indisponível: ${missing.join(', ')}`);
    }
  }

  /** Garante que os responsáveis indicados existem. */
  async assertResponsiblesExist(recs: RecommendationItemDto[] | undefined): Promise<void> {
    const ids = [
      ...new Set((recs ?? []).map(r => r.responsibleId).filter((v): v is number => !!v)),
    ];
    if (!ids.length) return;
    const found = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const missing = ids.filter(id => !found.some(u => u.id === id));
    if (missing.length) {
      throw new BadRequestException(`Responsável inexistente: ${missing.join(', ')}`);
    }
  }

  /**
   * Substitui os registos estruturados da avaliação (apenas enquanto é rascunho:
   * o chamador já impede a re-submissão de pedidos concluídos).
   */
  async replaceItems(
    tx: Prisma.TransactionClient,
    evaluationId: number,
    actorId: number,
    input: StructuredItemsInput,
  ): Promise<void> {
    await tx.evaluationRecommendation.deleteMany({ where: { evaluationId } });
    await tx.evaluationImprovementArea.deleteMany({ where: { evaluationId } });
    await tx.evaluationStrength.deleteMany({ where: { evaluationId } });

    for (const s of input.strengthItems ?? []) {
      await tx.evaluationStrength.create({
        data: {
          evaluationId,
          competencyId: s.competencyId ?? null,
          competency: s.competency.trim(),
          score: s.score,
          description: s.description?.trim() ?? '',
          evidence: s.evidence?.trim() || null,
          impact: s.impact?.trim() || null,
          comment: s.comment?.trim() || null,
        },
      });
    }

    const areaIdByRef = new Map<string, number>();
    for (const a of input.improvementItems ?? []) {
      const created = await tx.evaluationImprovementArea.create({
        data: {
          evaluationId,
          competencyId: a.competencyId ?? null,
          competency: a.competency.trim(),
          score: a.score,
          description: a.description?.trim() ?? '',
          evidence: a.evidence?.trim() || null,
          impact: a.impact?.trim() || null,
          priority: a.priority,
          comment: a.comment?.trim() || null,
        },
      });
      if (a.ref) areaIdByRef.set(a.ref, created.id);
    }

    for (const r of input.recommendationItems ?? []) {
      await tx.evaluationRecommendation.create({
        data: {
          evaluationId,
          improvementAreaId: r.improvementRef ? (areaIdByRef.get(r.improvementRef) ?? null) : null,
          action: r.action.trim(),
          objective: r.objective.trim(),
          actionType: r.actionType,
          responsibleId: r.responsibleId ?? null,
          trainingId: r.trainingId ?? null,
          dueDate: r.dueDate ? new Date(r.dueDate) : null,
          successIndicator: r.successIndicator.trim(),
          priority: r.priority,
          notes: r.notes?.trim() || null,
          createdById: actorId,
        },
      });
    }
  }

  private async loadEvaluation(id: number) {
    const ev = await this.prisma.performanceEvaluation.findUnique({
      where: { id },
      select: { id: true, evaluatorId: true, evaluatedId: true, isDraft: true, pdiPlanId: true },
    });
    if (!ev) throw new NotFoundException('Avaliação não encontrada');
    return ev;
  }

  /** Avaliador, avaliado (só se submetida) ou ADMIN/RH. Caso contrário 404, sem revelar existência. */
  /**
   * Dados de uma avaliação para exportação (PDF). Mesma regra de acesso de
   * `getItems` (avaliador, avaliado só se submetida, ou ADMIN/RH) — reutiliza-a,
   * por isso quem não pode ver a avaliação recebe 404 também aqui.
   */
  async getExportData(evaluationId: number, actor: Actor) {
    const items = await this.getItems(evaluationId, actor);
    const ev = await this.prisma.performanceEvaluation.findUnique({
      where: { id: evaluationId },
      select: {
        type: true,
        period: true,
        overallScore: true,
        ratingLabel: true,
        generalComment: true,
        createdAt: true,
        isDraft: true,
        evaluated: {
          select: {
            fullName: true,
            position: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
        evaluator: { select: { fullName: true } },
        cycle: { select: { name: true } },
      },
    });
    if (!ev) throw new NotFoundException('Avaliação não encontrada');
    return { ev, items };
  }

  async getItems(evaluationId: number, actor: Actor) {
    const ev = await this.loadEvaluation(evaluationId);
    const isEvaluator = ev.evaluatorId === actor.id;
    const isEvaluated = ev.evaluatedId === actor.id && !ev.isDraft;
    if (!isEvaluator && !isEvaluated && !isPrivileged(actor, RECOMMENDATION_ADMIN_ROLES)) {
      throw new NotFoundException('Avaliação não encontrada');
    }
    const [strengths, improvements, recommendations] = await Promise.all([
      this.prisma.evaluationStrength.findMany({ where: { evaluationId }, orderBy: { id: 'asc' } }),
      this.prisma.evaluationImprovementArea.findMany({
        where: { evaluationId },
        orderBy: { id: 'asc' },
      }),
      this.prisma.evaluationRecommendation.findMany({
        where: { evaluationId },
        orderBy: { id: 'asc' },
        include: {
          responsible: { select: { id: true, fullName: true } },
          training: { select: { id: true, title: true, status: true } },
          pdiAction: {
            select: { id: true, planId: true, status: true, progress: true, completedAt: true },
          },
        },
      }),
    ]);

    // Estado real da formação para o AVALIADO (inscrição/presença/conclusão
    // vêm do módulo trainings; não se cria nem se simula inscrição aqui).
    const trainingIds = [
      ...new Set(recommendations.map(r => r.trainingId).filter(Boolean)),
    ] as number[];
    const participations = trainingIds.length
      ? await this.prisma.trainingParticipant.findMany({
          where: { trainingId: { in: trainingIds }, userId: ev.evaluatedId },
          select: { trainingId: true, status: true, completedAt: true },
          orderBy: { updatedAt: 'desc' },
        })
      : [];
    const now = new Date();
    return {
      evaluationId,
      pdiPlanId: ev.pdiPlanId,
      strengths,
      improvements,
      recommendations: recommendations.map(r => ({
        ...r,
        ...effectiveRecommendationState(r, r.pdiAction, now),
        trainingParticipation: r.trainingId
          ? (participations.find(p => p.trainingId === r.trainingId) ?? null)
          : null,
      })),
    };
  }

  /**
   * Acompanhamento de uma recomendação: avaliador, responsável ou ADMIN/RH.
   * Evolução de estado/percentagem e conclusão ficam auditadas.
   */
  async updateRecommendation(id: number, dto: UpdateRecommendationDto, actor: Actor) {
    const rec = await this.prisma.evaluationRecommendation.findUnique({
      where: { id },
      include: { evaluation: { select: { evaluatorId: true, isDraft: true } } },
    });
    if (!rec || rec.evaluation.isDraft) throw new NotFoundException('Recomendação não encontrada');
    const admin = isPrivileged(actor, RECOMMENDATION_ADMIN_ROLES);
    const allowed =
      rec.evaluation.evaluatorId === actor.id || rec.responsibleId === actor.id || admin;
    if (!allowed) throw new NotFoundException('Recomendação não encontrada');

    if (rec.pdiActionId) {
      throw new ConflictException(
        'Esta recomendação está ligada a uma ação do PDI — atualize o estado no PDI',
      );
    }
    if ((rec.status === 'CONCLUIDA' || rec.status === 'CANCELADA') && !admin) {
      throw new ConflictException('Ação já encerrada — só RH/Administração a pode reabrir');
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (dto.dueDate && new Date(dto.dueDate) < startOfToday) {
      throw new BadRequestException('O prazo não pode estar no passado');
    }
    if (dto.responsibleId) {
      const u = await this.prisma.user.findUnique({
        where: { id: dto.responsibleId },
        select: { id: true },
      });
      if (!u) throw new BadRequestException('Responsável inexistente');
    }

    const nextStatus = dto.status ?? rec.status;
    const progress = normalizeRecommendationProgress(
      nextStatus,
      dto.progressPct ?? (dto.status ? undefined : rec.progressPct),
    );
    const closing = nextStatus === 'CONCLUIDA' && rec.status !== 'CONCLUIDA';
    const updated = await this.prisma.evaluationRecommendation.update({
      where: { id },
      data: {
        status: progress.status,
        progressPct: progress.progressPct,
        ...(dto.successIndicator !== undefined && { successIndicator: dto.successIndicator }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.responsibleId !== undefined && { responsibleId: dto.responsibleId }),
        completedAt: closing ? new Date() : nextStatus === 'CONCLUIDA' ? rec.completedAt : null,
        updatedById: actor.id,
      },
    });

    await writeChainedAuditLog(this.prisma, {
      userId: actor.id,
      action: closing ? 'RECOMMENDATION_COMPLETED' : 'RECOMMENDATION_UPDATED',
      entity: 'EvaluationRecommendation',
      entityId: id,
      before: JSON.stringify({ status: rec.status, progressPct: rec.progressPct }),
      after: JSON.stringify({ status: updated.status, progressPct: updated.progressPct }),
    }).catch((e: unknown) => {
      this.logger.warn({
        action: 'EVALUATION_RECOMMENDATION_AUDIT_LOG',
        recommendationId: id,
        err: { message: e instanceof Error ? e.message : 'erro desconhecido' },
        msg: 'Falha ao registar auditoria da recomendação',
      });
    });
    return updated;
  }

  /**
   * Gera (ou completa) o PDI do avaliado a partir das recomendações submetidas.
   * Delega no DevelopmentPlansService; cada recomendação passa a ter uma ação
   * de PDI ligada e o estado/progresso passa a ser lido do PDI. Pode ser
   * chamado de novo para acrescentar ações a recomendações ainda sem ligação.
   */
  async generatePdi(evaluationId: number, actor: CurrentUserData) {
    if (!this.plans) throw new BadRequestException('Módulo de PDI indisponível');
    const ev = await this.prisma.performanceEvaluation.findUnique({
      where: { id: evaluationId },
      include: {
        evaluated: { select: { id: true, fullName: true } },
        strengthItems: { select: { competency: true } },
        improvementItems: { select: { competency: true, description: true } },
        recommendationItems: {
          where: { pdiActionId: null, status: { not: 'CANCELADA' } },
          include: { training: { select: { title: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!ev) throw new NotFoundException('Avaliação não encontrada');
    if (ev.evaluatorId !== actor.id && !isPrivileged(actor, RECOMMENDATION_ADMIN_ROLES)) {
      throw new NotFoundException('Avaliação não encontrada');
    }
    if (ev.isDraft) throw new ConflictException('Submeta a avaliação antes de gerar o PDI');
    if (!ev.recommendationItems.length) {
      throw new ConflictException(
        ev.pdiPlanId
          ? 'Todas as recomendações já estão no PDI'
          : 'A avaliação não tem recomendações para transformar em PDI',
      );
    }

    let planId = ev.pdiPlanId;
    if (!planId) {
      const plan = await this.plans.create({
        name: `PDI — ${ev.evaluated.fullName} (${ev.period})`,
        goal: ev.recommendationItems
          .map(r => r.objective)
          .join(' · ')
          .slice(0, 1500),
        userId: ev.evaluatedId,
        period: ev.period,
        origin: 'PERFORMANCE_REVIEW',
        originJustification: `Gerado a partir da avaliação de desempenho #${ev.id}`,
        strengths: ev.strengthItems.map(s => s.competency).join(', ') || undefined,
        developmentNeeds: ev.improvementItems.map(a => a.competency).join(', ') || undefined,
      } as never);
      planId = plan.id;
      await this.prisma.performanceEvaluation.update({
        where: { id: ev.id },
        data: { pdiPlanId: planId },
      });
    }

    let created = 0;
    for (const [i, r] of ev.recommendationItems.entries()) {
      const action = await this.plans.addAction(
        {
          planId,
          title: r.action.slice(0, 200),
          description: [
            `Objetivo: ${r.objective}`,
            `Indicador de sucesso: ${r.successIndicator}`,
            r.training ? `Formação recomendada: ${r.training.title}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          type: (PDI_ACTION_TYPE[r.actionType] ?? 'PROJECT') as never,
          dueDate: r.dueDate?.toISOString(),
          seq: i,
        },
        actor,
      );
      await this.prisma.evaluationRecommendation.update({
        where: { id: r.id },
        data: { pdiActionId: action.id, updatedById: actor.id },
      });
      created++;
    }

    await writeChainedAuditLog(this.prisma, {
      userId: actor.id,
      action: 'PDI_GENERATED_FROM_EVALUATION',
      entity: 'PerformanceEvaluation',
      entityId: ev.id,
      after: JSON.stringify({ planId, actions: created }),
    }).catch((e: unknown) => {
      this.logger.warn({
        action: 'EVALUATION_PDI_AUDIT_LOG',
        evaluationId: ev.id,
        err: { message: e instanceof Error ? e.message : 'erro desconhecido' },
        msg: 'Falha ao registar auditoria da geração de PDI',
      });
    });
    return { planId, actionsCreated: created };
  }
}

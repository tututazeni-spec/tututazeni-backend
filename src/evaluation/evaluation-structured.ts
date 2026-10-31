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
    if (blank(s.description)) errors.push(`Ponto forte ${i + 1}: a descrição é obrigatória`);
    if (opts.requireEvidence && s.score >= 4 && blank(s.evidence)) {
      errors.push(
        `Ponto forte "${s.competency}": nota ${s.score} exige evidência ou exemplo concreto`,
      );
    }
  });

  improvements.forEach((a, i) => {
    if (blank(a.description)) errors.push(`Área de melhoria ${i + 1}: a descrição é obrigatória`);
    // Nota 4–5 só é "lacuna" com justificação específica (§5.1).
    if (a.score >= 4 && blank(a.evidence) && blank(a.comment)) {
      errors.push(
        `Área de melhoria "${a.competency}": nota ${a.score} só é aceite como lacuna com evidência ou comentário que a justifique`,
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

const RECOMMENDATION_ADMIN_ROLES: Role[] = [...ADMIN_RH_ROLES];

export interface Actor {
  id: number;
  role?: { name: string } | null;
}

export class EvaluationStructuredService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

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
          description: s.description.trim(),
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
          description: a.description.trim(),
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
      select: { id: true, evaluatorId: true, evaluatedId: true, isDraft: true },
    });
    if (!ev) throw new NotFoundException('Avaliação não encontrada');
    return ev;
  }

  /** Avaliador, avaliado (só se submetida) ou ADMIN/RH. Caso contrário 404, sem revelar existência. */
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
        include: { responsible: { select: { id: true, fullName: true } } },
      }),
    ]);
    return { evaluationId, strengths, improvements, recommendations };
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
}

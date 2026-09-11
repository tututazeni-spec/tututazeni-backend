import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LeadershipCriterionSource, ParticipantStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import { LeadershipProgramsService } from './leadership-programs.service';

/**
 * Motor de elegibilidade + fluxo de selecção candidato→participante (Task 3).
 *
 * - `calculate()` lê os dados reais das entidades canónicas (desempenho,
 *   potencial 9-box, competências, feedback 360°, leadership score, antiguidade,
 *   carreira/PDI, formação) conforme os `LeadershipSelectionCriterion` activos do
 *   programa, produz um score 0-100 determinístico e **persiste o snapshot** na
 *   linha do participante (`eligibilityScore/Breakdown/MissingData/ComputedAt`)
 *   para explicação, auditoria e histórico.
 * - O score é calculado EXCLUSIVAMENTE no servidor. Sem `Math.random`, sem
 *   dependência do relógio para além de `eligibilityComputedAt`.
 * - Dados ausentes não são silenciados: entram em `missingData` e no `breakdown`
 *   com contribuição zero e a flag `missing`.
 * - Ownership: reutiliza `LeadershipProgramsService.assertCanManageProgram`
 *   (mesmo dono/privilegiado do agregado) — não duplica a regra.
 */
@Injectable()
export class LeadershipEligibilityService {
  private readonly logger = new Logger(LeadershipEligibilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly programsService: LeadershipProgramsService,
  ) {}

  // ─── Constantes de normalização (documentadas no task-3-report) ───────────
  /** Nota mínima (0-100) do score agregado para um candidato ser elegível. */
  static readonly PASS_MARK = 60;
  /** Eixo de potencial do 9-box: 1-3 (ver talent-development.service). */
  private static readonly NINE_BOX_MAX = 3;
  /** LeadershipScore.score vive numa escala 0-1000 (leadership.service.recalc). */
  private static readonly LEADERSHIP_SCORE_MAX = 1000;
  /** LeadershipFeedback360Response.score — Likert 1-5 (get360Summary). */
  private static readonly FEEDBACK_360_MAX = 5;
  /** Tecto de nível de competência quando o modelo não expõe scaleMax. */
  private static readonly COMPETENCY_LEVEL_MAX = 5;
  /** Antiguidade: ≥ 5 anos de casa = 100. */
  private static readonly TENURE_CAP_YEARS = 5;
  /** Formação: ≥ 5 conclusões (cursos concluídos + certificados) = 100. */
  private static readonly TRAINING_CAP = 5;
  private static readonly MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

  /** Estados de pré-inscrição — o que a lista de "candidatos" devolve. */
  private static readonly CANDIDATE_STATES: ParticipantStatus[] = [
    ParticipantStatus.CANDIDATE,
    ParticipantStatus.SELECTED,
    ParticipantStatus.INVITED,
    ParticipantStatus.REJECTED,
  ];

  /**
   * Máquina de estados da selecção do participante.
   *
   * Mapa brief→enum canónico (o enum da migração da Task 1 manda):
   *   CALLED → INVITED, NOT_COMPLETED → FAILED.
   *
   * CANDIDATE → SELECTED → INVITED → ENROLLED → IN_PROGRESS →
   *   COMPLETED | WITHDRAWN | FAILED
   * REJECTED alcançável de CANDIDATE/SELECTED; CANCELLED é fuga administrativa
   * de qualquer estado não-terminal. Terminais: COMPLETED, REJECTED, WITHDRAWN,
   * FAILED, CANCELLED.
   */
  private static readonly SELECTION_TRANSITIONS: Record<ParticipantStatus, ParticipantStatus[]> = {
    [ParticipantStatus.CANDIDATE]: [
      ParticipantStatus.SELECTED,
      ParticipantStatus.REJECTED,
      ParticipantStatus.CANCELLED,
    ],
    [ParticipantStatus.SELECTED]: [
      ParticipantStatus.INVITED,
      ParticipantStatus.REJECTED,
      ParticipantStatus.CANCELLED,
    ],
    [ParticipantStatus.INVITED]: [ParticipantStatus.ENROLLED, ParticipantStatus.CANCELLED],
    [ParticipantStatus.ENROLLED]: [
      ParticipantStatus.IN_PROGRESS,
      ParticipantStatus.WITHDRAWN,
      ParticipantStatus.CANCELLED,
    ],
    [ParticipantStatus.IN_PROGRESS]: [
      ParticipantStatus.COMPLETED,
      ParticipantStatus.FAILED,
      ParticipantStatus.WITHDRAWN,
      ParticipantStatus.CANCELLED,
    ],
    [ParticipantStatus.COMPLETED]: [],
    [ParticipantStatus.REJECTED]: [],
    [ParticipantStatus.WITHDRAWN]: [],
    [ParticipantStatus.FAILED]: [],
    [ParticipantStatus.CANCELLED]: [],
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers puros (testados directamente — brief Step 1)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Média ponderada. Cada `value` já está em 0-100 e os pesos somam 100, logo
   * `score = round(Σ(weight*value) / 100)`. Ex.: `[{30,80},{70,90}]` → 87.
   */
  calculateFromFactors(factors: Array<{ source?: string; weight: number; value: number }>): {
    score: number;
  } {
    if (!factors.length) return { score: 0 };
    const total = factors.reduce((s, f) => s + Number(f.weight) * Number(f.value), 0);
    return { score: Math.round(total / 100) };
  }

  /**
   * Garante que os pesos totalizam 100 (tolerância ±0.01 para arredondamento de
   * `Decimal`). Caso contrário lança `BadRequestException`.
   */
  validateWeights(items: Array<{ weight: number | Prisma.Decimal | string }>): void {
    const total = items.reduce((s, i) => s + Number(i.weight), 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(
        `Os pesos dos critérios têm de totalizar 100 (actual: ${Math.round(total * 100) / 100}).`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cálculo de elegibilidade
  // ─────────────────────────────────────────────────────────────────────────

  async calculate(
    programId: number,
    userId: number,
    opts: { persist?: boolean; manualValues?: Record<string, number> } = {},
  ): Promise<EligibilityResult> {
    const persist = opts.persist !== false;
    const manualValues = opts.manualValues ?? {};

    const criteria = await this.prisma.read.leadershipSelectionCriterion.findMany({
      where: { programId, active: true },
      orderBy: { seq: 'asc' },
    });

    if (!criteria.length) {
      const empty: EligibilityResult = {
        score: 0,
        eligible: false,
        breakdown: [],
        missingData: ['SELECTION_CRITERIA'],
      };
      if (persist) await this.persistSnapshot(programId, userId, empty);
      return empty;
    }

    // Sanidade dos pesos — explicável, nunca fatal (config inválida não deve
    // rebentar o cálculo de um candidato, mas fica registada).
    let weightsWarning: string | null = null;
    try {
      this.validateWeights(criteria);
    } catch {
      weightsWarning = 'SELECTION_WEIGHTS_NOT_100';
    }

    // Dados partilhados por várias fontes — uma leitura só.
    const [reviews, leadershipScore, user] = await Promise.all([
      this.prisma.read.performanceReview.findMany({
        where: { userId },
        include: { cycle: { select: { scoreScale: true, startDate: true } } },
        orderBy: [{ cycle: { startDate: 'desc' } }, { createdAt: 'desc' }],
      }),
      this.prisma.read.leadershipScore.findUnique({ where: { userId } }),
      this.prisma.read.user.findUnique({ where: { id: userId }, select: { hireDate: true } }),
    ]);

    const ctx: FactorContext = { userId, reviews, leadershipScore, user, manualValues };
    const breakdown: EligibilityFactor[] = [];
    const missingData: string[] = [];

    for (const c of criteria) {
      const weight = Number(c.weight);
      const resolved = await this.resolveFactor(c, ctx);
      const normalizedValue = resolved.missing ? 0 : clamp(resolved.value);
      const factor: EligibilityFactor = {
        criterion: c.name,
        source: c.source,
        weight,
        required: Boolean(c.required),
        rawValue: resolved.rawValue,
        normalizedValue,
        weightedContribution: round2((weight * normalizedValue) / 100),
        missing: resolved.missing,
        meetsMinScore: c.minScore == null ? true : normalizedValue >= Number(c.minScore),
        minScore: c.minScore == null ? null : Number(c.minScore),
        note: resolved.note,
      };
      if (resolved.missing) {
        missingData.push(
          c.source === LeadershipCriterionSource.MANUAL ? `MANUAL:${c.name}` : c.source,
        );
      }
      breakdown.push(factor);
    }
    if (weightsWarning) missingData.push(weightsWarning);

    // Divisor = soma real dos pesos (== 100 quando a config é válida). Assim uma
    // config com pesos != 100 continua a devolver um score sensato e determinista.
    const totalWeight = breakdown.reduce((s, f) => s + f.weight, 0);
    const score =
      totalWeight > 0
        ? Math.round(breakdown.reduce((s, f) => s + f.weight * f.normalizedValue, 0) / totalWeight)
        : 0;

    // Elegível: passa a nota mínima E todos os critérios `required` têm dados e
    // cumprem o respectivo minScore.
    const requiredGatesPass = breakdown
      .filter(f => f.required)
      .every(f => !f.missing && f.meetsMinScore);
    const eligible = score >= LeadershipEligibilityService.PASS_MARK && requiredGatesPass;

    const result: EligibilityResult = { score, eligible, breakdown, missingData };
    if (persist) await this.persistSnapshot(programId, userId, result);
    return result;
  }

  private async resolveFactor(
    c: {
      name: string;
      source: LeadershipCriterionSource;
      competencyId?: number | null;
    },
    ctx: FactorContext,
  ): Promise<ResolvedFactor> {
    const S = LeadershipEligibilityService;
    switch (c.source) {
      case LeadershipCriterionSource.PERFORMANCE_REVIEW: {
        const r = ctx.reviews.find(x => x.score != null);
        if (!r) return miss('Sem PerformanceReview com score');
        const scale = r.cycle?.scoreScale ?? S.COMPETENCY_LEVEL_MAX;
        return {
          value: (Number(r.score) / scale) * 100,
          rawValue: Number(r.score),
          missing: false,
          note: `score ${r.score}/${scale}`,
        };
      }
      case LeadershipCriterionSource.NINE_BOX_POTENTIAL: {
        const r = ctx.reviews.find(x => x.potentialScore != null);
        if (!r) return miss('Sem potentialScore em PerformanceReview (eixo 9-box)');
        return {
          value: (Number(r.potentialScore) / S.NINE_BOX_MAX) * 100,
          rawValue: Number(r.potentialScore),
          missing: false,
          note: `potencial ${r.potentialScore}/${S.NINE_BOX_MAX}`,
        };
      }
      case LeadershipCriterionSource.LEADERSHIP_SCORE: {
        if (!ctx.leadershipScore) return miss('Sem LeadershipScore');
        return {
          value: (Number(ctx.leadershipScore.score) / S.LEADERSHIP_SCORE_MAX) * 100,
          rawValue: Number(ctx.leadershipScore.score),
          missing: false,
          note: `${ctx.leadershipScore.score}/${S.LEADERSHIP_SCORE_MAX}`,
        };
      }
      case LeadershipCriterionSource.FEEDBACK_360: {
        const fbs = await this.prisma.read.leadershipFeedback360.findMany({
          where: { leaderId: ctx.userId },
          include: { responses: { select: { score: true } } },
        });
        const scores = fbs.flatMap(f => f.responses.map(r => r.score));
        if (!scores.length) return miss('Sem feedback 360°');
        const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
        return {
          value: (avg / S.FEEDBACK_360_MAX) * 100,
          rawValue: round2(avg),
          missing: false,
          note: `média ${round2(avg)}/${S.FEEDBACK_360_MAX} (${scores.length} respostas)`,
        };
      }
      case LeadershipCriterionSource.COMPETENCY_ASSESSMENT: {
        if (c.competencyId != null) {
          const uc = await this.prisma.read.userCompetency.findUnique({
            where: { userId_competencyId: { userId: ctx.userId, competencyId: c.competencyId } },
            include: { competency: { select: { scaleMax: true } } },
          });
          if (uc) {
            const max = uc.competency?.scaleMax ?? S.COMPETENCY_LEVEL_MAX;
            return {
              value: (uc.currentLevel / max) * 100,
              rawValue: uc.currentLevel,
              missing: false,
              note: `UserCompetency nível ${uc.currentLevel}/${max}`,
            };
          }
          const ce = await this.prisma.read.competencyEvaluation.findFirst({
            where: { competencyId: c.competencyId, review: { userId: ctx.userId } },
            orderBy: { id: 'desc' },
          });
          if (ce) {
            return {
              value: (ce.evaluatedLevel / S.COMPETENCY_LEVEL_MAX) * 100,
              rawValue: ce.evaluatedLevel,
              missing: false,
              note: `CompetencyEvaluation nível ${ce.evaluatedLevel}/${S.COMPETENCY_LEVEL_MAX}`,
            };
          }
          return miss('Sem avaliação da competência-alvo');
        }
        const ucs = await this.prisma.read.userCompetency.findMany({
          where: { userId: ctx.userId },
          include: { competency: { select: { scaleMax: true } } },
        });
        if (!ucs.length) return miss('Sem competências avaliadas');
        const norm = ucs.map(
          u => (u.currentLevel / (u.competency?.scaleMax ?? S.COMPETENCY_LEVEL_MAX)) * 100,
        );
        const avg = norm.reduce((s, v) => s + v, 0) / norm.length;
        return {
          value: avg,
          rawValue: round2(avg),
          missing: false,
          note: `média de ${ucs.length} competências`,
        };
      }
      case LeadershipCriterionSource.TENURE: {
        if (!ctx.user?.hireDate) return miss('Sem data de admissão (User.hireDate)');
        const years = (Date.now() - new Date(ctx.user.hireDate).getTime()) / S.MS_PER_YEAR;
        return {
          value: clamp((years / S.TENURE_CAP_YEARS) * 100),
          rawValue: round2(years),
          missing: false,
          note: `${round2(years)} anos (cap ${S.TENURE_CAP_YEARS})`,
        };
      }
      case LeadershipCriterionSource.CAREER_HISTORY: {
        // CareerPlan/LegacyPdi legados são keyed por employeeId sem join fiável a
        // User → usam-se os equivalentes canónicos keyed por userId.
        const [careerPlans, devPlans] = await Promise.all([
          this.prisma.read.userCareerPlan.count({ where: { userId: ctx.userId } }),
          this.prisma.read.developmentPlan.count({ where: { userId: ctx.userId } }),
        ]);
        const total = careerPlans + devPlans;
        if (total === 0) return miss('Sem plano de carreira nem PDI');
        return {
          value: 100,
          rawValue: total,
          missing: false,
          note: `${total} registos de carreira/PDI (has-data → 100)`,
        };
      }
      case LeadershipCriterionSource.TRAINING_HISTORY: {
        const [completed, certs] = await Promise.all([
          this.prisma.read.enrollment.count({
            where: { userId: ctx.userId, status: 'COMPLETED' },
          }),
          this.prisma.read.certificate.count({ where: { userId: ctx.userId } }),
        ]);
        const total = completed + certs;
        if (total === 0) return miss('Sem formação concluída');
        return {
          value: clamp((total / S.TRAINING_CAP) * 100),
          rawValue: total,
          missing: false,
          note: `${total} conclusões (cap ${S.TRAINING_CAP})`,
        };
      }
      case LeadershipCriterionSource.MANUAL: {
        const raw = ctx.manualValues?.[c.name];
        if (raw == null || Number.isNaN(Number(raw))) return miss('Valor manual não fornecido');
        return {
          value: clamp(Number(raw)),
          rawValue: Number(raw),
          missing: false,
          note: 'Valor manual',
        };
      }
      default:
        return miss(`Fonte não suportada: ${c.source}`);
    }
  }

  private async persistSnapshot(
    programId: number,
    userId: number,
    result: EligibilityResult,
  ): Promise<void> {
    const data = {
      eligibilityScore: result.score,
      eligibilityBreakdown: JSON.stringify(result.breakdown),
      eligibilityMissingData: JSON.stringify(result.missingData),
      eligibilityComputedAt: new Date(),
    };
    await this.prisma.leadershipProgramParticipant.upsert({
      where: { userId_programId: { userId, programId } },
      // `status` tem @default(ENROLLED) no schema — uma linha de candidato tem de
      // nascer explicitamente como CANDIDATE.
      create: { userId, programId, status: ParticipantStatus.CANDIDATE, ...data },
      update: data,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Endpoints de gestão (manager-only via assertCanManageProgram)
  // ─────────────────────────────────────────────────────────────────────────

  /** Lista os candidatos do programa com a elegibilidade persistida.
   *  Compute-on-read: linhas sem snapshot são calculadas e persistidas agora. */
  async listCandidates(actor: CurrentUserData, programId: number) {
    await this.programsService.assertCanManageProgram(actor, programId);

    const rows = await this.prisma.read.leadershipProgramParticipant.findMany({
      where: { programId, status: { in: LeadershipEligibilityService.CANDIDATE_STATES } },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ eligibilityScore: 'desc' }, { id: 'asc' }],
    });

    const stale = rows.filter(r => r.eligibilityComputedAt == null);
    for (const r of stale) {
      await this.calculate(programId, r.userId, { persist: true });
    }

    const fresh = stale.length
      ? await this.prisma.read.leadershipProgramParticipant.findMany({
          where: { programId, status: { in: LeadershipEligibilityService.CANDIDATE_STATES } },
          include: { user: { select: { id: true, fullName: true, email: true } } },
          orderBy: [{ eligibilityScore: 'desc' }, { id: 'asc' }],
        })
      : rows;

    return fresh.map(r => ({
      ...r,
      eligibilityBreakdown: safeParse(r.eligibilityBreakdown, []),
      eligibilityMissingData: safeParse(r.eligibilityMissingData, []),
    }));
  }

  /** Recalcula + persiste o snapshot de um candidato e devolve o resultado fresco. */
  async recalculate(
    actor: CurrentUserData,
    programId: number,
    userId: number,
    dto?: { manualValues?: Record<string, number> },
  ): Promise<EligibilityResult> {
    await this.programsService.assertCanManageProgram(actor, programId);
    return this.calculate(programId, userId, { persist: true, manualValues: dto?.manualValues });
  }

  /** Transição CANDIDATE→SELECTED (cria a linha como CANDIDATE se não existir). */
  async selectCandidate(actor: CurrentUserData, programId: number, userId: number) {
    await this.programsService.assertCanManageProgram(actor, programId);

    const existing = await this.prisma.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
    });
    if (!existing) {
      await this.prisma.leadershipProgramParticipant.create({
        data: { userId, programId, status: ParticipantStatus.CANDIDATE },
      });
    }
    return this.transitionParticipant(programId, userId, ParticipantStatus.SELECTED, actor.id);
  }

  /** Avança o participante pela máquina de estados da selecção. */
  async advanceSelection(
    actor: CurrentUserData,
    programId: number,
    userId: number,
    target: ParticipantStatus,
  ) {
    await this.programsService.assertCanManageProgram(actor, programId);
    return this.transitionParticipant(programId, userId, target, actor.id);
  }

  private async transitionParticipant(
    programId: number,
    userId: number,
    target: ParticipantStatus,
    actorId: number,
  ) {
    const participant = await this.prisma.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
    });
    if (!participant) {
      throw new NotFoundException('Participante não encontrado neste programa');
    }
    const allowed = LeadershipEligibilityService.SELECTION_TRANSITIONS[participant.status] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(
        `Transição de estado de participante inválida: ${participant.status} → ${target}`,
      );
    }

    const now = new Date();
    const data: Prisma.LeadershipProgramParticipantUncheckedUpdateInput = { status: target };
    if (target === ParticipantStatus.SELECTED) {
      data.selectedAt = now;
      data.selectedById = actorId;
    } else if (target === ParticipantStatus.INVITED) {
      data.invitedAt = now;
    } else if (target === ParticipantStatus.ENROLLED) {
      data.enrolledAt = now;
    } else if (target === ParticipantStatus.IN_PROGRESS) {
      data.startedAt = now;
    } else if (target === ParticipantStatus.COMPLETED) {
      data.completedAt = now;
    } else if (target === ParticipantStatus.WITHDRAWN) {
      data.withdrawnAt = now;
    }

    return this.prisma.leadershipProgramParticipant.update({
      where: { userId_programId: { userId, programId } },
      data,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface EligibilityFactor {
  criterion: string;
  source: LeadershipCriterionSource;
  weight: number;
  required: boolean;
  /** Valor na escala nativa da fonte (null quando ausente). */
  rawValue: number | null;
  /** Valor normalizado 0-100 (0 quando ausente). */
  normalizedValue: number;
  /** `weight * normalizedValue / 100`. */
  weightedContribution: number;
  missing: boolean;
  meetsMinScore: boolean;
  minScore: number | null;
  note?: string;
}

export interface EligibilityResult {
  score: number;
  eligible: boolean;
  breakdown: EligibilityFactor[];
  missingData: string[];
}

interface FactorContext {
  userId: number;
  reviews: Array<{
    score: number | null;
    potentialScore: number | null;
    createdAt: Date;
    cycle?: { scoreScale: number | null } | null;
  }>;
  leadershipScore: { score: number } | null;
  user: { hireDate: Date | null } | null;
  manualValues: Record<string, number>;
}

interface ResolvedFactor {
  value: number;
  rawValue: number | null;
  missing: boolean;
  note?: string;
}

function miss(note: string): ResolvedFactor {
  return { value: 0, rawValue: null, missing: true, note };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

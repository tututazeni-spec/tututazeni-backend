// src/succession/succession.service.ts
import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import {
  Prisma,
  SuccessorPriority,
  BusinessImpact,
  ReplacementTime,
  RiskLevel,
  ReadinessLevel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DevelopmentPlansService } from '../development-plans/development-plans.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/decorators';
import {
  CreateCriticalPositionDto,
  UpdateCriticalPositionDto,
  SuccessionCreateSuccessionPlanDto,
  UpdateSuccessionPlanDto,
  AddToTalentPoolDto,
  GeneratePDIDto,
  SuccessionFilterDto,
  CriticalPositionFilterDto,
  GetSuccessionMatrixFilterDto,
} from './succession.dto';

interface AlertInput {
  _count?: { successionPlans: number };
  successionPlans?: unknown[];
  exitRisk: string;
  expectedExitDate: Date | null;
}

interface MatchScoreInput {
  criticalPosition?: {
    position?: {
      competencies?: Array<{ competencyId: number; requiredLevel: number }>;
    } | null;
  } | null;
  candidate?: {
    userCompetencies?: Array<{ competencyId: number; currentLevel: number | null }>;
    performanceReviews?: Array<{ score: number | null }>;
    hireDate?: Date | null;
    // Secção 7, acrescento 4: eixo "Potencial" do pipeline — reaproveita a
    // mesma classificação 9-box usada em career.getTalentHeatmap(), última
    // colocação do candidato (independente do ciclo).
    nineBoxPlacements?: Array<{ potentialAxis: number }>;
  } | null;
}

@Injectable()
export class SuccessionService {
  private readonly logger = new Logger(SuccessionService.name);

  constructor(
    private prisma: PrismaService,
    private readonly developmentPlans: DevelopmentPlansService,
    private readonly audit: AuditService,
  ) {}

  // ─── CARGOS CRÍTICOS ──────────────────────────────────────────────────────

  async createCriticalPosition(dto: CreateCriticalPositionDto, userId: number) {
    const position = await this.prisma.read.position.findUnique({ where: { id: dto.positionId } });
    if (!position) throw new NotFoundException('Posição não encontrada');

    const exists = await this.prisma.criticalPosition.findUnique({
      where: { positionId: dto.positionId },
    });
    if (exists) throw new ConflictException('Esta posição já está classificada como crítica');

    const exitRisk =
      dto.exitRisk ??
      this.computeExitRisk({
        businessImpact: dto.businessImpact,
        replacementTime: dto.replacementTime,
        readinessLevels: [],
        minSuccessorsRequired: dto.minSuccessorsRequired ?? 2,
        actualSuccessorCount: 0,
      });

    const created = await this.prisma.criticalPosition.create({
      data: {
        positionId: dto.positionId,
        businessImpact: dto.businessImpact,
        replacementTime: dto.replacementTime,
        exitRisk,
        expectedExitDate: dto.expectedExitDate ? new Date(dto.expectedExitDate) : null,
        criticalReason: dto.criticalReason,
        keyPersonRisk: dto.keyPersonRisk ?? false,
        minSuccessorsRequired: dto.minSuccessorsRequired ?? 2,
        requiresDocumentation: dto.requiresDocumentation ?? false,
      },
      include: { position: true },
    });

    await this.logSuccessionHistory(userId, 'CREATE', 'CriticalPosition', created.id, {
      position: created.position.name,
      businessImpact: created.businessImpact,
      exitRisk: created.exitRisk,
    });

    return created;
  }

  async getCriticalPositions(filters: CriticalPositionFilterDto) {
    const {
      page = 1,
      limit = 20,
      businessImpact,
      exitRisk,
      departmentId,
      withoutSuccessor,
    } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.CriticalPositionWhereInput = {};
    if (businessImpact) where.businessImpact = businessImpact;
    if (exitRisk) where.exitRisk = exitRisk;
    if (departmentId) where.position = { departmentId };

    const [data, total] = await Promise.all([
      this.prisma.read.criticalPosition.findMany({
        where,
        skip,
        take: limit,
        include: {
          position: {
            select: {
              id: true,
              name: true,
              level: true,
              users: {
                select: { id: true, fullName: true, avatarUrl: true, hireDate: true },
                take: 1,
              },
            },
          },
          successionPlans: {
            include: {
              candidate: { select: { id: true, fullName: true, avatarUrl: true } },
            },
          },
          _count: { select: { successionPlans: true } },
        },
        orderBy: [{ exitRisk: 'desc' }, { businessImpact: 'desc' }],
      }),
      this.prisma.read.criticalPosition.count({ where }),
    ]);

    // Filtrar cargos sem sucessores (pós-query para simplificar)
    const filtered = withoutSuccessor
      ? data.filter(cp => cp._count.successionPlans < (cp.minSuccessorsRequired ?? 2))
      : data;

    return {
      data: filtered.map(cp => ({
        ...cp,
        coverageStatus: this.calcCoverageStatus(
          cp._count.successionPlans,
          cp.minSuccessorsRequired ?? 2,
        ),
        daysUntilExit: cp.expectedExitDate ? this.daysUntil(cp.expectedExitDate) : null,
        alert: this.buildAlert(cp),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOneCriticalPosition(id: number) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { id },
      include: {
        position: {
          include: {
            users: {
              select: { id: true, fullName: true, avatarUrl: true, hireDate: true, email: true },
            },
            competencies: { include: { competency: true } },
          },
        },
        successionPlans: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                email: true,
                position: { select: { name: true } },
                department: { select: { name: true } },
                hireDate: true,
                userCompetencies: { include: { competency: true }, take: 10 },
                performanceReviews: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { score: true, category: true },
                },
                nineBoxPlacements: {
                  orderBy: { updatedAt: 'desc' },
                  take: 1,
                  select: { potentialAxis: true },
                },
              },
            },
            // Secção 7, acrescento 3 (plano de preparação do sucessor):
            // resumo do DevelopmentPlan já gerado (se algum) — o detalhe
            // completo (adicionar mentoring/coaching/job rotation/exposição
            // à liderança) continua a viver no módulo PDI, não se duplica
            // aqui, mesmo padrão do separador "PDI & Desenvolvimento".
            developmentPlan: {
              select: {
                id: true,
                status: true,
                overallProgress: true,
                actions: { select: { type: true, status: true } },
              },
            },
          },
          orderBy: { priority: 'asc' },
        },
        _count: { select: { successionPlans: true } },
      },
    });
    if (!cp) throw new NotFoundException('Cargo crítico não encontrado');

    // Enriquecer cada sucessor com a quebra Desempenho/Potencial/
    // Competências/Gaps (acrescento 4) — o matchScore guardado no plano
    // continua a ser a fonte da % apresentada; isto só acrescenta o detalhe
    // por eixo, sem o recalcular nem o persistir.
    const successionPlans = await Promise.all(
      cp.successionPlans.map(async sp => {
        const match = await this.calculateMatchScore({
          criticalPosition: { position: { competencies: cp.position?.competencies ?? [] } },
          candidate: sp.candidate,
        });
        return { ...sp, matchDetails: match.details };
      }),
    );

    return { ...cp, successionPlans };
  }

  async updateCriticalPosition(id: number, dto: UpdateCriticalPositionDto, userId: number) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { id },
      include: { successionPlans: { select: { readinessLevel: true } } },
    });
    if (!cp) throw new NotFoundException('Cargo crítico não encontrado');

    // Só recalcula quando o chamador não fixa exitRisk explicitamente (e não
    // mexe num valor CRITICAL manual — ver computeExitRisk()).
    const exitRisk =
      dto.exitRisk ??
      (cp.exitRisk === RiskLevel.CRITICAL
        ? undefined
        : this.computeExitRisk({
            businessImpact: dto.businessImpact ?? cp.businessImpact,
            replacementTime: dto.replacementTime ?? cp.replacementTime,
            readinessLevels: cp.successionPlans.map(sp => sp.readinessLevel),
            minSuccessorsRequired: dto.minSuccessorsRequired ?? cp.minSuccessorsRequired,
            actualSuccessorCount: cp.successionPlans.length,
          }));

    const updated = await this.prisma.criticalPosition.update({
      where: { id },
      data: { ...dto, exitRisk },
    });

    await this.logSuccessionHistory(userId, 'UPDATE', 'CriticalPosition', id, {
      exitRiskBefore: cp.exitRisk,
      exitRiskAfter: updated.exitRisk,
      businessImpactBefore: cp.businessImpact,
      businessImpactAfter: updated.businessImpact,
    });

    return updated;
  }

  // ─── PLANOS DE SUCESSÃO ───────────────────────────────────────────────────

  async findAll(filters: SuccessionFilterDto) {
    const {
      page = 1,
      limit = 20,
      criticalPositionId,
      candidateId,
      readinessLevel,
      priority,
      departmentId,
    } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.SuccessionPlanWhereInput = {};
    if (criticalPositionId) where.criticalPositionId = criticalPositionId;
    if (candidateId) where.candidateId = candidateId;
    if (readinessLevel) where.readinessLevel = readinessLevel;
    if (priority) where.priority = priority;
    if (departmentId) where.candidate = { departmentId };

    const [data, total] = await Promise.all([
      this.prisma.read.successionPlan.findMany({
        where,
        skip,
        take: limit,
        include: {
          criticalPosition: {
            include: { position: { select: { id: true, name: true, level: true } } },
          },
          candidate: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              email: true,
              position: { select: { name: true } },
              department: { select: { name: true } },
              hireDate: true,
            },
          },
        },
        orderBy: [{ priority: 'asc' }, { readinessLevel: 'asc' }],
      }),
      this.prisma.read.successionPlan.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const s = await this.prisma.read.successionPlan.findUnique({
      where: { id },
      include: {
        criticalPosition: {
          include: {
            position: {
              include: { competencies: { include: { competency: true } } },
            },
          },
        },
        candidate: {
          include: {
            userCompetencies: { include: { competency: true } },
            performanceReviews: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { score: true, category: true, cycle: { select: { name: true } } },
            },
            learningPathEnrollments: {
              where: { status: 'COMPLETED' },
              include: { learningPath: { select: { title: true } } },
              take: 5,
            },
            nineBoxPlacements: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { potentialAxis: true },
            },
          },
        },
        pdi: true,
      },
    });
    if (!s) throw new NotFoundException('Plano de sucessão não encontrado');

    // Calcular match
    const match = await this.calculateMatchScore(s);

    return { ...s, matchScore: match.score, matchDetails: match.details };
  }

  async create(dto: SuccessionCreateSuccessionPlanDto, userId: number) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { id: dto.criticalPositionId },
    });
    if (!cp) throw new NotFoundException('Cargo crítico não encontrado');

    const candidate = await this.prisma.read.user.findUnique({ where: { id: dto.candidateId } });
    if (!candidate) throw new NotFoundException('Candidato não encontrado');

    // Verificar duplicação
    const exists = await this.prisma.successionPlan.findFirst({
      where: { criticalPositionId: dto.criticalPositionId, candidateId: dto.candidateId },
    });
    if (exists) throw new ConflictException('Candidato já está no plano de sucessão deste cargo');

    // Calcular match score automaticamente se não fornecido
    let matchScore = dto.matchScore;
    if (!matchScore) {
      const autoMatch = await this.calculateMatchScoreForCandidate(
        dto.criticalPositionId,
        dto.candidateId,
      );
      matchScore = autoMatch.score;
    }

    // `priority` pode vir do DTO (caminho `/succession`) ou ser calculada por
    // contagem posicional (caminho `/career/succession`, que nunca a envia) —
    // Fase G2 unificou as duas regras num só sítio.
    const priority = dto.priority ?? (await this.computePriority(dto.criticalPositionId));

    const data: Prisma.SuccessionPlanUncheckedCreateInput = {
      criticalPositionId: dto.criticalPositionId,
      // SuccessionPlan.positionId é uma FK obrigatória (sem default) para
      // Position — o próprio schema comenta "verificar o tipo", indício de
      // ter sido adicionado e nunca ligado ao código; sem isto, criar um
      // plano de sucessão rebentava sempre com "Argument positionId is
      // missing". O cargo crítico já referencia a posição, por isso
      // reutiliza-se o mesmo positionId em vez de o pedir de novo ao caller.
      positionId: cp.positionId,
      candidateId: dto.candidateId,
      readinessLevel: dto.readinessLevel,
      priority,
      matchScore,
      geographicMobility: dto.geographicMobility ?? true,
      available: dto.available ?? true,
      notes: dto.notes,
      readinessByDate: dto.readinessByDate ? new Date(dto.readinessByDate) : null,
    };
    let plan;
    try {
      plan = await this.prisma.successionPlan.create({
        data,
        include: {
          criticalPosition: { include: { position: true } },
          candidate: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Candidato já está no plano de sucessão deste cargo');
      }
      throw e;
    }

    // Notificar RH
    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.candidateId,
          type: 'SUCCESSION_PLAN_ADDED',
          message: `Você foi adicionado ao plano de sucessão`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e =>
        this.logger.warn({
          userId: dto.candidateId,
          criticalPositionId: dto.criticalPositionId,
          action: 'SUCCESSION_PLAN_ADDED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar candidato de adição ao plano de sucessão',
        }),
      );

    await this.recomputeExitRisk(dto.criticalPositionId).catch(e =>
      this.logger.warn({
        criticalPositionId: dto.criticalPositionId,
        action: 'RECOMPUTE_EXIT_RISK',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao recalcular risco de saída após criação de plano de sucessão',
      }),
    );

    await this.logSuccessionHistory(userId, 'CREATE', 'SuccessionPlan', plan.id, {
      criticalPositionId: dto.criticalPositionId,
      // Usa o `candidate` já validado acima, não `plan.candidate` — este
      // spec (unit) faz mock de `successionPlan.create` sem o `include`
      // real, e ler daqui evita depender desse shape.
      candidate: candidate.fullName,
      readinessLevel: plan.readinessLevel,
      priority: plan.priority,
    });

    return plan;
  }

  /**
   * Regra de `priority` portada de `career.createSuccessionPlan` (Fase G2):
   * contagem posicional dos planos já existentes para o cargo crítico —
   * 0 → PRIMARY, 1 → SECONDARY, >=2 → TERTIARY. Usada só quando o DTO não
   * traz `priority` (caminho `/career/succession`).
   */
  private async computePriority(criticalPositionId: number): Promise<SuccessorPriority> {
    const count = await this.prisma.successionPlan.count({ where: { criticalPositionId } });
    return count === 0 ? 'PRIMARY' : count === 1 ? 'SECONDARY' : 'TERTIARY';
  }

  async update(id: number, dto: UpdateSuccessionPlanDto, userId: number) {
    const existing = await this.findOne(id);
    const updated = await this.prisma.successionPlan.update({ where: { id }, data: dto });

    if (dto.readinessLevel && dto.readinessLevel !== existing.readinessLevel) {
      await this.recomputeExitRisk(existing.criticalPositionId).catch(e =>
        this.logger.warn({
          criticalPositionId: existing.criticalPositionId,
          action: 'RECOMPUTE_EXIT_RISK',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao recalcular risco de saída após actualização de plano de sucessão',
        }),
      );
    }

    await this.logSuccessionHistory(userId, 'UPDATE', 'SuccessionPlan', id, {
      criticalPositionId: existing.criticalPositionId,
      readinessLevelBefore: existing.readinessLevel,
      readinessLevelAfter: updated.readinessLevel,
      priorityBefore: existing.priority,
      priorityAfter: updated.priority,
      availableBefore: existing.available,
      availableAfter: updated.available,
    });

    return updated;
  }

  async remove(id: number, userId: number) {
    const existing = await this.findOne(id);
    await this.prisma.successionPlan.delete({ where: { id } });

    await this.recomputeExitRisk(existing.criticalPositionId).catch(e =>
      this.logger.warn({
        criticalPositionId: existing.criticalPositionId,
        action: 'RECOMPUTE_EXIT_RISK',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao recalcular risco de saída após remoção de plano de sucessão',
      }),
    );

    await this.logSuccessionHistory(userId, 'DELETE', 'SuccessionPlan', id, {
      criticalPositionId: existing.criticalPositionId,
      candidate: existing.candidate.fullName,
    });

    return { message: 'Plano de sucessão removido' };
  }

  // ─── CÁLCULO DE MATCH ─────────────────────────────────────────────────────

  private async calculateMatchScoreForCandidate(criticalPositionId: number, candidateId: number) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { id: criticalPositionId },
      include: { position: { include: { competencies: true } } },
    });
    const candidate = await this.prisma.read.user.findUnique({
      where: { id: candidateId },
      include: {
        userCompetencies: true,
        performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
        nineBoxPlacements: { orderBy: { updatedAt: 'desc' }, take: 1, select: { potentialAxis: true } },
      },
    });

    return this.calculateMatchScore({ criticalPosition: cp, candidate });
  }

  private async calculateMatchScore(plan: MatchScoreInput) {
    const requiredComps = plan.criticalPosition?.position?.competencies ?? [];
    const userComps = plan.candidate?.userCompetencies ?? [];
    const userCompMap = new Map(userComps.map(uc => [uc.competencyId, uc.currentLevel ?? 0]));

    // Score de competências (40%)
    let compScore = 0;
    if (requiredComps.length > 0) {
      const met = requiredComps.filter(
        rc => (userCompMap.get(rc.competencyId) ?? 0) >= rc.requiredLevel,
      ).length;
      compScore = (met / requiredComps.length) * 100;
    } else {
      compScore = 50; // sem competências definidas → neutro
    }

    // Score de performance (40%)
    const latestReview = plan.candidate?.performanceReviews?.[0];
    let perfScore = 50; // neutro se sem avaliação
    if (latestReview?.score) {
      perfScore = Math.min(100, (latestReview.score / 5) * 100);
    }

    // Score de experiência / tempo de empresa (20%)
    const hireDate = plan.candidate?.hireDate ? new Date(plan.candidate.hireDate) : null;
    const yearsExp = hireDate ? (Date.now() - hireDate.getTime()) / (365.25 * 24 * 3600 * 1000) : 0;
    const expScore = Math.min(100, yearsExp * 10); // 10 anos = 100%

    const finalScore = Math.round(compScore * 0.4 + perfScore * 0.4 + expScore * 0.2);

    // "Potencial" (secção 7, acrescento 4) — eixo próprio, informativo, NÃO
    // entra no matchScore ponderado acima (esse continua
    // competências/desempenho/experiência, como sempre foi). 9-box:
    // potentialAxis 1-5 → 0-100; sem colocação 9-box → null (não "neutro
    // 50", para o front distinguir "sem dado" de "potencial médio").
    const latestPlacement = plan.candidate?.nineBoxPlacements?.[0];
    const potentialScore =
      latestPlacement != null ? Math.round((latestPlacement.potentialAxis / 5) * 100) : null;

    const gaps = requiredComps
      .filter(rc => (userCompMap.get(rc.competencyId) ?? 0) < rc.requiredLevel)
      .map(rc => ({
        competencyId: rc.competencyId,
        requiredLevel: rc.requiredLevel,
        currentLevel: userCompMap.get(rc.competencyId) ?? 0,
        gap: Number(rc.requiredLevel) - Number(userCompMap.get(rc.competencyId) ?? 0),
      }));

    return {
      score: finalScore,
      details: { compScore, perfScore, expScore, potentialScore, gaps },
    };
  }

  // ─── TALENT POOL ──────────────────────────────────────────────────────────

  async getTalentPool() {
    return this.prisma.read.talentPool.findMany({
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            email: true,
            hireDate: true,
            position: { select: { name: true } },
            department: { select: { name: true } },
            userCompetencies: { include: { competency: true }, take: 5 },
            performanceReviews: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { score: true, category: true },
            },
          },
        },
        mentor: { select: { id: true, fullName: true, position: { select: { name: true } } } },
      },
      orderBy: { readinessLevel: 'asc' },
    });
  }

  async addToTalentPool(dto: AddToTalentPoolDto) {
    const exists = await this.prisma.talentPool.findUnique({ where: { userId: dto.userId } });
    if (exists) throw new ConflictException('Colaborador já está no Talent Pool');

    return this.prisma.talentPool.create({
      data: {
        userId: dto.userId,
        readinessLevel: dto.readinessLevel,
        mentorId: dto.mentorId,
        notes: dto.notes,
        geographicMobility: dto.geographicMobility ?? true,
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }

  async removeFromTalentPool(userId: number) {
    const entry = await this.prisma.read.talentPool.findUnique({ where: { userId } });
    if (!entry) throw new NotFoundException('Colaborador não está no Talent Pool');
    await this.prisma.talentPool.delete({ where: { userId } });
    return { message: 'Removido do Talent Pool' };
  }

  // ─── PDI ──────────────────────────────────────────────────────────────────
  // DEPRECATED (escrita): já não cria/actualiza SuccessionPDI — delega no
  // DevelopmentPlansService para produzir um DevelopmentPlan real
  // (origin=SUCCESSION, successionPlanId preenchido), o único dono de escrita
  // de DevelopmentPlan. Mantém a mesma rota e forma do DTO para não partir o
  // FE existente.
  async generatePDI(dto: GeneratePDIDto, actingUser: CurrentUserData) {
    const plan = await this.findOne(dto.successionPlanId);

    // Buscar gaps automáticos
    const gaps = plan.matchDetails?.gaps ?? [];
    const gapCompIds = gaps.map(g => g.competencyId);

    // Sugerir cursos mapeados aos gaps
    const suggestedCourses = await this.prisma.read.courseCompetency.findMany({
      where: { competencyId: { in: gapCompIds } },
      include: { course: { select: { id: true, title: true, thumbnailUrl: true } } },
      take: 10,
    });

    const suggestedLPs = await this.prisma.read.learningPath.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, title: true, pathType: true },
      take: 5,
    });

    const positionName = plan.criticalPosition?.position?.name ?? 'o cargo crítico';
    const developmentGoals =
      dto.developmentGoals ?? `Desenvolver competências para ${positionName}`;
    const competencyGaps = gaps.map(g => ({
      competencyId: g.competencyId,
      currentLevel: g.currentLevel,
      targetLevel: g.requiredLevel,
    }));

    const existing = await this.prisma.read.developmentPlan.findUnique({
      where: { successionPlanId: dto.successionPlanId },
    });

    let developmentPlan;
    if (existing) {
      developmentPlan = await this.developmentPlans.update(existing.id, {
        goal: developmentGoals,
        competencyGaps,
      });
    } else {
      const created = await this.developmentPlans.create({
        name: `Preparação para sucessão — ${positionName}`,
        goal: developmentGoals,
        userId: plan.candidateId,
        origin: 'SUCCESSION',
        successionPlanId: dto.successionPlanId,
        priority: 'HIGH',
        competencyGaps,
      });
      // Ao contrário de um PDI criado manualmente, este nasce já com os gaps
      // e o plano de acção definidos automaticamente — não faz sentido
      // passar por DRAFT/aprovação. Mantém o comportamento do antigo
      // SuccessionPDI (sempre ACTIVE desde a criação).
      developmentPlan = await this.developmentPlans.update(created.id, { status: 'ACTIVE' });
    }

    const courseIds = dto.courseIds ?? suggestedCourses.slice(0, 5).map(cc => cc.courseId);
    for (const courseId of courseIds) {
      await this.developmentPlans
        .addAction(
          {
            planId: developmentPlan.id,
            title: `Curso recomendado #${courseId}`,
            type: 'COURSE',
            courseId,
          },
          actingUser,
        )
        .catch(e =>
          this.logger.warn({
            developmentPlanId: developmentPlan.id,
            courseId,
            action: 'SUCCESSION_PDI_ADD_COURSE_ACTION',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao adicionar acção de curso recomendado ao PDI de sucessão',
          }),
        );
    }

    return {
      pdi: developmentPlan,
      suggestedCourses: suggestedCourses.map(cc => cc.course),
      suggestedLPs,
    };
  }

  // ─── SUMÁRIO POR CARGO ────────────────────────────────────────────────────

  async getPositionSummary(positionId: number) {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { positionId },
      include: {
        position: {
          include: {
            users: { select: { id: true, fullName: true, avatarUrl: true }, take: 1 },
            competencies: { include: { competency: { select: { id: true, name: true } } } },
          },
        },
        successionPlans: {
          include: {
            candidate: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                position: { select: { name: true } },
                performanceReviews: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { score: true, category: true },
                },
              },
            },
          },
          orderBy: [{ priority: 'asc' }, { readinessLevel: 'asc' }],
        },
      },
    });
    if (!cp) throw new NotFoundException('Posição não encontrada como cargo crítico');

    const byReadiness = {
      READY_NOW: cp.successionPlans.filter(sp => sp.readinessLevel === 'READY_NOW'),
      READY_SOON: cp.successionPlans.filter(sp => sp.readinessLevel === 'READY_SOON'),
      READY_1_2_YEARS: cp.successionPlans.filter(sp => sp.readinessLevel === 'READY_1_2_YEARS'),
      READY_2_3_YEARS: cp.successionPlans.filter(sp => sp.readinessLevel === 'READY_2_3_YEARS'),
      NEEDS_DEVELOPMENT: cp.successionPlans.filter(sp => sp.readinessLevel === 'NEEDS_DEVELOPMENT'),
    };

    const coverageStatus = this.calcCoverageStatus(
      cp.successionPlans.length,
      cp.minSuccessorsRequired ?? 2,
    );

    return {
      criticalPosition: cp,
      byReadiness,
      total: cp.successionPlans.length,
      coverageStatus,
      alert: this.buildAlert(cp),
      daysUntilExit: cp.expectedExitDate ? this.daysUntil(cp.expectedExitDate) : null,
    };
  }

  // ─── ORGANOGRAMA DE SUCESSÃO ──────────────────────────────────────────────

  async getOrganizationChart(departmentId?: number) {
    const where: Prisma.CriticalPositionWhereInput = {};
    if (departmentId) where.position = { departmentId };

    // Position não tem relação `department` (só o escalar `departmentId`) —
    // sem uma relação para incluir, faz-se uma segunda query em lote (mesmo
    // padrão já usado noutros módulos: courses/reports) para anexar o nome
    // do departamento.
    const criticalPositions = await this.prisma.criticalPosition.findMany({
      where,
      include: {
        position: {
          select: {
            id: true,
            name: true,
            level: true,
            departmentId: true,
            users: { select: { id: true, fullName: true, avatarUrl: true }, take: 1 },
          },
        },
        successionPlans: {
          include: {
            candidate: { select: { id: true, fullName: true, avatarUrl: true } },
          },
          orderBy: { priority: 'asc' },
          take: 3,
        },
        _count: { select: { successionPlans: true } },
      },
      orderBy: [{ businessImpact: 'desc' }, { exitRisk: 'desc' }],
      take: 50,
    });

    const deptIds = [
      ...new Set(criticalPositions.map(cp => cp.position?.departmentId).filter(Boolean)),
    ];
    const depts = deptIds.length
      ? await this.prisma.read.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true },
        })
      : [];
    const deptMap = new Map(depts.map(d => [d.id, d]));

    return criticalPositions.map(cp => ({
      id: cp.id,
      position: {
        ...cp.position,
        department: cp.position?.departmentId
          ? (deptMap.get(cp.position.departmentId) ?? null)
          : null,
      },
      exitRisk: cp.exitRisk,
      businessImpact: cp.businessImpact,
      keyPersonRisk: cp.keyPersonRisk,
      daysUntilExit: cp.expectedExitDate ? this.daysUntil(cp.expectedExitDate) : null,
      coverageStatus: this.calcCoverageStatus(
        cp._count.successionPlans,
        cp.minSuccessorsRequired ?? 2,
      ),
      successors: cp.successionPlans.map(sp => ({
        ...sp.candidate,
        readinessLevel: sp.readinessLevel,
        priority: sp.priority,
        matchScore: sp.matchScore,
      })),
    }));
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────

  async getDashboard() {
    const [totalCritical, withoutSuccessor, readyNowCount, highRisk, allPlans] = await Promise.all([
      this.prisma.read.criticalPosition.count(),
      this.prisma.read.criticalPosition.count({
        where: { successionPlans: { none: {} } },
      }),
      this.prisma.read.successionPlan.count({ where: { readinessLevel: 'READY_NOW' } }),
      this.prisma.read.criticalPosition.count({
        where: { exitRisk: { in: ['HIGH', 'CRITICAL'] } },
      }),
      this.prisma.read.successionPlan.findMany({
        select: { matchScore: true, readinessLevel: true, criticalPositionId: true },
      }),
    ]);

    const avgMatchScore = allPlans.length
      ? Math.round(allPlans.reduce((s, p) => s + (p.matchScore ?? 0), 0) / allPlans.length)
      : 0;

    const readinessIndex =
      totalCritical > 0 ? Math.round((readyNowCount / totalCritical) * 100) : 0;

    const coverageRate =
      totalCritical > 0
        ? Math.round(((totalCritical - withoutSuccessor) / totalCritical) * 100)
        : 0;

    // Alertas críticos
    const criticalAlerts = await this.prisma.read.criticalPosition.findMany({
      where: {
        OR: [
          { exitRisk: 'CRITICAL' },
          { expectedExitDate: { lte: new Date(Date.now() + 90 * 24 * 3600 * 1000) } },
          { successionPlans: { none: {} } },
        ],
      },
      include: { position: { select: { name: true } } },
      take: 10,
    });

    return {
      kpis: {
        totalCriticalPositions: totalCritical,
        withoutSuccessor,
        coverageRate,
        readinessIndex,
        highRiskPositions: highRisk,
        avgMatchScore,
      },
      criticalAlerts: criticalAlerts.map(ca => ({
        id: ca.id,
        position: ca.position.name,
        exitRisk: ca.exitRisk,
        alert: this.buildAlert(ca),
        daysUntilExit: ca.expectedExitDate ? this.daysUntil(ca.expectedExitDate) : null,
      })),
    };
  }

  // ─── COMPARADOR DE PERFIS ─────────────────────────────────────────────────

  async compareProfiles(candidateAId: number, candidateBId: number, criticalPositionId: number) {
    const [a, b, cp] = await Promise.all([
      this.prisma.read.user.findUnique({
        where: { id: candidateAId },
        include: {
          userCompetencies: { include: { competency: true } },
          performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
          nineBoxPlacements: { orderBy: { updatedAt: 'desc' }, take: 1, select: { potentialAxis: true } },
        },
      }),
      this.prisma.read.user.findUnique({
        where: { id: candidateBId },
        include: {
          userCompetencies: { include: { competency: true } },
          performanceReviews: { orderBy: { createdAt: 'desc' }, take: 1 },
          nineBoxPlacements: { orderBy: { updatedAt: 'desc' }, take: 1, select: { potentialAxis: true } },
        },
      }),
      this.prisma.read.criticalPosition.findUnique({
        where: { id: criticalPositionId },
        include: { position: { include: { competencies: { include: { competency: true } } } } },
      }),
    ]);

    if (!a || !b) throw new NotFoundException('Candidato não encontrado');

    const [matchA, matchB] = await Promise.all([
      this.calculateMatchScore({ criticalPosition: cp, candidate: a }),
      this.calculateMatchScore({ criticalPosition: cp, candidate: b }),
    ]);

    return { candidateA: { user: a, match: matchA }, candidateB: { user: b, match: matchB } };
  }

  // ─── RISCO DE SAÍDA CALCULADO ─────────────────────────────────────────────
  // Módulo Career, secção 7 (Sucessão): "risco baseado em critérios
  // configuráveis, e não numa classificação manual". Pontua impacto de
  // negócio + tempo de substituição + cobertura de sucessores + prontidão
  // do pipeline. Nunca devolve CRITICAL — esse nível fica reservado para
  // classificação manual explícita via UpdateCriticalPositionDto.exitRisk.
  private computeExitRisk(input: {
    businessImpact: BusinessImpact;
    replacementTime: ReplacementTime;
    readinessLevels: ReadinessLevel[];
    minSuccessorsRequired: number;
    actualSuccessorCount: number;
  }): RiskLevel {
    const impactScore: Record<BusinessImpact, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };
    const replacementScore: Record<ReplacementTime, number> = {
      IMMEDIATE: 1,
      SHORT_TERM: 2,
      MEDIUM_TERM: 3,
      LONG_TERM: 4,
    };

    const coveragePenalty = input.actualSuccessorCount < input.minSuccessorsRequired ? 2 : 0;
    const hasNearTermSuccessor = input.readinessLevels.some(
      r => r === ReadinessLevel.READY_NOW || r === ReadinessLevel.READY_SOON,
    );
    const readinessPenalty = hasNearTermSuccessor ? 0 : 2;

    const total =
      impactScore[input.businessImpact] +
      replacementScore[input.replacementTime] +
      coveragePenalty +
      readinessPenalty;

    if (total <= 4) return RiskLevel.LOW;
    if (total <= 7) return RiskLevel.MEDIUM;
    return RiskLevel.HIGH;
  }

  // Recalcula e persiste o exitRisk de um cargo crítico a partir do estado
  // actual dos seus planos de sucessão — chamado (best-effort, nunca bloqueia
  // a escrita principal) sempre que um SuccessionPlan é criado/actualizado/
  // removido. Preserva CRITICAL quando já foi atribuído manualmente.
  private async recomputeExitRisk(criticalPositionId: number): Promise<void> {
    const cp = await this.prisma.read.criticalPosition.findUnique({
      where: { id: criticalPositionId },
      include: { successionPlans: { select: { readinessLevel: true } } },
    });
    if (!cp || cp.exitRisk === RiskLevel.CRITICAL) return;

    const exitRisk = this.computeExitRisk({
      businessImpact: cp.businessImpact,
      replacementTime: cp.replacementTime,
      readinessLevels: cp.successionPlans.map(sp => sp.readinessLevel),
      minSuccessorsRequired: cp.minSuccessorsRequired,
      actualSuccessorCount: cp.successionPlans.length,
    });

    if (exitRisk !== cp.exitRisk) {
      await this.prisma.criticalPosition.update({
        where: { id: criticalPositionId },
        data: { exitRisk },
      });
    }
  }

  // ─── MATRIZ DE SUCESSÃO ───────────────────────────────────────────────────
  // Módulo Career, secção 7.5: Posição | Titular | Sucessor | Prontidão | Gap | Risco.
  async getSuccessionMatrix(filters: GetSuccessionMatrixFilterDto = {}) {
    const where: Prisma.CriticalPositionWhereInput = {};
    if (filters.departmentId) where.position = { departmentId: filters.departmentId };
    if (filters.businessImpact) where.businessImpact = filters.businessImpact;

    const criticalPositions = await this.prisma.read.criticalPosition.findMany({
      where,
      include: {
        position: {
          select: {
            id: true,
            name: true,
            users: { select: { id: true, fullName: true }, take: 1 },
          },
        },
        successionPlans: {
          include: { candidate: { select: { id: true, fullName: true } } },
          orderBy: { priority: 'asc' },
        },
      },
      orderBy: [{ businessImpact: 'desc' }, { exitRisk: 'desc' }],
    });

    const rows: Array<{
      criticalPositionId: number;
      position: string;
      titular: string | null;
      sucessor: string | null;
      readinessLevel: ReadinessLevel | null;
      gap: number | null;
      exitRisk: RiskLevel;
    }> = [];

    for (const cp of criticalPositions) {
      const titular = cp.position?.users?.[0]?.fullName ?? null;
      if (cp.successionPlans.length === 0) {
        rows.push({
          criticalPositionId: cp.id,
          position: cp.position?.name ?? '—',
          titular,
          sucessor: null,
          readinessLevel: null,
          gap: null,
          exitRisk: cp.exitRisk,
        });
        continue;
      }

      for (const sp of cp.successionPlans) {
        const match = await this.calculateMatchScoreForCandidate(cp.id, sp.candidate.id);
        rows.push({
          criticalPositionId: cp.id,
          position: cp.position?.name ?? '—',
          titular,
          sucessor: sp.candidate.fullName,
          readinessLevel: sp.readinessLevel,
          gap: match.details.gaps.length,
          exitRisk: cp.exitRisk,
        });
      }
    }

    return rows;
  }

  // ─── HISTÓRICO DE SUCESSÃO ────────────────────────────────────────────────
  // Módulo Career, secção 7: "histórico de sucessão". AuditLog não tinha
  // nenhuma escrita a partir deste módulo — mudanças de risco/prontidão/
  // prioridade não deixavam rasto nenhum. Usa a AuditService partilhada
  // (src/common/services/audit.service.ts, NÃO a cadeia de hash em
  // src/audit/ — ver [[project_innova_audit_module_split]]), entity
  // 'CriticalPosition'/'SuccessionPlan'. `metadata` guarda sempre
  // `criticalPositionId` mesmo nas entradas de SuccessionPlan, porque um
  // sucessor removido deixa de ter linha própria para se poder ligar de
  // volta ao cargo — só a entrada de auditoria sobrevive.
  async getSuccessionHistory(criticalPositionId: number) {
    const logs = await this.prisma.read.auditLog.findMany({
      where: {
        OR: [
          { entity: 'CriticalPosition', entityId: criticalPositionId },
          {
            entity: 'SuccessionPlan',
            metadata: { contains: `"criticalPositionId":${criticalPositionId}` },
          },
        ],
      },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return logs.map(l => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      user: l.user,
      metadata: l.metadata ? (JSON.parse(l.metadata) as Record<string, unknown>) : null,
      createdAt: l.createdAt,
    }));
  }

  private async logSuccessionHistory(
    userId: number,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    entity: 'CriticalPosition' | 'SuccessionPlan',
    entityId: number,
    metadata: object,
  ): Promise<void> {
    await this.audit.log({ userId, action, entity, entityId, metadata }).catch(e =>
      this.logger.warn({
        entity,
        entityId,
        action,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar histórico de sucessão em AuditLog',
      }),
    );
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private calcCoverageStatus(count: number, required: number): string {
    if (count === 0) return 'CRITICAL';
    if (count < required) return 'AT_RISK';
    if (count >= required) return 'COVERED';
    return 'UNKNOWN';
  }

  private daysUntil(date: Date | null): number | null {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 3600 * 1000));
  }

  private buildAlert(cp: AlertInput): string | null {
    if (cp._count?.successionPlans === 0 || cp.successionPlans?.length === 0) {
      return '🚨 Cargo crítico sem sucessores';
    }
    if (cp.exitRisk === 'CRITICAL') return '🔴 Risco de saída crítico';
    if (cp.exitRisk === 'HIGH') return '🟠 Risco de saída alto';
    const days = this.daysUntil(cp.expectedExitDate);
    if (days !== null && days <= 90) return `⏳ Saída prevista em ${days} dias`;
    return null;
  }
}

// src/competencies/competencies.service.ts
import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCompetencyDto, UpdateCompetencyDto, CompetencyFilterDto,
  UpsertUserCompetencyDto, SelfAssessmentDto, ManagerAssessmentDto,
  MapCompetencyToPositionDto, MapCompetencyToCourseDto,
  CreateProficiencyLevelDto, CreateEndorsementDto,
  CompetencySource,
} from './competencies.dto';

@Injectable()
export class CompetenciesService {
  private readonly logger = new Logger(CompetenciesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CATÁLOGO ─────────────────────────────────────────────────────────────

  async findAll(filters: CompetencyFilterDto) {
    const { page = 1, limit = 20, search, category, status, tag } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search)   where.OR = [
      { name:        { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
    if (category) where.category = category;
    if (status)   where.status   = status;
    if (tag)      where.tags     = { has: tag };

    const [data, total] = await Promise.all([
      this.prisma.competency.findMany({
        where, skip, take: limit,
        include: {
          _count: { select: { userCompetencies: true, courses: true, positions: true } },
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.competency.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const c = await this.prisma.competency.findUnique({
      where: { id },
      include: {
        courses:    { include: { course: { select: { id: true, title: true, status: true } } } },
        positions:  { include: { position: { select: { id: true, name: true, level: true } } } },
        proficiencyLevels: { orderBy: { value: 'asc' } },
        _count: { select: { userCompetencies: true, endorsements: true } },
      },
    });
    if (!c) throw new NotFoundException('Competência não encontrada');
    return c;
  }

  async create(dto: CreateCompetencyDto) {
    const exists = await this.prisma.competency.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (exists) throw new ConflictException(`Competência "${dto.name}" já existe`);

    return this.prisma.competency.create({
      data: {
        name:        dto.name,
        description: dto.description,
        category:    dto.category,
        tags:        dto.tags ?? [],
        status:      dto.status ?? 'ACTIVE',
      },
    });
  }

  async update(id: number, dto: UpdateCompetencyDto) {
    await this.findOne(id);

    if (dto.name) {
      const nameConflict = await this.prisma.competency.findFirst({
        where: { name: { equals: dto.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (nameConflict) throw new ConflictException(`Nome "${dto.name}" já existe`);
    }

    return this.prisma.competency.update({ where: { id }, data: dto });
  }

  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.competency.update({ where: { id }, data: { status: 'INACTIVE' } });
  }

  async remove(id: number) {
    const c = await this.findOne(id) as any;
    if (c._count.userCompetencies > 0) {
      throw new BadRequestException(
        `Competência tem ${c._count.userCompetencies} utilizadores associados. Archive-a em vez de eliminar.`
      );
    }
    await this.prisma.competency.delete({ where: { id } });
    return { message: 'Competência eliminada' };
  }

  // ─── NÍVEIS DE PROFICIÊNCIA ───────────────────────────────────────────────

  async createProficiencyLevel(dto: CreateProficiencyLevelDto) {
    await this.findOne(dto.competencyId);
    const exists = await this.prisma.proficiencyLevel.findFirst({
      where: { competencyId: dto.competencyId, value: dto.value },
    });
    if (exists) throw new ConflictException(`Nível ${dto.value} já existe para esta competência`);

    return this.prisma.proficiencyLevel.create({ data: dto });
  }

  async removeProficiencyLevel(levelId: number) {
    return this.prisma.proficiencyLevel.delete({ where: { id: levelId } });
  }

  // ─── COMPETÊNCIAS DO UTILIZADOR ──────────────────────────────────────────

  async upsertUserCompetency(dto: UpsertUserCompetencyDto, updatedById?: number) {
    const existing = await this.prisma.userCompetency.findFirst({
      where: { userId: dto.userId, competencyId: dto.competencyId },
    });

    const previousLevel = existing?.currentLevel ?? null;

    const uc = await this.prisma.userCompetency.upsert({
      where: { userId_competencyId: { userId: dto.userId, competencyId: dto.competencyId } },
      create: {
        userId:        dto.userId,
        competencyId:  dto.competencyId,
        currentLevel:  dto.currentLevel,
        targetLevel:   dto.targetLevel ?? null,
        selfLevel:     dto.source === CompetencySource.MANUAL ? dto.currentLevel : null,
        managerLevel:  dto.source === CompetencySource.MANAGER ? dto.currentLevel : null,
        source:        dto.source,
        notes:         dto.notes,
        evidenceUrl:   dto.evidenceUrl,
        evaluatedAt:   new Date(),
      },
      update: {
        currentLevel:  dto.currentLevel,
        targetLevel:   dto.targetLevel ?? undefined,
        source:        dto.source,
        notes:         dto.notes ?? undefined,
        evidenceUrl:   dto.evidenceUrl ?? undefined,
        evaluatedAt:   new Date(),
        ...(dto.source === CompetencySource.MANAGER ? { managerLevel: dto.currentLevel } : {}),
        ...(dto.source === CompetencySource.MANUAL  ? { selfLevel:    dto.currentLevel } : {}),
      },
      include: { competency: true },
    });

    // Registar histórico
    if (previousLevel !== dto.currentLevel) {
      await this.prisma.competencyEvolutionLog.create({
        data: {
          userId:        dto.userId,
          competencyId:  dto.competencyId,
          previousLevel: previousLevel ?? 0,
          newLevel:      dto.currentLevel,
          source:        dto.source,
          updatedById:   updatedById ?? dto.userId,
        },
      });

      // Notificar
      if (dto.source === CompetencySource.MANAGER) {
        await this.prisma.notificationLog.create({
          data: {
            userId:   dto.userId,
            type:     'COMPETENCY_EVALUATED',
            message:  `O gestor avaliou a sua competência. Nível: ${dto.currentLevel}/5`,
            metadata: JSON.stringify({}),
          },
        }).catch(() => {});
      }
    }

    return uc;
  }

  // Autoavaliação pelo próprio colaborador
  async selfAssess(userId: number, dto: SelfAssessmentDto) {
    return this.upsertUserCompetency({
      userId,
      competencyId: dto.competencyId,
      currentLevel: dto.selfLevel,
      source:       CompetencySource.MANUAL,
      notes:        dto.notes,
      evidenceUrl:  dto.evidenceUrl,
    }, userId);
  }

  // Avaliação pelo gestor
  async managerAssess(managerId: number, dto: ManagerAssessmentDto) {
    // Gravar nível do gestor separadamente e recalcular nível actual
    const existing = await this.prisma.userCompetency.findFirst({
      where: { userId: dto.userId, competencyId: dto.competencyId },
    });

    const uc = await this.prisma.userCompetency.upsert({
      where: { userId_competencyId: { userId: dto.userId, competencyId: dto.competencyId } },
      create: {
        userId:        dto.userId,
        competencyId:  dto.competencyId,
        currentLevel:  dto.managerLevel,
        managerLevel:  dto.managerLevel,
        source:        CompetencySource.MANAGER,
        notes:         dto.feedback,
        evaluatedAt:   new Date(),
      },
      update: {
        managerLevel:  dto.managerLevel,
        currentLevel:  dto.managerLevel,
        source:        CompetencySource.MANAGER,
        notes:         dto.feedback ?? undefined,
        evaluatedAt:   new Date(),
      },
    });

    // Detectar divergência self vs manager
    const selfLevel = existing?.selfLevel;
    if (selfLevel !== null && selfLevel !== undefined) {
      const divergence = Math.abs(selfLevel - dto.managerLevel);
      if (divergence >= 2) {
        await this.prisma.notificationLog.create({
          data: {
            userId:   dto.userId,
            type:     'COMPETENCY_DIVERGENCE',
            message:  `Divergência significativa detectada: Autoavaliação ${selfLevel} vs Gestor ${dto.managerLevel}`,
            metadata: JSON.stringify({}),
          },
        }).catch(() => {});
      }
    }

    await this.prisma.competencyEvolutionLog.create({
      data: {
        userId:        dto.userId,
        competencyId:  dto.competencyId,
        previousLevel: existing?.currentLevel ?? 0,
        newLevel:      dto.managerLevel,
        source:        CompetencySource.MANAGER,
        updatedById:   managerId,
      },
    });

    return uc;
  }

  async getUserCompetencies(userId: number) {
    const competencies = await this.prisma.userCompetency.findMany({
      where:   { userId },
      include: {
        competency: {
          include: {
            proficiencyLevels: { orderBy: { value: 'asc' } },
            _count: { select: { endorsements: true } },
          },
        },
      },
      orderBy: { evaluatedAt: 'desc' },
    });

    return competencies.map(uc => ({
      ...uc,
      gap: (uc.targetLevel ?? 0) > 0
        ? Math.max(0, (uc.targetLevel ?? 0) - (uc.currentLevel ?? 0))
        : null,
      divergence: (uc.selfLevel !== null && uc.managerLevel !== null)
        ? Math.abs((uc.selfLevel ?? 0) - (uc.managerLevel ?? 0))
        : null,
    }));
  }

  async getCompetencyEvolution(userId: number, competencyId?: number) {
    const where: any = { userId };
    if (competencyId) where.competencyId = competencyId;

    return this.prisma.competencyEvolutionLog.findMany({
      where,
      include: { competency: { select: { id: true, name: true, category: true } } },
      orderBy: { createdAt: 'desc' },
      take:    50,
    });
  }

  // ─── GAP ANALYSIS ─────────────────────────────────────────────────────────

  async getCompetencyGap(userId: number, positionId: number) {
    const [userComps, required] = await Promise.all([
      this.prisma.userCompetency.findMany({
        where:   { userId },
        include: { competency: true },
      }),
      this.prisma.positionCompetency.findMany({
        where:   { positionId },
        include: { competency: { include: { courses: { include: { course: { select: { id: true, title: true } } } } } } },
      }),
    ]);

    const userMap = new Map(userComps.map(uc => [uc.competencyId, uc.currentLevel ?? 0]));

    const gaps = required.map(req => {
      const current  = userMap.get(req.competencyId) ?? 0;
      const gapValue = Math.max(0, req.requiredLevel - current);
      return {
        competency:     req.competency,
        requiredLevel:  req.requiredLevel,
        currentLevel:   current,
        gap:            gapValue,
        met:            current >= req.requiredLevel,
        priority:       (req as any).priority ?? 'MANDATORY',
        weight:         (req as any).weight ?? 1,
        recommendedCourses: (req.competency as any).courses?.map((cc: any) => cc.course) ?? [],
      };
    });

    // Ordenar: gaps críticos primeiro (maior gap × maior peso)
    gaps.sort((a, b) => (b.gap * (b.weight ?? 1)) - (a.gap * (a.weight ?? 1)));

    const totalGap         = gaps.reduce((acc, g) => acc + g.gap, 0);
    const mandatoryGaps    = gaps.filter(g => g.priority === 'MANDATORY' && !g.met).length;
    const readinessPercent = required.length
      ? Math.round((gaps.filter(g => g.met).length / required.length) * 100)
      : 100;

    return { gaps, totalGap, mandatoryGaps, readinessPercent, positionId, userId };
  }

  // ─── MAPEAMENTOS ──────────────────────────────────────────────────────────

  async mapToPosition(dto: MapCompetencyToPositionDto) {
    await this.findOne(dto.competencyId);
    return (this.prisma as any).positionCompetency.upsert({
    where: { positionId_competencyId: { positionId: dto.positionId, competencyId: dto.competencyId } },
    create: {
    positionId:    dto.positionId,
    competencyId:  dto.competencyId,
    requiredLevel: dto.requiredLevel,
    priority:      dto.priority,
    weight:        dto.weight ?? 1,
  },
    update: {
    requiredLevel: dto.requiredLevel,
    priority:      dto.priority,
    weight:        dto.weight ?? undefined,
      },
    });
  }

  async unmapFromPosition(positionId: number, competencyId: number) {
    return this.prisma.positionCompetency.deleteMany({ where: { positionId, competencyId } });
  }

  async mapToCourse(dto: MapCompetencyToCourseDto) {
    await this.findOne(dto.competencyId);
    return this.prisma.courseCompetency.upsert({
      where: { courseId_competencyId: { courseId: dto.courseId, competencyId: dto.competencyId } },
      create: { courseId: dto.courseId, competencyId: dto.competencyId, levelGained: dto.levelGained },
      update: { levelGained: dto.levelGained },
    });
  }

  // ─── ENDORSEMENTS ─────────────────────────────────────────────────────────

  async addEndorsement(endorserId: number, dto: CreateEndorsementDto) {
    if (endorserId === dto.targetUserId) {
      throw new BadRequestException('Não pode endorsar a si próprio');
    }

    const existing = await this.prisma.competencyEndorsement.findFirst({
      where: { endorserId, userId: dto.targetUserId, competencyId: dto.competencyId },
    });
    if (existing) throw new ConflictException('Já endorsou esta competência para este utilizador');

    const endorsement = await this.prisma.competencyEndorsement.create({
      data: {
        endorserId,
        userId:       dto.targetUserId,
        competencyId: dto.competencyId,
        comment:      dto.comment,
      },
    });

    await this.prisma.notificationLog.create({
      data: {
        userId:   dto.targetUserId,
        type:     'COMPETENCY_ENDORSED',
        message:  `Recebeu um endorsement numa competência`,
        metadata: JSON.stringify({}),
      },
    }).catch(() => {});

    return endorsement;
  }

  async getEndorsements(userId: number) {
    return this.prisma.competencyEndorsement.findMany({
      where:   { userId },
      include: {
        competency: { select: { id: true, name: true, category: true } },
        endorser:   { select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── SKILL MATRIX ─────────────────────────────────────────────────────────

  async getSkillMatrix(departmentId?: number, positionId?: number) {
    const userWhere: any = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;
    if (positionId)   userWhere.positionId   = positionId;

    const [users, competencies] = await Promise.all([
      this.prisma.user.findMany({
        where:  userWhere,
        select: {
          id: true, fullName: true, avatarUrl: true,
          position:   { select: { name: true } },
          department: { select: { name: true } },
        },
        take: 50,
      }),
      this.prisma.competency.findMany({
        where:   { status: 'ACTIVE' },
        select:  { id: true, name: true, category: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const userIds = users.map(u => u.id);
    const allUC   = await this.prisma.userCompetency.findMany({
      where: { userId: { in: userIds } },
    });

    // Montar grid
    const matrix = users.map(user => {
      const userUC = allUC.filter(uc => uc.userId === user.id);
      const levels = competencies.map(comp => {
        const uc = userUC.find(u => u.competencyId === comp.id);
        return { competencyId: comp.id, level: uc?.currentLevel ?? 0 };
      });
      return { user, levels };
    });

    return { users, competencies, matrix };
  }

  // ─── ANALYTICS & DASHBOARD ───────────────────────────────────────────────

  async getTopCompetencies(limit = 10) {
    const grouped = await this.prisma.userCompetency.groupBy({
      by:       ['competencyId'],
      _count:   { competencyId: true },
      _avg:     { currentLevel: true },
      orderBy:  { _count: { competencyId: 'desc' } },
      take:     limit,
    });

    // Enriquecer com nomes
    const ids  = grouped.map(g => g.competencyId);
    const comps= await this.prisma.competency.findMany({
      where:  { id: { in: ids } },
      select: { id: true, name: true, category: true },
    });
    const compMap = new Map(comps.map(c => [c.id, c]));

    return grouped.map(g => ({
      ...g,
      competency: compMap.get(g.competencyId),
      avgLevel:   Math.round((g._avg.currentLevel ?? 0) * 10) / 10,
    }));
  }

  async getOrgGapDashboard(departmentId?: number) {
    const userWhere: any = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const users = await this.prisma.user.findMany({
      where:  userWhere,
      select: { id: true, positionId: true },
    });

    const totalUsers = users.length;
    const usersWithComps = await this.prisma.userCompetency.findMany({
      where: { userId: { in: users.map(u => u.id) } },
      select: { userId: true, competencyId: true, currentLevel: true, targetLevel: true },
    });

    // Gaps totais
    const gapsCount = usersWithComps.filter(
      uc => (uc.targetLevel ?? 0) > 0 && (uc.currentLevel ?? 0) < (uc.targetLevel ?? 0)
    ).length;

    // Competências críticas (mais gaps)
    const gapMap: Record<number, number> = {};
    for (const uc of usersWithComps) {
      if ((uc.targetLevel ?? 0) > (uc.currentLevel ?? 0)) {
        gapMap[uc.competencyId] = (gapMap[uc.competencyId] ?? 0) + 1;
      }
    }

    const criticalCompetencyIds = Object.entries(gapMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => parseInt(id));

    const criticalComps = await this.prisma.competency.findMany({
      where:  { id: { in: criticalCompetencyIds } },
      select: { id: true, name: true, category: true },
    });

    return {
      totalUsers,
      usersWithCompetencies: new Set(usersWithComps.map(u => u.userId)).size,
      totalGaps: gapsCount,
      criticalGaps: criticalComps.map(c => ({
        ...c,
        usersWithGap: gapMap[c.id] ?? 0,
      })),
    };
  }

  async getRecommendations(userId: number) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { positionId: true, departmentId: true },
    });
    if (!user?.positionId) return { recommendations: [], reason: 'Cargo não definido' };

    const gap = await this.getCompetencyGap(userId, user.positionId);
    const gapsWithCourses = gap.gaps.filter(g => !g.met && g.recommendedCourses.length > 0);

    return {
      gaps: gapsWithCourses.slice(0, 5),
      recommendations: gapsWithCourses.flatMap(g => g.recommendedCourses).slice(0, 10),
    };
  }

  // Atualização automática após conclusão de curso
  async updateFromCourse(userId: number, courseId: number) {
    const courseComps = await this.prisma.courseCompetency.findMany({
      where: { courseId },
    });

    for (const cc of courseComps) {
      const existing = await this.prisma.userCompetency.findFirst({
        where: { userId, competencyId: cc.competencyId },
      });
      const newLevel = Math.min(5, Math.max(
        existing?.currentLevel ?? 0,
        (cc as any).levelGained ?? 1,
      ));

      if (!existing || existing.currentLevel < newLevel) {
        await this.upsertUserCompetency({
          userId,
          competencyId:  cc.competencyId,
          currentLevel:  newLevel,
          source:        CompetencySource.COURSE,
        });
      }
    }

    this.logger.log(`Competências actualizadas para user ${userId} após curso ${courseId}`);
  }
}

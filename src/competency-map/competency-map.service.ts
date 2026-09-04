// ─── src/competency-map/competency-map.service.ts ────────────────────────────
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  SkillFilterDto,
  GapAnalysisFilterDto,
  CreateSkillCategoryDto,
  CreateSkillMapDto,
  UpdateSkillDto,
  CreateSkillProficiencyLevelDto,
  SetRoleSkillMatrixDto,
  UpsertEmployeeSkillDto,
  BatchAssessmentDto,
  GapPriority,
  AssessmentSource,
} from './competency-map.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export interface GapEntry {
  skillId: number;
  skillName: string;
  skillType: string;
  category: string | undefined;
  currentLevel: number;
  requiredLevel: number;
  gap: number;
  weight: number;
  mandatory: boolean;
  priority: GapPriority;
  hasGap: boolean;
}

function getGapPriority(gap: number, mandatory: boolean): GapPriority {
  if (mandatory && gap >= 2) return GapPriority.HIGH;
  if (gap >= 2) return GapPriority.MEDIUM;
  if (gap >= 1) return GapPriority.LOW;
  return GapPriority.LOW;
}

function calcWeightedScore(
  employeeSkills: Map<number, number>,
  roleSkills: Array<{ skillId: number; requiredLevel: number; weight: number; mandatory: boolean }>,
): number {
  if (!roleSkills.length) return 0;
  let totalWeight = 0;
  let metWeight = 0;
  for (const req of roleSkills) {
    totalWeight += req.weight;
    const current = employeeSkills.get(req.skillId) ?? 0;
    const ratio = Math.min(1, current / req.requiredLevel);
    metWeight += req.weight * ratio;
  }
  return totalWeight > 0 ? +((metWeight / totalWeight) * 100).toFixed(1) : 0;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CompetencyMapService {
  private readonly logger = new Logger(CompetencyMapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // SKILL CATEGORIES
  // ══════════════════════════════════════════════════════════════════

  async createCategory(dto: CreateSkillCategoryDto) {
    return this.prisma.skillCategory.create({ data: { ...dto, active: dto.active ?? true } });
  }

  async getCategories() {
    return this.prisma.read.skillCategory.findMany({
      where: { active: true },
      include: { _count: { select: { skills: true } } },
      orderBy: [{ family: 'asc' }, { name: 'asc' }],
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // SKILLS CATALOGUE
  // ══════════════════════════════════════════════════════════════════

  async createSkill(dto: CreateSkillMapDto, createdById: number) {
    const skill = await this.prisma.skill.create({
      data: {
        ...dto,
        tags: dto.tags ?? [],
        maxLevel: dto.maxLevel ?? 5,
        active: dto.active ?? true,
      },
      include: { category: true },
    });
    await this.audit.log({
      action: 'SKILL_CREATED',
      entity: 'Skill',
      entityId: String(skill.id),
      userId: createdById,
    });
    return skill;
  }

  async getSkills(filters: SkillFilterDto) {
    const { page = 1, limit = 50, search, type, categoryId, active = true } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.SkillWhereInput = { active };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (type) where.type = type;
    if (categoryId) where.categoryId = categoryId;

    const [data, total] = await Promise.all([
      this.prisma.read.skill.findMany({
        where,
        skip,
        take,
        include: {
          category: true,
          proficiencyLevels: { orderBy: { level: 'asc' } },
          _count: { select: { employeeSkills: true, roleRequirements: true } },
        },
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.read.skill.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async getSkill(id: number) {
    const s = await this.prisma.read.skill.findUnique({
      where: { id },
      include: {
        category: true,
        proficiencyLevels: { orderBy: { level: 'asc' } },
        roleRequirements: { include: { roleMatrix: true } },
        _count: { select: { employeeSkills: true } },
      },
    });
    if (!s) throw new NotFoundException('Skill não encontrada');
    return s;
  }

  async updateSkill(id: number, dto: UpdateSkillDto) {
    await this.getSkill(id);
    return this.prisma.skill.update({ where: { id }, data: dto });
  }

  // ══════════════════════════════════════════════════════════════════
  // PROFICIENCY LEVELS
  // ══════════════════════════════════════════════════════════════════

  async setProficiencyLevels(dto: CreateSkillProficiencyLevelDto) {
    return this.prisma.skillProficiencyLevel.upsert({
      where: { skillId_level: { skillId: dto.skillId, level: dto.level } },
      create: { ...dto },
      update: {
        name: dto.name,
        description: dto.description,
        observableBehavior: dto.observableBehavior,
        expectedMonths: dto.expectedMonths,
      },
    });
  }

  async getProficiencyLevels(skillId: number) {
    return this.prisma.read.skillProficiencyLevel.findMany({
      where: { skillId },
      orderBy: { level: 'asc' },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ROLE SKILL MATRIX
  // ══════════════════════════════════════════════════════════════════

  async setRoleSkillMatrix(dto: SetRoleSkillMatrixDto) {
    // Upsert o header da matriz
    const matrix = await this.prisma.roleSkillMatrix.upsert({
      where: { roleCode: dto.roleCode },
      create: { roleCode: dto.roleCode, department: dto.department },
      update: { department: dto.department },
    });

    // Substituir skills
    await this.prisma.roleSkillRequirement.deleteMany({ where: { matrixId: matrix.id } });
    await this.prisma.roleSkillRequirement.createMany({
      data: dto.skills.map(s => ({
        matrixId: matrix.id,
        skillId: s.skillId,
        requiredLevel: s.requiredLevel,
        weight: s.weight,
        mandatory: s.mandatory,
      })),
    });

    return this.getRoleSkillMatrix(dto.roleCode);
  }

  async getRoleSkillMatrix(roleCode: string) {
    const matrix = await this.prisma.read.roleSkillMatrix.findUnique({
      where: { roleCode },
      include: {
        requirements: {
          include: { skill: { include: { category: true } } },
          orderBy: [{ mandatory: 'desc' }, { weight: 'desc' }],
        },
      },
    });
    if (!matrix) throw new NotFoundException(`Matriz para "${roleCode}" não encontrada`);
    return matrix;
  }

  async getAllRoleMatrices(department?: string) {
    return this.prisma.read.roleSkillMatrix.findMany({
      where: department ? { department: { contains: department, mode: 'insensitive' } } : {},
      include: { _count: { select: { requirements: true } } },
      orderBy: { roleCode: 'asc' },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // EMPLOYEE SKILLS
  // ══════════════════════════════════════════════════════════════════

  async upsertEmployeeSkill(dto: UpsertEmployeeSkillDto, submittedById: number) {
    // Anti-inflation: autoavaliações não podem superar nível 4 sem validação do gestor
    if (dto.source === AssessmentSource.SELF && dto.currentLevel >= 5 && !dto.managerValidated) {
      throw new BadRequestException('Autoavaliação de nível 5 requer validação do gestor');
    }

    const existing = await this.prisma.legacyEmployeeSkill.findUnique({
      where: { userId_skillId: { userId: dto.userId, skillId: dto.skillId } },
    });

    // Histórico: guardar snapshot antes de actualizar
    if (existing) {
      await this.prisma.skillAssessmentHistory.create({
        data: {
          userId: dto.userId,
          skillId: dto.skillId,
          level: existing.currentLevel,
          source: existing.source,
          assessedById: existing.assessedById,
          notes: existing.notes,
          snapshotAt: existing.assessedAt ?? new Date(),
        },
      });
    }

    const skill = await this.prisma.legacyEmployeeSkill.upsert({
      where: { userId_skillId: { userId: dto.userId, skillId: dto.skillId } },
      create: {
        userId: dto.userId,
        skillId: dto.skillId,
        currentLevel: dto.currentLevel,
        targetLevel: dto.targetLevel ?? dto.currentLevel,
        source: dto.source,
        assessedById: dto.assessedById,
        managerValidated: dto.managerValidated ?? dto.source === AssessmentSource.MANAGER,
        notes: dto.notes,
        evidenceUrl: dto.evidenceUrl,
        assessedAt: new Date(),
      },
      update: {
        currentLevel: dto.currentLevel,
        targetLevel: dto.targetLevel,
        source: dto.source,
        assessedById: dto.assessedById,
        managerValidated: dto.managerValidated ?? dto.source === AssessmentSource.MANAGER,
        notes: dto.notes,
        evidenceUrl: dto.evidenceUrl,
        assessedAt: new Date(),
      },
      include: { skill: { include: { category: true } } },
    });

    await this.audit.log({
      action: 'SKILL_ASSESSED',
      entity: 'LegacyEmployeeSkill',
      entityId: String(skill.id),
      userId: submittedById,
    });

    // Notificar gestor se autoavaliação
    if (dto.source === AssessmentSource.SELF) {
      await this.notifyManager(
        dto.userId,
        'SKILL_SELF_ASSESSED',
        `Nova autoavaliação de skill pendente de validação`,
      );
    }

    return skill;
  }

  async batchAssessment(dto: BatchAssessmentDto, submittedById: number) {
    const results = await Promise.allSettled(
      dto.assessments.map(a =>
        this.upsertEmployeeSkill(
          {
            userId: dto.userId,
            skillId: a.skillId,
            currentLevel: a.currentLevel,
            source: dto.source,
            assessedById: dto.assessedById,
            notes: a.notes,
          },
          submittedById,
        ),
      ),
    );
    return {
      success: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    };
  }

  async getEmployeeSkills(userId: number) {
    const skills = await this.prisma.read.legacyEmployeeSkill.findMany({
      where: { userId },
      include: {
        skill: { include: { category: true, proficiencyLevels: true } },
      },
      orderBy: [{ skill: { type: 'asc' } }, { currentLevel: 'desc' }],
    });

    const byType = skills.reduce(
      (acc: Record<string, typeof skills>, s) => {
        const type = s.skill.type;
        if (!acc[type]) acc[type] = [];
        acc[type].push(s);
        return acc;
      },
      {} as Record<string, typeof skills>,
    );

    const avgScore = skills.length
      ? +(skills.reduce((a, s) => a + s.currentLevel, 0) / skills.length).toFixed(2)
      : 0;

    return { userId, skills, byType, total: skills.length, avgScore };
  }

  async getSkillHistory(userId: number, skillId: number) {
    const history = await this.prisma.read.skillAssessmentHistory.findMany({
      where: { userId, skillId },
      orderBy: { snapshotAt: 'asc' },
    });
    const current = await this.prisma.legacyEmployeeSkill.findUnique({
      where: { userId_skillId: { userId, skillId } },
      include: { skill: true },
    });
    return { history, current };
  }

  // ══════════════════════════════════════════════════════════════════
  // GAP ANALYSIS
  // ══════════════════════════════════════════════════════════════════

  async getUserGapAnalysis(userId: number, roleCode?: string) {
    // Buscar role code do colaborador se não fornecido.
    // FIX: `user.employee` nunca existiu (User não tem essa relação — ver
    // CLAUDE.md) e ficava sempre undefined atrás do `as any`; o campo real
    // equivalente é `user.role.code` (Role.code, usado em RoleSkillMatrix.roleCode).
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    const targetRole = roleCode ?? user?.role?.code ?? undefined;

    // Skills do colaborador
    const employeeSkills = await this.prisma.read.legacyEmployeeSkill.findMany({
      where: { userId },
      include: { skill: { include: { category: true } } },
    });
    const skillMap = new Map(employeeSkills.map(s => [s.skillId, s.currentLevel]));

    let matrix = null;
    let gaps: GapEntry[] = [];
    let readinessScore = 0;

    if (targetRole) {
      try {
        matrix = await this.getRoleSkillMatrix(targetRole);
        for (const req of matrix.requirements) {
          const current = skillMap.get(req.skillId) ?? 0;
          const gap = req.requiredLevel - current;
          const priority = getGapPriority(gap, req.mandatory);

          gaps.push({
            skillId: req.skillId,
            skillName: req.skill.name,
            skillType: req.skill.type,
            category: req.skill.category?.name,
            currentLevel: current,
            requiredLevel: req.requiredLevel,
            gap: Math.max(0, gap),
            weight: req.weight,
            mandatory: req.mandatory,
            priority,
            hasGap: gap > 0,
          });
        }
        readinessScore = calcWeightedScore(skillMap, matrix.requirements);
        gaps = gaps.sort((a, b) => {
          const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
          return order[a.priority] - order[b.priority];
        });
      } catch (e: unknown) {
        this.logger.warn({
          userId,
          targetRole,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao calcular gap analysis — a devolver sem gaps calculados',
        });
      }
    }

    const missingMandatory = gaps.filter(g => g.hasGap && g.mandatory);
    const skillsGap = gaps.filter(g => g.hasGap && !g.mandatory);
    const metRequirements = gaps.filter(g => !g.hasGap).length;

    // Cursos recomendados para os gaps
    const recommendedCourses = await this.getCoursesForGaps(
      gaps.filter(g => g.hasGap).map(g => g.skillId),
    );

    return {
      userId,
      targetRole,
      readinessScore,
      readinessLevel:
        readinessScore >= 80 ? 'READY' : readinessScore >= 50 ? 'DEVELOPING' : 'STARTING',
      totalRequirements: gaps.length,
      metRequirements,
      gaps: { mandatory: missingMandatory, optional: skillsGap, all: gaps },
      employeeSkills,
      recommendedCourses,
    };
  }

  async getOrganisationalGapAnalysis(filters: GapAnalysisFilterDto) {
    const where: Prisma.LegacyEmployeeSkillWhereInput = {};
    // FIX: o filtro de departamento nunca foi implementado (comentário
    // "no direct relation" datava de antes de `User.department` existir como
    // relação real) — o parâmetro `filters.department` era sempre ignorado.
    if (filters.department)
      where.user = { department: { name: { contains: filters.department, mode: 'insensitive' } } };
    if (filters.userId) where.userId = filters.userId;
    if (filters.skillType) where.skill = { type: filters.skillType };

    const allEmployeeSkills = await this.prisma.read.legacyEmployeeSkill.findMany({
      where,
      include: {
        skill: { include: { category: true } },
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    // Agrupar por skill: média, distribuição de níveis
    interface SkillGapAgg {
      skillId: number;
      skillName: string;
      skillType: string;
      category: string | undefined;
      levels: number[];
      count: number;
    }
    const bySkill: Record<number, SkillGapAgg> = {};
    for (const es of allEmployeeSkills) {
      const id = es.skillId;
      if (!bySkill[id]) {
        bySkill[id] = {
          skillId: id,
          skillName: es.skill.name,
          skillType: es.skill.type,
          category: es.skill.category?.name,
          levels: [],
          count: 0,
        };
      }
      bySkill[id].levels.push(es.currentLevel);
      bySkill[id].count++;
    }

    const skillSummary = Object.values(bySkill)
      .map(s => {
        const avg = +(s.levels.reduce((a, b) => a + b, 0) / s.levels.length).toFixed(2);
        const below3 = s.levels.filter(l => l < 3).length;
        return {
          ...s,
          avgLevel: avg,
          belowThreshold: below3,
          belowThresholdRate: +((below3 / s.levels.length) * 100).toFixed(1),
          levelDistribution: [1, 2, 3, 4, 5].map(l => ({
            level: l,
            count: s.levels.filter(x => x === l).length,
          })),
        };
      })
      .sort((a, b) => a.avgLevel - b.avgLevel);

    // Skills mais críticas (abaixo de 3 em muitos colaboradores)
    const criticalGaps = skillSummary.filter(s => s.belowThresholdRate > 30);

    // Departamento summary
    // FIX: `es.user.employee` nunca existiu — grupo caía sempre em 'N/A'; o
    // campo real é `user.department.name` (agora incluído acima).
    interface DeptAgg {
      department: string;
      totalAssessments: number;
      sumLevels: number;
    }
    const deptSummary = allEmployeeSkills.reduce(
      (acc: Record<string, DeptAgg>, es) => {
        const dept = es.user.department?.name ?? 'N/A';
        if (!acc[dept]) acc[dept] = { department: dept, totalAssessments: 0, sumLevels: 0 };
        acc[dept].totalAssessments++;
        acc[dept].sumLevels += es.currentLevel;
        return acc;
      },
      {} as Record<string, DeptAgg>,
    );

    return {
      totalAssessments: allEmployeeSkills.length,
      skillSummary,
      criticalGaps,
      departmentSummary: Object.values(deptSummary).map(d => ({
        ...d,
        avgLevel: +(d.sumLevels / d.totalAssessments).toFixed(2),
      })),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // EMPLOYEE MAP (profile view)
  // ══════════════════════════════════════════════════════════════════

  async getMap(userId: number) {
    const [employeeData, gapData] = await Promise.all([
      this.getEmployeeSkills(userId),
      this.getUserGapAnalysis(userId),
    ]);
    return { ...employeeData, gapAnalysis: gapData };
  }

  async getDepartmentMap(department: string) {
    // FIX: o filtro de departamento nunca foi implementado (mesmo comentário
    // desactualizado de getOrganisationalGapAnalysis) — devolvia sempre TODOS
    // os utilizadores, independentemente do departamento pedido.
    const users = await this.prisma.read.user.findMany({
      where: { department: { name: { contains: department, mode: 'insensitive' } } },
      select: { id: true, fullName: true, avatarUrl: true },
    });

    const allSkills = await this.prisma.read.legacyEmployeeSkill.findMany({
      where: { userId: { in: users.map(u => u.id) } },
      include: { skill: { include: { category: true } } },
    });

    // Média por skill
    interface DeptSkillAgg {
      skill: (typeof allSkills)[number]['skill'];
      levels: number[];
      count: number;
    }
    const bySkill: Record<number, DeptSkillAgg> = {};
    for (const s of allSkills) {
      if (!bySkill[s.skillId]) bySkill[s.skillId] = { skill: s.skill, levels: [], count: 0 };
      bySkill[s.skillId].levels.push(s.currentLevel);
      bySkill[s.skillId].count++;
    }

    const summary = Object.values(bySkill)
      .map(s => ({
        skill: s.skill,
        avgLevel: +(s.levels.reduce((a, b) => a + b, 0) / s.levels.length).toFixed(2),
        count: s.count,
      }))
      .sort((a, b) => b.avgLevel - a.avgLevel);

    const topSkills = summary.slice(0, 5);
    const bottomSkills = summary.slice(-5).reverse();

    return { department, totalUsers: users.length, summary, topSkills, bottomSkills, users };
  }

  // ══════════════════════════════════════════════════════════════════
  // TEAM MAP (manager view)
  // ══════════════════════════════════════════════════════════════════

  async getTeamMap(managerId: number) {
    const subordinates = await this.prisma.read.user.findMany({
      where: { managerId },
      select: { id: true, fullName: true, avatarUrl: true },
    });

    const teamSkills = await Promise.all(
      subordinates.map(async s => {
        const gap = await this.getUserGapAnalysis(s.id);
        return {
          user: s,
          readinessScore: gap.readinessScore,
          readinessLevel: gap.readinessLevel,
          topGaps: gap.gaps.mandatory.slice(0, 3),
          employeeSkills: gap.employeeSkills,
        };
      }),
    );

    teamSkills.sort((a, b) => b.readinessScore - a.readinessScore);

    return {
      managerId,
      teamSize: subordinates.length,
      avgReadiness: +(
        teamSkills.reduce((a, t) => a + t.readinessScore, 0) / (teamSkills.length || 1)
      ).toFixed(1),
      members: teamSkills,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // ANALYTICS & RADAR DATA
  // ══════════════════════════════════════════════════════════════════

  async getRadarData(userId: number, _roleCode?: string) {
    const { skills, gapAnalysis } = await this.getMap(userId);

    // Para radar chart: agrupar por tipo de skill
    interface RadarAgg {
      type: string;
      current: number;
      required: number;
      count: number;
    }
    const radarByType = Object.entries(
      skills.reduce(
        (acc: Record<string, RadarAgg>, s) => {
          const type = s.skill.type;
          if (!acc[type]) acc[type] = { type, current: 0, required: 0, count: 0 };
          acc[type].current += s.currentLevel;

          // Buscar required do gap analysis
          const gap = gapAnalysis.gaps?.all?.find(g => g.skillId === s.skillId);
          if (gap) acc[type].required += gap.requiredLevel;
          else acc[type].required += s.currentLevel;
          acc[type].count++;
          return acc;
        },
        {} as Record<string, RadarAgg>,
      ),
    ).map(([, v]) => ({
      type: v.type,
      avgCurrent: +(v.current / v.count).toFixed(2),
      avgRequired: +(v.required / v.count).toFixed(2),
      count: v.count,
    }));

    return { userId, radarByType, readinessScore: gapAnalysis.readinessScore };
  }

  async getHeatmapData(department?: string) {
    const where: Prisma.LegacyEmployeeSkillWhereInput = {};
    // FIX: mesmo filtro de departamento morto de getOrganisationalGapAnalysis/getDepartmentMap.
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const data = await this.prisma.read.legacyEmployeeSkill.findMany({
      where,
      select: {
        userId: true,
        skillId: true,
        currentLevel: true,
        skill: { select: { name: true, type: true } },
        user: { select: { fullName: true, avatarUrl: true } },
      },
    });

    return data;
  }

  // ══════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════════════════

  private async getCoursesForGaps(skillIds: number[]) {
    if (!skillIds.length) return [];
    try {
      // Course não tem relação `skills` (ver CLAUDE.md) — não há como filtrar
      // cursos pelos skillIds dos gaps; devolve-se uma amostra genérica.
      const where: Prisma.CourseWhereInput = {};
      return (
        this.prisma.course?.findMany?.({
          where,
          select: { id: true, title: true },
          take: 5,
        }) ?? []
      );
    } catch (e: unknown) {
      this.logger.warn({
        skillIds,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao procurar cursos recomendados para os gaps',
      });
      return [];
    }
  }

  private async notifyManager(userId: number, type: string, message: string) {
    try {
      // FIX: `user.employee` nunca existiu; `managerId` já é um campo escalar
      // directo em `User` (FK `managerId`), não precisa de nenhum include.
      const user = await this.prisma.read.user.findUnique({ where: { id: userId } });
      const managerId = user?.managerId;
      if (managerId)
        await createNotificationSafe(this.prisma, this.logger, {
          userId: managerId,
          type,
          message,
        });
    } catch (e: unknown) {
      this.logger.warn({
        userId,
        type,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao notificar gestor',
      });
    }
  }
}

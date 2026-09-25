// src/competencies/competencies.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildCsvString } from '../common/utils/csv-export.util';
import {
  CreateCompetencyDto,
  UpdateCompetencyDto,
  CompetencyFilterDto,
  UpsertUserCompetencyDto,
  SelfAssessmentDto,
  ManagerAssessmentDto,
  MapCompetencyToPositionDto,
  MapCompetencyToCourseDto,
  CreateProficiencyLevelDto,
  UpdateProficiencyLevelDto,
  CreateEndorsementDto,
  CompetencySource,
  CreateCompetencyModelDto,
  UpdateCompetencyModelDto,
  CompetencyModelFilterDto,
  UpsertCompetencyModelItemDto,
  SkillMatrixFilterDto,
  CompetencyEvaluationFilterDto,
  CompetencyEvaluationStatus,
  CompetencyGapFilterDto,
  CompetencyGapPriority,
  CompetencyGapStatus,
  DevelopmentActionFilterDto,
  DevelopmentResult,
  CompetencyReportFilterDto,
} from './competencies.dto';

@Injectable()
export class CompetenciesService {
  private readonly logger = new Logger(CompetenciesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CATÁLOGO ─────────────────────────────────────────────────────────────

  async findAll(filters: CompetencyFilterDto) {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      status,
      tag,
      isCritical,
      isStrategic,
    } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.CompetencyWhereInput = {};
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    if (category) where.category = category;
    if (status) where.status = status;
    if (tag) where.tags = { has: tag };
    if (isCritical !== undefined) where.isCritical = isCritical;
    if (isStrategic !== undefined) where.isStrategic = isStrategic;

    const [data, total] = await Promise.all([
      this.prisma.read.competency.findMany({
        where,
        skip,
        take: limit,
        include: {
          owner: { select: { id: true, fullName: true } },
          _count: { select: { userCompetencies: true, courses: true, positions: true } },
        },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.read.competency.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const c = await this.prisma.read.competency.findUnique({
      where: { id },
      include: {
        courses: { include: { course: { select: { id: true, title: true, status: true } } } },
        positions: { include: { position: { select: { id: true, name: true, level: true } } } },
        proficiencyLevels: { orderBy: { value: 'asc' } },
        owner: { select: { id: true, fullName: true } },
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

    if (dto.code) {
      const codeExists = await this.prisma.competency.findFirst({
        where: { code: { equals: dto.code, mode: 'insensitive' } },
      });
      if (codeExists) throw new ConflictException(`Código "${dto.code}" já existe`);
    }

    return this.prisma.competency.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        tags: dto.tags ?? [],
        status: dto.status ?? 'ACTIVE',
        // Campos do catálogo de Avaliação 360º — só enviados quando presentes,
        // para o schema aplicar os seus defaults nos restantes fluxos.
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.scaleMin !== undefined ? { scaleMin: dto.scaleMin } : {}),
        ...(dto.scaleMax !== undefined ? { scaleMax: dto.scaleMax } : {}),
        ...(dto.isGlobal !== undefined ? { isGlobal: dto.isGlobal } : {}),
        // tenantId: vestigial (§7 single-tenant) — encaminhado apenas para
        // preservar o comportamento histórico de /evaluation360/competencies.
        ...(dto.tenantId !== undefined ? { tenantId: dto.tenantId } : {}),
        // docs/módulo_competencies.md §2 — Informações gerais + Configuração.
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.family !== undefined ? { family: dto.family } : {}),
        ...(dto.objective !== undefined ? { objective: dto.objective } : {}),
        ...(dto.isCritical !== undefined ? { isCritical: dto.isCritical } : {}),
        ...(dto.isStrategic !== undefined ? { isStrategic: dto.isStrategic } : {}),
        ...(dto.isMandatory !== undefined ? { isMandatory: dto.isMandatory } : {}),
        ...(dto.isAssessable !== undefined ? { isAssessable: dto.isAssessable } : {}),
        ...(dto.isDevelopable !== undefined ? { isDevelopable: dto.isDevelopable } : {}),
        ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
        ...(dto.indicators?.length
          ? {
              indicators: {
                create: dto.indicators.map(ind => ({
                  level: ind.level,
                  description: ind.description,
                  examples: ind.examples,
                })),
              },
            }
          : {}),
      },
      include: { indicators: true },
    });
  }

  async update(id: number, dto: UpdateCompetencyDto) {
    await this.findOne(id);

    if (dto.name) {
      const nameConflict = await this.prisma.read.competency.findFirst({
        where: { name: { equals: dto.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (nameConflict) throw new ConflictException(`Nome "${dto.name}" já existe`);
    }

    if (dto.code) {
      const codeConflict = await this.prisma.read.competency.findFirst({
        where: { code: { equals: dto.code, mode: 'insensitive' }, id: { not: id } },
      });
      if (codeConflict) throw new ConflictException(`Código "${dto.code}" já existe`);
    }

    // `indicators` é uma relação (create aninhado) — não é atribuível num
    // update de campos escalares.
    const { indicators: _indicators, ...data } = dto;
    return this.prisma.competency.update({ where: { id }, data });
  }

  /**
   * Vista de catálogo tenant-scoped consumida por GET /evaluation360/competencies.
   * Difere de `findAll` de propósito: devolve um array simples (sem envelope
   * paginado), inclui os indicadores e filtra por `isActive`/`isGlobal`/`tenantId`
   * — preserva a forma de resposta histórica desse endpoint.
   */
  async listCatalogue(params: {
    tenantId?: string;
    search?: string;
    offset?: number;
    limit?: number;
    /** Filtra pelo array `tags` (ex.: 'FEEDBACK' — banco curado do modal
     * "Dar Feedback" contínuo, ver seedFeedbackTagCompetencies em seed.ts). */
    tag?: string;
  }) {
    const where: Prisma.CompetencyWhereInput = { isActive: true };
    if (params.tenantId) where.OR = [{ isGlobal: true }, { tenantId: params.tenantId }];
    else where.isGlobal = true;
    if (params.search) where.name = { contains: params.search };
    if (params.tag) where.tags = { has: params.tag };

    return this.prisma.read.competency.findMany({
      where,
      include: { indicators: { orderBy: { level: 'asc' } } },
      orderBy: { name: 'asc' },
      skip: params.offset ?? 0,
      take: params.limit ?? 50,
    });
  }

  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.competency.update({ where: { id }, data: { status: 'INACTIVE' } });
  }

  async remove(id: number) {
    const c = await this.findOne(id);
    if (c._count.userCompetencies > 0) {
      throw new BadRequestException(
        `Competência tem ${c._count.userCompetencies} utilizadores associados. Archive-a em vez de eliminar.`,
      );
    }
    await this.prisma.competency.delete({ where: { id } });
    return { message: 'Competência eliminada' };
  }

  // ─── NÍVEIS DE PROFICIÊNCIA ───────────────────────────────────────────────
  // docs/módulo_competencies.md §3 (Fase 2) — ver
  // docs/superpowers/specs/2026-09-25-competencies-fase2-design.md: níveis
  // continuam por-competência, esta aba só lista/gere o que já existe.

  async findAllProficiencyLevels(params: { competencyId?: number; search?: string }) {
    const where: Prisma.ProficiencyLevelWhereInput = {};
    if (params.competencyId) where.competencyId = params.competencyId;
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { competency: { name: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.read.proficiencyLevel.findMany({
      where,
      include: { competency: { select: { id: true, name: true, category: true } } },
      orderBy: [{ competencyId: 'asc' }, { value: 'asc' }],
    });
  }

  async createProficiencyLevel(dto: CreateProficiencyLevelDto) {
    await this.findOne(dto.competencyId);
    const exists = await this.prisma.proficiencyLevel.findFirst({
      where: { competencyId: dto.competencyId, value: dto.value },
    });
    if (exists) throw new ConflictException(`Nível ${dto.value} já existe para esta competência`);

    return this.prisma.proficiencyLevel.create({ data: dto });
  }

  async updateProficiencyLevel(levelId: number, dto: UpdateProficiencyLevelDto) {
    const level = await this.prisma.read.proficiencyLevel.findUnique({ where: { id: levelId } });
    if (!level) throw new NotFoundException('Nível de proficiência não encontrado');

    if (dto.value !== undefined && dto.value !== level.value) {
      const exists = await this.prisma.proficiencyLevel.findFirst({
        where: { competencyId: level.competencyId, value: dto.value, id: { not: levelId } },
      });
      if (exists) {
        throw new ConflictException(`Nível ${dto.value} já existe para esta competência`);
      }
    }

    return this.prisma.proficiencyLevel.update({ where: { id: levelId }, data: dto });
  }

  async removeProficiencyLevel(levelId: number) {
    return this.prisma.proficiencyLevel.delete({ where: { id: levelId } });
  }

  // ─── MODELOS DE COMPETÊNCIAS ──────────────────────────────────────────────
  // docs/módulo_competencies.md §4 (Fase 2) — ver
  // docs/superpowers/specs/2026-09-25-competencies-fase2-design.md.

  async findAllModels(filters: CompetencyModelFilterDto) {
    const { page = 1, limit = 20, search, departmentId, status } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.CompetencyModelWhereInput = {};
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    if (departmentId) where.departmentId = departmentId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.read.competencyModel.findMany({
        where,
        skip,
        take: limit,
        include: {
          department: { select: { id: true, name: true } },
          owner: { select: { id: true, fullName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.competencyModel.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOneModel(id: number) {
    const model = await this.prisma.read.competencyModel.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        owner: { select: { id: true, fullName: true } },
        items: {
          include: { competency: { select: { id: true, name: true, category: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!model) throw new NotFoundException('Modelo de competências não encontrado');
    return model;
  }

  async createModel(dto: CreateCompetencyModelDto) {
    if (dto.code) {
      const codeExists = await this.prisma.competencyModel.findFirst({
        where: { code: { equals: dto.code, mode: 'insensitive' } },
      });
      if (codeExists) throw new ConflictException(`Código "${dto.code}" já existe`);
    }

    return this.prisma.competencyModel.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        objective: dto.objective,
        type: dto.type,
        departmentId: dto.departmentId,
        positionFamily: dto.positionFamily,
        hierarchyLevel: dto.hierarchyLevel,
        status: dto.status ?? 'ACTIVE',
        version: dto.version ?? 1,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        ownerId: dto.ownerId,
      },
    });
  }

  async updateModel(id: number, dto: UpdateCompetencyModelDto) {
    await this.findOneModel(id);

    if (dto.code) {
      const codeConflict = await this.prisma.read.competencyModel.findFirst({
        where: { code: { equals: dto.code, mode: 'insensitive' }, id: { not: id } },
      });
      if (codeConflict) throw new ConflictException(`Código "${dto.code}" já existe`);
    }

    const { effectiveDate, endDate, ...rest } = dto;
    return this.prisma.competencyModel.update({
      where: { id },
      data: {
        ...rest,
        ...(effectiveDate !== undefined ? { effectiveDate: new Date(effectiveDate) } : {}),
        ...(endDate !== undefined ? { endDate: new Date(endDate) } : {}),
      },
    });
  }

  async removeModel(id: number) {
    const model = await this.prisma.read.competencyModel.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!model) throw new NotFoundException('Modelo de competências não encontrado');
    if (model._count.items > 0) {
      throw new BadRequestException(
        `Modelo tem ${model._count.items} competências associadas. Remova-as primeiro.`,
      );
    }
    await this.prisma.competencyModel.delete({ where: { id } });
    return { message: 'Modelo de competências eliminado' };
  }

  // find-then-write: @@unique([modelId, competencyId]) não dá para usar em
  // upsert() porque o Prisma exige o nome da chave composta no `where`, que
  // aqui é sempre construído a partir de dois IDs vindos do DTO — mesmo
  // padrão de mapToPosition acima.
  async upsertModelItem(modelId: number, dto: UpsertCompetencyModelItemDto) {
    await this.findOneModel(modelId);
    await this.findOne(dto.competencyId);

    const existing = await this.prisma.competencyModelItem.findFirst({
      where: { modelId, competencyId: dto.competencyId },
    });

    const data = {
      weight: dto.weight ?? 1,
      expectedLevel: dto.expectedLevel,
      isMandatory: dto.isMandatory ?? false,
      isCritical: dto.isCritical ?? false,
    };

    if (existing) {
      return this.prisma.competencyModelItem.update({ where: { id: existing.id }, data });
    }
    return this.prisma.competencyModelItem.create({
      data: { modelId, competencyId: dto.competencyId, ...data },
    });
  }

  async removeModelItem(modelId: number, competencyId: number) {
    return this.prisma.competencyModelItem.deleteMany({ where: { modelId, competencyId } });
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
        userId: dto.userId,
        competencyId: dto.competencyId,
        currentLevel: dto.currentLevel,
        targetLevel: dto.targetLevel ?? null,
        selfLevel: dto.source === CompetencySource.MANUAL ? dto.currentLevel : null,
        managerLevel: dto.source === CompetencySource.MANAGER ? dto.currentLevel : null,
        source: dto.source,
        notes: dto.notes,
        evidenceUrl: dto.evidenceUrl,
        evaluatedAt: new Date(),
      },
      update: {
        currentLevel: dto.currentLevel,
        targetLevel: dto.targetLevel ?? undefined,
        source: dto.source,
        notes: dto.notes ?? undefined,
        evidenceUrl: dto.evidenceUrl ?? undefined,
        evaluatedAt: new Date(),
        ...(dto.source === CompetencySource.MANAGER ? { managerLevel: dto.currentLevel } : {}),
        ...(dto.source === CompetencySource.MANUAL ? { selfLevel: dto.currentLevel } : {}),
      },
      include: { competency: true },
    });

    // Registar histórico
    if (previousLevel !== dto.currentLevel) {
      await this.prisma.competencyEvolutionLog.create({
        data: {
          userId: dto.userId,
          competencyId: dto.competencyId,
          previousLevel: previousLevel ?? 0,
          newLevel: dto.currentLevel,
          source: dto.source,
          updatedById: updatedById ?? dto.userId,
        },
      });

      // Notificar
      if (dto.source === CompetencySource.MANAGER) {
        await this.prisma.notificationLog
          .create({
            data: {
              userId: dto.userId,
              type: 'COMPETENCY_EVALUATED',
              message: `O gestor avaliou a sua competência. Nível: ${dto.currentLevel}/5`,
              metadata: JSON.stringify({}),
            },
          })
          .catch((e: unknown) => {
            this.logger.warn({
              userId: dto.userId,
              action: 'COMPETENCY_EVALUATED_NOTIFY',
              entityId: dto.competencyId,
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao notificar utilizador sobre avaliação de competência pelo gestor',
            });
          });
      }
    }

    return uc;
  }

  // Autoavaliação pelo próprio colaborador
  async selfAssess(userId: number, dto: SelfAssessmentDto) {
    return this.upsertUserCompetency(
      {
        userId,
        competencyId: dto.competencyId,
        currentLevel: dto.selfLevel,
        source: CompetencySource.MANUAL,
        notes: dto.notes,
        evidenceUrl: dto.evidenceUrl,
      },
      userId,
    );
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
        userId: dto.userId,
        competencyId: dto.competencyId,
        currentLevel: dto.managerLevel,
        managerLevel: dto.managerLevel,
        source: CompetencySource.MANAGER,
        notes: dto.feedback,
        evaluatedAt: new Date(),
      },
      update: {
        managerLevel: dto.managerLevel,
        currentLevel: dto.managerLevel,
        source: CompetencySource.MANAGER,
        notes: dto.feedback ?? undefined,
        evaluatedAt: new Date(),
      },
    });

    // Detectar divergência self vs manager
    const selfLevel = existing?.selfLevel;
    if (selfLevel !== null && selfLevel !== undefined) {
      const divergence = Math.abs(selfLevel - dto.managerLevel);
      if (divergence >= 2) {
        await this.prisma.notificationLog
          .create({
            data: {
              userId: dto.userId,
              type: 'COMPETENCY_DIVERGENCE',
              message: `Divergência significativa detectada: Autoavaliação ${selfLevel} vs Gestor ${dto.managerLevel}`,
              metadata: JSON.stringify({}),
            },
          })
          .catch((e: unknown) => {
            this.logger.warn({
              userId: dto.userId,
              action: 'COMPETENCY_DIVERGENCE_NOTIFY',
              entityId: dto.competencyId,
              err: { message: e instanceof Error ? e.message : String(e) },
              msg: 'Falha ao notificar utilizador sobre divergência de autoavaliação vs gestor',
            });
          });
      }
    }

    await this.prisma.competencyEvolutionLog.create({
      data: {
        userId: dto.userId,
        competencyId: dto.competencyId,
        previousLevel: existing?.currentLevel ?? 0,
        newLevel: dto.managerLevel,
        source: CompetencySource.MANAGER,
        updatedById: managerId,
      },
    });

    return uc;
  }

  async getUserCompetencies(userId: number) {
    const competencies = await this.prisma.read.userCompetency.findMany({
      where: { userId },
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
      gap:
        (uc.targetLevel ?? 0) > 0
          ? Math.max(0, (uc.targetLevel ?? 0) - (uc.currentLevel ?? 0))
          : null,
      divergence:
        uc.selfLevel !== null && uc.managerLevel !== null
          ? Math.abs((uc.selfLevel ?? 0) - (uc.managerLevel ?? 0))
          : null,
    }));
  }

  async getCompetencyEvolution(userId: number, competencyId?: number) {
    const where: Prisma.CompetencyEvolutionLogWhereInput = { userId };
    if (competencyId) where.competencyId = competencyId;

    return this.prisma.read.competencyEvolutionLog.findMany({
      where,
      include: { competency: { select: { id: true, name: true, category: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── GAP ANALYSIS ─────────────────────────────────────────────────────────

  async getCompetencyGap(userId: number, positionId: number) {
    const [userComps, required] = await Promise.all([
      this.prisma.read.userCompetency.findMany({
        where: { userId },
        include: { competency: true },
      }),
      this.prisma.read.positionCompetency.findMany({
        where: { positionId },
        include: {
          competency: {
            include: { courses: { include: { course: { select: { id: true, title: true } } } } },
          },
        },
      }),
    ]);

    const userMap = new Map(userComps.map(uc => [uc.competencyId, uc.currentLevel ?? 0]));

    const gaps = required.map(req => {
      const current = userMap.get(req.competencyId) ?? 0;
      const gapValue = Math.max(0, req.requiredLevel - current);
      return {
        competency: req.competency,
        requiredLevel: req.requiredLevel,
        currentLevel: current,
        gap: gapValue,
        met: current >= req.requiredLevel,
        priority: req.priority ?? 'MANDATORY',
        weight: req.weight ?? 1,
        recommendedCourses: req.competency.courses?.map(cc => cc.course) ?? [],
      };
    });

    // Ordenar: gaps críticos primeiro (maior gap × maior peso)
    gaps.sort((a, b) => b.gap * (b.weight ?? 1) - a.gap * (a.weight ?? 1));

    const totalGap = gaps.reduce((acc, g) => acc + g.gap, 0);
    const mandatoryGaps = gaps.filter(g => g.priority === 'MANDATORY' && !g.met).length;
    const readinessPercent = required.length
      ? Math.round((gaps.filter(g => g.met).length / required.length) * 100)
      : 100;

    return { gaps, totalGap, mandatoryGaps, readinessPercent, positionId, userId };
  }

  // Aba "Competências" do módulo Evaluation (docs/modulo_evaluation.md pt.6)
  // integra directamente com este motor de gap em vez de duplicar a lógica —
  // só resolve o positionId do utilizador em vez de o exigir como parâmetro,
  // já que aí o consumidor tem o userId (colaborador avaliado) mas não sabe
  // o cargo. Sem cargo atribuído devolve gaps vazio em vez de rebentar.
  async getCompetencyGapForUser(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { positionId: true },
    });
    if (!user?.positionId) {
      return {
        gaps: [],
        totalGap: 0,
        mandatoryGaps: 0,
        readinessPercent: 100,
        positionId: null,
        userId,
        noPosition: true,
      };
    }
    return this.getCompetencyGap(userId, user.positionId);
  }

  // ─── MAPEAMENTOS ──────────────────────────────────────────────────────────

  // PositionCompetency não tem @@unique([positionId, competencyId]) — suporta
  // positionId OU careerPositionId (dois modelos de cargo distintos), pelo que
  // não existe uma chave composta real para usar em upsert(). find-then-write.
  async mapToPosition(dto: MapCompetencyToPositionDto) {
    await this.findOne(dto.competencyId);

    const existing = await this.prisma.positionCompetency.findFirst({
      where: { positionId: dto.positionId, competencyId: dto.competencyId },
    });

    const data = {
      requiredLevel: dto.requiredLevel,
      priority: dto.priority,
      weight: dto.weight ?? 1,
    };

    if (existing) {
      return this.prisma.positionCompetency.update({ where: { id: existing.id }, data });
    }
    return this.prisma.positionCompetency.create({
      data: { positionId: dto.positionId, competencyId: dto.competencyId, ...data },
    });
  }

  async unmapFromPosition(positionId: number, competencyId: number) {
    return this.prisma.positionCompetency.deleteMany({ where: { positionId, competencyId } });
  }

  async mapToCourse(dto: MapCompetencyToCourseDto) {
    await this.findOne(dto.competencyId);
    return this.prisma.courseCompetency.upsert({
      where: { courseId_competencyId: { courseId: dto.courseId, competencyId: dto.competencyId } },
      create: {
        courseId: dto.courseId,
        competencyId: dto.competencyId,
        levelGained: dto.levelGained,
      },
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
        userId: dto.targetUserId,
        competencyId: dto.competencyId,
        comment: dto.comment,
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.targetUserId,
          type: 'COMPETENCY_ENDORSED',
          message: `Recebeu um endorsement numa competência`,
          metadata: JSON.stringify({}),
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId: dto.targetUserId,
          action: 'COMPETENCY_ENDORSED_NOTIFY',
          entityId: dto.competencyId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar utilizador sobre endorsement de competência recebido',
        });
      });

    return endorsement;
  }

  async getEndorsements(userId: number) {
    return this.prisma.read.competencyEndorsement.findMany({
      where: { userId },
      include: {
        competency: { select: { id: true, name: true, category: true } },
        endorser: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            position: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── SKILL MATRIX ─────────────────────────────────────────────────────────

  async getSkillMatrix(filters: SkillMatrixFilterDto = {}) {
    const { departmentId, positionId, competencyId, hierarchyLevel, userId, currentLevel } =
      filters;

    const userWhere: Prisma.UserWhereInput = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;
    if (positionId) userWhere.positionId = positionId;
    if (userId) userWhere.id = userId;
    if (hierarchyLevel) userWhere.position = { level: hierarchyLevel };

    const [users, competencies] = await Promise.all([
      this.prisma.read.user.findMany({
        where: userWhere,
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          position: { select: { name: true, level: true } },
          department: { select: { name: true } },
        },
        take: 50,
      }),
      this.prisma.read.competency.findMany({
        where: { status: 'ACTIVE', ...(competencyId ? { id: competencyId } : {}) },
        select: { id: true, name: true, category: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const userIds = users.map(u => u.id);
    const allUC = await this.prisma.read.userCompetency.findMany({
      where: { userId: { in: userIds } },
    });

    // Montar grid
    let matrix = users.map(user => {
      const userUC = allUC.filter(uc => uc.userId === user.id);
      const levels = competencies.map(comp => {
        const uc = userUC.find(u => u.competencyId === comp.id);
        return { competencyId: comp.id, level: uc?.currentLevel ?? 0 };
      });
      return { user, levels };
    });

    // Filtro por nível actual — mantém apenas colaboradores com pelo menos
    // uma competência (entre as filtradas) no nível pedido.
    if (currentLevel !== undefined) {
      matrix = matrix.filter(row => row.levels.some(l => l.level === currentLevel));
    }

    const filteredUserIds = new Set(matrix.map(row => row.user.id));
    return {
      users: users.filter(u => filteredUserIds.has(u.id)),
      competencies,
      matrix,
    };
  }

  // ─── AVALIAÇÕES (docs/módulo_competencies.md §6) ─────────────────────────
  // A avaliação em si acontece nos módulos Evaluation/Evaluation360 — aqui
  // apresentamos o resultado já gravado em UserCompetency (via selfAssess /
  // managerAssess / upsertUserCompetency / updateFromCourse), enriquecido com
  // o avaliador resolvido a partir do CompetencyEvolutionLog mais recente.

  private static readonly EVALUATION_TYPE_LABELS: Record<CompetencySource, string> = {
    MANUAL: 'Autoavaliação',
    MANAGER: 'Avaliação do gestor',
    ASSESSMENT: 'Avaliação técnica',
    COURSE: 'Avaliação de certificação',
    TRAINING: 'Avaliação de formação',
    HRIS: 'Importação HRIS',
  };

  async getEvaluations(filters: CompetencyEvaluationFilterDto = {}) {
    const { userId, competencyId, departmentId, positionId, hierarchyLevel, source, status } =
      filters;

    const userWhere: Prisma.UserWhereInput = {};
    if (userId) userWhere.id = userId;
    if (departmentId) userWhere.departmentId = departmentId;
    if (positionId) userWhere.positionId = positionId;
    if (hierarchyLevel) userWhere.position = { level: hierarchyLevel };

    const where: Prisma.UserCompetencyWhereInput = {};
    if (competencyId) where.competencyId = competencyId;
    if (source) where.source = source;
    if (Object.keys(userWhere).length) where.user = userWhere;

    const rows = await this.prisma.read.userCompetency.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        },
        competency: { select: { id: true, name: true, category: true } },
      },
      orderBy: { evaluatedAt: 'desc' },
      take: 200,
    });

    // Resolver avaliador via log de evolução mais recente de cada par
    // (userId, competencyId) — UserCompetency não guarda o avaliador.
    const evolutionLogs = rows.length
      ? await this.prisma.read.competencyEvolutionLog.findMany({
          where: {
            OR: rows.map(r => ({ userId: r.userId, competencyId: r.competencyId })),
          },
          orderBy: { createdAt: 'desc' },
          select: { userId: true, competencyId: true, updatedById: true },
        })
      : [];

    const latestLogByPair = new Map<string, (typeof evolutionLogs)[number]>();
    for (const log of evolutionLogs) {
      const key = `${log.userId}:${log.competencyId}`;
      if (!latestLogByPair.has(key)) latestLogByPair.set(key, log);
    }

    const evaluatorIds = [
      ...new Set(
        [...latestLogByPair.values()]
          .map(l => l.updatedById)
          .filter((id): id is number => id != null),
      ),
    ];
    const evaluators = evaluatorIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: evaluatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const evaluatorMap = new Map(evaluators.map(e => [e.id, e.fullName]));

    let results = rows.map(uc => {
      const gap = uc.targetLevel != null ? Math.max(0, uc.targetLevel - uc.currentLevel) : null;
      const evalStatus: CompetencyEvaluationStatus =
        uc.targetLevel == null
          ? CompetencyEvaluationStatus.SEM_META
          : gap === 0
            ? CompetencyEvaluationStatus.ATINGIDO
            : CompetencyEvaluationStatus.ABAIXO_DO_ESPERADO;

      const log = latestLogByPair.get(`${uc.userId}:${uc.competencyId}`);
      const evaluatorId = log?.updatedById ?? null;
      const evaluator =
        evaluatorId === uc.userId
          ? uc.user.fullName
          : evaluatorId != null
            ? (evaluatorMap.get(evaluatorId) ?? null)
            : null;

      return {
        id: uc.id,
        colaborador: uc.user.fullName,
        colaboradorId: uc.userId,
        colaboradorAvatarUrl: uc.user.avatarUrl,
        departamento: uc.user.department?.name ?? null,
        cargo: uc.user.position?.name ?? null,
        avaliador: evaluator,
        competencia: uc.competency.name,
        competenciaId: uc.competencyId,
        categoria: uc.competency.category,
        tipoAvaliacao: CompetenciesService.EVALUATION_TYPE_LABELS[uc.source],
        source: uc.source,
        nivelObtido: uc.currentLevel,
        nivelEsperado: uc.targetLevel,
        gap,
        data: uc.evaluatedAt,
        estado: evalStatus,
        comentarios: uc.notes,
        evidencias: uc.evidenceUrl,
        proximaAvaliacao: null as Date | null,
      };
    });

    if (status) results = results.filter(r => r.estado === status);

    return results;
  }

  // ─── GAPS DE COMPETÊNCIAS (docs/módulo_competencies.md §7) ───────────────
  // Mostra onde existe diferença entre o nível actual e o nível necessário —
  // reaproveita UserCompetency.currentLevel/targetLevel (mesma fonte de
  // dados do §6), filtrado a gap > 0. Prioridade e Estado não são
  // persistidos: prioridade deriva da dimensão do gap (bonificada quando a
  // competência é crítica); estado deriva do PDI/acção de desenvolvimento
  // ligado a este par (userId, competencyId), quando existe.

  private static priorityForGap(gap: number, isCritical: boolean): CompetencyGapPriority {
    const tiers = [
      CompetencyGapPriority.LOW,
      CompetencyGapPriority.MEDIUM,
      CompetencyGapPriority.HIGH,
      CompetencyGapPriority.CRITICAL,
    ];
    const tier = gap >= 4 ? 3 : gap === 3 ? 2 : gap === 2 ? 1 : 0;
    return tiers[isCritical ? Math.min(3, tier + 1) : tier];
  }

  private static gapStatusForPlan(planStatus: string): CompetencyGapStatus {
    switch (planStatus) {
      case 'ACTIVE':
        return CompetencyGapStatus.EM_DESENVOLVIMENTO;
      case 'PAUSED':
      case 'AT_RISK':
      case 'OVERDUE':
      case 'COMPLETED':
      case 'PARTIALLY_COMPLETED':
        return CompetencyGapStatus.EM_ACOMPANHAMENTO;
      case 'CANCELLED':
        return CompetencyGapStatus.ENCERRADO;
      default:
        return CompetencyGapStatus.IDENTIFICADO;
    }
  }

  async getGaps(filters: CompetencyGapFilterDto = {}) {
    const {
      userId,
      competencyId,
      departmentId,
      positionId,
      hierarchyLevel,
      priority,
      status,
      isCritical,
    } = filters;

    const userWhere: Prisma.UserWhereInput = { active: true };
    if (userId) userWhere.id = userId;
    if (departmentId) userWhere.departmentId = departmentId;
    if (positionId) userWhere.positionId = positionId;
    if (hierarchyLevel) userWhere.position = { level: hierarchyLevel };

    const where: Prisma.UserCompetencyWhereInput = { targetLevel: { not: null }, user: userWhere };
    if (competencyId) where.competencyId = competencyId;
    if (isCritical !== undefined) where.competency = { isCritical };

    const rows = await this.prisma.read.userCompetency.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { id: true, name: true } },
            position: { select: { name: true } },
          },
        },
        competency: {
          select: { id: true, name: true, category: true, isCritical: true, isStrategic: true },
        },
      },
      orderBy: { evaluatedAt: 'desc' },
      take: 300,
    });

    const gapped = rows.filter(uc => (uc.targetLevel ?? 0) > uc.currentLevel);
    if (!gapped.length) return [];

    // PDIs dos colaboradores com gap — resolvem "Plano de desenvolvimento
    // associado" e "Estado" via PdiCompetencyGap ou via acção cujo
    // competencyIds inclua a competência em causa.
    const plans = await this.prisma.read.developmentPlan.findMany({
      where: { userId: { in: [...new Set(gapped.map(g => g.userId))] } },
      select: {
        id: true,
        name: true,
        status: true,
        userId: true,
        updatedAt: true,
        competencyGaps: { select: { competencyId: true } },
        actions: { select: { competencyIds: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const planForGap = (uId: number, cId: number) =>
      plans.find(
        p =>
          p.userId === uId &&
          (p.competencyGaps.some(g => g.competencyId === cId) ||
            p.actions.some(a => a.competencyIds.includes(cId))),
      ) ?? null;

    let results = gapped.map(uc => {
      const gap = (uc.targetLevel ?? 0) - uc.currentLevel;
      const plan = planForGap(uc.userId, uc.competencyId);
      return {
        id: uc.id,
        colaborador: uc.user.fullName,
        colaboradorId: uc.userId,
        colaboradorAvatarUrl: uc.user.avatarUrl,
        departamentoId: uc.user.department?.id ?? null,
        departamento: uc.user.department?.name ?? null,
        cargo: uc.user.position?.name ?? null,
        competencia: uc.competency.name,
        competenciaId: uc.competencyId,
        categoria: uc.competency.category,
        nivelAtual: uc.currentLevel,
        nivelEsperado: uc.targetLevel,
        gap,
        prioridade: CompetenciesService.priorityForGap(gap, uc.competency.isCritical),
        competenciaCritica: uc.competency.isCritical,
        impacto:
          uc.competency.isCritical && uc.competency.isStrategic
            ? 'ALTO'
            : uc.competency.isCritical || uc.competency.isStrategic
              ? 'MEDIO'
              : 'BAIXO',
        dataIdentificacao: uc.evaluatedAt,
        planoDesenvolvimentoAssociado: plan ? { id: plan.id, name: plan.name } : null,
        estado: plan
          ? CompetenciesService.gapStatusForPlan(plan.status)
          : CompetencyGapStatus.IDENTIFICADO,
      };
    });

    if (priority) results = results.filter(r => r.prioridade === priority);
    if (status) results = results.filter(r => r.estado === status);

    results.sort((a, b) => b.gap - a.gap);
    return results;
  }

  // ─── DESENVOLVIMENTO (docs/módulo_competencies.md §8) ────────────────────
  // Liga as lacunas de competências às acções de desenvolvimento do PDI
  // (DevelopmentPlanAction.competencyIds) — integração com Development
  // Plans/PDI, Trainings e Courses (via action.courseId). Uma acção pode
  // endereçar várias competências: expandida aqui para uma linha por
  // (acção, competência), como o Artillery/UI espera consumir.

  async getDevelopmentActions(filters: DevelopmentActionFilterDto = {}) {
    const { userId, competencyId, planId, departmentId, type, status } = filters;

    const planWhere: Prisma.DevelopmentPlanWhereInput = {};
    if (userId) planWhere.userId = userId;
    if (planId) planWhere.id = planId;
    if (departmentId) planWhere.user = { departmentId };

    const actionWhere: Prisma.DevelopmentPlanActionWhereInput = {
      competencyIds: { isEmpty: false },
      plan: planWhere,
    };
    if (type) actionWhere.type = type;
    if (status) actionWhere.status = status;
    if (competencyId) actionWhere.competencyIds = { has: competencyId };

    const actions = await this.prisma.read.developmentPlanAction.findMany({
      where: actionWhere,
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            userId: true,
            startDate: true,
            activatedAt: true,
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                department: { select: { name: true } },
              },
            },
            manager: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    if (!actions.length) return [];

    const competencyIds = [...new Set(actions.flatMap(a => a.competencyIds))];
    const courseIds = [
      ...new Set(actions.map(a => a.courseId).filter((id): id is number => id != null)),
    ];

    const pairKeys = new Set<string>();
    const pairConditions: Array<{ userId: number; competencyId: number }> = [];
    for (const a of actions) {
      for (const cId of a.competencyIds) {
        const key = `${a.plan.userId}:${cId}`;
        if (!pairKeys.has(key)) {
          pairKeys.add(key);
          pairConditions.push({ userId: a.plan.userId, competencyId: cId });
        }
      }
    }

    const [competencies, userComps, courses, evolutionLogs] = await Promise.all([
      this.prisma.read.competency.findMany({
        where: { id: { in: competencyIds } },
        select: { id: true, name: true, category: true },
      }),
      this.prisma.read.userCompetency.findMany({
        where: { OR: pairConditions },
      }),
      courseIds.length
        ? this.prisma.read.course.findMany({
            where: { id: { in: courseIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      this.prisma.read.competencyEvolutionLog.findMany({
        where: { OR: pairConditions },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const competencyMap = new Map(competencies.map(c => [c.id, c]));
    const courseMap = new Map(courses.map(c => [c.id, c.title]));
    const ucMap = new Map(userComps.map(uc => [`${uc.userId}:${uc.competencyId}`, uc]));

    const latestLogByPair = new Map<string, (typeof evolutionLogs)[number]>();
    for (const log of evolutionLogs) {
      const key = `${log.userId}:${log.competencyId}`;
      if (!latestLogByPair.has(key)) latestLogByPair.set(key, log);
    }

    return actions.flatMap(action =>
      action.competencyIds
        .map(cId => {
          const comp = competencyMap.get(cId);
          if (!comp) return null;

          const uc = ucMap.get(`${action.plan.userId}:${cId}`);
          const log = latestLogByPair.get(`${action.plan.userId}:${cId}`);
          const hasResult = action.status === 'COMPLETED' && log != null;

          return {
            id: `${action.id}:${cId}`,
            actionId: action.id,
            colaborador: action.plan.user.fullName,
            colaboradorId: action.plan.userId,
            colaboradorAvatarUrl: action.plan.user.avatarUrl,
            departamento: action.plan.user.department?.name ?? null,
            competencia: comp.name,
            competenciaId: cId,
            categoria: comp.category,
            gap: uc?.targetLevel != null ? Math.max(0, uc.targetLevel - uc.currentLevel) : null,
            nivelAtual: uc?.currentLevel ?? null,
            nivelObjetivo: uc?.targetLevel ?? null,
            acao: action.title,
            tipoAcao: action.type,
            cursoFormacao: action.courseId ? (courseMap.get(action.courseId) ?? null) : null,
            cursoFormacaoId: action.courseId,
            pdiAssociado: { id: action.plan.id, name: action.plan.name },
            responsavel: action.plan.manager?.fullName ?? null,
            dataInicio: action.plan.startDate ?? action.plan.activatedAt,
            dataPrevistaConclusao: action.dueDate,
            estado: action.status,
            progresso: action.progress,
            resultado: hasResult
              ? log!.newLevel > log!.previousLevel
                ? DevelopmentResult.MELHOROU
                : DevelopmentResult.MANTEVE
              : DevelopmentResult.PENDENTE,
            nivelAposDesenvolvimento: hasResult ? log!.newLevel : null,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r != null),
    );
  }

  // ─── ANALYTICS & DASHBOARD ───────────────────────────────────────────────

  async getTopCompetencies(limit = 10) {
    const grouped = await this.prisma.read.userCompetency.groupBy({
      by: ['competencyId'],
      _count: { competencyId: true },
      _avg: { currentLevel: true },
      orderBy: { _count: { competencyId: 'desc' } },
      take: limit,
    });

    // Enriquecer com nomes
    const ids = grouped.map(g => g.competencyId);
    const comps = await this.prisma.read.competency.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, category: true },
    });
    const compMap = new Map(comps.map(c => [c.id, c]));

    return grouped.map(g => ({
      ...g,
      competency: compMap.get(g.competencyId),
      avgLevel: Math.round((g._avg.currentLevel ?? 0) * 10) / 10,
    }));
  }

  async getOrgGapDashboard(departmentId?: number) {
    const userWhere: Prisma.UserWhereInput = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const users = await this.prisma.read.user.findMany({
      where: userWhere,
      select: { id: true, positionId: true },
    });

    const totalUsers = users.length;
    const usersWithComps = await this.prisma.read.userCompetency.findMany({
      where: { userId: { in: users.map(u => u.id) } },
      select: { userId: true, competencyId: true, currentLevel: true, targetLevel: true },
    });

    // Gaps totais
    const gapsCount = usersWithComps.filter(
      uc => (uc.targetLevel ?? 0) > 0 && (uc.currentLevel ?? 0) < (uc.targetLevel ?? 0),
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

    const criticalComps = await this.prisma.read.competency.findMany({
      where: { id: { in: criticalCompetencyIds } },
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

  /**
   * docs/módulo_competencies.md §1 — Visão Geral (tab 1). Agregados
   * organização-wide, sem filtro de departamento (ao contrário de
   * getOrgGapDashboard, cujo cálculo de gaps por competência é reaproveitado
   * aqui, sem o filtro).
   */
  async getOverview() {
    const [total, byCategory, critical, strategic, active, inReview] = await Promise.all([
      this.prisma.read.competency.count(),
      this.prisma.read.competency.groupBy({ by: ['category'], _count: { category: true } }),
      this.prisma.read.competency.count({ where: { isCritical: true } }),
      this.prisma.read.competency.count({ where: { isStrategic: true } }),
      this.prisma.read.competency.count({ where: { status: 'ACTIVE' } }),
      this.prisma.read.competency.count({ where: { status: 'IN_REVIEW' } }),
    ]);

    const categoryCounts: Record<string, number> = {};
    for (const c of byCategory) categoryCounts[c.category] = c._count.category;

    const allUC = await this.prisma.read.userCompetency.findMany({
      select: { userId: true, competencyId: true, currentLevel: true, targetLevel: true },
    });

    const avgProficiency = allUC.length
      ? Math.round((allUC.reduce((sum, uc) => sum + uc.currentLevel, 0) / allUC.length) * 10) / 10
      : 0;

    const gapMap: Record<number, number> = {};
    for (const uc of allUC) {
      if ((uc.targetLevel ?? 0) > (uc.currentLevel ?? 0)) {
        gapMap[uc.competencyId] = (gapMap[uc.competencyId] ?? 0) + 1;
      }
    }

    const topGapIds = Object.entries(gapMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([id]) => parseInt(id));

    const topGapComps = await this.prisma.read.competency.findMany({
      where: { id: { in: topGapIds } },
      select: { id: true, name: true, category: true, isCritical: true },
    });

    const biggestGaps = topGapComps
      .map(c => ({ ...c, usersWithGap: gapMap[c.id] ?? 0 }))
      .sort((a, b) => b.usersWithGap - a.usersWithGap);

    const criticalAlerts = biggestGaps.filter(c => c.isCritical);

    return {
      total,
      byCategory: {
        technical: categoryCounts['HARD_SKILL'] ?? 0,
        behavioral: categoryCounts['SOFT_SKILL'] ?? 0,
        leadership: categoryCounts['LEADERSHIP'] ?? 0,
        functional: categoryCounts['FUNCTIONAL'] ?? 0,
        language: categoryCounts['LANGUAGE'] ?? 0,
        tool: categoryCounts['TOOL'] ?? 0,
      },
      critical,
      strategic,
      active,
      inReview,
      avgProficiency,
      evaluatedUsers: new Set(allUC.map(uc => uc.userId)).size,
      biggestGaps,
      criticalAlerts,
      topCompetencies: await this.getTopCompetencies(5),
      // Depende do tab 6 (Avaliações), ainda não construído neste módulo —
      // null ≠ 0: a UI mostra "—", nunca afirma "0 pendentes".
      pendingEvaluations: null as number | null,
    };
  }

  async getRecommendations(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
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
    const courseComps = await this.prisma.read.courseCompetency.findMany({
      where: { courseId },
    });

    for (const cc of courseComps) {
      const existing = await this.prisma.userCompetency.findFirst({
        where: { userId, competencyId: cc.competencyId },
      });
      const newLevel = Math.min(5, Math.max(existing?.currentLevel ?? 0, cc.levelGained ?? 1));

      if (!existing || existing.currentLevel < newLevel) {
        await this.upsertUserCompetency({
          userId,
          competencyId: cc.competencyId,
          currentLevel: newLevel,
          source: CompetencySource.COURSE,
        });
      }
    }

    this.logger.log(`Competências actualizadas para user ${userId} após curso ${courseId}`);
  }

  // docs/trainings-detalhado.md — Fluxo completo do Trainings: Conclusão →
  // Certificação → Competências → PDI/Carreira. Mesmo padrão de
  // updateFromCourse acima, chamado por TrainingService.updateParticipantStatus
  // quando um participante conclui uma Training. TrainingCompetency não tem
  // `levelGained` (ao contrário de CourseCompetency) — concluir a formação
  // garante pelo menos o nível 1 na competência associada.
  async updateFromTraining(userId: number, trainingId: number) {
    const trainingComps = await this.prisma.read.trainingCompetency.findMany({
      where: { trainingId },
    });

    for (const tc of trainingComps) {
      const existing = await this.prisma.userCompetency.findFirst({
        where: { userId, competencyId: tc.competencyId },
      });
      const newLevel = Math.min(5, Math.max(existing?.currentLevel ?? 0, 1));

      if (!existing || existing.currentLevel < newLevel) {
        await this.upsertUserCompetency({
          userId,
          competencyId: tc.competencyId,
          currentLevel: newLevel,
          source: CompetencySource.TRAINING,
        });
      }
    }

    this.logger.log(`Competências actualizadas para user ${userId} após formação ${trainingId}`);
  }

  // ─── RELATÓRIOS (docs/módulo_competencies.md §9) ─────────────────────────
  // Sem tabela própria — os 14 relatórios são todos derivados, no momento da
  // leitura, do mesmo par de conjuntos (utilizadores que cumprem os filtros ×
  // competências que cumprem os filtros) e das linhas de UserCompetency que
  // os ligam. Mesma filosofia de "sem tabela nova" da Decisão 1 do §7/§8 (ver
  // docs/superpowers/specs/2026-09-24-competencies-fase3-gaps-desenvolvimento-design.md).
  // "Impacto das formações" é a única secção que sai deste par e vai directo
  // a CompetencyEvolutionLog (source TRAINING/COURSE), porque mede evolução
  // no tempo, não o estado actual.

  private static round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  private static avg(values: number[]): number {
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  }

  private static groupCompetencyRows<
    T extends { userId: number; competencyId: number; currentLevel: number },
  >(rows: T[], labelFn: (r: T) => string) {
    const map = new Map<
      string,
      { levels: number[]; userIds: Set<number>; competencyIds: Set<number> }
    >();
    for (const r of rows) {
      const label = labelFn(r);
      let entry = map.get(label);
      if (!entry) {
        entry = { levels: [], userIds: new Set(), competencyIds: new Set() };
        map.set(label, entry);
      }
      entry.levels.push(r.currentLevel);
      entry.userIds.add(r.userId);
      entry.competencyIds.add(r.competencyId);
    }
    return [...map.entries()]
      .map(([label, e]) => ({
        label,
        totalCompetencies: e.competencyIds.size,
        usersAssessed: e.userIds.size,
        avgLevel: CompetenciesService.round1(CompetenciesService.avg(e.levels)),
      }))
      .sort((a, b) => b.totalCompetencies - a.totalCompetencies);
  }

  private static groupGapRows<
    T extends { userId: number; currentLevel: number; targetLevel: number | null },
  >(rows: T[], labelFn: (r: T) => string) {
    const map = new Map<string, { gaps: number[]; userIds: Set<number> }>();
    for (const r of rows) {
      const label = labelFn(r);
      let entry = map.get(label);
      if (!entry) {
        entry = { gaps: [], userIds: new Set() };
        map.set(label, entry);
      }
      entry.gaps.push((r.targetLevel ?? 0) - r.currentLevel);
      entry.userIds.add(r.userId);
    }
    return [...map.entries()]
      .map(([label, e]) => ({
        label,
        count: e.gaps.length,
        usersWithGap: e.userIds.size,
        avgGap: CompetenciesService.round1(CompetenciesService.avg(e.gaps)),
      }))
      .sort((a, b) => b.count - a.count);
  }

  /** Departamentos elegíveis para o filtro "Departamento" — o próprio +
   *  filhos directos — ou só o "Subdepartamento" pedido, quando presente. */
  private async resolveReportDepartmentIds(filters: CompetencyReportFilterDto) {
    if (filters.subDepartmentId) return [filters.subDepartmentId];
    if (!filters.departmentId) return undefined;
    const children = await this.prisma.read.department.findMany({
      where: { parentId: filters.departmentId },
      select: { id: true },
    });
    return [filters.departmentId, ...children.map(c => c.id)];
  }

  async getReports(filters: CompetencyReportFilterDto = {}) {
    const departmentIds = await this.resolveReportDepartmentIds(filters);

    const userWhere: Prisma.UserWhereInput = { active: true };
    if (filters.unitId) userWhere.unitId = filters.unitId;
    if (departmentIds) userWhere.departmentId = { in: departmentIds };
    if (filters.positionId) userWhere.positionId = filters.positionId;
    if (filters.hierarchyLevel) userWhere.position = { level: filters.hierarchyLevel };

    const competencyWhere: Prisma.CompetencyWhereInput = {};
    if (filters.competencyId) competencyWhere.id = filters.competencyId;
    if (filters.category) competencyWhere.category = filters.category;
    if (filters.status) competencyWhere.status = filters.status;

    const dateRange: { gte?: Date; lte?: Date } | undefined =
      filters.from || filters.to
        ? {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          }
        : undefined;

    const [users, competencies] = await Promise.all([
      this.prisma.read.user.findMany({
        where: userWhere,
        select: {
          id: true,
          department: { select: { name: true } },
          position: { select: { name: true, level: true } },
          unit: { select: { name: true } },
        },
      }),
      this.prisma.read.competency.findMany({
        where: competencyWhere,
        select: { id: true, name: true, category: true, isCritical: true, isStrategic: true },
      }),
    ]);

    const userIds = users.map(u => u.id);
    const userMap = new Map(users.map(u => [u.id, u]));
    const competencyIds = competencies.map(c => c.id);
    const competencyMap = new Map(competencies.map(c => [c.id, c]));

    const ucWhere: Prisma.UserCompetencyWhereInput = {
      userId: { in: userIds },
      competencyId: { in: competencyIds },
    };
    if (dateRange) ucWhere.evaluatedAt = dateRange;

    const rows = await this.prisma.read.userCompetency.findMany({
      where: ucWhere,
      select: { userId: true, competencyId: true, currentLevel: true, targetLevel: true },
    });

    // Linhas enriquecidas com o rótulo já resolvido — evita repetir o lookup
    // em userMap dentro de cada groupBy abaixo.
    const enriched = rows.map(r => {
      const u = userMap.get(r.userId);
      return {
        ...r,
        department: u?.department?.name ?? 'Sem departamento',
        position: u?.position?.name ?? 'Sem cargo',
        unit: u?.unit?.name ?? 'Sem unidade',
        hierarchyLevel: u?.position?.level ?? 'Sem nível',
      };
    });

    const gapped = enriched.filter(r => (r.targetLevel ?? 0) > r.currentLevel);

    // 1. Mapa geral de competências
    const byCategoryMap: Record<string, number> = {};
    for (const c of competencies) byCategoryMap[c.category] = (byCategoryMap[c.category] ?? 0) + 1;
    const mapaGeral = {
      totalCompetencies: competencies.length,
      byCategory: byCategoryMap,
      critical: competencies.filter(c => c.isCritical).length,
      strategic: competencies.filter(c => c.isStrategic).length,
      usersEligible: users.length,
      usersAssessed: new Set(enriched.map(r => r.userId)).size,
    };

    // 2/3/4. Competências por departamento / cargo / unidade
    const porDepartamento = CompetenciesService.groupCompetencyRows(enriched, r => r.department);
    const porCargo = CompetenciesService.groupCompetencyRows(enriched, r => r.position);
    const porUnidade = CompetenciesService.groupCompetencyRows(enriched, r => r.unit);

    // 5. Nível médio de proficiência (geral + por categoria)
    const byCategoryLevels = new Map<string, number[]>();
    for (const r of enriched) {
      const comp = competencyMap.get(r.competencyId);
      if (!comp) continue;
      const arr = byCategoryLevels.get(comp.category) ?? [];
      arr.push(r.currentLevel);
      byCategoryLevels.set(comp.category, arr);
    }
    const nivelMedioProficiencia = {
      geral: CompetenciesService.round1(CompetenciesService.avg(enriched.map(r => r.currentLevel))),
      porCategoria: [...byCategoryLevels.entries()].map(([category, levels]) => ({
        category,
        avgLevel: CompetenciesService.round1(CompetenciesService.avg(levels)),
        count: levels.length,
      })),
    };

    // 6/7/8. Gaps (geral / por departamento / por cargo)
    const gaps = {
      total: gapped.length,
      usersWithGap: new Set(gapped.map(r => r.userId)).size,
      avgGap: CompetenciesService.round1(
        CompetenciesService.avg(gapped.map(r => (r.targetLevel ?? 0) - r.currentLevel)),
      ),
    };
    const gapsPorDepartamento = CompetenciesService.groupGapRows(gapped, r => r.department);
    const gapsPorCargo = CompetenciesService.groupGapRows(gapped, r => r.position);

    // 9. Competências críticas
    const competenciasCriticas = competencies
      .filter(c => c.isCritical)
      .map(c => {
        const compRows = enriched.filter(r => r.competencyId === c.id);
        const compGapped = compRows.filter(r => (r.targetLevel ?? 0) > r.currentLevel);
        return {
          id: c.id,
          name: c.name,
          category: c.category,
          usersAssessed: compRows.length,
          usersWithGap: compGapped.length,
          avgLevel: compRows.length
            ? CompetenciesService.round1(CompetenciesService.avg(compRows.map(r => r.currentLevel)))
            : 0,
        };
      })
      .sort((a, b) => b.usersWithGap - a.usersWithGap);

    // 10. Competências mais desenvolvidas (mais colaboradores com registo)
    const developedCount = new Map<number, number>();
    for (const r of enriched)
      developedCount.set(r.competencyId, (developedCount.get(r.competencyId) ?? 0) + 1);
    const maisDesenvolvidas = [...developedCount.entries()]
      .map(([id, count]) => ({
        id,
        name: competencyMap.get(id)?.name ?? '—',
        category: competencyMap.get(id)?.category,
        usersAssessed: count,
      }))
      .sort((a, b) => b.usersAssessed - a.usersAssessed)
      .slice(0, 10);

    // 11. Competências com maior défice (soma dos gaps)
    const deficitSum = new Map<number, number>();
    for (const r of gapped) {
      deficitSum.set(
        r.competencyId,
        (deficitSum.get(r.competencyId) ?? 0) + ((r.targetLevel ?? 0) - r.currentLevel),
      );
    }
    const maiorDefice = [...deficitSum.entries()]
      .map(([id, totalGap]) => ({
        id,
        name: competencyMap.get(id)?.name ?? '—',
        category: competencyMap.get(id)?.category,
        totalGap,
      }))
      .sort((a, b) => b.totalGap - a.totalGap)
      .slice(0, 10);

    // 12. Colaboradores abaixo do nível esperado
    const belowByUser = new Map<number, number>();
    for (const r of gapped) belowByUser.set(r.userId, (belowByUser.get(r.userId) ?? 0) + 1);
    const colaboradoresAbaixoDoEsperado = [...belowByUser.entries()]
      .map(([userId, gapsCount]) => {
        const u = userMap.get(userId);
        return {
          userId,
          department: u?.department?.name ?? null,
          position: u?.position?.name ?? null,
          gapsCount,
        };
      })
      .sort((a, b) => b.gapsCount - a.gapsCount);

    // 13. Competências por nível hierárquico
    const porNivelHierarquico = CompetenciesService.groupCompetencyRows(
      enriched,
      r => r.hierarchyLevel,
    );

    // 14. Impacto das formações na proficiência — evolução atribuída a
    // CompetencyEvolutionLog com source TRAINING/COURSE (updateFromTraining/
    // updateFromCourse acima), não ao estado actual de UserCompetency.
    const evolutionWhere: Prisma.CompetencyEvolutionLogWhereInput = {
      userId: { in: userIds },
      competencyId: { in: competencyIds },
      source: { in: ['TRAINING', 'COURSE'] },
    };
    if (dateRange) evolutionWhere.createdAt = dateRange;
    const evolutionLogs = await this.prisma.read.competencyEvolutionLog.findMany({
      where: evolutionWhere,
      select: { source: true, previousLevel: true, newLevel: true },
    });
    const deltas = evolutionLogs.map(l => l.newLevel - l.previousLevel);
    const impactoFormacoes = {
      events: evolutionLogs.length,
      improved: deltas.filter(d => d > 0).length,
      avgLevelIncrease: CompetenciesService.round1(CompetenciesService.avg(deltas)),
      bySource: (['TRAINING', 'COURSE'] as const).map(source => {
        const subset = evolutionLogs.filter(l => l.source === source);
        return {
          source,
          events: subset.length,
          avgLevelIncrease: CompetenciesService.round1(
            CompetenciesService.avg(subset.map(l => l.newLevel - l.previousLevel)),
          ),
        };
      }),
    };

    return {
      filters,
      mapaGeral,
      porDepartamento,
      porCargo,
      porUnidade,
      nivelMedioProficiencia,
      gaps,
      gapsPorDepartamento,
      gapsPorCargo,
      competenciasCriticas,
      maisDesenvolvidas,
      maiorDefice,
      colaboradoresAbaixoDoEsperado: {
        total: colaboradoresAbaixoDoEsperado.length,
        items: colaboradoresAbaixoDoEsperado.slice(0, 50),
      },
      porNivelHierarquico,
      impactoFormacoes,
    };
  }

  async exportReportsCsv(filters: CompetencyReportFilterDto = {}): Promise<string> {
    const report = await this.getReports(filters);
    const rows = [
      { metrica: 'Total de competências', valor: report.mapaGeral.totalCompetencies },
      { metrica: 'Competências críticas', valor: report.mapaGeral.critical },
      { metrica: 'Competências estratégicas', valor: report.mapaGeral.strategic },
      { metrica: 'Colaboradores elegíveis', valor: report.mapaGeral.usersEligible },
      { metrica: 'Colaboradores avaliados', valor: report.mapaGeral.usersAssessed },
      { metrica: 'Nível médio de proficiência', valor: report.nivelMedioProficiencia.geral },
      { metrica: 'Gaps de competências (total)', valor: report.gaps.total },
      { metrica: 'Gap médio', valor: report.gaps.avgGap },
      { metrica: 'Colaboradores com gap', valor: report.gaps.usersWithGap },
      {
        metrica: 'Colaboradores abaixo do nível esperado',
        valor: report.colaboradoresAbaixoDoEsperado.total,
      },
      {
        metrica: 'Eventos de formação com impacto na proficiência',
        valor: report.impactoFormacoes.events,
      },
      {
        metrica: 'Aumento médio de nível por formação/curso',
        valor: report.impactoFormacoes.avgLevelIncrease,
      },
    ];
    return buildCsvString(rows, ['metrica', 'valor']);
  }
}

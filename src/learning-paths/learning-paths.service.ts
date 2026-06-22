import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LearningPathsCreateLearningPathDto,
  UpdateLearningPathDto,
  LearningPathFilterDto,
  AssignLearningPathDto,
  LearningPathStepDto,
  ReorderStepsDto,
  AssignmentTarget,
} from './learning-paths.dto';

@Injectable()
export class LearningPathsService {
  private readonly logger = new Logger(LearningPathsService.name);
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }


  constructor(private prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async calcTotalHours(learningPathId: number): Promise<number> {
    const steps = await this.prismaRead.learningPathCourse.findMany({
      where: { learningPathId },
      include: { course: { select: { workloadHours: true } } },
    });
    return steps.reduce((sum, s) => sum + ((s.course as any)?.workloadHours ?? 0), 0);
  }

  // ─── CATÁLOGO ─────────────────────────────────────────────────────────────

  async findAll(filters: LearningPathFilterDto) {
    const { page = 1, limit = 20, search, status, level, pathType, mandatory, category } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (level) where.level = level;
    if (pathType) where.pathType = pathType;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prismaRead.learningPath.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { courses: true, assignments: true, enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaRead.learningPath.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const lp = await this.prismaRead.learningPath.findUnique({
      where: { id },
      include: {
        courses: {
          orderBy: { seq: 'asc' },
          include: {
            course: {
              select: {
                id: true,
                title: true,
                thumbnailUrl: true,
                category: true,
                level: true,
                workloadHours: true,
                status: true,
                _count: { select: { modules: true } },
              },
            },
          },
        },
        milestones: { orderBy: { seq: 'asc' } },
        _count: { select: { courses: true, assignments: true, enrollments: true } },
      },
    });
    if (!lp) throw new NotFoundException('Trilha de aprendizagem não encontrada');
    return lp;
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: LearningPathsCreateLearningPathDto) {
    const { courseIds, ...data } = dto;

    const lp = await this.prisma.learningPath.create({
      data: {
        title: data.title,
        shortDescription: data.shortDescription,
        description: data.description,
        objective: data.objective,
        thumbnailUrl: data.thumbnailUrl,
        category: data.category,
        tags: data.tags ?? [],
        level: data.level ?? 'BEGINNER',
        pathType: data.pathType ?? 'CUSTOM',
        progressionType: data.progressionType ?? 'SEQUENTIAL',
        status: data.status ?? 'DRAFT',
        mandatory: data.mandatory ?? false,
        language: data.language ?? 'pt',
        deadline: data.deadline ? new Date(data.deadline) : null,
      },
    });

    if (courseIds?.length) {
      await this.prisma.learningPathCourse.createMany({
        data: courseIds.map((courseId, seq) => ({
          learningPathId: lp.id,
          courseId,
          seq,
          required: true,
        })),
      });
    }

    // Recalcular duração total
    const totalHours = await this.calcTotalHours(lp.id);
    await this.prisma.learningPath.update({
      where: { id: lp.id },
      data: { totalHours },
    });

    return this.findOne(lp.id);
  }

  async update(id: number, dto: UpdateLearningPathDto) {
    await this.findOne(id);
    const { courseIds, ...data } = dto;

    if (courseIds) {
      await this.prisma.learningPathCourse.deleteMany({ where: { learningPathId: id } });
      await this.prisma.learningPathCourse.createMany({
        data: courseIds.map((courseId, seq) => ({
          learningPathId: id,
          courseId,
          seq,
          required: true,
        })),
      });
    }

    const updated = await this.prisma.learningPath.update({
      where: { id },
      data: {
        ...data,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        tags: data.tags ?? undefined,
      },
    });

    // Recalcular duração
    const totalHours = await this.calcTotalHours(id);
    return this.prisma.learningPath.update({ where: { id }, data: { totalHours } });
  }

  async publish(id: number) {
    const lp = (await this.findOne(id)) as any;
    if (lp._count.courses === 0) {
      throw new BadRequestException('Trilha sem conteúdos não pode ser publicada');
    }
    return this.prisma.learningPath.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.learningPath.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async duplicate(id: number) {
    const original = (await this.findOne(id)) as any;
    const {
      id: _,
      courses,
      milestones,
      _count,
      createdAt,
      updatedAt,
      publishedAt,
      ...data
    } = original;

    const clone = await this.prisma.learningPath.create({
      data: {
        ...data,
        title: `${data.title} (cópia)`,
        status: 'DRAFT',
      },
    });

    // Clonar steps
    if (courses.length) {
      await this.prisma.learningPathCourse.createMany({
        data: courses.map((lpc: any) => ({
          learningPathId: clone.id,
          courseId: lpc.courseId,
          seq: lpc.seq,
          required: lpc.required,
          deadlineDays: lpc.deadlineDays,
        })),
      });
    }

    // Clonar milestones
    if (milestones.length) {
      for (const m of milestones) {
        await this.prisma.learningPathMilestone.create({
          data: {
            learningPathId: clone.id,
            title: m.title,
            description: m.description,
            seq: m.seq,
          },
        });
      }
    }

    return this.findOne(clone.id);
  }

  async remove(id: number) {
    const lp = (await this.findOne(id)) as any;
    if (lp.status === 'PUBLISHED' && lp._count.enrollments > 0) {
      throw new ForbiddenException(
        'Trilha publicada com matrículas não pode ser eliminada. Archive-a primeiro.',
      );
    }
    await this.prisma.learningPath.delete({ where: { id } });
    return { message: 'Trilha eliminada' };
  }

  // ─── STEPS (Cursos na trilha) ─────────────────────────────────────────────

  async addStep(learningPathId: number, dto: LearningPathStepDto) {
    const lp = await this.findOne(learningPathId);

    const course = await this.prismaRead.course.findUnique({ where: { id: dto.courseId } });
    if (!course) throw new NotFoundException('Curso não encontrado');

    const step = await this.prisma.learningPathCourse.upsert({
      where: { learningPathId_courseId: { learningPathId, courseId: dto.courseId } },
      create: {
        learningPathId,
        courseId: dto.courseId,
        seq: dto.seq,
        required: dto.required ?? true,
        milestoneId: dto.milestoneId,
        deadlineDays: dto.deadlineDays,
      },
      update: {
        seq: dto.seq,
        required: dto.required ?? true,
        milestoneId: dto.milestoneId,
        deadlineDays: dto.deadlineDays,
      },
    });

    const totalHours = await this.calcTotalHours(learningPathId);
    await this.prisma.learningPath.update({ where: { id: learningPathId }, data: { totalHours } });

    return step;
  }

  async removeStep(learningPathId: number, courseId: number) {
    await this.prisma.learningPathCourse.deleteMany({ where: { learningPathId, courseId } });
    const totalHours = await this.calcTotalHours(learningPathId);
    await this.prisma.learningPath.update({ where: { id: learningPathId }, data: { totalHours } });
    return { message: 'Curso removido da trilha' };
  }

  async reorderSteps(learningPathId: number, dto: ReorderStepsDto) {
    await this.findOne(learningPathId);
    await Promise.all(
      dto.order.map(({ courseId, seq }) =>
        this.prisma.learningPathCourse.update({
          where: { learningPathId_courseId: { learningPathId, courseId } },
          data: { seq },
        }),
      ),
    );
    return this.findOne(learningPathId);
  }

  // ─── MILESTONES ────────────────────────────────────────────────────────────

  async createMilestone(
    learningPathId: number,
    dto: { title: string; description?: string; seq: number },
  ) {
    await this.findOne(learningPathId);
    return this.prisma.learningPathMilestone.create({
      data: { learningPathId, ...dto },
    });
  }

  async removeMilestone(milestoneId: number) {
    return this.prisma.learningPathMilestone.delete({ where: { id: milestoneId } });
  }

  // ─── ATRIBUIÇÃO ───────────────────────────────────────────────────────────

  async assign(dto: AssignLearningPathDto) {
    const lp = (await this.findOne(dto.learningPathId)) as any;
    if (lp.status !== 'PUBLISHED') {
      throw new BadRequestException('Apenas trilhas publicadas podem ser atribuídas');
    }

    let userIds: number[] = [];

    if (dto.targetType === AssignmentTarget.USER) {
      userIds = [dto.targetId];
    } else if (dto.targetType === AssignmentTarget.DEPARTMENT) {
      const users = await this.prismaRead.user.findMany({
        where: { departmentId: dto.targetId, active: true },
        select: { id: true },
      });
      userIds = users.map(u => u.id);
    } else if (dto.targetType === AssignmentTarget.POSITION) {
      const users = await this.prismaRead.user.findMany({
        where: { positionId: dto.targetId, active: true },
        select: { id: true },
      });
      userIds = users.map(u => u.id);
    } else if (dto.targetType === AssignmentTarget.UNIT) {
      const users = await this.prismaRead.user.findMany({
        where: { unitId: dto.targetId, active: true },
        select: { id: true },
      });
      userIds = users.map(u => u.id);
    } else if (dto.targetType === AssignmentTarget.ROLE) {
      const users = await this.prismaRead.user.findMany({
        where: { roleId: dto.targetId, active: true },
        select: { id: true },
      });
      userIds = users.map(u => u.id);
    }

    // Guardar atribuição
    const assignment = await this.prisma.learningPathAssignment.create({
      data: {
        learningPathId: dto.learningPathId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        mandatory: dto.mandatory ?? lp.mandatory ?? false,
        deadline: dto.deadline ? new Date(dto.deadline) : lp.deadline,
      },
    });

    // Matricular utilizadores
    const results = await this.enrollUsersInPath(dto.learningPathId, userIds, {
      mandatory: dto.mandatory,
      deadline: dto.deadline,
    });

    return { assignment, ...results };
  }

  async getAssignments(learningPathId: number) {
    return this.prismaRead.learningPathAssignment.findMany({
      where: { learningPathId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── MATRÍCULA NA TRILHA ──────────────────────────────────────────────────

  async enrollUsersInPath(
    learningPathId: number,
    userIds: number[],
    opts: { mandatory?: boolean; deadline?: string } = {},
  ) {
    const lp = (await this.findOne(learningPathId)) as any;
    const courses: any[] = lp.courses;

    const results = { enrolled: 0, skipped: 0, total: userIds.length };

    for (const userId of userIds) {
      // Criar matrícula na trilha
      await this.prisma.learningPathEnrollment.upsert({
        where: { learningPathId_userId: { learningPathId, userId } },
        create: {
          learningPathId,
          userId,
          status: 'NOT_STARTED',
          mandatory: opts.mandatory ?? lp.mandatory ?? false,
          deadline: opts.deadline ? new Date(opts.deadline) : lp.deadline,
        },
        update: {},
      });

      // Matricular nos cursos individuais
      for (const lpc of courses) {
        const exists = await this.prisma.enrollment.findFirst({
          where: { userId, courseId: lpc.courseId, status: { notIn: ['EXPIRED'] } },
        });
        if (!exists) {
          await this.prisma.enrollment.create({
            data: {
              userId,
              courseId: lpc.courseId,
              mandatory: lpc.required && (opts.mandatory ?? lp.mandatory ?? false),
              status: 'NOT_STARTED',
            },
          });
          results.enrolled++;
        } else {
          results.skipped++;
        }
      }

      // Notificar
      await this.prisma.notificationLog
        .create({
          data: {
            userId,
            type: 'LEARNING_PATH_ASSIGNED',
            message: `A trilha "${lp.title}" foi atribuída a si`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
    }

    return results;
  }

  async selfEnroll(learningPathId: number, userId: number) {
    const lp = (await this.findOne(learningPathId)) as any;
    if (lp.status !== 'PUBLISHED') {
      throw new BadRequestException('Apenas trilhas publicadas aceitam matrículas');
    }

    const existing = await this.prisma.learningPathEnrollment.findFirst({
      where: { learningPathId, userId },
    });
    if (existing) throw new ConflictException('Já está matriculado nesta trilha');

    return this.enrollUsersInPath(learningPathId, [userId]);
  }

  // ─── PROGRESSO ────────────────────────────────────────────────────────────

  async getMyProgress(learningPathId: number, userId: number) {
    const lp = (await this.findOne(learningPathId)) as any;
    const enrollment = await this.prismaRead.learningPathEnrollment.findFirst({
      where: { learningPathId, userId },
    });

    const steps: any[] = lp.courses;
    const progressionType = lp.progressionType ?? 'SEQUENTIAL';

    const stepsWithProgress = await Promise.all(
      steps.map(async (step: any, idx: number) => {
        const courseEnrollment = await this.prismaRead.enrollment.findFirst({
          where: { userId, courseId: step.courseId },
        });

        // Verificar se está desbloqueado
        let locked = false;
        if (progressionType === 'SEQUENTIAL' && idx > 0) {
          const prevStep = steps[idx - 1];
          const prevEnrollment = await this.prismaRead.enrollment.findFirst({
            where: { userId, courseId: prevStep.courseId },
          });
          locked = prevEnrollment?.status !== 'COMPLETED';
        }

        return {
          seq: step.seq,
          courseId: step.courseId,
          required: step.required,
          deadlineDays: step.deadlineDays,
          course: step.course,
          status: courseEnrollment?.status ?? 'NOT_ENROLLED',
          locked,
          completedAt: courseEnrollment?.completedAt ?? null,
          progress: courseEnrollment?.status === 'COMPLETED' ? 100 : 0,
        };
      }),
    );

    const completedRequired = stepsWithProgress.filter(
      s => s.required && s.status === 'COMPLETED',
    ).length;
    const totalRequired = stepsWithProgress.filter(s => s.required).length;
    const overallPct =
      totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

    // Verificar conclusão automática
    if (enrollment && enrollment.status !== 'COMPLETED' && overallPct >= 100) {
      await this.completePath(learningPathId, userId);
    }

    return {
      learningPathId,
      userId,
      enrollment,
      overallPct,
      completedRequired,
      totalRequired,
      totalSteps: steps.length,
      steps: stepsWithProgress,
      isOverdue: enrollment?.deadline ? new Date() > new Date(enrollment.deadline) : false,
    };
  }

  private async completePath(learningPathId: number, userId: number) {
    const existing = await this.prisma.learningPathEnrollment.findFirst({
      where: { learningPathId, userId, status: { not: 'COMPLETED' } },
    });
    if (!existing) return;

    await this.prisma.learningPathEnrollment.update({
      where: { id: existing.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    const lp = await this.prismaRead.learningPath.findUnique({ where: { id: learningPathId } });

    // Gamificação
    await this.prisma.userPoints
      .upsert({
        where: { userId },
        create: { userId, points: 200 },
        update: { points: { increment: 200 } },
      })
      .catch(() => {});

    // Notificar
    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'LEARNING_PATH_COMPLETED',
          message: `Concluíste a trilha "${lp?.title}"! 🎉`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    this.logger.log(`Learning Path ${learningPathId} concluída por user ${userId}`);
  }

  // ─── MATRÍCULAS DO UTILIZADOR ─────────────────────────────────────────────

  async getMyEnrollments(userId: number) {
    return this.prismaRead.learningPathEnrollment.findMany({
      where: { userId },
      include: {
        learningPath: {
          select: {
            id: true,
            title: true,
            thumbnailUrl: true,
            category: true,
            level: true,
            pathType: true,
            totalHours: true,
            status: true,
            _count: { select: { courses: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  // ─── ANALYTICS ────────────────────────────────────────────────────────────

  async getAnalytics(learningPathId: number) {
    await this.findOne(learningPathId);

    const [totalEnrollments, completed, inProgress, notStarted, overdueCount] = await Promise.all([
      this.prismaRead.learningPathEnrollment.count({ where: { learningPathId } }),
      this.prismaRead.learningPathEnrollment.count({ where: { learningPathId, status: 'COMPLETED' } }),
      this.prismaRead.learningPathEnrollment.count({
        where: { learningPathId, status: 'IN_PROGRESS' },
      }),
      this.prismaRead.learningPathEnrollment.count({
        where: { learningPathId, status: 'NOT_STARTED' },
      }),
      this.prismaRead.learningPathEnrollment.count({
        where: {
          learningPathId,
          deadline: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'EXPIRED'] },
        },
      }),
    ]);

    const completionRate =
      totalEnrollments > 0 ? Math.round((completed / totalEnrollments) * 100) : 0;

    // Step-level drop-off
    const lp = (await this.findOne(learningPathId)) as any;
    const stepDropoff = await Promise.all(
      (lp.courses as any[]).map(async (step: any) => {
        const stepCompleted = await this.prismaRead.enrollment.count({
          where: { courseId: step.courseId, status: 'COMPLETED' },
        });
        return {
          seq: step.seq,
          courseId: step.courseId,
          title: step.course?.title ?? '—',
          completed: stepCompleted,
        };
      }),
    );

    return {
      learningPathId,
      enrollments: { total: totalEnrollments, completed, inProgress, notStarted },
      completionRate,
      overdue: overdueCount,
      stepDropoff,
    };
  }

  // ─── DASHBOARD ADMIN ──────────────────────────────────────────────────────

  async getAdminDashboard() {
    const [totalPaths, published, totalEnrollments, completedEnrollments] = await Promise.all([
      this.prismaRead.learningPath.count(),
      this.prismaRead.learningPath.count({ where: { status: 'PUBLISHED' } }),
      this.prismaRead.learningPathEnrollment.count(),
      this.prismaRead.learningPathEnrollment.count({ where: { status: 'COMPLETED' } }),
    ]);

    const topPaths = await this.prismaRead.learningPath.findMany({
      where: { status: 'PUBLISHED' },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { enrollments: { _count: 'desc' } },
      take: 5,
    });

    return {
      paths: { total: totalPaths, published },
      enrollments: { total: totalEnrollments, completed: completedEnrollments },
      completionRate:
        totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0,
      topPaths,
    };
  }
}

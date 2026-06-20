import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { CertificateType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EnrollmentsCreateEnrollmentDto,
  UpdateEnrollmentStatusDto,
  EnrollmentFilterDto,
  BulkEnrollDto,
  CancelEnrollmentDto,
  UpdateDeadlineDto,
  EnrollmentOrigin,
} from './enrollments.dto';

const ENROLLMENT_INCLUDE_BASIC = {
  user: {
    select: {
      id: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      department: { select: { name: true } },
    },
  },
  course: {
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      category: true,
      workloadHours: true,
      status: true,
    },
  },
  certificate: { select: { id: true, validationCode: true, issuedAt: true, expiresAt: true } },
} as const;

@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async computeProgress(enrollmentId: number, courseId: number, userId: number) {
    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.lesson.count({ where: { module: { courseId } } }),
      this.prisma.lessonProgress.count({
        where: { userId, completed: true, lesson: { module: { courseId } } },
      }),
    ]);
    return {
      totalLessons,
      completedLessons,
      progressPercent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
    };
  }

  private isOverdue(deadline: Date | null, status: string): boolean {
    if (!deadline) return false;
    if (status === 'COMPLETED' || status === 'CANCELLED') return false;
    return new Date() > deadline;
  }

  // ─── LISTAGEM ADMIN ───────────────────────────────────────────────────────

  async findAll(filters: EnrollmentFilterDto) {
    const {
      page = 1,
      limit = 20,
      userId,
      courseId,
      departmentId,
      status,
      origin,
      mandatory,
      overdue,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (userId) where.userId = userId;
    if (courseId) where.courseId = courseId;
    if (status) where.status = status;
    if (origin) where.origin = origin;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (departmentId) {
      where.user = { departmentId };
    }
    if (overdue) {
      where.deadline = { lt: new Date() };
      where.status = { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] };
    }

    const [data, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        skip,
        take: limit,
        include: {
          ...ENROLLMENT_INCLUDE_BASIC,
          _count: { select: { progresses: true } },
        },
        orderBy: { enrolledAt: 'desc' },
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    // Batch progress for all enrollments in this page (eliminates N+1)
    const courseIds = [...new Set(data.map(e => (e as any).courseId as number))];
    const enrollmentIds = data.map(e => e.id);

    // groupBy on enrollmentId uses direct index — avoids 3-table JOIN (lesson → module → courseId)
    const [moduleGroups, completedByEnrollment] = await Promise.all([
      this.prisma.courseModule.findMany({
        where: { courseId: { in: courseIds } },
        select: { courseId: true, _count: { select: { lessons: true } } },
      }),
      this.prisma.lessonProgress.groupBy({
        by: ['enrollmentId'],
        where: { enrollmentId: { in: enrollmentIds }, completed: true },
        _count: { id: true },
      }),
    ]);

    const totalLessonsMap: Record<number, number> = {};
    for (const mod of moduleGroups) {
      totalLessonsMap[mod.courseId] = (totalLessonsMap[mod.courseId] || 0) + mod._count.lessons;
    }

    const completedLessonsMap: Record<number, number> = {};
    for (const g of completedByEnrollment) {
      if (g.enrollmentId) completedLessonsMap[g.enrollmentId] = g._count.id;
    }

    const enriched = data.map(e => {
      const courseId = (e as any).courseId as number;
      const totalLessons = totalLessonsMap[courseId] || 0;
      const completedLessons = completedLessonsMap[e.id] || 0;
      const progressPercent =
        totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
      return {
        ...e,
        totalLessons,
        completedLessons,
        progressPercent,
        isOverdue: this.isOverdue((e as any).deadline, (e as any).status),
      };
    });

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── DETALHE ──────────────────────────────────────────────────────────────

  async findOne(id: number) {
    const e = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        ...ENROLLMENT_INCLUDE_BASIC,
        progresses: {
          include: { lesson: { select: { id: true, title: true, type: true } } },
        },
      },
    });
    if (!e) throw new NotFoundException('Matrícula não encontrada');

    const prog = await this.computeProgress(id, (e as any).courseId, (e as any).userId);
    return {
      ...e,
      ...prog,
      isOverdue: this.isOverdue((e as any).deadline, (e as any).status),
    };
  }

  // ─── MATRICULAR ───────────────────────────────────────────────────────────

  async enroll(dto: EnrollmentsCreateEnrollmentDto) {
    const exists = await this.prisma.enrollment.findFirst({
      where: {
        userId: dto.userId,
        courseId: dto.courseId,
        status: { notIn: ['CANCELLED', 'EXPIRED'] },
      },
    });
    if (exists) {
      throw new ConflictException(
        `Utilizador já tem matrícula activa neste curso (status: ${exists.status})`,
      );
    }

    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      select: { id: true, title: true, status: true, mandatory: true },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    if (course.status !== 'PUBLISHED') {
      throw new BadRequestException('Apenas cursos publicados aceitam matrículas');
    }

    const enrollment = await this.prisma.enrollment.create({
      data: {
        userId: dto.userId,
        courseId: dto.courseId,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        mandatory: dto.mandatory ?? course.mandatory ?? false,
        origin: dto.origin ?? 'MANUAL',
        learningPathId: dto.learningPathId,
        assignedById: dto.assignedById,
        status: 'NOT_STARTED',
      },
      include: ENROLLMENT_INCLUDE_BASIC,
    });

    // Fire-and-forget: non-critical side effects run in parallel without blocking the response
    void Promise.all([
      this.prisma.courseAnalytics
        .updateMany({
          where: { courseId: dto.courseId },
          data: { totalEnrollments: { increment: 1 } },
        })
        .catch(() => {}),
      this.prisma.notificationLog
        .create({
          data: {
            userId: dto.userId,
            type: 'COURSE_ENROLLED',
            message: `Matriculado no curso "${course.title}"`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {}),
    ]);

    return enrollment;
  }

  // ─── BULK ENROLL ──────────────────────────────────────────────────────────

  async bulkEnroll(dto: BulkEnrollDto) {
    const results = {
      success: 0,
      skipped: 0,
      errors: [] as Array<{ userId: number; error: string }>,
      enrolled: [] as number[],
    };

    for (const userId of dto.userIds) {
      try {
        await this.enroll({
          userId,
          courseId: dto.courseId,
          deadline: dto.deadline,
          mandatory: dto.mandatory,
          origin: dto.origin ?? EnrollmentOrigin.MANUAL,
        });
        results.success++;
        results.enrolled.push(userId);
      } catch (e: any) {
        if (e instanceof ConflictException) {
          results.skipped++;
        } else {
          results.errors.push({ userId, error: e.message });
          this.logger.warn(`Bulk enroll error user ${userId}: ${e.message}`);
        }
      }
    }

    return {
      success: results.success,
      skipped: results.skipped,
      errors: results.errors.length,
      total: dto.userIds.length,
      details: { enrolled: results.enrolled, errors: results.errors },
    };
  }

  // ─── ATUALIZAR STATUS ─────────────────────────────────────────────────────

  async updateStatus(id: number, dto: UpdateEnrollmentStatusDto) {
    const e = await this.findOne(id);
    const current = (e as any).status;

    const invalidTransitions: Record<string, string[]> = {
      COMPLETED: ['NOT_STARTED', 'IN_PROGRESS'],
      CANCELLED: ['COMPLETED'],
    };
    if (invalidTransitions[dto.status]?.includes(current)) {
      throw new BadRequestException(`Transição inválida: ${current} → ${dto.status}`);
    }

    const data: any = { status: dto.status };
    if (dto.status === 'COMPLETED' && !(e as any).completedAt) {
      data.completedAt = new Date();
    }

    return this.prisma.enrollment.update({ where: { id }, data });
  }

  // ─── CANCELAR ─────────────────────────────────────────────────────────────

  async cancel(id: number, dto: CancelEnrollmentDto, requestingUserId: number) {
    const e = (await this.findOne(id)) as any;

    if (e.status === 'COMPLETED') {
      throw new ForbiddenException('Matrícula concluída não pode ser cancelada');
    }
    if (e.mandatory) {
      throw new ForbiddenException(
        'Matrículas obrigatórias não podem ser canceladas pelo colaborador. Contacte o RH.',
      );
    }

    await this.prisma.enrollment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelReason: dto.reason,
        cancelledAt: new Date(),
      },
    });

    await this.prisma.courseAnalytics
      .updateMany({
        where: { courseId: e.courseId },
        data: { totalEnrollments: { decrement: 1 } },
      })
      .catch(() => {});

    return { message: 'Matrícula cancelada' };
  }

  // ─── ATUALIZAR DEADLINE ───────────────────────────────────────────────────

  async updateDeadline(id: number, dto: UpdateDeadlineDto) {
    await this.findOne(id);
    return this.prisma.enrollment.update({
      where: { id },
      data: { deadline: new Date(dto.deadline) },
    });
  }

  // ─── GERAR CERTIFICADO ────────────────────────────────────────────────────

  async generateCertificate(enrollmentId: number) {
    const e = (await this.findOne(enrollmentId)) as any;

    if (e.status !== 'COMPLETED') {
      throw new BadRequestException('Curso ainda não concluído');
    }

    const exists = await this.prisma.certificate.findFirst({
      where: { enrollmentId },
    });
    if (exists) return exists;

    const course = await this.prisma.course.findUnique({ where: { id: e.courseId } });
    const validationCode = `CERT-${e.courseId}-${e.userId}-${Date.now()}`;

    const expiresAt = course?.certificateValidityDays
      ? new Date(Date.now() + course.certificateValidityDays * 86400 * 1000)
      : null;

    // ← corrigido: adicionados campos obrigatórios type e validationCode; removido campo inexistente 'code'
    const cert = await this.prisma.certificate.create({
      data: {
        enrollmentId,
        userId: e.userId,
        courseId: e.courseId,
        type: CertificateType.COURSE,
        validationCode,
        issuedAt: new Date(),
        expiresAt,
      },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: e.userId,
          type: 'CERTIFICATE_ISSUED',
          message: `Certificado emitido para "${course?.title}"`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    return cert;
  }

  // ─── MATRÍCULAS DO UTILIZADOR ─────────────────────────────────────────────

  async getUserEnrollments(userId: number, filters?: Partial<EnrollmentFilterDto>) {
    const where: any = { userId };
    if (filters?.status) where.status = filters.status;
    if (filters?.mandatory !== undefined) where.mandatory = filters.mandatory;

    const enrollments = await this.prisma.enrollment.findMany({
      where,
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
        certificate: { select: { id: true, validationCode: true, issuedAt: true } },
      },
      orderBy: [{ mandatory: 'desc' }, { deadline: 'asc' }, { enrolledAt: 'desc' }],
    });

    if (enrollments.length === 0) {
      return {
        enrollments: [],
        groups: { overdue: [], inProgress: [], notStarted: [], completed: [], cancelled: [] },
      };
    }

    const courseIds = [...new Set(enrollments.map(e => (e as any).courseId as number))];
    const enrollmentIds = enrollments.map(e => e.id);

    // groupBy on enrollmentId uses direct index — avoids 3-table JOIN (lesson → module → courseId)
    const [moduleGroups, completedByEnrollment] = await Promise.all([
      this.prisma.courseModule.findMany({
        where: { courseId: { in: courseIds } },
        select: { courseId: true, _count: { select: { lessons: true } } },
      }),
      this.prisma.lessonProgress.groupBy({
        by: ['enrollmentId'],
        where: { enrollmentId: { in: enrollmentIds }, completed: true },
        _count: { id: true },
      }),
    ]);

    const totalLessonsMap: Record<number, number> = {};
    for (const mod of moduleGroups) {
      totalLessonsMap[mod.courseId] = (totalLessonsMap[mod.courseId] || 0) + mod._count.lessons;
    }

    const completedLessonsMap: Record<number, number> = {};
    for (const g of completedByEnrollment) {
      if (g.enrollmentId) completedLessonsMap[g.enrollmentId] = g._count.id;
    }

    const enriched = enrollments.map(e => {
      const courseId = (e as any).courseId as number;
      const totalLessons = totalLessonsMap[courseId] || 0;
      const completedLessons = completedLessonsMap[e.id] || 0;
      const progressPercent =
        totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
      const isOverdue = this.isOverdue((e as any).deadline, (e as any).status);
      return { ...e, totalLessons, completedLessons, progressPercent, isOverdue };
    });

    const groups = {
      overdue: enriched.filter(e => e.isOverdue),
      inProgress: enriched.filter(e => !e.isOverdue && (e as any).status === 'IN_PROGRESS'),
      notStarted: enriched.filter(e => !e.isOverdue && (e as any).status === 'NOT_STARTED'),
      completed: enriched.filter(e => (e as any).status === 'COMPLETED'),
      cancelled: enriched.filter(e => (e as any).status === 'CANCELLED'),
    };

    return { enrollments: enriched, groups };
  }

  // ─── COMPLIANCE DASHBOARD (Admin/RH) ─────────────────────────────────────

  async getComplianceDashboard(departmentId?: number) {
    const userWhere: any = { active: true };
    if (departmentId) userWhere.departmentId = departmentId;

    const [totalMandatory, completedMandatory, overdueCount, notStartedMandatory] =
      await Promise.all([
        this.prisma.enrollment.count({
          where: { mandatory: true, user: userWhere },
        }),
        this.prisma.enrollment.count({
          where: { mandatory: true, status: 'COMPLETED', user: userWhere },
        }),
        this.prisma.enrollment.count({
          where: {
            mandatory: true,
            deadline: { lt: new Date() },
            status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
            user: userWhere,
          },
        }),
        this.prisma.enrollment.count({
          where: { mandatory: true, status: 'NOT_STARTED', user: userWhere },
        }),
      ]);

    const complianceRate =
      totalMandatory > 0 ? Math.round((completedMandatory / totalMandatory) * 100) : 100;

    const topOverdueCourses = await this.prisma.enrollment.groupBy({
      by: ['courseId'],
      where: {
        mandatory: true,
        deadline: { lt: new Date() },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      _count: { courseId: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: 5,
    });

    const topOverdueWithTitles = await Promise.all(
      topOverdueCourses.map(async o => {
        const c = await this.prisma.course.findUnique({
          where: { id: o.courseId },
          select: { id: true, title: true },
        });
        return { ...c, overdueCount: o._count.courseId };
      }),
    );

    return {
      mandatory: {
        total: totalMandatory,
        completed: completedMandatory,
        overdue: overdueCount,
        notStarted: notStartedMandatory,
      },
      complianceRate,
      topOverdueCourses: topOverdueWithTitles,
    };
  }

  // ─── PROGRESSO DA EQUIPA (Manager) ────────────────────────────────────────

  async getTeamProgress(managerId: number, courseId?: number) {
    const subordinates = await this.prisma.user.findMany({
      where: { managerId, active: true },
      select: { id: true, fullName: true, email: true, avatarUrl: true },
    });

    const teamProgress = await Promise.all(
      subordinates.map(async sub => {
        const where: any = { userId: sub.id };
        if (courseId) where.courseId = courseId;

        const enrollments = await this.prisma.enrollment.findMany({
          where,
          include: {
            course: { select: { id: true, title: true, mandatory: true } },
          },
        });

        const stats = {
          total: enrollments.length,
          completed: enrollments.filter(e => e.status === 'COMPLETED').length,
          inProgress: enrollments.filter(e => e.status === 'IN_PROGRESS').length,
          overdue: enrollments.filter(e => this.isOverdue((e as any).deadline, e.status)).length,
        };

        return { ...sub, enrollments, stats };
      }),
    );

    return { managerId, team: teamProgress, total: teamProgress.length };
  }

  // ─── ANALYTICS ADMIN ──────────────────────────────────────────────────────

  async getAdminDashboard() {
    const [totalEnrollments, completed, inProgress, notStarted, overdue, mandatoryCount] =
      await Promise.all([
        this.prisma.enrollment.count(),
        this.prisma.enrollment.count({ where: { status: 'COMPLETED' } }),
        this.prisma.enrollment.count({ where: { status: 'IN_PROGRESS' } }),
        this.prisma.enrollment.count({ where: { status: 'NOT_STARTED' } }),
        this.prisma.enrollment.count({
          where: {
            deadline: { lt: new Date() },
            status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
          },
        }),
        this.prisma.enrollment.count({ where: { mandatory: true } }),
      ]);

    const completionRate =
      totalEnrollments > 0 ? Math.round((completed / totalEnrollments) * 100) : 0;

    const topCourses = await this.prisma.enrollment.groupBy({
      by: ['courseId'],
      _count: { courseId: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: 5,
    });

    const topCoursesDetail = await Promise.all(
      topCourses.map(async tc => {
        const c = await this.prisma.course.findUnique({
          where: { id: tc.courseId },
          select: { id: true, title: true, category: true },
        });
        return { ...c, enrollments: tc._count.courseId };
      }),
    );

    return {
      enrollments: { total: totalEnrollments, completed, inProgress, notStarted, overdue },
      mandatory: mandatoryCount,
      completionRate,
      topCourses: topCoursesDetail,
    };
  }

  // ─── SYNC DE OVERDUE (job periódico) ──────────────────────────────────────

  async syncOverdueStatus() {
    const updated = await this.prisma.enrollment.updateMany({
      where: {
        deadline: { lt: new Date() },
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      },
      data: { status: 'OVERDUE' },
    });

    this.logger.log(`Marcadas ${updated.count} matrículas como OVERDUE`);
    return { updated: updated.count };
  }
}

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  LmsCreateLearningPathDto,
  LmsUpdateLearningPathDto,
  CreateLiveSessionDto,
  AttendanceFeedbackDto,
  FilterPathDto,
} from './dto';
import { AuditService } from '../common/services/audit.service';

@Injectable()
export class LmsService {
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── GERAÇÃO DE CÓDIGOS ──────────────────────────────

  private async generateSessionCode(): Promise<string> {
    const last = await this.prisma.lmsLiveSession.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('SES-', ''), 10) + 1 : 1;
    return `SES-${String(num).padStart(5, '0')}`;
  }

  // ─── PERCURSOS DE APRENDIZAGEM ───────────────────────

  async createPath(dto: LmsCreateLearningPathDto, userId: number) {
    const existing = await this.prisma.lmsLearningPath.findUnique({
      where: { code: dto.code },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Código ${dto.code} já existe`);
    }
    const path = await this.prisma.lmsLearningPath.create({
      data: {
        ...dto,
        courseOrder: dto.courseOrder || dto.courseIds,
        createdById: userId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'LmsLearningPath', path.id, {
      code: dto.code,
    });
    return path;
  }

  async findAllPaths(filters: FilterPathDto) {
    const { level, search, isFeatured, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      isActive: true,
      ...(level && { level }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.lmsLearningPath.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        include: {
          createdBy: { select: { fullName: true } },
          _count: { select: { enrollments: true } },
        },
      }),
      this.prisma.read.lmsLearningPath.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findPathById(id: string) {
    const path = await this.prisma.read.lmsLearningPath.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!path || path.deletedAt) throw new NotFoundException('Percurso não encontrado');
    return path;
  }

  async updatePath(id: string, dto: LmsUpdateLearningPathDto, userId: number) {
    await this.findPathById(id);
    const updated = await this.prisma.lmsLearningPath.update({
      where: { id },
      data: dto,
    });
    await this.audit.logEntity(userId, 'UPDATE', 'LmsLearningPath', id, dto);
    return updated;
  }

  async softDeletePath(id: string, userId: number) {
    await this.findPathById(id);
    await this.prisma.lmsLearningPath.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'LmsLearningPath', id, {
      deletedAt: new Date(),
    });
    return { message: 'Percurso removido com sucesso' };
  }

  // ─── MATRÍCULA EM PERCURSO ───────────────────────────

  async enrollInPath(pathId: string, userId: number) {
    const path = await this.findPathById(pathId);
    const existing = await this.prisma.lmsPathEnrollment.findUnique({
      where: { pathId_userId: { pathId, userId } },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('Já inscrito neste percurso');
    }
    const enrollment = await this.prisma.lmsPathEnrollment.create({
      data: {
        pathId,
        userId,
        currentCourseId: path.courseOrder[0] || null,
      },
    });
    await this.prisma.lmsLearningPath.update({
      where: { id: pathId },
      data: { enrolledCount: { increment: 1 } },
    });
    await this.prisma.notificationLog.create({
      data: {
        userId,
        type: 'LMS_PATH_ENROLLMENT',
        title: 'Inscrição em percurso',
        message: `Inscreveste-te no percurso "${path.name}".`,
        metadata: JSON.stringify({ pathId }),
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'LmsPathEnrollment', enrollment.id, {
      pathId,
    });
    return enrollment;
  }

  async updatePathProgress(pathId: string, completedCourseId: string, userId: number) {
    const enrollment = await this.prisma.read.lmsPathEnrollment.findUnique({
      where: { pathId_userId: { pathId, userId } },
      include: { path: true },
    });
    if (!enrollment) throw new NotFoundException('Inscrição não encontrada');

    const completed = [...new Set([...enrollment.completedCourseIds, completedCourseId])];
    const totalCourses = enrollment.path.courseIds.length;
    const progress = totalCourses > 0 ? Math.round((completed.length / totalCourses) * 100) : 0;
    const isComplete = progress >= 100;

    // Próximo curso da ordem
    const nextCourse = enrollment.path.courseOrder.find(c => !completed.includes(c));

    const updated = await this.prisma.lmsPathEnrollment.update({
      where: { id: enrollment.id },
      data: {
        completedCourseIds: completed,
        currentCourseId: nextCourse || null,
        progress,
        status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: isComplete ? new Date() : null,
      },
    });

    if (isComplete) {
      await this.prisma.lmsLearningPath.update({
        where: { id: pathId },
        data: { completedCount: { increment: 1 } },
      });
      await this.updateAnalytics(userId, { pathsCompleted: 1 });
    }
    return updated;
  }

  async getMyPaths(userId: number) {
    return this.prisma.read.lmsPathEnrollment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startedAt: 'desc' },
      include: {
        path: {
          select: {
            name: true,
            code: true,
            level: true,
            estimatedHours: true,
            thumbnail: true,
          },
        },
      },
    });
  }

  // ─── SESSÕES AO VIVO ─────────────────────────────────

  async createSession(dto: CreateLiveSessionDto, userId: number) {
    const code = await this.generateSessionCode();
    const { scheduledAt, ...rest } = dto;
    const session = await this.prisma.lmsLiveSession.create({
      data: {
        ...rest,
        scheduledAt: new Date(scheduledAt),
        code,
        createdById: userId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'LmsLiveSession', session.id, {
      code,
      title: dto.title,
    });
    return session;
  }

  async findUpcomingSessions(page = 1, limit = 20) {
    const where = {
      deletedAt: null,
      status: { in: ['SCHEDULED', 'LIVE'] as any },
      scheduledAt: { gte: new Date() },
    };
    const [data, total] = await Promise.all([
      this.prisma.read.lmsLiveSession.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          instructor: { select: { fullName: true } },
          _count: { select: { attendances: true } },
        },
      }),
      this.prisma.read.lmsLiveSession.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async registerForSession(sessionId: string, userId: number) {
    const session = await this.prisma.read.lmsLiveSession.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { attendances: true } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.maxAttendees && session._count.attendances >= session.maxAttendees) {
      throw new ConflictException('Sessão lotada');
    }
    const existing = await this.prisma.lmsLiveAttendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing) throw new ConflictException('Já inscrito nesta sessão');

    return this.prisma.lmsLiveAttendance.create({
      data: { sessionId, userId },
    });
  }

  async markAttendance(sessionId: string, userId: number) {
    const attendance = await this.prisma.read.lmsLiveAttendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!attendance) throw new NotFoundException('Inscrição na sessão não encontrada');

    const updated = await this.prisma.lmsLiveAttendance.update({
      where: { id: attendance.id },
      data: { attended: true, joinedAt: new Date() },
    });
    await this.updateAnalytics(userId, { sessionsAttended: 1 });
    return updated;
  }

  async submitSessionFeedback(sessionId: string, dto: AttendanceFeedbackDto, userId: number) {
    const attendance = await this.prisma.read.lmsLiveAttendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!attendance) throw new NotFoundException('Presença não encontrada');
    return this.prisma.lmsLiveAttendance.update({
      where: { id: attendance.id },
      data: { rating: dto.rating, feedback: dto.feedback },
    });
  }

  // ─── RECOMENDAÇÕES ───────────────────────────────────

  async getRecommendations(userId: number) {
    // Recomendações baseadas na actividade do utilizador
    await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { roleId: true, fullName: true },
    });

    const enrolled = await this.prisma.read.lmsPathEnrollment.findMany({
      where: { userId, deletedAt: null },
      select: { pathId: true },
    });
    const enrolledIds = enrolled.map(e => e.pathId);

    const recommended = await this.prisma.read.lmsLearningPath.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        id: { notIn: enrolledIds },
      },
      orderBy: [{ isFeatured: 'desc' }, { enrolledCount: 'desc' }],
      take: 5,
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        estimatedHours: true,
        thumbnail: true,
        enrolledCount: true,
      },
    });

    return recommended.map(p => ({
      ...p,
      reason: 'Recomendado com base na tua actividade',
    }));
  }

  // ─── ANALYTICS DO UTILIZADOR ─────────────────────────

  async getMyAnalytics(userId: number) {
    let analytics = await this.prisma.read.lmsLearningAnalytics.findUnique({
      where: { userId },
    });
    if (!analytics) {
      analytics = await this.prisma.lmsLearningAnalytics.create({
        data: { userId },
      });
    }
    return analytics;
  }

  async getLmsDashboard() {
    const [
      totalPaths,
      activePaths,
      totalEnrollments,
      completedPaths,
      upcomingSessions,
      totalSessions,
      byLevel,
    ] = await Promise.all([
      this.prisma.read.lmsLearningPath.count({ where: { deletedAt: null } }),
      this.prisma.read.lmsLearningPath.count({
        where: { isActive: true, deletedAt: null },
      }),
      this.prisma.read.lmsPathEnrollment.count({ where: { deletedAt: null } }),
      this.prisma.read.lmsPathEnrollment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.read.lmsLiveSession.count({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { gte: new Date() },
          deletedAt: null,
        },
      }),
      this.prisma.read.lmsLiveSession.count({ where: { deletedAt: null } }),
      (this.prisma.read.lmsLearningPath.groupBy as any)({
        by: ['level'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
    ]);
    return {
      totals: {
        totalPaths,
        activePaths,
        totalEnrollments,
        completedPaths,
        upcomingSessions,
        totalSessions,
        pathCompletionRate: totalEnrollments > 0 ? (completedPaths / totalEnrollments) * 100 : 0,
      },
      byLevel,
    };
  }

  // ─── HELPERS ─────────────────────────────────────────

  private async updateAnalytics(userId: number, increments: any) {
    const existing = await this.prisma.lmsLearningAnalytics.findUnique({
      where: { userId },
    });
    if (!existing) {
      await this.prisma.lmsLearningAnalytics.create({
        data: { userId, ...increments, lastActivityAt: new Date() },
      });
      return;
    }
    const data: any = { lastActivityAt: new Date() };
    for (const key of Object.keys(increments)) {
      data[key] = { increment: increments[key] };
    }
    await this.prisma.lmsLearningAnalytics.update({
      where: { userId },
      data,
    });
  }
}

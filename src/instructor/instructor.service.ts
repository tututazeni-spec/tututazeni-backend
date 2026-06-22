// src/instructor/instructor.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInstructorProfileDto,
  UpdateInstructorProfileDto,
  CreateMarketplaceCourseDto,
  InstructorReviewDto,
  InstructorFilterDto,
  CreateCohortDto,
  UpdateCohortDto,
  InstructorAddParticipantsDto,
  CohortFilterDto,
} from './instructor.dto';

@Injectable()
export class InstructorService {
  private readonly logger = new Logger(InstructorService.name);
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }


  constructor(private prisma: PrismaService) {}

  // ─── PROFILES ─────────────────────────────────────────────────────────────

  async findAll(filters: InstructorFilterDto) {
    const { page = 1, limit = 20, approved, search, instructorType } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (approved !== undefined) where.approved = approved;
    if (instructorType) where.instructorType = instructorType;
    if (search)
      where.OR = [
        { user: { fullName: { contains: search, mode: 'insensitive' } } },
        { expertiseArea: { contains: search, mode: 'insensitive' } },
      ];

    const [data, total] = await Promise.all([
      this.prismaRead.instructorProfile.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true,
              position: { select: { name: true } },
            },
          },
          _count: { select: { reviews: true, marketplaceCourses: true, cohorts: true } },
        },
        orderBy: { ratingAverage: 'desc' },
      }),
      this.prismaRead.instructorProfile.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const profile = await this.prismaRead.instructorProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        reviews: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        marketplaceCourses: true,
        payouts: { orderBy: { createdAt: 'desc' }, take: 10 },
        cohorts: {
          include: {
            course: { select: { id: true, title: true } },
            _count: { select: { participants: true } },
          },
          orderBy: { startDate: 'desc' },
          take: 5,
        },
        _count: { select: { reviews: true, cohorts: true } },
      },
    });
    if (!profile) throw new NotFoundException('Perfil de instrutor não encontrado');
    return profile;
  }

  async findByUser(userId: number) {
    const profile = await this.prismaRead.instructorProfile.findUnique({
      where: { userId },
      include: {
        reviews: { orderBy: { createdAt: 'desc' }, take: 5 },
        marketplaceCourses: true,
        cohorts: {
          include: { _count: { select: { participants: true } } },
          orderBy: { startDate: 'desc' },
          take: 5,
        },
        _count: { select: { reviews: true, cohorts: true } },
      },
    });
    if (!profile) throw new NotFoundException('Instrutor não encontrado');
    return profile;
  }

  async createProfile(userId: number, dto: CreateInstructorProfileDto) {
    const exists = await this.prisma.instructorProfile.findUnique({ where: { userId } });
    if (exists) throw new ConflictException('Perfil de instrutor já existe');

    return this.prisma.instructorProfile.create({
      data: {
        userId,
        bio: dto.bio,
        expertiseArea: dto.expertiseArea,
        instructorType: dto.instructorType ?? 'STANDARD',
        specialties: dto.specialties ?? [],
        certifications: dto.certifications ?? [],
        linkedinUrl: dto.linkedinUrl,
        hourlyRate: dto.hourlyRate,
        availableForMentoring: dto.availableForMentoring ?? false,
      },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async updateProfile(userId: number, dto: UpdateInstructorProfileDto) {
    await this.findByUser(userId);
    return this.prisma.instructorProfile.update({ where: { userId }, data: dto });
  }

  async approve(id: number) {
    return this.prisma.instructorProfile.update({ where: { id }, data: { approved: true } });
  }

  async revoke(id: number) {
    return this.prisma.instructorProfile.update({ where: { id }, data: { approved: false } });
  }

  // ─── DASHBOARD DO INSTRUTOR ───────────────────────────────────────────────

  async getMyDashboard(userId: number) {
    const profile = await this.findByUser(userId);
    const instructorId = profile.id;

    const [cohorts, totalReviews, recentReviews] = await Promise.all([
      this.prismaRead.instructorCohort.findMany({
        where: { instructorId, status: { in: ['ACTIVE', 'OPEN'] } },
        include: {
          course: { select: { id: true, title: true } },
          participants: { select: { userId: true, status: true, progress: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { startDate: 'asc' },
        take: 10,
      }),
      this.prismaRead.instructorReview.count({ where: { instructorId } }),
      this.prismaRead.instructorReview.findMany({
        where: { instructorId },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    // Calcular métricas dos cohorts activos
    const activeCohorts = cohorts.map(c => {
      const participants = c.participants as any[];
      const total = participants.length;
      const completed = participants.filter(p => p.status === 'COMPLETED').length;
      const atRisk = participants.filter(p => p.status === 'AT_RISK').length;
      const avgProgress =
        total > 0
          ? Math.round(participants.reduce((s: number, p: any) => s + (p.progress ?? 0), 0) / total)
          : 0;
      return {
        id: c.id,
        name: (c as any).name,
        course: c.course,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        modalidade: (c as any).modalidade,
        totalStudents: total,
        completed,
        atRisk,
        avgProgress,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      };
    });

    const totalStudents = activeCohorts.reduce((s, c) => s + c.totalStudents, 0);
    const totalAtRisk = activeCohorts.reduce((s, c) => s + c.atRisk, 0);
    const avgCompletion =
      activeCohorts.length > 0
        ? Math.round(activeCohorts.reduce((s, c) => s + c.completionRate, 0) / activeCohorts.length)
        : 0;

    return {
      profile: {
        id: profile.id,
        fullName: (profile as any).user?.fullName,
        expertiseArea: profile.expertiseArea,
        ratingAverage: profile.ratingAverage,
        totalCourses: profile.totalCourses,
        instructorType: (profile as any).instructorType,
      },
      metrics: {
        activeCohorts: activeCohorts.length,
        totalStudents,
        avgCompletionRate: avgCompletion,
        totalAtRisk,
        totalReviews,
        ratingAverage: profile.ratingAverage,
      },
      cohorts: activeCohorts,
      recentReviews,
    };
  }

  // ─── COHORTS ──────────────────────────────────────────────────────────────

  async createCohort(userId: number, dto: CreateCohortDto) {
    const profile = await this.findByUser(userId);

    const cohort = await this.prisma.instructorCohort.create({
      data: {
        instructorId: profile.id,
        courseId: dto.courseId,
        name: dto.name,
        description: dto.description,
        modalidade: dto.modalidade ?? 'ONLINE',
        maxParticipants: dto.maxParticipants ?? 30,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        status: 'OPEN',
      },
      include: { course: { select: { id: true, title: true } } },
    });

    // Inscrever participantes iniciais
    if (dto.participantIds && dto.participantIds.length > 0) {
      await this.addParticipants(cohort.id, userId, { userIds: dto.participantIds });
    }

    return cohort;
  }

  async updateCohort(cohortId: number, userId: number, dto: UpdateCohortDto) {
    const cohort = await this.getCohortOrFail(cohortId, userId);
    return this.prisma.instructorCohort.update({
      where: { id: cohortId },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });
  }

  async getCohorts(userId: number, filters: CohortFilterDto) {
    const profile = await this.findByUser(userId);
    const { page = 1, limit = 20, courseId, status } = filters;
    const skip = (page - 1) * limit;

    const where: any = { instructorId: profile.id };
    if (courseId) where.courseId = courseId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prismaRead.instructorCohort.findMany({
        where,
        skip,
        take: limit,
        include: {
          course: { select: { id: true, title: true } },
          _count: { select: { participants: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prismaRead.instructorCohort.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getCohortDetail(cohortId: number, userId: number) {
    await this.getCohortOrFail(cohortId, userId);

    const cohort = await this.prismaRead.instructorCohort.findUnique({
      where: { id: cohortId },
      include: {
        course: { select: { id: true, title: true, workloadHours: true } },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
                position: { select: { name: true } },
              },
            },
          },
          orderBy: { enrolledAt: 'asc' },
        },
        _count: { select: { participants: true } },
      },
    });

    // Enriquecer com progresso real de enrollment
    const participants = cohort?.participants as any[];
    const enriched = await Promise.all(
      participants.map(async p => {
        const enrollment = await this.prismaRead.enrollment.findFirst({
          where: { userId: p.userId, courseId: (cohort as any).courseId },
          select: { progresses: true, status: true, completedAt: true },
        });
        return {
          ...p,
          enrollmentStatus: enrollment?.status ?? 'NOT_STARTED',
          enrollmentProgress: enrollment?.progresses?.[0] as any,
          completedAt: enrollment?.completedAt,
        };
      }),
    );

    // Calcular alertas de risco
    const atRisk = enriched.filter(
      p =>
        p.enrollmentProgress < 20 &&
        (!p.lastActiveAt || Date.now() - new Date(p.lastActiveAt).getTime() > 7 * 24 * 3600 * 1000),
    );

    return {
      ...cohort,
      participants: enriched,
      atRiskCount: atRisk.length,
      atRisk: atRisk.map(p => p.userId),
    };
  }

  async addParticipants(cohortId: number, userId: number, dto: InstructorAddParticipantsDto) {
    const cohort = await this.getCohortOrFail(cohortId, userId);
    if ((cohort as any).maxParticipants) {
      const current = await this.prismaRead.cohortParticipant.count({ where: { cohortId } });
      if (current + dto.userIds.length > (cohort as any).maxParticipants) {
        throw new BadRequestException('Capacidade máxima da turma atingida');
      }
    }

    const data = dto.userIds.map(userId => ({
      cohortId,
      userId,
      status: 'ACTIVE',
      enrolledAt: new Date(),
    }));

    await this.prisma.cohortParticipant.createMany({ data, skipDuplicates: true });

    // Inscrever automaticamente no curso se não estiver
    const courseId = (cohort as any).courseId;
    if (courseId) {
      for (const uid of dto.userIds) {
        await this.prisma.enrollment.upsert({
          where: { courseId_userId: { courseId, userId: uid } },
          create: { userId: uid, courseId, status: 'NOT_STARTED', origin: 'INSTRUCTOR' },
          update: {},
        });
      }
    }

    return { added: dto.userIds.length };
  }

  async removeParticipant(cohortId: number, participantUserId: number, instructorUserId: number) {
    await this.getCohortOrFail(cohortId, instructorUserId);
    await this.prisma.cohortParticipant.deleteMany({
      where: { cohortId, userId: participantUserId },
    });
    return { message: 'Participante removido' };
  }

  // ─── ANALYTICS DO INSTRUTOR ───────────────────────────────────────────────

  async getAnalytics(userId: number) {
    const profile = await this.findByUser(userId);
    const instructorId = profile.id;

    const [allCohorts, totalStudents, reviewStats, topCourses] = await Promise.all([
      this.prismaRead.instructorCohort.findMany({
        where: { instructorId },
        include: {
          _count: { select: { participants: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      this.prismaRead.cohortParticipant.count({
        where: { cohort: { instructorId } },
      }),
      this.prismaRead.instructorReview.aggregate({
        where: { instructorId },
        _avg: { rating: true },
        _count: true,
      }),
      this.prismaRead.instructorCohort.groupBy({
        by: ['courseId'],
        where: { instructorId },
        _count: true,
        orderBy: { _count: { courseId: 'desc' } },
        take: 5,
      }),
    ]);

    const completedCohorts = allCohorts.filter(c => c.status === 'CLOSED').length;
    const activeCohorts = allCohorts.filter(c => c.status === 'ACTIVE').length;

    return {
      totals: {
        cohorts: allCohorts.length,
        activeCohorts,
        completedCohorts,
        totalStudents,
        reviews: reviewStats._count,
        avgRating: Math.round((reviewStats._avg.rating ?? 0) * 10) / 10,
      },
      cohortsByStatus: {
        draft: allCohorts.filter(c => c.status === 'DRAFT').length,
        open: allCohorts.filter(c => c.status === 'OPEN').length,
        active: activeCohorts,
        closed: completedCohorts,
      },
      recentCohorts: allCohorts.slice(0, 5).map(c => ({
        id: c.id,
        name: (c as any).name,
        course: c.course,
        status: c.status,
        participants: c._count.participants,
      })),
    };
  }

  // ─── ALUNOS EM RISCO ──────────────────────────────────────────────────────

  async getAtRiskStudents(userId: number) {
    const profile = await this.findByUser(userId);

    const cohorts = await this.prismaRead.instructorCohort.findMany({
      where: { instructorId: profile.id, status: 'ACTIVE' },
      include: {
        course: { select: { id: true, title: true } },
        participants: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        },
      },
    });

    const atRisk: any[] = [];

    for (const cohort of cohorts) {
      for (const p of cohort.participants as any[]) {
        const enrollment = await this.prismaRead.enrollment.findFirst({
          where: { userId: p.userId, courseId: (cohort as any).courseId },
          select: { progress: true, status: true, enrolledAt: true },
        });

        const daysSinceEnroll = enrollment?.enrolledAt
          ? Math.floor(
              (Date.now() - new Date(enrollment.enrolledAt).getTime()) / (1000 * 60 * 60 * 24),
            )
          : 0;

        const isAtRisk =
          ((enrollment?.progress ?? 0) < 20 && daysSinceEnroll > 7) ||
          enrollment?.status === 'CANCELLED';

        if (isAtRisk) {
          atRisk.push({
            userId: p.userId,
            fullName: p.user?.fullName,
            avatarUrl: p.user?.avatarUrl,
            cohortId: cohort.id,
            cohortName: (cohort as any).name,
            course: cohort.course,
            progress: enrollment?.progress ?? 0,
            daysSinceEnroll,
          });
        }
      }
    }

    return { count: atRisk.length, students: atRisk };
  }

  // ─── REVIEWS ─────────────────────────────────────────────────────────────

  async addReview(userId: number, dto: InstructorReviewDto) {
    const review = await this.prisma.instructorReview.upsert({
      where: { instructorId_userId: { instructorId: dto.instructorId, userId } },
      create: { instructorId: dto.instructorId, userId, rating: dto.rating, comment: dto.comment },
      update: { rating: dto.rating, comment: dto.comment },
    });

    const avg = await this.prismaRead.instructorReview.aggregate({
      where: { instructorId: dto.instructorId },
      _avg: { rating: true },
    });
    await this.prisma.instructorProfile.update({
      where: { id: dto.instructorId },
      data: { ratingAverage: avg._avg.rating ?? 0 },
    });

    return review;
  }

  // ─── MARKETPLACE ─────────────────────────────────────────────────────────

  async createMarketplaceCourse(userId: number, dto: CreateMarketplaceCourseDto) {
    const profile = await this.findByUser(userId);

    const course = await this.prisma.marketplaceCourse.create({
      data: {
        title: dto.title,
        description: dto.description,
        price: dto.price,
        category: dto.category,
        level: dto.level,
        workloadHours: dto.workloadHours,
        instructorId: profile.id,
      },
    });

    await this.prisma.instructorCourse.create({
      data: { instructorId: profile.id, marketplaceCourseId: course.id },
    });

    await this.prisma.instructorProfile.update({
      where: { id: profile.id },
      data: { totalCourses: { increment: 1 } },
    });

    return course;
  }

  async getMarketplaceCourses(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prismaRead.marketplaceCourse.findMany({
        skip,
        take: limit,
        include: {
          instructor: {
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaRead.marketplaceCourse.count(),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── PAYOUTS ─────────────────────────────────────────────────────────────

  async createPayout(instructorId: number, amount: number) {
    return this.prisma.instructorPayout.create({ data: { instructorId, amount } });
  }

  async getPayoutHistory(userId: number) {
    const profile = await this.findByUser(userId);
    return this.prismaRead.instructorPayout.findMany({
      where: { instructorId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── HELPER ───────────────────────────────────────────────────────────────

  private async getCohortOrFail(cohortId: number, userId: number) {
    const profile = await this.findByUser(userId);
    const cohort = await this.prismaRead.instructorCohort.findFirst({
      where: { id: cohortId, instructorId: profile.id },
    });
    if (!cohort) throw new NotFoundException('Turma não encontrada ou sem permissão');
    return cohort;
  }
}

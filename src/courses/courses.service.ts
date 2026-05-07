import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { CertificateType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCourseDto, UpdateCourseDto, CourseFilterDto,
  CreateCourseModuleDto, UpdateCourseModuleDto,
  CreateLessonDto, UpdateLessonDto,
  MarkLessonCompleteDto, EnrollDto, AssignCourseDto,
  CreateQuizDto, SubmitQuizDto, CourseFeedbackDto,
  CourseStatus, EnrollmentStatus, AssignmentTarget,
} from './courses.dto';

const COURSE_BASE_INCLUDE = {
  _count:       { select: { enrollments: true, feedbacks: true, modules: true } },
  competencies: { include: { competency: true } },
} as const;

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Catálogo ─────────────────────────────────────────────────────────────

  async findAll(filters: CourseFilterDto) {
    const { page = 1, limit = 20, search, category, level, status, mandatory, departmentId } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status)       where.status = status;
    if (category)     where.category = category;
    if (level)        where.level = level;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (departmentId) where.departmentId = departmentId;
    if (search) {
      where.OR = [
        { title:            { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
        { tags:             { has: search } },
        { internalCode:     { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.course.findMany({
        where, skip, take: limit,
        include: COURSE_BASE_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.course.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        ...COURSE_BASE_INCLUDE,
        modules: {
          orderBy: { seq: 'asc' },
          include: { lessons: { orderBy: { seq: 'asc' } } },
        },
        feedbacks: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take:    10,
        },
        department: { select: { id: true, name: true, code: true } },
      },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    return course;
  }

  async getCategories() {
    const cats = await this.prisma.course.groupBy({
      by:    ['category'],
      where: { category: { not: null }, status: 'PUBLISHED' },
      _count: { id: true },
    });
    return cats.map(c => ({ category: c.category, count: c._count.id })).filter(c => c.category);
  }

  // ─── CRUD Curso ───────────────────────────────────────────────────────────

  async create(dto: CreateCourseDto) {
    if (dto.internalCode) {
      const exists = await this.prisma.course.findFirst({ where: { internalCode: dto.internalCode } });
      if (exists) throw new ConflictException(`Código interno ${dto.internalCode} já existe`);
    }

    const course = await this.prisma.course.create({
      data: {
        ...dto,
        tags:               dto.tags ?? [],
        learningObjectives: dto.learningObjectives ?? [],
        status:             dto.status ?? 'DRAFT',
        language:           dto.language ?? 'pt',
      },
    });

    await this.prisma.courseAnalytics.create({
      data: { courseId: course.id, totalEnrollments: 0, totalCompleted: 0, avgRating: 0 },
    });

    return course;
  }

  async update(id: number, dto: UpdateCourseDto) {
    await this.findOne(id);
    return this.prisma.course.update({ where: { id }, data: dto });
  }

  async publish(id: number) {
    const course = await this.findOne(id);
    if ((course as any)._count.modules === 0) {
      throw new BadRequestException('Curso sem módulos não pode ser publicado');
    }
    return this.prisma.course.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
  }

  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.course.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async duplicate(id: number) {
    const original = await this.findOne(id) as any;
    const { id: _id, createdAt, updatedAt, publishedAt, modules, feedbacks, _count, ...data } = original;

    const copy = await this.prisma.course.create({
      data: {
        ...data,
        title:        `${data.title} (cópia)`,
        status:       'DRAFT',
        internalCode: data.internalCode ? `${data.internalCode}-COPY` : undefined,
      },
    });

    for (const mod of (modules as any[])) {
      const newMod = await this.prisma.courseModule.create({
        data: { courseId: copy.id, title: mod.title, description: mod.description, seq: mod.seq },
      });
      for (const lesson of mod.lessons) {
        await this.prisma.lesson.create({
          data: {
            moduleId:        newMod.id,
            title:           lesson.title,
            description:     lesson.description,
            type:            lesson.type,
            contentUrl:      lesson.contentUrl,
            textContent:     lesson.textContent,
            seq:             lesson.seq,
            durationMinutes: lesson.durationMinutes,
            isFree:          lesson.isFree,
            allowDownload:   lesson.allowDownload,
          },
        });
      }
    }

    await this.prisma.courseAnalytics.create({
      data: { courseId: copy.id, totalEnrollments: 0, totalCompleted: 0, avgRating: 0 },
    });

    return copy;
  }

  async remove(id: number) {
    const course = await this.findOne(id) as any;
    if (course.status === 'PUBLISHED' && course._count.enrollments > 0) {
      throw new ForbiddenException('Curso publicado com matrículas não pode ser eliminado. Archive-o primeiro.');
    }
    await this.prisma.course.delete({ where: { id } });
    return { message: 'Curso eliminado' };
  }

  // ─── Competências ─────────────────────────────────────────────────────────

  async addCompetency(courseId: number, competencyId: number) {
    await this.findOne(courseId);
    return this.prisma.courseCompetency.upsert({
      where:  { courseId_competencyId: { courseId, competencyId } },
      create: { courseId, competencyId },
      update: {},
    });
  }

  async removeCompetency(courseId: number, competencyId: number) {
    return this.prisma.courseCompetency.deleteMany({ where: { courseId, competencyId } });
  }

  // ─── Módulos ──────────────────────────────────────────────────────────────

  async createModule(courseId: number, dto: CreateCourseModuleDto) {
    await this.findOne(courseId);
    return this.prisma.courseModule.create({ data: { courseId, ...dto } });
  }

  async updateModule(courseId: number, moduleId: number, dto: UpdateCourseModuleDto) {
    const mod = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId } });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return this.prisma.courseModule.update({ where: { id: moduleId }, data: dto });
  }

  async reorderModules(courseId: number, orderedIds: number[]) {
    await Promise.all(
      orderedIds.map((id, idx) =>
        this.prisma.courseModule.update({ where: { id }, data: { seq: idx } })
      )
    );
    return { message: 'Módulos reordenados' };
  }

  async removeModule(courseId: number, moduleId: number) {
    const mod = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId } });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return this.prisma.courseModule.delete({ where: { id: moduleId } });
  }

  // ─── Aulas ────────────────────────────────────────────────────────────────

  async createLesson(moduleId: number, dto: CreateLessonDto) {
    const mod = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return this.prisma.lesson.create({ data: { moduleId, ...dto } });
  }

  async updateLesson(lessonId: number, dto: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    return this.prisma.lesson.update({ where: { id: lessonId }, data: dto });
  }

  async reorderLessons(moduleId: number, orderedIds: number[]) {
    await Promise.all(
      orderedIds.map((id, idx) =>
        this.prisma.lesson.update({ where: { id }, data: { seq: idx } })
      )
    );
    return { message: 'Aulas reordenadas' };
  }

  async removeLesson(lessonId: number) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    return this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  // ─── Matrículas ───────────────────────────────────────────────────────────

  async enroll(courseId: number, userId: number, dto: EnrollDto) {
    const course = await this.findOne(courseId) as any;
    if (course.status !== 'PUBLISHED') {
      throw new BadRequestException('Apenas cursos publicados aceitam matrículas');
    }

    const existing = await this.prisma.enrollment.findFirst({ where: { courseId, userId } });
    if (existing && existing.status !== 'EXPIRED') {
      throw new ConflictException('Utilizador já matriculado neste curso');
    }

    const enrollment = await this.prisma.enrollment.create({
      data: {
        courseId, userId,
        status:    'NOT_STARTED',
        mandatory: dto.mandatory ?? course.mandatory ?? false,
        deadline:  dto.deadline ? new Date(dto.deadline) : null,
      },
    });

    await this.prisma.courseAnalytics.updateMany({
      where: { courseId },
      data:  { totalEnrollments: { increment: 1 } },
    });

    await this.prisma.notificationLog.create({
      data: {
        userId,
        type:     'COURSE_ENROLLED',
        message:  `Está matriculado no curso "${course.title}"`,
        metadata: JSON.stringify({}),
      },
    });

    return enrollment;
  }

  async assignCourse(courseId: number, dto: AssignCourseDto, assignedById: number) {
    const course = await this.findOne(courseId) as any;
    if (course.status !== 'PUBLISHED') {
      throw new BadRequestException('Apenas cursos publicados podem ser atribuídos');
    }

    let userIds: number[] = [];

    if (dto.targetType === AssignmentTarget.USER) {
      userIds = [dto.targetId];
    } else if (dto.targetType === AssignmentTarget.DEPARTMENT) {
      const users = await this.prisma.user.findMany({
        where: { departmentId: dto.targetId, active: true }, select: { id: true },
      });
      userIds = users.map(u => u.id);
    } else if (dto.targetType === AssignmentTarget.POSITION) {
      const users = await this.prisma.user.findMany({
        where: { positionId: dto.targetId, active: true }, select: { id: true },
      });
      userIds = users.map(u => u.id);
    }

    const results = { enrolled: 0, skipped: 0, total: userIds.length };

    for (const userId of userIds) {
      const exists = await this.prisma.enrollment.findFirst({
        where: { courseId, userId, status: { not: 'EXPIRED' } },
      });
      if (exists) { results.skipped++; continue; }

      await this.prisma.enrollment.create({
        data: {
          courseId, userId,
          mandatory:   dto.mandatory ?? false,
          deadline:    dto.deadline ? new Date(dto.deadline) : null,
          status:      'NOT_STARTED',
          assignedById,
        },
      });

      await this.prisma.notificationLog.create({
        data: {
          userId,
          type:     'COURSE_ASSIGNED',
          message:  `O curso "${course.title}" foi atribuído a si`,
          metadata: JSON.stringify({}),
        },
      });

      results.enrolled++;
    }

    await this.prisma.courseAnalytics.updateMany({
      where: { courseId },
      data:  { totalEnrollments: { increment: results.enrolled } },
    });

    return results;
  }

  async getMyEnrollments(userId: number) {
    return this.prisma.enrollment.findMany({
      where:   { userId },
      include: {
        course: {
          select: {
            id: true, title: true, thumbnailUrl: true, category: true,
            level: true, workloadHours: true, status: true,
            _count: { select: { modules: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  // ─── Progresso ────────────────────────────────────────────────────────────

  async markLessonComplete(lessonId: number, userId: number, dto: MarkLessonCompleteDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where:   { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Aula não encontrada');

    const courseId   = (lesson as any).module.courseId;
    const enrollment = await this.prisma.enrollment.findFirst({ where: { userId, courseId } });
    if (!enrollment) throw new ForbiddenException('Não está matriculado neste curso');

    const progress = await this.prisma.lessonProgress.upsert({
      where:  { lessonId_userId: { lessonId, userId } },
      create: {
        lessonId, userId, completed: true, completedAt: new Date(),
        watchedSeconds: dto.watchedSeconds, resumePosition: dto.resumePosition,
      },
      update: {
        completed: true, completedAt: new Date(),
        watchedSeconds: dto.watchedSeconds, resumePosition: dto.resumePosition,
      },
    });

    if (enrollment.status === 'NOT_STARTED') {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data:  { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }

    const courseProgress = await this.calculateCourseProgress(courseId, userId);
    if (courseProgress.pct >= 100) {
      await this.completeCourse(enrollment.id, userId, courseId);
    }

    return { progress, courseProgress };
  }

  private async calculateCourseProgress(courseId: number, userId: number) {
    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.lesson.count({ where: { module: { courseId } } }),
      this.prisma.lessonProgress.count({
        where: { userId, completed: true, lesson: { module: { courseId } } },
      }),
    ]);
    const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { totalLessons, completedLessons, pct };
  }

  private async completeCourse(enrollmentId: number, userId: number, courseId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment || enrollment.status === 'COMPLETED') return;

    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data:  { status: 'COMPLETED', completedAt: new Date() },
    });

    await this.prisma.courseAnalytics.updateMany({
      where: { courseId },
      data:  { totalCompleted: { increment: 1 } },
    });

    await this.issueCertificate(enrollmentId, userId, courseId);
  }

  async getCourseProgress(courseId: number, userId: number) {
    const enrollment = await this.prisma.enrollment.findFirst({ where: { userId, courseId } });
    if (!enrollment) return null;

    const courseProgress  = await this.calculateCourseProgress(courseId, userId);
    const moduleProgress  = await this.prisma.courseModule.findMany({
      where:   { courseId },
      orderBy: { seq: 'asc' },
      include: { lessons: { include: { progress: { where: { userId } } } } },
    });

    return {
      enrollment,
      courseProgress,
      modules: moduleProgress.map(mod => ({
        id:             mod.id,
        title:          mod.title,
        seq:            mod.seq,
        lessons:        mod.lessons.map(l => ({
          id:             l.id,
          title:          l.title,
          type:           l.type,
          seq:            l.seq,
          completed:      (l as any).progress[0]?.completed ?? false,
          resumePosition: (l as any).progress[0]?.resumePosition ?? 0,
        })),
        completedCount: mod.lessons.filter(l => (l as any).progress[0]?.completed).length,
        totalCount:     mod.lessons.length,
      })),
    };
  }

  // ─── Certificados ─────────────────────────────────────────────────────────

  private async issueCertificate(enrollmentId: number, userId: number, courseId: number) {
    const course    = await this.prisma.course.findUnique({ where: { id: courseId } });
    const code      = `CERT-${courseId}-${userId}-${Date.now()}`;
    const expiresAt = course?.certificateValidityDays
      ? new Date(Date.now() + course.certificateValidityDays * 86400 * 1000)
      : null;

    const cert = await this.prisma.certificate.create({
      data: {
        enrollmentId,
        userId,
        courseId,
        issuedAt:       new Date(),
        expiresAt,
        type:           CertificateType.COURSE,
        validationCode: code,
      },
    });

    await this.prisma.notificationLog.create({
      data: {
        userId,
        type:     'CERTIFICATE_ISSUED',
        message:  `Certificado emitido para o curso "${course?.title}"`,
        metadata: JSON.stringify({}),
      },
    });

    return cert;
  }

  async getMyCertificates(userId: number) {
    return this.prisma.certificate.findMany({
      where:   { userId },
      include: { course: { select: { id: true, title: true, thumbnailUrl: true, category: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async verifyCertificate(validationCode: string) {
    const cert = await this.prisma.certificate.findFirst({
      where:   { validationCode },
      include: {
        course: { select: { id: true, title: true } },
        user:   { select: { id: true, fullName: true } },
      },
    });
    if (!cert) throw new NotFoundException('Certificado não encontrado ou inválido');
    const expired = cert.expiresAt ? new Date() > new Date(cert.expiresAt) : false;
    return { ...cert, valid: !expired };
  }

  // ─── Quiz ─────────────────────────────────────────────────────────────────

  async createQuiz(lessonId: number, dto: CreateQuizDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');

    const quiz = await this.prisma.quiz.create({
      data: {
        lessonId,
        title:            dto.title,
        passingScore:     dto.passingScore ?? 70,
        maxAttempts:      dto.maxAttempts ?? 0,
        timeLimitMinutes: dto.timeLimitMinutes,
      },
    });

    await this.prisma.quizQuestion.createMany({
      data: dto.questions.map((q, idx) => ({
        quizId:        quiz.id,
        question:      q.question,
        type:          q.type,
        options:       q.options ? JSON.stringify(q.options) : null,
        correctAnswer: q.correctAnswer,
        points:        q.points ?? 1,
        seq:           idx,
      })),
    });

    return this.prisma.quiz.findUnique({
      where:   { id: quiz.id },
      include: { questions: { orderBy: { seq: 'asc' } } },
    });
  }

  async submitQuiz(quizId: number, userId: number, dto: SubmitQuizDto) {
    const quiz = await this.prisma.quiz.findUnique({
      where:   { id: quizId },
      include: { questions: true },
    });
    if (!quiz) throw new NotFoundException('Quiz não encontrado');

    if (quiz.maxAttempts > 0) {
      const attempts = await this.prisma.quizAttempt.count({ where: { quizId, userId } });
      if (attempts >= quiz.maxAttempts) {
        throw new ForbiddenException(`Limite de ${quiz.maxAttempts} tentativa(s) atingido`);
      }
    }

    let totalPoints = 0;
    let earnedPoints = 0;
    const results: any[] = [];

    for (const q of quiz.questions as any[]) {
      const answer = dto.answers[String(q.id)];
      totalPoints += q.points;

      if (q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') {
        const options   = q.options ? JSON.parse(q.options) : [];
        const correct   = options.find((o: any) => o.isCorrect)?.text ?? q.correctAnswer;
        const isCorrect = answer?.toLowerCase() === correct?.toLowerCase();
        if (isCorrect) earnedPoints += q.points;
        results.push({ questionId: q.id, answer, correct: isCorrect, correctAnswer: correct });
      } else {
        results.push({ questionId: q.id, answer, correct: null, note: 'Correção manual necessária' });
      }
    }

    const score  = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId, userId, score, passed,
        answers:     JSON.stringify(dto.answers),
        results:     JSON.stringify(results),
        submittedAt: new Date(),
      },
    });

    return { attempt, score, passed, passingScore: quiz.passingScore, results };
  }

  // ─── Feedback ─────────────────────────────────────────────────────────────

  async addFeedback(courseId: number, userId: number, dto: CourseFeedbackDto) {
    await this.findOne(courseId);

    const existing = await this.prisma.courseFeedback.findFirst({ where: { courseId, userId } });
    if (existing) {
      const updated = await this.prisma.courseFeedback.update({
        where: { id: existing.id },
        data:  { comment: dto.comment, rating: dto.rating },
      });
      await this.updateAvgRating(courseId);
      return updated;
    }

    const feedback = await this.prisma.courseFeedback.create({
      data: { courseId, userId, comment: dto.comment, rating: dto.rating },
    });
    await this.updateAvgRating(courseId);
    return feedback;
  }

  private async updateAvgRating(courseId: number) {
    const avg = await this.prisma.courseFeedback.aggregate({
      where: { courseId }, _avg: { rating: true }, _count: true,
    });
    await this.prisma.courseAnalytics.updateMany({
      where: { courseId },
      data:  { avgRating: avg._avg.rating ?? 0, totalRatings: avg._count },
    });
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getCourseAnalytics(courseId: number) {
    await this.findOne(courseId);

    const [analytics, enrollmentsByStatus, feedbackStats, recentActivity, lessonCompletion] =
      await Promise.all([
        this.prisma.courseAnalytics.findFirst({ where: { courseId } }),
        this.prisma.enrollment.groupBy({ by: ['status'], where: { courseId }, _count: true }),
        this.prisma.courseFeedback.aggregate({ where: { courseId }, _avg: { rating: true }, _count: true }),
        this.prisma.enrollment.findMany({
          where:   { courseId },
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { enrolledAt: 'desc' },
          take:    10,
        }),
        this.prisma.lesson.findMany({
          where:   { module: { courseId } },
          include: {
            progress: { where: { completed: true }, select: { id: true } },
            _count:   { select: { progress: true } },
          },
          orderBy: [{ module: { seq: 'asc' } }, { seq: 'asc' }],
        }),
      ]);

    return {
      analytics,
      enrollmentsByStatus,
      feedbackStats,
      recentActivity,
      lessonCompletion: lessonCompletion.map(l => ({
        id:          l.id,
        title:       l.title,
        completions: (l as any)._count.progress,
      })),
    };
  }

  async getAdminDashboard() {
    const [totalCourses, published, totalEnrollments, completedEnrollments, overdueEnrollments] =
      await Promise.all([
        this.prisma.course.count(),
        this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.enrollment.count(),
        this.prisma.enrollment.count({ where: { status: 'COMPLETED' } }),
        this.prisma.enrollment.count({
          where: { deadline: { lt: new Date() }, status: { notIn: ['COMPLETED', 'EXPIRED'] } },
        }),
      ]);

    const topCourses = await this.prisma.course.findMany({
      where:   { status: 'PUBLISHED' },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { enrollments: { _count: 'desc' } },
      take:    5,
    });

    const completionRate = totalEnrollments > 0
      ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;

    return {
      courses:     { total: totalCourses, published },
      enrollments: { total: totalEnrollments, completed: completedEnrollments, overdue: overdueEnrollments },
      completionRate,
      topCourses,
    };
  }
}
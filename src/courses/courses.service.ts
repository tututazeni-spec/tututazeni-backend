import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CourseCompletionService } from '../course-completion/course-completion.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import {
  CreateCourseDto,
  UpdateCourseDto,
  CourseFilterDto,
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
  CreateLessonDto,
  UpdateLessonDto,
  MarkLessonCompleteDto,
  EnrollDto,
  AssignCourseDto,
  CreateQuizDto,
  UpdateQuizDto,
  SubmitQuizDto,
  CourseFeedbackDto,
  AssignmentTarget,
  CreateLessonActivityDto,
  UpdateLessonActivityDto,
  CreateLessonResourceDto,
  UpdateLessonResourceDto,
  CreateCourseAudienceGroupDto,
  UpdateCourseAudienceGroupDto,
} from './courses.dto';

const COURSE_BASE_INCLUDE = {
  _count: { select: { enrollments: true, feedbacks: true, modules: true } },
  competencies: { include: { competency: true } },
} as const;

const COURSE_DETAIL_INCLUDE = {
  ...COURSE_BASE_INCLUDE,
  primaryInstructor: { select: { id: true, fullName: true, avatarUrl: true } },
  requiredCourse: { select: { id: true, title: true } },
  instructors: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } },
  audienceGroups: true,
  modules: {
    orderBy: { seq: 'asc' as const },
    include: {
      lessons: { orderBy: { seq: 'asc' as const }, include: { activities: true, resources: true } },
      competencies: { include: { competency: true } },
    },
  },
  feedbacks: {
    include: { user: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'desc' as const },
    take: 10,
  },
  department: { select: { id: true, name: true, code: true } },
} as const;

function toDateOrNull(value?: string | null) {
  return value ? new Date(value) : value === null ? null : undefined;
}

// NOTA — dois sistemas paralelos de Módulos/Lições (ver docs/06-modulo-courses.md):
// Este service e `course-modules/course-modules.service.ts` expõem CRUD distinto
// (rotas `/courses/:id/modules|/courses/modules/:id/lessons` aqui vs. `/modules`,
// `/lessons` no outro) sobre os MESMOS modelos Prisma (CourseModule/Lesson) — sem
// divergência de dados, mas com histórico duplicado por terem sido escritos sem
// consciência um do outro (PR #296 não sabia que `/modules`/`/lessons` já existiam).
// Este service tem os campos mais completos do doc (code, status, live*,
// competências, activities, resources); o outro tem a lógica de acesso mais madura
// (drip/sequencial/analytics/clone/TTS). Frontend: ModuleModal/ModulosView (Gestão)
// usam este; ModuleBuilder/ProgressModal (/courses/[id]/learn) usam o outro.
// O único ponto onde a duplicação era um bug real de segurança — conclusão de
// aula a ignorar pré-requisitos de módulo via esta rota — foi corrigido
// centralizando o gate de acesso em CourseCompletionService.markLessonComplete,
// chamado por ambos. Não fundido fisicamente por agora (risco/custo de reescrever
// duas UIs admin distintas); mesmo padrão de "documentar em vez de fundir" já
// usado no repo para os dois AuditService (ver CLAUDE.md).
@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private prisma: PrismaService,
    private readonly courseCompletion: CourseCompletionService,
  ) {}

  // ─── Catálogo ─────────────────────────────────────────────────────────────

  async findAll(filters: CourseFilterDto) {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      level,
      status,
      mandatory,
      departmentId,
    } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.CourseWhereInput = {};
    if (status) where.status = status;
    if (category) where.category = category;
    if (level) where.level = level;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (departmentId) where.departmentId = departmentId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { shortDescription: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
        { internalCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.read.course.findMany({
        where,
        skip,
        take,
        include: COURSE_BASE_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.course.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number) {
    const course = await this.prisma.read.course.findUnique({
      where: { id },
      include: COURSE_DETAIL_INCLUDE,
    });
    if (!course) throw new NotFoundException('Curso não encontrado');

    // docs/06-modulo-courses.md secções 11-12 — "Cursos relacionados" e
    // "Este curso faz parte de: Percurso X". Sem isto o resto da página de
    // detalhe (secções 1-10) já tinha os dados via COURSE_DETAIL_INCLUDE mas
    // não era renderizado; estas duas secções não tinham sequer os dados.
    const competencyIds = course.competencies.map(c => c.competencyId);
    const relatedWhere: Prisma.CourseWhereInput[] = [];
    if (course.category) relatedWhere.push({ category: course.category });
    if (competencyIds.length > 0) {
      relatedWhere.push({ competencies: { some: { competencyId: { in: competencyIds } } } });
    }
    const [relatedCourses, pathLinks] = await Promise.all([
      relatedWhere.length > 0
        ? this.prisma.read.course.findMany({
            where: { id: { not: id }, status: 'PUBLISHED', OR: relatedWhere },
            take: 6,
            select: {
              id: true,
              title: true,
              thumbnailUrl: true,
              category: true,
              level: true,
              workloadHours: true,
            },
          })
        : Promise.resolve([]),
      this.prisma.read.learningPathCourse.findMany({
        where: { courseId: id },
        select: { learningPath: { select: { id: true, title: true } } },
      }),
    ]);

    return {
      ...course,
      relatedCourses,
      learningPaths: pathLinks.map(l => l.learningPath),
    };
  }

  async getCategories() {
    const cats = await this.prisma.read.course.groupBy({
      by: ['category'],
      where: { category: { not: null }, status: 'PUBLISHED' },
      _count: { id: true },
    });
    return cats.map(c => ({ category: c.category, count: c._count.id })).filter(c => c.category);
  }

  // ─── CRUD Curso ───────────────────────────────────────────────────────────

  async create(dto: CreateCourseDto) {
    if (dto.internalCode) {
      // Guard de unicidade antes da escrita: força primary.
      const exists = await this.prisma.course.findFirst({
        where: { internalCode: dto.internalCode },
      });
      if (exists) throw new ConflictException(`Código interno ${dto.internalCode} já existe`);
    }

    const course = await this.prisma.course.create({
      data: {
        ...dto,
        tags: dto.tags ?? [],
        targetAudience: dto.targetAudience ?? [],
        learningObjectives: dto.learningObjectives ?? [],
        status: dto.status ?? 'DRAFT',
        language: dto.language ?? 'pt',
        startDate: toDateOrNull(dto.startDate),
        endDate: toDateOrNull(dto.endDate),
      },
    });

    await this.prisma.courseAnalytics.create({
      data: { courseId: course.id, totalEnrollments: 0, totalCompleted: 0, avgRating: 0 },
    });

    return course;
  }

  async update(id: number, dto: UpdateCourseDto) {
    await this.findOne(id);
    return this.prisma.course.update({
      where: { id },
      data: {
        ...dto,
        startDate: toDateOrNull(dto.startDate),
        endDate: toDateOrNull(dto.endDate),
      },
    });
  }

  async publish(id: number) {
    const course = await this.findOne(id);
    if (course._count.modules === 0) {
      throw new BadRequestException('Curso sem módulos não pode ser publicado');
    }
    return this.prisma.course.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.course.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  async duplicate(id: number) {
    const original = await this.findOne(id);
    // Whitelist explícito dos campos escalares do Course a copiar — nunca
    // espalhar `original` directamente: `findOne()` inclui relações
    // (department, competencies, primaryInstructor, requiredCourse,
    // instructors, audienceGroups, modules, feedbacks, _count) que não são
    // argumentos válidos de `course.create({ data })` e rebentam em runtime
    // real (mascarado pelos testes unitários, que mockam o Prisma). Ver
    // histórico desta função.
    const copy = await this.prisma.course.create({
      data: {
        title: `${original.title} (cópia)`,
        shortDescription: original.shortDescription,
        description: original.description,
        category: original.category,
        knowledgeArea: original.knowledgeArea,
        tags: original.tags,
        thumbnailUrl: original.thumbnailUrl,
        introVideoUrl: original.introVideoUrl,
        workloadHours: original.workloadHours,
        estimatedDurationDays: original.estimatedDurationDays,
        language: original.language,
        level: original.level,
        status: 'DRAFT',
        visibility: original.visibility,
        mandatory: original.mandatory,
        internalCode: original.internalCode ? `${original.internalCode}-COPY` : undefined,
        departmentId: original.departmentId,
        unit: original.unit,
        targetAudience: original.targetAudience,
        learningObjectives: original.learningObjectives,
        requiresApproval: original.requiresApproval,
        passingScore: original.passingScore,
        minCompletionPercent: original.minCompletionPercent,
        certificateEnabled: original.certificateEnabled,
        certificateCriteria: original.certificateCriteria,
        certificateValidityDays: original.certificateValidityDays,
        allowDownload: original.allowDownload,
        primaryInstructorId: original.primaryInstructorId,
        requiredCourseId: original.requiredCourseId,
      },
    });

    const moduleIdMap = new Map<number, number>();

    for (const mod of original.modules) {
      const newMod = await this.prisma.courseModule.create({
        data: {
          courseId: copy.id,
          code: mod.code,
          title: mod.title,
          description: mod.description,
          thumbnailUrl: mod.thumbnailUrl,
          learningObjectives: mod.learningObjectives,
          seq: mod.seq,
          status: 'DRAFT',
          type: mod.type,
          progressionType: mod.progressionType,
          completionRule: mod.completionRule,
          minCompletionPercent: mod.minCompletionPercent,
          minQuizScore: mod.minQuizScore,
          mandatory: mod.mandatory,
          allowSkip: mod.allowSkip,
          estimatedDurationMinutes: mod.estimatedDurationMinutes,
          dripDays: mod.dripDays,
        },
      });
      moduleIdMap.set(mod.id, newMod.id);

      for (const competency of mod.competencies ?? []) {
        await this.prisma.moduleCompetency.create({
          data: { moduleId: newMod.id, competencyId: competency.competencyId },
        });
      }

      for (const lesson of mod.lessons) {
        const newLesson = await this.prisma.lesson.create({
          data: {
            moduleId: newMod.id,
            code: lesson.code,
            title: lesson.title,
            description: lesson.description,
            type: lesson.type,
            contentUrl: lesson.contentUrl,
            textContent: lesson.textContent,
            captionsUrl: lesson.captionsUrl,
            transcript: lesson.transcript,
            seq: lesson.seq,
            durationMinutes: lesson.durationMinutes,
            isFree: lesson.isFree,
            mandatory: lesson.mandatory,
            allowDownload: lesson.allowDownload,
            minWatchSeconds: lesson.minWatchSeconds,
            allowSkip: lesson.allowSkip,
            autoComplete: lesson.autoComplete,
            requiresActivity: lesson.requiresActivity,
            requiresAssessment: lesson.requiresAssessment,
          },
        });

        for (const activity of lesson.activities ?? []) {
          await this.prisma.lessonActivity.create({
            data: {
              lessonId: newLesson.id,
              type: activity.type,
              title: activity.title,
              description: activity.description,
              contentUrl: activity.contentUrl,
              seq: activity.seq,
            },
          });
        }

        for (const resource of lesson.resources ?? []) {
          await this.prisma.lessonResource.create({
            data: {
              lessonId: newLesson.id,
              title: resource.title,
              url: resource.url,
              fileType: resource.fileType,
              fileSizeKb: resource.fileSizeKb,
            },
          });
        }
      }
    }

    // Pré-requisitos entre módulos apontam para IDs do curso original —
    // remapeia para os novos IDs da cópia (segunda passagem, já com o mapa completo).
    for (const mod of original.modules) {
      if (mod.requiredModuleId && moduleIdMap.has(mod.requiredModuleId)) {
        await this.prisma.courseModule.update({
          where: { id: moduleIdMap.get(mod.id)! },
          data: { requiredModuleId: moduleIdMap.get(mod.requiredModuleId) },
        });
      }
    }

    await this.prisma.courseAnalytics.create({
      data: { courseId: copy.id, totalEnrollments: 0, totalCompleted: 0, avgRating: 0 },
    });

    return copy;
  }

  async remove(id: number) {
    const course = await this.findOne(id);
    if (course.status === 'PUBLISHED' && course._count.enrollments > 0) {
      throw new ForbiddenException(
        'Curso publicado com matrículas não pode ser eliminado. Archive-o primeiro.',
      );
    }
    await this.prisma.course.delete({ where: { id } });
    return { message: 'Curso eliminado' };
  }

  // ─── Competências ─────────────────────────────────────────────────────────

  async addCompetency(courseId: number, competencyId: number) {
    await this.findOne(courseId);
    return this.prisma.courseCompetency.upsert({
      where: { courseId_competencyId: { courseId, competencyId } },
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
    return this.prisma.courseModule.create({
      data: { courseId, ...dto, availableFrom: toDateOrNull(dto.availableFrom) },
    });
  }

  async updateModule(courseId: number, moduleId: number, dto: UpdateCourseModuleDto) {
    const mod = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId } });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return this.prisma.courseModule.update({
      where: { id: moduleId },
      data: { ...dto, availableFrom: toDateOrNull(dto.availableFrom) },
    });
  }

  async reorderModules(courseId: number, orderedIds: number[]) {
    await Promise.all(
      orderedIds.map((id, idx) =>
        this.prisma.courseModule.update({ where: { id }, data: { seq: idx } }),
      ),
    );
    return { message: 'Módulos reordenados' };
  }

  async removeModule(courseId: number, moduleId: number) {
    const mod = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId } });
    if (!mod) throw new NotFoundException('Módulo não encontrado');

    // Lesson→CourseModule tem onDelete: Cascade, mas Quiz→Lesson não — sem
    // isto, eliminar um módulo com uma aula com quiz rebentava com 500
    // (mesma FK RESTRICT não tratada de removeLesson, aqui atingida via
    // cascata). Mesma regra: bloquear se há tentativas reais, senão eliminar
    // os quizzes das aulas do módulo antes do módulo.
    const quizzes = await this.prisma.quiz.findMany({
      where: { lesson: { moduleId } },
      include: { _count: { select: { attempts: true } } },
    });
    const withAttempts = quizzes.filter(q => q._count.attempts > 0);
    if (withAttempts.length > 0) {
      throw new ForbiddenException(
        `${withAttempts.length} aula(s) deste módulo têm quiz com tentativas de alunos. Não pode ser eliminado.`,
      );
    }
    if (quizzes.length > 0) {
      await this.prisma.quizQuestion.deleteMany({ where: { quizId: { in: quizzes.map(q => q.id) } } });
      await this.prisma.quiz.deleteMany({ where: { id: { in: quizzes.map(q => q.id) } } });
    }

    return this.prisma.courseModule.delete({ where: { id: moduleId } });
  }

  // ─── Aulas ────────────────────────────────────────────────────────────────

  async createLesson(moduleId: number, dto: CreateLessonDto) {
    const mod = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return this.prisma.lesson.create({
      data: {
        moduleId,
        ...dto,
        availableFrom: toDateOrNull(dto.availableFrom),
        availableUntil: toDateOrNull(dto.availableUntil),
        liveDate: toDateOrNull(dto.liveDate),
      },
    });
  }

  async updateLesson(lessonId: number, dto: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...dto,
        availableFrom: toDateOrNull(dto.availableFrom),
        availableUntil: toDateOrNull(dto.availableUntil),
        liveDate: toDateOrNull(dto.liveDate),
      },
    });
  }

  // ─── Actividades da lição ─────────────────────────────────────────────────

  async createLessonActivity(lessonId: number, dto: CreateLessonActivityDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    return this.prisma.lessonActivity.create({ data: { lessonId, ...dto } });
  }

  async updateLessonActivity(activityId: number, dto: UpdateLessonActivityDto) {
    const activity = await this.prisma.lessonActivity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('Actividade não encontrada');
    return this.prisma.lessonActivity.update({ where: { id: activityId }, data: dto });
  }

  async removeLessonActivity(activityId: number) {
    const activity = await this.prisma.lessonActivity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException('Actividade não encontrada');
    return this.prisma.lessonActivity.delete({ where: { id: activityId } });
  }

  // ─── Recursos da lição ────────────────────────────────────────────────────

  async createLessonResource(lessonId: number, dto: CreateLessonResourceDto) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    return this.prisma.lessonResource.create({ data: { lessonId, ...dto } });
  }

  async updateLessonResource(resourceId: number, dto: UpdateLessonResourceDto) {
    const resource = await this.prisma.lessonResource.findUnique({ where: { id: resourceId } });
    if (!resource) throw new NotFoundException('Recurso não encontrado');
    return this.prisma.lessonResource.update({ where: { id: resourceId }, data: dto });
  }

  async removeLessonResource(resourceId: number) {
    const resource = await this.prisma.lessonResource.findUnique({ where: { id: resourceId } });
    if (!resource) throw new NotFoundException('Recurso não encontrado');
    return this.prisma.lessonResource.delete({ where: { id: resourceId } });
  }

  // ─── Instrutores ──────────────────────────────────────────────────────────

  async addInstructor(courseId: number, userId: number) {
    await this.findOne(courseId);
    return this.prisma.courseInstructor.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: { courseId, userId },
      update: {},
    });
  }

  async removeInstructor(courseId: number, userId: number) {
    return this.prisma.courseInstructor.deleteMany({ where: { courseId, userId } });
  }

  // ─── Grupos de audiência ──────────────────────────────────────────────────

  async createAudienceGroup(courseId: number, dto: CreateCourseAudienceGroupDto) {
    await this.findOne(courseId);
    return this.prisma.courseAudienceGroup.create({
      data: { courseId, name: dto.name, userIds: dto.userIds ?? [] },
    });
  }

  async updateAudienceGroup(groupId: number, dto: UpdateCourseAudienceGroupDto) {
    const group = await this.prisma.courseAudienceGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Grupo não encontrado');
    return this.prisma.courseAudienceGroup.update({ where: { id: groupId }, data: dto });
  }

  async removeAudienceGroup(groupId: number) {
    const group = await this.prisma.courseAudienceGroup.findUnique({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Grupo não encontrado');
    return this.prisma.courseAudienceGroup.delete({ where: { id: groupId } });
  }

  // ─── Competências do módulo ──────────────────────────────────────────────

  async addModuleCompetency(moduleId: number, competencyId: number) {
    const mod = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return this.prisma.moduleCompetency.upsert({
      where: { moduleId_competencyId: { moduleId, competencyId } },
      create: { moduleId, competencyId },
      update: {},
    });
  }

  async removeModuleCompetency(moduleId: number, competencyId: number) {
    return this.prisma.moduleCompetency.deleteMany({ where: { moduleId, competencyId } });
  }

  async reorderLessons(moduleId: number, orderedIds: number[]) {
    await Promise.all(
      orderedIds.map((id, idx) => this.prisma.lesson.update({ where: { id }, data: { seq: idx } })),
    );
    return { message: 'Aulas reordenadas' };
  }

  async removeLesson(lessonId: number) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');

    // Quiz.lessonId e QuizAttempt.quizId não têm onDelete: Cascade (RESTRICT
    // por omissão) — sem isto, eliminar uma aula com quiz rebentava com 500
    // (violação de FK não tratada) em vez de um erro claro. Bloquear se há
    // tentativas reais de alunos (dados que não devem desaparecer em
    // silêncio); sem tentativas, o quiz é só configuração e pode ser
    // eliminado em cascata com a aula.
    const quiz = await this.prisma.quiz.findUnique({
      where: { lessonId },
      include: { _count: { select: { attempts: true } } },
    });
    if (quiz) {
      if (quiz._count.attempts > 0) {
        throw new ForbiddenException(
          `Esta aula tem um quiz com ${quiz._count.attempts} tentativa(s) de alunos. Não pode ser eliminada.`,
        );
      }
      await this.prisma.quizQuestion.deleteMany({ where: { quizId: quiz.id } });
      await this.prisma.quiz.delete({ where: { id: quiz.id } });
    }

    return this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  // ─── Matrículas ───────────────────────────────────────────────────────────

  async enroll(courseId: number, userId: number, dto: EnrollDto) {
    const course = await this.findOne(courseId);
    if (course.status !== 'PUBLISHED') {
      throw new BadRequestException('Apenas cursos publicados aceitam matrículas');
    }

    // Guard de matrícula duplicada antes da escrita: força primary.
    const existing = await this.prisma.enrollment.findFirst({ where: { courseId, userId } });
    if (existing && existing.status !== 'EXPIRED') {
      throw new ConflictException('Utilizador já matriculado neste curso');
    }

    const pending = course.requiresApproval === true;

    const enrollment = await this.prisma.enrollment.create({
      data: {
        courseId,
        userId,
        status: pending ? 'PENDING_APPROVAL' : 'NOT_STARTED',
        mandatory: dto.mandatory ?? course.mandatory ?? false,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
      },
    });

    if (!pending) {
      await this.prisma.courseAnalytics.updateMany({
        where: { courseId },
        data: { totalEnrollments: { increment: 1 } },
      });
    }

    if (pending) {
      // Curso exige aprovação — notifica o instrutor principal (ou, na
      // ausência, um utilizador RH) em vez do próprio requerente. Mesmo
      // padrão de notificação single-target usado noutros módulos (ver
      // leave-management.service.ts / work-declarations.service.ts).
      const approver =
        course.primaryInstructorId ??
        (await this.prisma.read.user.findFirst({ where: { role: { code: 'RH' } } }))?.id;
      if (approver) {
        await createNotificationSafe(this.prisma, this.logger, {
          userId: approver,
          type: 'COURSE_ENROLLMENT_REQUESTED',
          message: `Novo pedido de inscrição em "${course.title}" aguarda aprovação`,
        });
      }
    } else {
      await createNotificationSafe(this.prisma, this.logger, {
        userId,
        type: 'COURSE_ENROLLED',
        message: `Está matriculado no curso "${course.title}"`,
      });
    }

    return enrollment;
  }

  async listPendingEnrollments(courseId: number) {
    return this.prisma.read.enrollment.findMany({
      where: { courseId, status: 'PENDING_APPROVAL' },
      include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { enrolledAt: 'asc' },
    });
  }

  async approveEnrollment(enrollmentId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');
    if (enrollment.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Esta matrícula não está pendente de aprovação');
    }
    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'NOT_STARTED' },
    });
    await this.prisma.courseAnalytics.updateMany({
      where: { courseId: enrollment.courseId },
      data: { totalEnrollments: { increment: 1 } },
    });
    const course = await this.prisma.read.course.findUnique({ where: { id: enrollment.courseId } });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: enrollment.userId,
      type: 'COURSE_ENROLLED',
      message: `A sua inscrição em "${course?.title ?? 'curso'}" foi aprovada`,
    });
    return updated;
  }

  async rejectEnrollment(enrollmentId: number, reason?: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');
    if (enrollment.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Esta matrícula não está pendente de aprovação');
    }
    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'CANCELLED', cancelReason: reason ?? 'Pedido de inscrição rejeitado' },
    });
    const course = await this.prisma.read.course.findUnique({ where: { id: enrollment.courseId } });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: enrollment.userId,
      type: 'COURSE_ENROLLMENT_REJECTED',
      message: `A sua inscrição em "${course?.title ?? 'curso'}" foi rejeitada`,
    });
    return updated;
  }

  async assignCourse(courseId: number, dto: AssignCourseDto, assignedById: number) {
    const course = await this.findOne(courseId);
    if (course.status !== 'PUBLISHED') {
      throw new BadRequestException('Apenas cursos publicados podem ser atribuídos');
    }

    let userIds: number[] = [];

    if (dto.targetType === AssignmentTarget.USER) {
      userIds = [dto.targetId];
    } else if (dto.targetType === AssignmentTarget.DEPARTMENT) {
      const users = await this.prisma.read.user.findMany({
        where: { departmentId: dto.targetId, active: true },
        select: { id: true },
      });
      userIds = users.map(u => u.id);
    } else if (dto.targetType === AssignmentTarget.POSITION) {
      const users = await this.prisma.read.user.findMany({
        where: { positionId: dto.targetId, active: true },
        select: { id: true },
      });
      userIds = users.map(u => u.id);
    }

    const results = { enrolled: 0, skipped: 0, total: userIds.length };

    for (const userId of userIds) {
      // Guard de duplicado antes de criar matrícula: força primary.
      const exists = await this.prisma.enrollment.findFirst({
        where: { courseId, userId, status: { not: 'EXPIRED' } },
      });
      if (exists) {
        results.skipped++;
        continue;
      }

      await this.prisma.enrollment.create({
        data: {
          courseId,
          userId,
          mandatory: dto.mandatory ?? false,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          status: 'NOT_STARTED',
          assignedById,
        },
      });

      await createNotificationSafe(this.prisma, this.logger, {
        userId,
        type: 'COURSE_ASSIGNED',
        message: `O curso "${course.title}" foi atribuído a si`,
      });

      results.enrolled++;
    }

    await this.prisma.courseAnalytics.updateMany({
      where: { courseId },
      data: { totalEnrollments: { increment: results.enrolled } },
    });

    return results;
  }

  async getMyEnrollments(userId: number) {
    return this.prisma.read.enrollment.findMany({
      where: { userId },
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
      orderBy: { enrolledAt: 'desc' },
    });
  }

  // ─── Progresso ────────────────────────────────────────────────────────────

  async markLessonComplete(lessonId: number, userId: number, dto: MarkLessonCompleteDto) {
    return this.courseCompletion.markLessonComplete(userId, lessonId, {
      watchedSeconds: dto.watchedSeconds,
      resumePosition: dto.resumePosition,
    });
  }

  async getCourseProgress(courseId: number, userId: number) {
    const enrollment = await this.prisma.read.enrollment.findFirst({
      where: { userId, courseId },
      include: { certificate: { select: { id: true, code: true, issuedAt: true, fileUrl: true } } },
    });
    if (!enrollment) return null;

    const courseProgress = await this.courseCompletion.getCourseProgressNumbers(courseId, userId);
    const moduleProgress = await this.prisma.read.courseModule.findMany({
      where: { courseId },
      orderBy: { seq: 'asc' },
      include: { lessons: { include: { progress: { where: { userId } } } } },
    });

    return {
      enrollment,
      courseProgress,
      modules: moduleProgress.map(mod => ({
        id: mod.id,
        title: mod.title,
        seq: mod.seq,
        lessons: mod.lessons.map(l => ({
          id: l.id,
          title: l.title,
          type: l.type,
          seq: l.seq,
          completed: l.progress[0]?.completed ?? false,
          resumePosition: l.progress[0]?.resumePosition ?? 0,
        })),
        completedCount: mod.lessons.filter(l => l.progress[0]?.completed).length,
        totalCount: mod.lessons.length,
      })),
    };
  }

  // ─── Certificados ─────────────────────────────────────────────────────────

  async getMyCertificates(userId: number) {
    return this.prisma.read.certificate.findMany({
      where: { userId },
      include: {
        course: { select: { id: true, title: true, thumbnailUrl: true, category: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async verifyCertificate(validationCode: string) {
    const cert = await this.prisma.read.certificate.findFirst({
      where: { validationCode },
      include: {
        course: { select: { id: true, title: true } },
        user: { select: { id: true, fullName: true } },
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
        title: dto.title,
        passingScore: dto.passingScore ?? 70,
        maxAttempts: dto.maxAttempts ?? 0,
        timeLimitMinutes: dto.timeLimitMinutes,
        shuffleQuestions: dto.shuffleQuestions ?? false,
        shuffleAnswers: dto.shuffleAnswers ?? false,
        showCorrectAnswers: dto.showCorrectAnswers ?? true,
        autoFeedback: dto.autoFeedback ?? true,
      },
    });

    await this.prisma.quizQuestion.createMany({
      data: dto.questions.map((q, idx) => ({
        quizId: quiz.id,
        question: q.question,
        type: q.type,
        options: q.options ? JSON.stringify(q.options) : null,
        correctAnswer: q.correctAnswer,
        points: q.points ?? 1,
        seq: idx,
      })),
    });

    // Read-after-write: re-lê o quiz acabado de criar — força primary para não devolver vazio.
    return this.prisma.quiz.findUnique({
      where: { id: quiz.id },
      include: { questions: { orderBy: { seq: 'asc' } } },
    });
  }

  async updateQuiz(quizId: number, dto: UpdateQuizDto) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('Quiz não encontrado');
    const { questions, ...settings } = dto;

    await this.prisma.quiz.update({ where: { id: quizId }, data: settings });

    // Antes desta correcção, `questions` era destruturado só para o
    // descartar — o admin conseguia enviar perguntas editadas e a resposta
    // 200 sugeria sucesso, mas nada mudava na BD (bug real: perda silenciosa
    // de dados, mesma classe de problema já documentada no CLAUDE.md para
    // outros campos "aceites mas nunca persistidos").
    if (questions) {
      await this.prisma.quizQuestion.deleteMany({ where: { quizId } });
      await this.prisma.quizQuestion.createMany({
        data: questions.map((q, idx) => ({
          quizId,
          question: q.question,
          type: q.type,
          options: q.options ? JSON.stringify(q.options) : null,
          correctAnswer: q.correctAnswer,
          points: q.points ?? 1,
          seq: idx,
        })),
      });
    }

    return this.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: { orderBy: { seq: 'asc' } } },
    });
  }

  /** Quiz + perguntas com resposta certa — só para a UI de edição (ADMIN/RH). */
  async getQuizForEdit(lessonId: number) {
    const quiz = await this.prisma.read.quiz.findUnique({
      where: { lessonId },
      include: { questions: { orderBy: { seq: 'asc' } } },
    });
    return quiz;
  }

  /**
   * Quiz + perguntas para o aluno responder — nunca inclui a resposta certa
   * (nem em `options[].isCorrect` nem em `correctAnswer`), e devolve as
   * tentativas já feitas para a UI mostrar "restam N tentativas" e o
   * histórico. Exige matrícula no curso da aula — mesma regra de acesso já
   * usada para o conteúdo da aula (ver CourseCompletionService).
   */
  async getQuizForAttempt(quizId: number, userId: number) {
    const quiz = await this.prisma.read.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: { orderBy: { seq: 'asc' } },
        lesson: { select: { module: { select: { courseId: true } } } },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz não encontrado');

    const enrollment = await this.prisma.read.enrollment.findFirst({
      where: { userId, courseId: quiz.lesson.module.courseId },
    });
    if (!enrollment) throw new ForbiddenException('Não está matriculado neste curso');

    const attempts = await this.prisma.read.quizAttempt.findMany({
      where: { quizId, userId },
      orderBy: { submittedAt: 'desc' },
      select: { id: true, score: true, passed: true, submittedAt: true },
    });

    return {
      id: quiz.id,
      title: quiz.title,
      passingScore: quiz.passingScore,
      maxAttempts: quiz.maxAttempts,
      timeLimitMinutes: quiz.timeLimitMinutes,
      shuffleQuestions: quiz.shuffleQuestions,
      shuffleAnswers: quiz.shuffleAnswers,
      attemptsUsed: attempts.length,
      attemptsRemaining: quiz.maxAttempts > 0 ? Math.max(0, quiz.maxAttempts - attempts.length) : null,
      myAttempts: attempts,
      questions: quiz.questions.map(q => ({
        id: q.id,
        question: q.question,
        type: q.type,
        points: q.points,
        options: q.options
          ? (JSON.parse(q.options) as { text?: string }[]).map(o => ({ text: o.text }))
          : null,
      })),
    };
  }

  async submitQuiz(quizId: number, userId: number, dto: SubmitQuizDto) {
    const quiz = await this.prisma.read.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true },
    });
    if (!quiz) throw new NotFoundException('Quiz não encontrado');

    if (quiz.maxAttempts > 0) {
      // Guard de limite de tentativas antes de criar: força primary (conta tentativas reais).
      const attempts = await this.prisma.quizAttempt.count({ where: { quizId, userId } });
      if (attempts >= quiz.maxAttempts) {
        throw new ForbiddenException(`Limite de ${quiz.maxAttempts} tentativa(s) atingido`);
      }
    }

    let totalPoints = 0;
    let earnedPoints = 0;
    const results: {
      questionId: number;
      answer: string | undefined;
      correct: boolean | null;
      correctAnswer?: string | null;
      note?: string;
    }[] = [];

    for (const q of quiz.questions) {
      const answer = dto.answers[String(q.id)];
      totalPoints += q.points;

      if (q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') {
        const options: { text?: string; isCorrect?: boolean }[] = q.options
          ? JSON.parse(q.options)
          : [];
        const correct = options.find(o => o.isCorrect)?.text ?? q.correctAnswer;
        const isCorrect = answer?.toLowerCase() === correct?.toLowerCase();
        if (isCorrect) earnedPoints += q.points;
        results.push({ questionId: q.id, answer, correct: isCorrect, correctAnswer: correct });
      } else {
        results.push({
          questionId: q.id,
          answer,
          correct: null,
          note: 'Correção manual necessária',
        });
      }
    }

    const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizId,
        userId,
        score,
        passed,
        answers: JSON.stringify(dto.answers),
        results: JSON.stringify(results),
        submittedAt: new Date(),
      },
    });

    // showCorrectAnswers=false: esconde a resposta correcta na resposta ao
    // cliente (fica guardada em quizAttempt.results para auditoria/correcção manual).
    const visibleResults = quiz.showCorrectAnswers
      ? results
      : results.map(({ correctAnswer: _correctAnswer, ...r }) => r);

    return {
      attempt,
      score,
      passed,
      passingScore: quiz.passingScore,
      results: visibleResults,
      feedback: quiz.autoFeedback ? (passed ? 'Aprovado' : 'Reprovado') : undefined,
    };
  }

  // ─── Feedback ─────────────────────────────────────────────────────────────

  async addFeedback(courseId: number, userId: number, dto: CourseFeedbackDto) {
    await this.findOne(courseId);

    // Decide update vs create: força primary para não criar feedback duplicado via réplica.
    const existing = await this.prisma.courseFeedback.findFirst({ where: { courseId, userId } });
    if (existing) {
      const updated = await this.prisma.courseFeedback.update({
        where: { id: existing.id },
        data: { comment: dto.comment, rating: dto.rating },
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
    // Calcula média e grava em analytics: lê do primary para incluir o feedback acabado de escrever.
    const avg = await this.prisma.courseFeedback.aggregate({
      where: { courseId },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.courseAnalytics.updateMany({
      where: { courseId },
      data: { avgRating: avg._avg.rating ?? 0, totalRatings: avg._count },
    });
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getCourseAnalytics(courseId: number) {
    await this.findOne(courseId);

    const [analytics, enrollmentsByStatus, feedbackStats, recentActivity, lessonCompletion] =
      await Promise.all([
        this.prisma.read.courseAnalytics.findFirst({ where: { courseId } }),
        this.prisma.read.enrollment.groupBy({ by: ['status'], where: { courseId }, _count: true }),
        this.prisma.read.courseFeedback.aggregate({
          where: { courseId },
          _avg: { rating: true },
          _count: true,
        }),
        this.prisma.read.enrollment.findMany({
          where: { courseId },
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { enrolledAt: 'desc' },
          take: 10,
        }),
        this.prisma.read.lesson.findMany({
          where: { module: { courseId } },
          include: {
            progress: { where: { completed: true }, select: { id: true } },
            _count: { select: { progress: true } },
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
        id: l.id,
        title: l.title,
        completions: l._count.progress,
      })),
    };
  }

  // docs/06-modulo-courses.md — "Dashboard Admin → Cursos". A versão anterior
  // só cobria ~4 dos ~45 indicadores pedidos pelo doc; esta cobre a maioria
  // dos que têm dados reais no schema. Não incluído por não existir campo
  // nenhum no schema para o suportar: "por modalidade" (Course não tem
  // campo modalidade/formato — ver docs/06-modulo-courses.md secção 1 vs.
  // schema.prisma real). "Atalhos" ficam só no frontend (são links de
  // navegação, não dados).
  async getAdminDashboard() {
    const now = new Date();
    const soon = new Date(now.getTime() + 14 * 86400 * 1000);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      statusCounts,
      totalModules,
      totalLessons,
      totalEnrollments,
      pendingEnrollments,
      completedEnrollments,
      overdueEnrollments,
      mandatoryCourses,
      optionalCourses,
      certificatesIssued,
      byCategory,
      byLevel,
      byUnit,
      byDepartmentRaw,
      byInstructorRaw,
      recentlyCreated,
      recentlyUpdated,
      openForEnrollment,
      endingSoon,
      withoutEnrollments,
      withoutContent,
      withoutInstructor,
      withPendingContent,
      upcomingLiveSessions,
      recentEnrollments,
      recentCompletions,
      recentFeedbacks,
      recentCertificates,
      monthlyEnrollments,
      monthlyCompletions,
      feedbackAvg,
      quizPassStats,
      analyticsRows,
      courseCompetencies,
    ] = await Promise.all([
      this.prisma.read.course.groupBy({ by: ['status'], _count: true }),
      this.prisma.read.courseModule.count(),
      this.prisma.read.lesson.count(),
      this.prisma.read.enrollment.count(),
      this.prisma.read.enrollment.count({ where: { status: 'PENDING_APPROVAL' } }),
      this.prisma.read.enrollment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.read.enrollment.count({
        where: { deadline: { lt: now }, status: { notIn: ['COMPLETED', 'EXPIRED'] } },
      }),
      this.prisma.read.course.count({ where: { mandatory: true } }),
      this.prisma.read.course.count({ where: { mandatory: false } }),
      this.prisma.read.certificate.count({ where: { type: 'COURSE' } }),
      this.prisma.read.course.groupBy({ by: ['category'], _count: true }),
      this.prisma.read.course.groupBy({ by: ['level'], _count: true }),
      this.prisma.read.course.groupBy({ by: ['unit'], _count: true }),
      this.prisma.read.course.groupBy({ by: ['departmentId'], _count: true }),
      this.prisma.read.course.groupBy({ by: ['primaryInstructorId'], _count: true }),
      this.prisma.read.course.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, createdAt: true },
      }),
      this.prisma.read.course.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, updatedAt: true },
      }),
      this.prisma.read.course.count({
        where: { status: 'PUBLISHED', OR: [{ endDate: null }, { endDate: { gt: now } }] },
      }),
      this.prisma.read.course.findMany({
        where: { status: 'PUBLISHED', endDate: { gte: now, lte: soon } },
        orderBy: { endDate: 'asc' },
        take: 5,
        select: { id: true, title: true, endDate: true },
      }),
      this.prisma.read.course.count({
        where: { status: 'PUBLISHED', enrollments: { none: {} } },
      }),
      this.prisma.read.course.count({ where: { modules: { none: {} } } }),
      this.prisma.read.course.count({ where: { primaryInstructorId: null } }),
      this.prisma.read.course.count({ where: { modules: { some: { status: 'DRAFT' } } } }),
      this.prisma.read.lesson.findMany({
        where: { type: 'LIVE', liveDate: { gt: now } },
        orderBy: { liveDate: 'asc' },
        take: 5,
        select: {
          id: true,
          title: true,
          liveDate: true,
          liveInstructor: { select: { fullName: true } },
          module: { select: { course: { select: { id: true, title: true } } } },
        },
      }),
      this.prisma.read.enrollment.findMany({
        orderBy: { enrolledAt: 'desc' },
        take: 5,
        select: {
          id: true,
          enrolledAt: true,
          user: { select: { fullName: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.read.enrollment.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          completedAt: true,
          user: { select: { fullName: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.read.courseFeedback.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          rating: true,
          createdAt: true,
          user: { select: { fullName: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.read.certificate.findMany({
        where: { type: 'COURSE' },
        orderBy: { issuedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          issuedAt: true,
          user: { select: { fullName: true } },
          course: { select: { id: true, title: true } },
        },
      }),
      this.prisma.read.enrollment.findMany({
        where: { enrolledAt: { gte: sixMonthsAgo } },
        select: { enrolledAt: true },
      }),
      this.prisma.read.enrollment.findMany({
        where: { status: 'COMPLETED', completedAt: { gte: sixMonthsAgo } },
        select: { completedAt: true },
      }),
      this.prisma.read.courseFeedback.aggregate({ _avg: { rating: true } }),
      this.prisma.read.quizAttempt.groupBy({ by: ['passed'], _count: true }),
      this.prisma.read.courseAnalytics.findMany({
        where: { totalEnrollments: { gt: 0 } },
        include: { course: { select: { id: true, title: true } } },
      }),
      this.prisma.read.courseCompetency.findMany({
        include: {
          competency: { select: { id: true, name: true } },
          course: { select: { analytics: { select: { totalCompleted: true } } } },
        },
      }),
    ]);

    const countByStatus = (status: string) =>
      statusCounts.find(s => s.status === status)?._count ?? 0;

    // Nomes para os groupBy de departamento/instrutor — groupBy não faz join.
    const deptIds = byDepartmentRaw.map(d => d.departmentId).filter((v): v is number => v != null);
    const instructorIds = byInstructorRaw
      .map(i => i.primaryInstructorId)
      .filter((v): v is number => v != null);
    const [depts, instructors] = await Promise.all([
      deptIds.length
        ? this.prisma.read.department.findMany({
            where: { id: { in: deptIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      instructorIds.length
        ? this.prisma.read.user.findMany({
            where: { id: { in: instructorIds } },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([]),
    ]);
    const deptName = (id: number | null) => depts.find(d => d.id === id)?.name ?? 'Sem departamento';
    const instructorName = (id: number | null) =>
      instructors.find(i => i.id === id)?.fullName ?? 'Sem instrutor';

    const topCourses = [...analyticsRows]
      .sort((a, b) => b.totalEnrollments - a.totalEnrollments)
      .slice(0, 5)
      .map(a => ({ id: a.course.id, title: a.course.title, enrollments: a.totalEnrollments }));

    const withRate = analyticsRows.map(a => ({
      id: a.course.id,
      title: a.course.title,
      rate: Math.round((a.totalCompleted / a.totalEnrollments) * 100),
    }));
    const bestCompletion = [...withRate].sort((a, b) => b.rate - a.rate).slice(0, 5);
    const worstCompletion = [...withRate].sort((a, b) => a.rate - b.rate).slice(0, 5);

    // Horas totais de aprendizagem — soma de workloadHours × inscrições
    // concluídas por curso (proxy: não há registo de tempo efectivamente
    // gasto por lição a nível agregado).
    const completedByCourse = await this.prisma.read.enrollment.groupBy({
      by: ['courseId'],
      where: { status: 'COMPLETED' },
      _count: true,
    });
    const courseHours = completedByCourse.length
      ? await this.prisma.read.course.findMany({
          where: { id: { in: completedByCourse.map(c => c.courseId) } },
          select: { id: true, workloadHours: true },
        })
      : [];
    const totalLearningHours = completedByCourse.reduce((sum, c) => {
      const hours = courseHours.find(h => h.id === c.courseId)?.workloadHours ?? 0;
      return sum + hours * c._count;
    }, 0);

    const quizTotal = quizPassStats.reduce((s, q) => s + q._count, 0);
    const quizPassed = quizPassStats.find(q => q.passed)?._count ?? 0;
    const avgPassRate = quizTotal > 0 ? Math.round((quizPassed / quizTotal) * 100) : 0;

    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const bucketByMonth = (dates: Date[]) => {
      const buckets = new Map<string, number>();
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        buckets.set(monthKey(d), 0);
      }
      for (const d of dates) {
        const key = monthKey(d);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
      return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
    };

    const competencyCompletions = new Map<string, { id: number; name: string; count: number }>();
    for (const cc of courseCompetencies) {
      const key = String(cc.competency.id);
      const entry = competencyCompletions.get(key) ?? {
        id: cc.competency.id,
        name: cc.competency.name,
        count: 0,
      };
      entry.count += cc.course.analytics?.totalCompleted ?? 0;
      competencyCompletions.set(key, entry);
    }
    const topCompetencies = Array.from(competencyCompletions.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const alerts = [
      pendingEnrollments > 0 && {
        message: `${pendingEnrollments} inscrições pendentes de aprovação`,
        severity: 'warning' as const,
      },
      withoutInstructor > 0 && {
        message: `${withoutInstructor} cursos sem instrutor`,
        severity: 'warning' as const,
      },
      withoutContent > 0 && {
        message: `${withoutContent} cursos sem conteúdo`,
        severity: 'danger' as const,
      },
      withPendingContent > 0 && {
        message: `${withPendingContent} cursos com módulos por publicar`,
        severity: 'info' as const,
      },
      withoutEnrollments > 0 && {
        message: `${withoutEnrollments} cursos publicados sem qualquer inscrição`,
        severity: 'info' as const,
      },
      overdueEnrollments > 0 && {
        message: `${overdueEnrollments} inscrições com prazo ultrapassado`,
        severity: 'danger' as const,
      },
    ].filter((a): a is { message: string; severity: 'warning' | 'danger' | 'info' } => !!a);

    const completionRate =
      totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 100) : 0;

    return {
      // Mantidos por compatibilidade com o AdminDashboard já consumido pelo frontend.
      courses: { total: statusCounts.reduce((s, c) => s + c._count, 0), published: countByStatus('PUBLISHED') },
      enrollments: { total: totalEnrollments, completed: completedEnrollments, overdue: overdueEnrollments },
      completionRate,

      counts: {
        total: statusCounts.reduce((s, c) => s + c._count, 0),
        published: countByStatus('PUBLISHED'),
        draft: countByStatus('DRAFT'),
        paused: countByStatus('PAUSED'),
        archived: countByStatus('ARCHIVED'),
        totalModules,
        totalLessons,
        totalEnrollments,
        pendingEnrollments,
        mandatoryCourses,
        optionalCourses,
        certificatesIssued,
      },
      rates: {
        avgCompletionRate: completionRate,
        avgPassRate,
        avgRating: feedbackAvg._avg.rating ? Math.round(feedbackAvg._avg.rating * 10) / 10 : 0,
        totalLearningHours,
      },
      topCourses,
      bestCompletion,
      worstCompletion,
      byCategory: byCategory.map(c => ({ category: c.category ?? 'Sem categoria', count: c._count })),
      byLevel: byLevel.map(l => ({ level: l.level, count: l._count })),
      byUnit: byUnit.map(u => ({ unit: u.unit ?? 'Sem unidade', count: u._count })),
      byDepartment: byDepartmentRaw.map(d => ({
        department: deptName(d.departmentId),
        count: d._count,
      })),
      byInstructor: byInstructorRaw.map(i => ({
        instructor: instructorName(i.primaryInstructorId),
        count: i._count,
      })),
      recentlyCreated,
      recentlyUpdated,
      openForEnrollment,
      endingSoon,
      withoutEnrollments,
      withoutContent,
      withoutInstructor,
      withPendingContent,
      upcomingLiveSessions: upcomingLiveSessions.map(l => ({
        id: l.id,
        title: l.title,
        liveDate: l.liveDate,
        instructor: l.liveInstructor?.fullName ?? null,
        course: l.module.course,
      })),
      recentActivity: {
        enrollments: recentEnrollments,
        completions: recentCompletions,
        feedbacks: recentFeedbacks,
        certificates: recentCertificates,
      },
      monthlyTrend: {
        enrollments: bucketByMonth(monthlyEnrollments.map(e => e.enrolledAt)),
        completions: bucketByMonth(
          monthlyCompletions.map(e => e.completedAt).filter((d): d is Date => !!d),
        ),
      },
      topCompetencies,
      alerts,
    };
  }
}

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateModuleDto,
  UpdateModuleDto,
  ReorderModulesDto,
  CreateModuleLessonDto,
  UpdateModuleLessonDto,
  MoveLessonDto,
  MarkModuleLessonCompleteDto,
  CreateModuleMaterialDto,
  CloneModuleDto,
} from './course-modules.dto';

@Injectable()
export class CourseModulesService {
  private readonly logger = new Logger(CourseModulesService.name);

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  // ─── MÓDULOS — CRUD ───────────────────────────────────────────────────────

  async createModule(dto: CreateModuleDto) {
    // Verificar que o curso existe
    const course = await this.prismaRead.course.findUnique({ where: { id: dto.courseId } });
    if (!course) throw new NotFoundException('Curso não encontrado');

    return this.prisma.courseModule.create({
      data: {
        courseId: dto.courseId,
        title: dto.title,
        description: dto.description,
        learningObjectives: dto.learningObjectives ?? [],
        seq: dto.seq,
        status: dto.status ?? 'DRAFT',
        type: dto.type,
        progressionType: dto.progressionType ?? 'SEQUENTIAL',
        completionRule: dto.completionRule ?? 'ALL_LESSONS',
        minCompletionPercent: dto.minCompletionPercent ?? 100,
        minQuizScore: dto.minQuizScore,
        mandatory: dto.mandatory ?? true,
        dripDays: dto.dripDays,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
      },
      include: {
        lessons: { orderBy: { seq: 'asc' } },
        materials: true,
        _count: { select: { lessons: true } },
      },
    });
  }

  async findModuleOrFail(id: number) {
    const mod = await this.prismaRead.courseModule.findUnique({
      where: { id },
      include: {
        lessons: {
          orderBy: { seq: 'asc' },
          include: { quiz: true },
        },
        materials: { orderBy: { createdAt: 'desc' } },
        _count: { select: { lessons: true } },
      },
    });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return mod;
  }

  async updateModule(id: number, dto: UpdateModuleDto) {
    await this.findModuleOrFail(id);
    return this.prisma.courseModule.update({
      where: { id },
      data: {
        ...dto,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
        learningObjectives: dto.learningObjectives ?? undefined,
      },
      include: {
        lessons: { orderBy: { seq: 'asc' } },
        materials: true,
        _count: { select: { lessons: true } },
      },
    });
  }

  async publishModule(id: number) {
    const mod = (await this.findModuleOrFail(id)) as any;
    if (mod._count.lessons === 0) {
      throw new BadRequestException('Módulo sem aulas não pode ser publicado');
    }
    return this.prisma.courseModule.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });
  }

  async deleteModule(id: number) {
    const mod = (await this.findModuleOrFail(id)) as any;

    // Verificar se há progresso activo nas aulas
    const activeProgress = await this.prismaRead.lessonProgress.count({
      where: { lesson: { moduleId: id } },
    });
    if (activeProgress > 0) {
      throw new ForbiddenException(
        `Módulo tem ${activeProgress} registos de progresso de utilizadores. Arquive-o ou mova as aulas primeiro.`,
      );
    }

    await this.prisma.courseModule.delete({ where: { id } });
    return { message: 'Módulo eliminado' };
  }

  async reorderModules(courseId: number, dto: ReorderModulesDto) {
    // Validar que todos os IDs pertencem ao curso
    const moduleIds = dto.order.map(o => o.id);
    const modules = await this.prismaRead.courseModule.findMany({
      where: { id: { in: moduleIds }, courseId },
    });
    if (modules.length !== moduleIds.length) {
      throw new BadRequestException('Alguns módulos não pertencem a este curso');
    }

    await Promise.all(
      dto.order.map(({ id, seq }) =>
        this.prisma.courseModule.update({ where: { id }, data: { seq } }),
      ),
    );

    return this.prismaRead.courseModule.findMany({
      where: { courseId },
      orderBy: { seq: 'asc' },
      include: {
        lessons: { orderBy: { seq: 'asc' } },
        _count: { select: { lessons: true } },
      },
    });
  }

  // ─── CLONAR MÓDULO ────────────────────────────────────────────────────────

  async cloneModule(moduleId: number, dto: CloneModuleDto) {
    const original = (await this.findModuleOrFail(moduleId)) as any;

    // Verificar curso destino
    const targetCourse = await this.prismaRead.course.findUnique({ where: { id: dto.targetCourseId } });
    if (!targetCourse) throw new NotFoundException('Curso destino não encontrado');

    // Determinar posição
    const maxSeq = await this.prismaRead.courseModule.findFirst({
      where: { courseId: dto.targetCourseId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const seq = dto.seq ?? (maxSeq?.seq ?? 0) + 1;

    const clone = await this.prisma.courseModule.create({
      data: {
        courseId: dto.targetCourseId,
        title: `${original.title} (cópia)`,
        description: original.description,
        learningObjectives: original.learningObjectives,
        seq,
        status: 'DRAFT',
        type: original.type,
        progressionType: original.progressionType,
        completionRule: original.completionRule,
        minCompletionPercent: original.minCompletionPercent,
        minQuizScore: original.minQuizScore,
        mandatory: original.mandatory,
      },
    });

    // Clonar aulas
    for (const lesson of original.lessons) {
      await this.prisma.lesson.create({
        data: {
          moduleId: clone.id,
          title: lesson.title,
          description: lesson.description,
          type: lesson.type,
          contentUrl: lesson.contentUrl,
          textContent: lesson.textContent,
          seq: lesson.seq,
          durationMinutes: lesson.durationMinutes,
          isFree: lesson.isFree,
          allowDownload: lesson.allowDownload,
        },
      });
    }

    // Clonar materiais
    for (const mat of original.materials) {
      await this.prisma.moduleMaterial.create({
        data: {
          moduleId: clone.id,
          title: mat.title,
          url: mat.url,
          fileType: mat.fileType,
          fileSizeKb: mat.fileSizeKb,
        },
      });
    }

    return this.findModuleOrFail(clone.id);
  }

  // ─── AULAS ────────────────────────────────────────────────────────────────

  async createLesson(dto: CreateModuleLessonDto) {
    const mod = await this.prismaRead.courseModule.findUnique({ where: { id: dto.moduleId } });
    if (!mod) throw new NotFoundException('Módulo não encontrado');

    return this.prisma.lesson.create({
      data: {
        moduleId: dto.moduleId,
        title: dto.title,
        description: dto.description,
        type: dto.contentType,
        contentUrl: dto.contentUrl,
        textContent: dto.textContent,
        seq: dto.seq,
        durationMinutes: dto.durationMinutes,
        isFree: dto.isFree ?? false,
        allowDownload: dto.allowDownload ?? false,
      },
    });
  }

  async updateLesson(id: number, dto: UpdateModuleLessonDto) {
    const lesson = await this.prismaRead.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    return this.prisma.lesson.update({ where: { id }, data: dto });
  }

  async moveLesson(lessonId: number, dto: MoveLessonDto) {
    const lesson = await this.prismaRead.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');

    const targetMod = await this.prismaRead.courseModule.findUnique({
      where: { id: dto.targetModuleId },
    });
    if (!targetMod) throw new NotFoundException('Módulo de destino não encontrado');

    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { moduleId: dto.targetModuleId, seq: dto.seq },
    });
  }

  async reorderLessons(moduleId: number, order: Array<{ id: number; seq: number }>) {
    await Promise.all(
      order.map(({ id, seq }) => this.prisma.lesson.update({ where: { id }, data: { seq } })),
    );
    return this.prismaRead.lesson.findMany({
      where: { moduleId },
      orderBy: { seq: 'asc' },
    });
  }

  async deleteLesson(id: number) {
    const lesson = await this.prismaRead.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Aula não encontrada');

    // Aviso se há progresso — não bloquear, apenas informar
    const progressCount = await this.prismaRead.lessonProgress.count({ where: { lessonId: id } });

    await this.prisma.lesson.delete({ where: { id } });
    return { message: 'Aula eliminada', hadProgress: progressCount > 0, progressCount };
  }

  // ─── MATERIAIS COMPLEMENTARES ─────────────────────────────────────────────

  async addMaterial(moduleId: number, dto: CreateModuleMaterialDto) {
    await this.findModuleOrFail(moduleId);
    return this.prisma.moduleMaterial.create({
      data: { moduleId, ...dto },
    });
  }

  async removeMaterial(materialId: number) {
    const mat = await this.prismaRead.moduleMaterial.findUnique({ where: { id: materialId } });
    if (!mat) throw new NotFoundException('Material não encontrado');
    return this.prisma.moduleMaterial.delete({ where: { id: materialId } });
  }

  // ─── PROGRESSO ────────────────────────────────────────────────────────────

  // Verificar se aula está acessível (segurança — previne acesso directo a aulas em módulos bloqueados)
  private async isLessonAccessible(
    lessonId: number,
    userId: number,
  ): Promise<{ accessible: boolean; reason?: string }> {
    const lesson = await this.prismaRead.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) return { accessible: false, reason: 'Aula não encontrada' };

    const mod = (lesson as any).module;
    const course = mod.course;

    if (mod.status !== 'PUBLISHED') {
      return { accessible: false, reason: 'Módulo não publicado' };
    }

    // Verificar matrícula
    const enrollment = await this.prismaRead.enrollment.findFirst({
      where: { userId, courseId: course.id },
    });
    if (!enrollment) return { accessible: false, reason: 'Não está matriculado neste curso' };

    // Verificar drip content
    if (mod.dripDays && mod.dripDays > 0) {
      const enrolledAt = new Date(enrollment.enrolledAt);
      const availableAt = new Date(enrolledAt.getTime() + mod.dripDays * 86400 * 1000);
      if (new Date() < availableAt) {
        return {
          accessible: false,
          reason: `Disponível em ${Math.ceil((availableAt.getTime() - Date.now()) / 86400000)} dia(s)`,
        };
      }
    }

    if (mod.availableFrom && new Date() < new Date(mod.availableFrom)) {
      return { accessible: false, reason: `Disponível a partir de ${mod.availableFrom}` };
    }

    // Verificar progressão sequencial
    if (mod.progressionType === 'SEQUENTIAL' && mod.seq > 0) {
      const previousModule = await this.prismaRead.courseModule.findFirst({
        where: { courseId: course.id, seq: mod.seq - 1, status: 'PUBLISHED' },
      });
      if (previousModule) {
        const prevCompleted = await this.isModuleCompleted(previousModule.id, userId);
        if (!prevCompleted) {
          return { accessible: false, reason: 'Deve concluir o módulo anterior primeiro' };
        }
      }
    }

    return { accessible: true };
  }

  // Verificar se módulo está concluído segundo as regras configuradas
  async isModuleCompleted(moduleId: number, userId: number): Promise<boolean> {
    const mod = await this.prismaRead.courseModule.findUnique({
      where: { id: moduleId },
      include: { lessons: true },
    });
    if (!mod) return false;

    const lessons = (mod as any).lessons;
    const totalLessons = lessons.length;
    if (totalLessons === 0) return true;

    const completedCount = await this.prismaRead.lessonProgress.count({
      where: { userId, completed: true, lessonId: { in: lessons.map((l: any) => l.id) } },
    });

    const rule = (mod as any).completionRule ?? 'ALL_LESSONS';

    if (rule === 'ALL_LESSONS') {
      return completedCount >= totalLessons;
    }

    if (rule === 'MIN_PERCENT') {
      const pct = (mod as any).minCompletionPercent ?? 100;
      return (completedCount / totalLessons) * 100 >= pct;
    }

    if (rule === 'QUIZ_PASS') {
      const quiz = await this.prismaRead.quiz.findFirst({
        where: { lesson: { moduleId } },
      });
      if (!quiz) return completedCount >= totalLessons;
      const passed = await this.prismaRead.quizAttempt.findFirst({
        where: { quizId: quiz.id, userId, passed: true },
      });
      return !!passed;
    }

    if (rule === 'COMBINED') {
      const pct = (mod as any).minCompletionPercent ?? 80;
      const lessonOk = (completedCount / totalLessons) * 100 >= pct;
      const quiz = await this.prismaRead.quiz.findFirst({ where: { lesson: { moduleId } } });
      const quizOk = quiz
        ? !!(await this.prismaRead.quizAttempt.findFirst({
            where: { quizId: quiz.id, userId, passed: true },
          }))
        : true;
      return lessonOk && quizOk;
    }

    return false;
  }

  async markLessonComplete(userId: number, dto: MarkModuleLessonCompleteDto) {
    // Segurança: verificar se aula está acessível
    const access = await this.isLessonAccessible(dto.lessonId, userId);
    if (!access.accessible) {
      throw new ForbiddenException(access.reason ?? 'Aula não acessível');
    }

    const lesson = await this.prismaRead.lesson.findUnique({
      where: { id: dto.lessonId },
      include: { module: { include: { course: true } } },
    });
    const courseId = (lesson as any).module.courseId;
    const moduleId = (lesson as any).moduleId;

    // Upsert progresso da aula
    const progress = await this.prisma.lessonProgress.upsert({
      where: { lessonId_userId: { lessonId: dto.lessonId, userId } },
      create: {
        lessonId: dto.lessonId,
        userId,
        completed: true,
        completedAt: new Date(),
        watchedSeconds: dto.watchedSeconds,
        resumePosition: dto.resumePosition,
      },
      update: {
        completed: true,
        completedAt: new Date(),
        watchedSeconds: dto.watchedSeconds,
        resumePosition: dto.resumePosition,
      },
    });

    // Actualizar enrollment para IN_PROGRESS se necessário
    const enrollment = await this.prismaRead.enrollment.findFirst({ where: { userId, courseId } });
    if (enrollment && enrollment.status === 'NOT_STARTED') {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }

    // Verificar conclusão do módulo
    const moduleCompleted = await this.isModuleCompleted(moduleId, userId);

    // Verificar conclusão do curso
    if (enrollment) {
      await this.checkAndCompleteCourse(enrollment.id, userId, courseId);
    }

    // Notificar desbloqueio do próximo módulo
    if (moduleCompleted) {
      await this.notifyNextModuleUnlock(moduleId, userId, courseId);
    }

    return {
      progress,
      moduleCompleted,
      courseId,
    };
  }

  private async notifyNextModuleUnlock(currentModuleId: number, userId: number, courseId: number) {
    const current = await this.prisma.courseModule.findUnique({ where: { id: currentModuleId } });
    if (!current) return;

    const nextModule = await this.prismaRead.courseModule.findFirst({
      where: { courseId, seq: (current as any).seq + 1, status: 'PUBLISHED' },
      include: { course: { select: { title: true } } },
    });
    if (!nextModule) return;

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'MODULE_UNLOCKED',
          message: `Novo módulo desbloqueado: "${nextModule.title}"`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {}); // Silenciar falha na notificação
  }

  async getLessonProgress(userId: number, courseId: number) {
    const modules = await this.prismaRead.courseModule.findMany({
      where: { courseId },
      orderBy: { seq: 'asc' },
      include: {
        lessons: {
          orderBy: { seq: 'asc' },
          include: {
            progress: { where: { userId } },
          },
        },
        materials: true,
      },
    });

    // Verificar acesso a cada módulo (drip, sequencial)
    const result = await Promise.all(
      modules.map(async mod => {
        const lessons = (mod as any).lessons;
        const completedCount = lessons.filter((l: any) => l.progress[0]?.completed).length;
        const totalCount = lessons.length;
        const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        const completed = await this.isModuleCompleted(mod.id, userId);

        // Verificar se módulo está bloqueado (progressão sequencial)
        let locked = false;
        let lockedReason: string | undefined;
        if ((mod as any).progressionType === 'SEQUENTIAL' && (mod as any).seq > 0) {
          const firstLesson = lessons[0];
          if (firstLesson) {
            const access = await this.isLessonAccessible(firstLesson.id, userId);
            locked = !access.accessible;
            lockedReason = access.reason;
          }
        }

        return {
          id: mod.id,
          title: mod.title,
          seq: (mod as any).seq,
          type: (mod as any).type,
          mandatory: (mod as any).mandatory,
          materials: (mod as any).materials,
          completedCount,
          totalCount,
          pct,
          completed,
          locked,
          lockedReason,
          lessons: lessons.map((l: any) => ({
            id: l.id,
            title: l.title,
            type: l.type,
            seq: l.seq,
            durationMinutes: l.durationMinutes,
            isFree: l.isFree,
            completed: l.progress[0]?.completed ?? false,
            completedAt: l.progress[0]?.completedAt ?? null,
            resumePosition: l.progress[0]?.resumePosition ?? 0,
          })),
        };
      }),
    );

    return result;
  }

  // Verificar e marcar curso como concluído
  private async checkAndCompleteCourse(enrollmentId: number, userId: number, courseId: number) {
    const enrollment = await this.prismaRead.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment || enrollment.status === 'COMPLETED') return;

    const mandatoryModules = await this.prismaRead.courseModule.findMany({
      where: { courseId, mandatory: true, status: 'PUBLISHED' },
    });

    let allMandatoryDone = true;
    for (const mod of mandatoryModules) {
      const done = await this.isModuleCompleted(mod.id, userId);
      if (!done) {
        allMandatoryDone = false;
        break;
      }
    }

    if (!allMandatoryDone) return;

    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await this.prisma.courseAnalytics.updateMany({
      where: { courseId },
      data: { totalCompleted: { increment: 1 } },
    });

    // Gamificação — pontuar
    await this.prisma.userPoints
      .upsert({
        where: { userId },
        create: { userId, points: 100 },
        update: { points: { increment: 100 } },
      })
      .catch(() => {});

    // Notificar
    const course = await this.prismaRead.course.findUnique({ where: { id: courseId } });
    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'COURSE_COMPLETED',
          message: `Concluíste o curso "${course?.title}"! 🎉`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});
  }

  // ─── ANALYTICS POR MÓDULO ─────────────────────────────────────────────────

  async getModuleAnalytics(moduleId: number) {
    await this.findModuleOrFail(moduleId);

    const lessons = await this.prismaRead.lesson.findMany({
      where: { moduleId },
      select: { id: true, title: true },
    });
    const lessonIds = lessons.map(l => l.id);

    const [totalEnrollments, totalCompleted, avgWatched, lessonStats] = await Promise.all([
      // Total de utilizadores que acederam a pelo menos uma aula
      this.prisma.lessonProgress
        .groupBy({
          by: ['userId'],
          where: { lessonId: { in: lessonIds } },
          _count: true,
        })
        .then(r => r.length),

      // Utilizadores que completaram todas as aulas
      this.prisma.lessonProgress
        .groupBy({
          by: ['userId'],
          where: { lessonId: { in: lessonIds }, completed: true },
          _count: true,
        })
        .then(groups => groups.filter(g => g._count >= lessonIds.length).length),

      // Média de segundos vistos
      this.prismaRead.lessonProgress.aggregate({
        where: { lessonId: { in: lessonIds } },
        _avg: { watchedSeconds: true },
      }),

      // Stats por aula
      Promise.all(
        lessons.map(async l => {
          const completions = await this.prismaRead.lessonProgress.count({
            where: { lessonId: l.id, completed: true },
          });
          return { lessonId: l.id, title: l.title, completions };
        }),
      ),
    ]);

    const completionRate =
      totalEnrollments > 0 ? Math.round((totalCompleted / totalEnrollments) * 100) : 0;

    return {
      moduleId,
      totalEnrollments,
      totalCompleted,
      completionRate,
      avgWatchedSeconds: Math.round(avgWatched._avg.watchedSeconds ?? 0),
      lessonStats,
    };
  }
}

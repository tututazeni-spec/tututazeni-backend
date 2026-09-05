import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CertificateType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';

/** Entrada mínima de progresso de aula — os controllers mantêm os seus próprios DTOs validados. */
export interface MarkLessonProgressInput {
  watchedSeconds?: number;
  resumePosition?: number;
}

@Injectable()
export class CourseCompletionService {
  private readonly logger = new Logger(CourseCompletionService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Números de progresso de um curso para um utilizador — a antiga
   * `calculateCourseProgress` de `courses.service.ts`, agora pública
   * (usada por `GET /courses/:id/progress`).
   */
  async getCourseProgressNumbers(courseId: number, userId: number) {
    // Lê da primária: esta decisão corre logo após um upsert de progresso na
    // primária — a réplica pode não ter o registo ainda (regressão evitada da
    // antiga calculateCourseProgress).
    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.lesson.count({ where: { module: { courseId } } }),
      this.prisma.lessonProgress.count({
        where: { userId, completed: true, lesson: { module: { courseId } } },
      }),
    ]);
    const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { totalLessons, completedLessons, pct };
  }

  /**
   * Orquestrador único: marca uma aula como concluída, promove a matrícula de
   * NOT_STARTED → IN_PROGRESS, recalcula o progresso do curso, avalia a conclusão
   * e, se aplicável, finaliza-a (certificado + pontos + notificação).
   */
  async markLessonComplete(userId: number, lessonId: number, dto: MarkLessonProgressInput) {
    // Lê da primária: esta decisão corre logo após um upsert de progresso na
    // primária — a réplica pode não ter o registo ainda (regressão evitada da
    // antiga calculateCourseProgress).
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Aula não encontrada');
    const courseId = lesson.module.courseId;

    const enrollment = await this.prisma.enrollment.findFirst({ where: { userId, courseId } });
    if (!enrollment) throw new ForbiddenException('Não está matriculado neste curso');

    const progress = await this.prisma.lessonProgress.upsert({
      where: { lessonId_userId: { lessonId, userId } },
      create: {
        lessonId,
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

    if (enrollment.status === 'NOT_STARTED') {
      await this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }

    const courseProgress = await this.getCourseProgressNumbers(courseId, userId);

    let courseCompleted = enrollment.status === 'COMPLETED';
    const evalResult = await this.evaluateCompletion(enrollment.id);
    if (evalResult.complete) {
      const { finalized } = await this.finalizeCompletion(enrollment.id);
      courseCompleted = courseCompleted || finalized;
    }

    return { progress, courseProgress, courseCompleted };
  }

  async isModuleCompleted(moduleId: number, userId: number): Promise<boolean> {
    // Lê da primária: esta decisão corre logo após um upsert de progresso na
    // primária — a réplica pode não ter o registo ainda (regressão evitada da
    // antiga calculateCourseProgress).
    const mod = await this.prisma.courseModule.findUnique({
      where: { id: moduleId },
      include: { lessons: true },
    });
    if (!mod) return false;

    const lessons = mod.lessons;
    const totalLessons = lessons.length;
    if (totalLessons === 0) return true;

    const completedCount = await this.prisma.lessonProgress.count({
      where: { userId, completed: true, lessonId: { in: lessons.map(l => l.id) } },
    });

    const rule = mod.completionRule ?? 'ALL_LESSONS';

    if (rule === 'ALL_LESSONS') {
      return completedCount >= totalLessons;
    }
    if (rule === 'MIN_PERCENT') {
      const pct = mod.minCompletionPercent ?? 100;
      return (completedCount / totalLessons) * 100 >= pct;
    }
    if (rule === 'QUIZ_PASS') {
      const quiz = await this.prisma.quiz.findFirst({ where: { lesson: { moduleId } } });
      if (!quiz) return completedCount >= totalLessons;
      const passed = await this.prisma.quizAttempt.findFirst({
        where: { quizId: quiz.id, userId, passed: true },
      });
      return !!passed;
    }
    if (rule === 'COMBINED') {
      const pct = mod.minCompletionPercent ?? 80;
      const lessonOk = (completedCount / totalLessons) * 100 >= pct;
      const quiz = await this.prisma.quiz.findFirst({ where: { lesson: { moduleId } } });
      const quizOk = quiz
        ? !!(await this.prisma.quizAttempt.findFirst({
            where: { quizId: quiz.id, userId, passed: true },
          }))
        : true;
      return lessonOk && quizOk;
    }
    return false;
  }

  async evaluateCompletion(enrollmentId: number): Promise<{ complete: boolean; reason: string }> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) return { complete: false, reason: 'no-enrollment' };

    // Lê da primária: esta decisão corre logo após um upsert de progresso na
    // primária — a réplica pode não ter o registo ainda (regressão evitada da
    // antiga calculateCourseProgress).
    const publishedModules = await this.prisma.courseModule.findMany({
      where: { courseId: enrollment.courseId, status: 'PUBLISHED' },
      select: { id: true, mandatory: true },
    });

    if (publishedModules.length === 0) {
      const [total, done] = await Promise.all([
        this.prisma.lesson.count({ where: { module: { courseId: enrollment.courseId } } }),
        this.prisma.lessonProgress.count({
          where: {
            userId: enrollment.userId,
            completed: true,
            lesson: { module: { courseId: enrollment.courseId } },
          },
        }),
      ]);
      if (total === 0) return { complete: false, reason: 'empty-course' };
      return { complete: done >= total, reason: 'all-lessons' };
    }

    const mandatory = publishedModules.filter(m => m.mandatory);
    const toCheck = mandatory.length > 0 ? mandatory : publishedModules;

    for (const mod of toCheck) {
      if (!(await this.isModuleCompleted(mod.id, enrollment.userId))) {
        return { complete: false, reason: `module-${mod.id}-incomplete` };
      }
    }
    return {
      complete: true,
      reason: mandatory.length > 0 ? 'mandatory-modules' : 'all-modules',
    };
  }

  async finalizeCompletion(enrollmentId: number): Promise<{ finalized: boolean }> {
    // Claim atómico: a própria escrita do estado serve de lock. `updateMany` só
    // afecta a linha se ainda não estiver COMPLETED — sob concorrência (ex.: duas
    // últimas lições marcadas em simultâneo) apenas uma chamada obtém count > 0;
    // as restantes saem já aqui, evitando pontos/notificação/analytics em dobro.
    const claimed = await this.prisma.enrollment.updateMany({
      where: { id: enrollmentId, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (claimed.count === 0) {
      return { finalized: false };
    }

    // Campos necessários aos efeitos seguintes (courseId/userId/título) — lidos da
    // primária após o claim bem-sucedido.
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { id: true, title: true, certificateValidityDays: true } } },
    });
    if (!enrollment) return { finalized: true };

    await this.issueCertificateInternal(enrollment);
    await this.awardCompletionPoints(enrollment.userId);

    await createNotificationSafe(this.prisma, this.logger, {
      userId: enrollment.userId,
      type: 'COURSE_COMPLETED',
      message: `Concluíste o curso "${enrollment.course?.title}"! Certificado emitido. 🎉`,
      metadata: { courseId: enrollment.courseId, enrollmentId },
    });

    // Analytics é o efeito menos essencial: corre depois da emissão do certificado
    // e não bloqueia. Se falhar (blip de ligação), a matrícula já está COMPLETED e
    // um retry no-opa no claim — o pior caso é perder um contador, não o certificado.
    await this.prisma.courseAnalytics
      .updateMany({
        where: { courseId: enrollment.courseId },
        data: { totalCompleted: { increment: 1 } },
      })
      .catch((e: unknown) => {
        this.logger.warn(
          `Falha ao actualizar analytics do curso após conclusão (não bloqueante) — enrollmentId=${enrollmentId}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      });

    return { finalized: true };
  }

  /**
   * Caminho manual/idempotente de emissão do certificado — usado por
   * `POST /enrollments/my/:id/certificate` e `POST /enrollments/:id/certificate`.
   * Só o dono da matrícula ou ADMIN/RH podem emitir; exige `status === 'COMPLETED'`.
   * Devolve o certificado existente se já houver um (sem notificar); caso contrário
   * cria-o via `issueCertificateInternal` e regista uma notificação `COURSE_COMPLETED`.
   */
  async issueCertificateFor(enrollmentId: number, user: CurrentUserData) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { id: true, title: true, certificateValidityDays: true } } },
    });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');

    // `assertCanAccess` lança NotFoundException a não-donos sem papel privilegiado,
    // por design (auditoria A10/IDOR — não revelar a existência do recurso). Mantém-se
    // sem embrulho para preservar o 404 que o endpoint `POST /enrollments/:id/certificate`
    // já devolve hoje via EnrollmentsService.generateCertificate.
    assertCanAccess(enrollment, enrollment.userId, user, [Role.ADMIN, Role.RH]);

    if (enrollment.status !== 'COMPLETED') {
      throw new BadRequestException('Curso ainda não concluído');
    }

    const before = await this.prisma.certificate.findFirst({ where: { enrollmentId } });
    const cert = await this.issueCertificateInternal(enrollment);

    if (!before && cert) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: enrollment.userId,
        type: 'COURSE_COMPLETED',
        message: `Certificado emitido para o curso "${enrollment.course?.title}".`,
        metadata: { courseId: enrollment.courseId, enrollmentId },
      });
    }

    return cert;
  }

  private async issueCertificateInternal(enrollment: {
    id: number;
    userId: number;
    courseId: number;
    course: { certificateValidityDays: number | null } | null;
  }) {
    const existing = await this.prisma.certificate.findFirst({
      where: { enrollmentId: enrollment.id },
    });
    if (existing) return existing;

    const validityDays = enrollment.course?.certificateValidityDays ?? null;
    const expiresAt = validityDays ? new Date(Date.now() + validityDays * 86400 * 1000) : null;

    try {
      return await this.prisma.certificate.create({
        data: {
          enrollmentId: enrollment.id,
          userId: enrollment.userId,
          courseId: enrollment.courseId,
          type: CertificateType.COURSE,
          validationCode: `CERT-${enrollment.courseId}-${enrollment.userId}-${Date.now()}`,
          issuedAt: new Date(),
          expiresAt,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.certificate.findFirst({ where: { enrollmentId: enrollment.id } });
      }
      throw e;
    }
  }

  private async awardCompletionPoints(userId: number) {
    try {
      await this.prisma.userPoints.upsert({
        where: { userId },
        create: { userId, points: 100 },
        update: { points: { increment: 100 } },
      });
    } catch (e: unknown) {
      this.logger.warn(
        `Falha ao atribuir pontos de conclusão (não bloqueante) — userId=${userId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}

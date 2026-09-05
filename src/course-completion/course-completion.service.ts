import { Injectable, Logger } from '@nestjs/common';
import { CertificateType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';

/** Entrada mínima de progresso de aula — os controllers mantêm os seus próprios DTOs validados. */
export interface MarkLessonProgressInput {
  watchedSeconds?: number;
  resumePosition?: number;
}

@Injectable()
export class CourseCompletionService {
  private readonly logger = new Logger(CourseCompletionService.name);

  constructor(private prisma: PrismaService) {}

  async isModuleCompleted(moduleId: number, userId: number): Promise<boolean> {
    const mod = await this.prisma.read.courseModule.findUnique({
      where: { id: moduleId },
      include: { lessons: true },
    });
    if (!mod) return false;

    const lessons = mod.lessons;
    const totalLessons = lessons.length;
    if (totalLessons === 0) return true;

    const completedCount = await this.prisma.read.lessonProgress.count({
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
      const quiz = await this.prisma.read.quiz.findFirst({ where: { lesson: { moduleId } } });
      if (!quiz) return completedCount >= totalLessons;
      const passed = await this.prisma.read.quizAttempt.findFirst({
        where: { quizId: quiz.id, userId, passed: true },
      });
      return !!passed;
    }
    if (rule === 'COMBINED') {
      const pct = mod.minCompletionPercent ?? 80;
      const lessonOk = (completedCount / totalLessons) * 100 >= pct;
      const quiz = await this.prisma.read.quiz.findFirst({ where: { lesson: { moduleId } } });
      const quizOk = quiz
        ? !!(await this.prisma.read.quizAttempt.findFirst({
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

    const publishedModules = await this.prisma.read.courseModule.findMany({
      where: { courseId: enrollment.courseId, status: 'PUBLISHED' },
      select: { id: true, mandatory: true },
    });

    if (publishedModules.length === 0) {
      const [total, done] = await Promise.all([
        this.prisma.read.lesson.count({ where: { module: { courseId: enrollment.courseId } } }),
        this.prisma.read.lessonProgress.count({
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
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { id: true, title: true, certificateValidityDays: true } } },
    });
    if (!enrollment) return { finalized: false };
    if (enrollment.status === 'COMPLETED') return { finalized: false };

    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    await this.prisma.courseAnalytics.updateMany({
      where: { courseId: enrollment.courseId },
      data: { totalCompleted: { increment: 1 } },
    });

    await this.issueCertificateInternal(enrollment);
    await this.awardCompletionPoints(enrollment.userId);

    await createNotificationSafe(this.prisma, this.logger, {
      userId: enrollment.userId,
      type: 'COURSE_COMPLETED',
      message: `Concluíste o curso "${enrollment.course?.title}"! Certificado emitido. 🎉`,
      metadata: { courseId: enrollment.courseId, enrollmentId },
    });

    return { finalized: true };
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

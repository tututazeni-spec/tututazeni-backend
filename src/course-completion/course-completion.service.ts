import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}

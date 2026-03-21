import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentStatus } from '@prisma/client';

@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}

  async enroll(userId: string, courseId: string) {
    const uId = Number(userId);
    const cId = Number(courseId);

    const existing = await this.prisma.enrollment.findFirst({
      where: {
        userId: uId,
        courseId: cId,
      },
    });

    if (existing) return existing;

    return this.prisma.enrollment.create({
      data: {
        userId: uId,
        courseId: cId,
      },
    });
  }

  async markLessonCompleted(enrollmentId: string, lessonId: string) {
    const eId = Number(enrollmentId);
    const lId = Number(lessonId);

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: eId },
    });

    if (!enrollment) throw new Error('Inscrição não encontrada');

    await this.prisma.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: eId,
          lessonId: lId,
        },
      },
      create: {
        enrollmentId: eId,
        lessonId: lId,
        completed: true,
        completedAt: new Date(),
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
    });

    // recalcular status do curso
    const totalLessons = await this.prisma.lesson.count({
      where: {
        module: {
          courseId: enrollment.courseId,
        },
      },
    });

    const completedLessons = await this.prisma.lessonProgress.count({
      where: {
        enrollmentId: eId,
        completed: true,
      },
    });

    if (totalLessons > 0 && completedLessons === totalLessons) {
      await this.prisma.enrollment.update({
        where: { id: eId },
        data: {
          status: EnrollmentStatus.CONCLUIDO,
        },
      });
    }

    return { totalLessons, completedLessons };
  }
}
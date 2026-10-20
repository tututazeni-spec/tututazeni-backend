import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { effectiveStatus } from './certificates.service';
import { CertificateFactsService } from './certificate-facts.service';

export interface LearningPathUnitProgress {
  kind: 'COURSE' | 'TRAINING';
  id: number;
  title: string;
  required: boolean;
  done: boolean;
}

export interface LearningPathProgress {
  learningPathId: number;
  title: string;
  /** Percentagem das unidades obrigatórias cumpridas (0–100). */
  completionPct: number;
  units: LearningPathUnitProgress[];
  certificate: { id: number; status: string } | null;
}

/** Progresso do colaborador nas suas trilhas: unidades cumpridas e estado do certificado. */
@Injectable()
export class LearningPathProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facts: CertificateFactsService,
  ) {}

  async mine(userId: number, now = new Date()): Promise<LearningPathProgress[]> {
    const enrollments = await this.prisma.learningPathEnrollment.findMany({
      where: { userId },
      select: {
        learningPath: {
          select: {
            id: true,
            title: true,
            courses: {
              orderBy: { seq: 'asc' },
              select: { courseId: true, required: true, course: { select: { title: true } } },
            },
            trainings: {
              orderBy: { seq: 'asc' },
              select: { trainingId: true, required: true, training: { select: { title: true } } },
            },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
    if (enrollments.length === 0) return [];

    const pathIds = enrollments.map(e => e.learningPath.id);
    const [completed, certs] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId, status: 'COMPLETED' },
        select: { courseId: true },
      }),
      this.prisma.certificate.findMany({
        where: {
          userId,
          deletedAt: null,
          activityKind: 'LEARNING_PATH',
          activityId: { in: pathIds },
        },
        select: { id: true, activityId: true, status: true, revoked: true, expiresAt: true },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);
    const completedCourses = new Set(completed.map(c => c.courseId));

    const result: LearningPathProgress[] = [];
    for (const { learningPath: lp } of enrollments) {
      const units: LearningPathUnitProgress[] = lp.courses.map(c => ({
        kind: 'COURSE' as const,
        id: c.courseId,
        title: c.course.title,
        required: c.required,
        done: completedCourses.has(c.courseId),
      }));
      for (const t of lp.trainings) {
        units.push({
          kind: 'TRAINING',
          id: t.trainingId,
          title: t.training.title,
          required: t.required,
          done: await this.facts.trainingCompleted(userId, t.trainingId),
        });
      }
      const required = units.filter(u => u.required);
      const cert = certs.find(c => c.activityId === lp.id);
      result.push({
        learningPathId: lp.id,
        title: lp.title,
        completionPct: required.length
          ? Math.round((required.filter(u => u.done).length / required.length) * 100)
          : 0,
        units,
        certificate: cert ? { id: cert.id, status: effectiveStatus(cert, now) } : null,
      });
    }
    return result;
  }
}

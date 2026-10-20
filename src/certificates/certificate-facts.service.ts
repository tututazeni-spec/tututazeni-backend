import { Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { CertificateActivityKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityFacts } from './certificate-rules';

export type CollectedFacts = ActivityFacts & { hours: number | null; title: string };

/** Lê da BD (nunca da cache/réplica) os factos que decidem a elegibilidade. */
@Injectable()
export class CertificateFactsService {
  constructor(private readonly prisma: PrismaService) {}

  async collect(
    userId: number,
    kind: CertificateActivityKind,
    activityId: number,
  ): Promise<CollectedFacts> {
    if (kind === 'COURSE') return this.course(userId, activityId);
    if (kind === 'EVENT') return this.event(userId, activityId);
    if (kind === 'TRAINING') return this.training(userId, activityId);
    if (kind === 'LEARNING_PATH') return this.learningPath(userId, activityId);
    throw new NotImplementedException('FACTS_UNSUPPORTED');
  }

  /** Se o colaborador cumpre a regra de conclusão da formação (usado no progresso das trilhas). */
  async trainingCompleted(userId: number, trainingId: number): Promise<boolean> {
    return (await this.training(userId, trainingId)).completionPct === 100;
  }

  /**
   * Formação: a regra de conclusão é a da formação (`completionMode`). MANUAL conta o
   * estado COMPLETED marcado pelo formador/Admin (não depende de dados de presença);
   * ATTENDANCE conta a presença mínima; HYBRID exige as duas. Uma nota abaixo da mínima
   * nunca conclui.
   */
  private async training(userId: number, trainingId: number): Promise<CollectedFacts> {
    const training = await this.prisma.training.findUnique({
      where: { id: trainingId },
      select: {
        title: true,
        workloadHours: true,
        passingScore: true,
        completionMode: true,
        minAttendancePercent: true,
      },
    });
    if (!training) throw new NotFoundException('Formação não encontrada');

    const rows = await this.prisma.trainingParticipant.findMany({
      where: {
        userId,
        session: { trainingId },
        status: { in: ['REGISTERED', 'ATTENDED', 'ABSENT', 'COMPLETED'] },
      },
      select: { status: true, finalScore: true, attendedHours: true },
    });

    const attended = rows.filter(r => r.status === 'ATTENDED' || r.status === 'COMPLETED').length;
    const attendancePct = rows.length ? Math.round((attended / rows.length) * 100) : null;
    const scores = rows.map(r => r.finalScore).filter((v): v is number => v !== null);
    const bestScore = scores.length ? Math.max(...scores) : null;
    const marked = rows.some(r => r.status === 'COMPLETED');
    const passed = bestScore === null || bestScore >= training.passingScore;
    const attendanceOk = attendancePct !== null && attendancePct >= training.minAttendancePercent;
    const byMode =
      training.completionMode === 'ATTENDANCE'
        ? attendanceOk
        : training.completionMode === 'HYBRID'
          ? attendanceOk && marked
          : marked;
    const done = byMode && passed;
    const attendedHours = rows.reduce((sum, r) => sum + (r.attendedHours ?? 0), 0);

    return {
      title: training.title,
      hours: training.workloadHours ?? (attendedHours > 0 ? attendedHours : null),
      completionPct: done ? 100 : 0,
      bestScore,
      attendancePct,
      practicalPassed: null,
      instructorApproved: marked && passed,
      managerApproved: false,
    };
  }

  /**
   * Trilha: concluída quando todas as unidades obrigatórias (cursos com matrícula
   * COMPLETED e formações concluídas segundo o seu modo) estão cumpridas.
   */
  private async learningPath(userId: number, learningPathId: number): Promise<CollectedFacts> {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: learningPathId },
      select: {
        title: true,
        totalHours: true,
        courses: { where: { required: true }, select: { courseId: true } },
        trainings: { where: { required: true }, select: { trainingId: true } },
      },
    });
    if (!path) throw new NotFoundException('Trilha não encontrada');

    const courseIds = path.courses.map(c => c.courseId);
    const trainingIds = path.trainings.map(t => t.trainingId);
    const total = courseIds.length + trainingIds.length;

    const coursesDone = courseIds.length
      ? await this.prisma.enrollment.count({
          where: { userId, courseId: { in: courseIds }, status: 'COMPLETED' },
        })
      : 0;
    let trainingsDone = 0;
    for (const id of trainingIds) {
      if ((await this.training(userId, id)).completionPct === 100) trainingsDone++;
    }

    return {
      title: path.title,
      hours: path.totalHours > 0 ? path.totalHours : null,
      // Trilha sem unidades obrigatórias nunca conta como concluída.
      completionPct: total ? Math.round(((coursesDone + trainingsDone) / total) * 100) : 0,
      bestScore: null,
      attendancePct: null,
      practicalPassed: null,
      instructorApproved: false,
      managerApproved: false,
    };
  }

  private async course(userId: number, courseId: number): Promise<CollectedFacts> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { title: true, workloadHours: true },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: { status: true, progress: true, cycleStartedAt: true },
    });
    const best = await this.prisma.quizAttempt.aggregate({
      where: {
        userId,
        quiz: { lesson: { module: { courseId } } },
        // Reciclagem: só as tentativas da realização corrente contam para a nota.
        ...(enrollment?.cycleStartedAt ? { submittedAt: { gte: enrollment.cycleStartedAt } } : {}),
      },
      _max: { score: true },
    });

    // Só COMPLETED conta como 100%: progress=100 com estado diferente não basta.
    const completionPct = !enrollment
      ? 0
      : enrollment.status === 'COMPLETED'
        ? 100
        : Math.min(enrollment.progress, 99);

    return {
      title: course.title,
      hours: course.workloadHours ?? null,
      completionPct,
      bestScore: best._max.score ?? null,
      attendancePct: null,
      practicalPassed: null,
      instructorApproved: false,
      managerApproved: false,
    };
  }

  private async event(userId: number, eventId: number): Promise<CollectedFacts> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { title: true, startAt: true, endAt: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado');

    const participant = await this.prisma.eventParticipant.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { status: true },
    });
    const present = participant?.status === 'PRESENT';
    const hours =
      Math.round(((event.endAt.getTime() - event.startAt.getTime()) / 3_600_000) * 10) / 10;

    return {
      title: event.title,
      hours: hours > 0 ? hours : null,
      completionPct: present ? 100 : 0,
      bestScore: null,
      attendancePct: present ? 100 : 0,
      practicalPassed: null,
      instructorApproved: false,
      managerApproved: false,
    };
  }
}

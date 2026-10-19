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
    // Sem modelo de presença/progresso utilizável para estas atividades ainda.
    throw new NotImplementedException('FACTS_UNSUPPORTED');
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

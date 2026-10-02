// src/avatar-training/avatar-training-notifications.service.ts
// Fase 7 — notificações (docs/Avatar_Training.md §9): atribuições, lembretes de
// prazo, atrasos e conclusão. Usa o NotificationsService existente (que honra as
// preferências do utilizador). É sempre melhor esforço: uma falha de entrega
// nunca desfaz a atribuição nem a conclusão que a originou.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const REMINDER_DAYS = 3;
const BATCH = 500;

const TYPES = {
  ASSIGNED: 'AVATAR_TRAINING_ASSIGNED',
  REMINDER: 'AVATAR_TRAINING_REMINDER',
  OVERDUE: 'AVATAR_TRAINING_OVERDUE',
  COMPLETED: 'AVATAR_TRAINING_COMPLETED',
  FAILED: 'AVATAR_TRAINING_FAILED',
  HELP: 'AVATAR_TRAINING_HELP_REQUEST',
} as const;

const fmt = (d: Date) => d.toLocaleDateString('pt-PT');

@Injectable()
export class AvatarTrainingNotificationsService {
  private readonly logger = new Logger(AvatarTrainingNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async safeSend(
    userId: number,
    type: string,
    title: string,
    message: string,
    priority: 'LOW' | 'MEDIUM' | 'HIGH',
    metadata: Record<string, unknown>,
  ) {
    try {
      await this.notifications.send({
        userId,
        type,
        title,
        message,
        priority,
        category: 'LMS',
        actionUrl: '/avatar-training',
        actionLabel: 'Abrir',
        metadata,
      });
    } catch (e) {
      this.logger.warn({
        action: 'AVATAR_TRAINING_NOTIFY',
        type,
        userId,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao enviar notificação',
      });
    }
  }

  /** `assignmentId` fica sempre em primeiro lugar no JSON para a deduplicação por prefixo. */
  private meta(assignmentId: number, extra: Record<string, unknown> = {}) {
    return { assignmentId, ...extra };
  }

  private async alreadySent(userId: number, type: string, assignmentId: number) {
    const found = await this.prisma.notificationLog.findFirst({
      where: { userId, type, metadata: { startsWith: `{"assignmentId":${assignmentId},` } },
      select: { id: true },
    });
    return !!found;
  }

  /** Pedido de ajuda do formando — avisa o formador humano responsável pela formação. */
  async helpRequested(input: {
    responsibleId: number | null;
    learnerId: number;
    sessionTitle: string;
    attemptId: number;
    message: string;
  }) {
    if (!input.responsibleId || input.responsibleId === input.learnerId) return;
    await this.safeSend(
      input.responsibleId,
      TYPES.HELP,
      'Pedido de ajuda numa formação com avatar',
      `Um formando pediu ajuda na sessão «${input.sessionTitle}»: ${input.message.slice(0, 200)}`,
      'MEDIUM',
      { attemptId: input.attemptId, learnerId: input.learnerId },
    );
  }

  /** Nova atribuição (ou reatribuição) — avisa o formando. */
  async assigned(
    assignments: { id: number; userId: number; dueDate: Date | null; mandatory: boolean }[],
    session: { id: number; title: string },
  ) {
    for (const a of assignments) {
      const due = a.dueDate ? ` Prazo: ${fmt(a.dueDate)}.` : '';
      await this.safeSend(
        a.userId,
        TYPES.ASSIGNED,
        a.mandatory ? 'Formação obrigatória com avatar' : 'Nova formação com avatar',
        `Foi-lhe atribuída a sessão «${session.title}».${due}`,
        a.mandatory ? 'HIGH' : 'MEDIUM',
        this.meta(a.id, { sessionId: session.id, mandatory: a.mandatory }),
      );
    }
  }

  /** Conclusão ou reprovação — avisa o formando e quem atribuiu (se for outra pessoa). */
  async finished(input: {
    assignmentId: number;
    userId: number;
    assignedById: number | null;
    sessionTitle: string;
    passed: boolean;
    score: number | null;
  }) {
    const score = input.score !== null ? ` Nota: ${input.score}.` : '';
    await this.safeSend(
      input.userId,
      input.passed ? TYPES.COMPLETED : TYPES.FAILED,
      input.passed ? 'Sessão concluída' : 'Sessão não aprovada',
      input.passed
        ? `Concluiu a sessão «${input.sessionTitle}».${score}`
        : `Não atingiu a nota mínima em «${input.sessionTitle}».${score} Pode repetir a sessão.`,
      input.passed ? 'LOW' : 'MEDIUM',
      this.meta(input.assignmentId),
    );
    if (input.assignedById && input.assignedById !== input.userId && input.passed) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { fullName: true },
      });
      await this.safeSend(
        input.assignedById,
        TYPES.COMPLETED,
        'Formação com avatar concluída',
        `${user?.fullName ?? 'Um colaborador'} concluiu «${input.sessionTitle}».${score}`,
        'LOW',
        this.meta(input.assignmentId, { forAssigner: true }),
      );
    }
  }

  /** Corre diariamente: lembretes de prazo próximo e avisos de atraso (uma vez por atribuição). */
  @Cron('0 8 * * *')
  async scheduledReminders() {
    try {
      await this.runReminders();
    } catch (e) {
      this.logger.error({
        action: 'AVATAR_TRAINING_REMINDERS',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha nos lembretes de formação com avatar',
      });
    }
  }

  async runReminders(now: Date = new Date()) {
    const soon = new Date(now.getTime() + REMINDER_DAYS * 86_400_000);
    const open = { in: ['ASSIGNED', 'IN_PROGRESS'] as ('ASSIGNED' | 'IN_PROGRESS')[] };
    const select = {
      id: true,
      userId: true,
      assignedById: true,
      dueDate: true,
      mandatory: true,
      session: { select: { title: true } },
    } as const;
    const [upcoming, late] = await Promise.all([
      this.prisma.avatarTrainingAssignment.findMany({
        where: { status: open, dueDate: { gte: now, lte: soon } },
        select,
        take: BATCH,
      }),
      this.prisma.avatarTrainingAssignment.findMany({
        where: { status: open, dueDate: { lt: now } },
        select,
        take: BATCH,
      }),
    ]);

    let reminders = 0;
    let overdue = 0;
    for (const a of upcoming) {
      if (await this.alreadySent(a.userId, TYPES.REMINDER, a.id)) continue;
      await this.safeSend(
        a.userId,
        TYPES.REMINDER,
        'Prazo a terminar',
        `A sessão «${a.session.title}» termina a ${fmt(a.dueDate as Date)}.`,
        a.mandatory ? 'HIGH' : 'MEDIUM',
        this.meta(a.id, { dueDate: a.dueDate }),
      );
      reminders++;
    }
    for (const a of late) {
      if (await this.alreadySent(a.userId, TYPES.OVERDUE, a.id)) continue;
      await this.safeSend(
        a.userId,
        TYPES.OVERDUE,
        'Formação em atraso',
        `A sessão «${a.session.title}» está fora do prazo (${fmt(a.dueDate as Date)}).`,
        'HIGH',
        this.meta(a.id, { dueDate: a.dueDate }),
      );
      if (a.assignedById && a.assignedById !== a.userId) {
        await this.safeSend(
          a.assignedById,
          TYPES.OVERDUE,
          'Formação em atraso na sua equipa',
          `Uma sessão atribuída por si, «${a.session.title}», está fora do prazo.`,
          'MEDIUM',
          this.meta(a.id, { forAssigner: true, dueDate: a.dueDate }),
        );
      }
      overdue++;
    }
    return { reminders, overdue };
  }
}

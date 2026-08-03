// src/evaluation360/evaluation360.events.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class Evaluation360EventListeners {
  private readonly logger = new Logger(Evaluation360EventListeners.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent('evaluation.invitation.send')
  async onInvitationSend(payload: { assignment: any }) {
    const { assignment } = payload;
    try {
      const evaluator = await this.prisma.user.findUnique({
        where: { id: +assignment.evaluatorId },
      });
      const evaluatee = await this.prisma.user.findUnique({
        where: { id: +assignment.evaluateeId },
      });
      if (!evaluator || !evaluatee) return;

      this.logger.log(
        `[360] Enviando convite: ${evaluator.fullName} vai avaliar ${evaluatee.fullName} (${assignment.role})`,
      );

      await this.notifications.sendToUser(+assignment.evaluatorId, {
        title: 'Convite para Avaliação 360°',
        message: `Você foi convidado a avaliar ${evaluatee.fullName}. Aceda ao INNOVA para responder.`,
        type: 'INFO',
        metadata: JSON.stringify({
          cycleId: assignment.cycleId,
          evaluateeId: assignment.evaluateeId,
          role: assignment.role,
        }),
      });
    } catch (err: unknown) {
      this.logger.error({
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
        cycleId: assignment.cycleId,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: '[360] Falha ao enviar convite',
      });
    }
  }

  @OnEvent('evaluation.reminder.send')
  async onReminderSend(payload: { assignment: any; channels: string[] }) {
    const { assignment } = payload;
    try {
      const evaluatee = await this.prisma.user.findUnique({
        where: { id: +assignment.evaluateeId },
      });
      this.logger.log(`[360] Lembrete: avaliador ${assignment.evaluatorId} ainda não respondeu`);

      await this.notifications.sendToUser(+assignment.evaluatorId, {
        title: 'Lembrete — Avaliação 360° Pendente',
        message: `Não esqueça de avaliar ${evaluatee?.fullName ?? 'um colega'}. O prazo está a terminar.`,
        type: 'WARNING',
      });
    } catch (err: unknown) {
      this.logger.error({
        evaluatorId: assignment.evaluatorId,
        evaluateeId: assignment.evaluateeId,
        cycleId: assignment.cycleId,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: '[360] Falha ao enviar lembrete',
      });
    }
  }

  @OnEvent('response.submitted')
  async onResponseSubmitted(payload: { responseId: string; cycleId: string }) {
    try {
      const response = await this.prisma.evaluationResponse.findUnique({
        where: { id: payload.responseId },
        include: { answers: { include: { question: true } } },
      });
      if (!response) return;

      const textAnswers = response.answers
        .filter(a => a.question.type === 'OPEN_TEXT' && a.textValue)
        .map(a => a.textValue!);

      if (textAnswers.length > 0) {
        const sentimentScore = this.calculateSimpleSentiment(textAnswers);
        await this.prisma.evaluationResponse.update({
          where: { id: payload.responseId },
          data: { sentimentScore },
        });
      }

      const numericAnswers = response.answers
        .filter(a => a.numericValue !== null)
        .map(a => a.numericValue!);
      if (numericAnswers.length >= 3) {
        const avg = numericAnswers.reduce((s, v) => s + v, 0) / numericAnswers.length;
        const stdDev = Math.sqrt(
          numericAnswers.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / numericAnswers.length,
        );

        if (stdDev < 0.2) {
          this.logger.warn({
            responseId: payload.responseId,
            cycleId: payload.cycleId,
            avg: avg.toFixed(2),
            msg: '[360] Viés detectado (respostas homogéneas)',
          });
        }
        if (avg >= 4.9 || avg <= 1.1) {
          this.logger.warn({
            responseId: payload.responseId,
            cycleId: payload.cycleId,
            avg: avg.toFixed(2),
            msg: '[360] Possível viés extremo',
          });
        }
      }
    } catch (err: unknown) {
      this.logger.error({
        responseId: payload.responseId,
        cycleId: payload.cycleId,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: '[360] Falha na análise pós-submissão',
      });
    }
  }

  @OnEvent('cycle.results.ready')
  async onResultsReady(payload: { cycleId: string }) {
    try {
      const participants = await this.prisma.cycleParticipant.findMany({
        where: { cycleId: payload.cycleId, status: 'COMPLETED' },
      });
      for (const p of participants) {
        await this.notifications.sendToUser(+p.userId, {
          title: 'Resultados da Avaliação 360° Disponíveis',
          message:
            'Os resultados da sua avaliação 360° já estão disponíveis. Aceda ao INNOVA para ver o seu relatório.',
          type: 'SUCCESS',
        });
      }
      this.logger.log(
        `[360] Notificações de resultados enviadas: ${participants.length} participantes`,
      );
    } catch (err: unknown) {
      this.logger.error({
        cycleId: payload.cycleId,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: '[360] Falha ao notificar resultados',
      });
    }
  }

  @OnEvent('cycle.published')
  async onCyclePublished(payload: { cycleId: string }) {
    this.logger.log(`[360] Ciclo publicado: ${payload.cycleId}`);
  }

  @OnEvent('feedback.continuous.created')
  async onFeedbackCreated(payload: { feedback: any }) {
    const { feedback } = payload;
    if (feedback.isPrivate) return;
    try {
      const from = await this.prisma.user.findUnique({
        where: { id: +feedback.fromUserId },
      });
      await this.notifications.sendToUser(+feedback.toUserId, {
        title: `Novo feedback de ${from?.fullName ?? 'colega'}`,
        message:
          feedback.message.length > 80 ? feedback.message.slice(0, 80) + '...' : feedback.message,
        type: feedback.type === 'RECOGNITION' ? 'SUCCESS' : 'INFO',
      });
    } catch (err: unknown) {
      this.logger.error({
        fromUserId: feedback.fromUserId,
        toUserId: feedback.toUserId,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: '[360] Falha ao notificar feedback',
      });
    }
  }

  @OnEvent('pdi.auto.create')
  async onPdiAutoCreate(payload: {
    userId: string;
    cycleId: string;
    gaps: any[];
    actions: any[];
    sourceResultId: string;
  }) {
    try {
      this.logger.log(
        `[360] Criando PDI automático para userId=${payload.userId}, ${payload.gaps.length} gaps identificados`,
      );
    } catch (err: unknown) {
      this.logger.error({
        userId: payload.userId,
        cycleId: payload.cycleId,
        sourceResultId: payload.sourceResultId,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: '[360] Falha ao criar PDI automático',
      });
    }
  }

  private calculateSimpleSentiment(texts: string[]): number {
    const positive = [
      'excelente',
      'ótimo',
      'bom',
      'positivo',
      'destaque',
      'liderança',
      'proativo',
      'dedicado',
      'comprometido',
      'forte',
    ];
    const negative = [
      'fraco',
      'melhora',
      'dificuldade',
      'problema',
      'falta',
      'ausente',
      'lento',
      'ineficaz',
      'conflito',
      'resistente',
    ];
    let score = 0;
    const combined = texts.join(' ').toLowerCase();
    positive.forEach(w => {
      if (combined.includes(w)) score += 0.1;
    });
    negative.forEach(w => {
      if (combined.includes(w)) score -= 0.1;
    });
    return Math.max(-1, Math.min(1, score));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dono único da mecânica de gamificação "atribuir pontos / atribuir badge".
 * Todos os métodos são **não-bloqueantes**: gamificação é sempre um efeito
 * secundário de um fluxo de negócio (conclusão de curso, automação, ...) e
 * nunca deve fazer esse fluxo falhar.
 */
@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Incrementa os pontos (XP) de um utilizador via upsert em `UserPoints`
   * (`userId` é `@unique`). Pontos <= 0 são ignorados. Nunca lança.
   */
  async awardPoints(userId: number, points: number, reason?: string): Promise<void> {
    if (!points || points <= 0) return;
    try {
      await this.prisma.userPoints.upsert({
        where: { userId },
        create: { userId, points },
        update: { points: { increment: points } },
      });
    } catch (e: unknown) {
      this.logger.warn({
        userId,
        points,
        reason,
        action: 'GAMIFICATION_AWARD_POINTS',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao atribuir pontos (não bloqueante)',
      });
    }
  }

  /**
   * Atribui um badge (resolvido por `name`) a um utilizador. Idempotente —
   * `BadgeAward` tem `@@unique([badgeId, userId])` desde a Fase F3, por isso um
   * award repetido cai num P2002 que é tratado como no-op. Nunca lança.
   */
  async awardBadge(userId: number, badgeCode: string): Promise<void> {
    if (!badgeCode) return;
    try {
      const badge = await this.prisma.badge.findFirst({ where: { name: badgeCode } });
      if (!badge) {
        this.logger.warn({
          userId,
          badgeCode,
          action: 'GAMIFICATION_AWARD_BADGE',
          msg: 'Badge não encontrado por name — atribuição ignorada',
        });
        return;
      }
      await this.prisma.badgeAward.create({ data: { userId, badgeId: badge.id } });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Badge já atribuído a este utilizador — idempotente.
        return;
      }
      this.logger.warn({
        userId,
        badgeCode,
        action: 'GAMIFICATION_AWARD_BADGE',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao atribuir badge (não bloqueante)',
      });
    }
  }
}

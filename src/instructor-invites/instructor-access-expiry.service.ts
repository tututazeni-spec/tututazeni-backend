import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { INSTRUCTOR_EXTERNO_ROLE } from './constants';
import { InstructorInvitesService } from './instructor-invites.service';

const BATCH = 200;
const MAX_BATCHES = 50;

/**
 * Desativa contas de instrutor externo cujo prazo de acesso terminou. O bloqueio imediato
 * já é feito em tempo de pedido (access-expiry.ts); este job limpa o estado e revoga sessões.
 * Idempotente: `deactivateUser` só actua em contas ainda activas, por isso duas instâncias
 * ou duas execuções seguidas não duplicam efeitos nem auditoria.
 */
@Injectable()
export class InstructorAccessExpiryService {
  private readonly logger = new Logger(InstructorAccessExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invites: InstructorInvitesService,
  ) {}

  @Cron('0 * * * *')
  async scheduled(): Promise<void> {
    try {
      const { deactivated } = await this.runExpiryJob();
      if (deactivated > 0) {
        this.logger.log({ action: 'INSTRUCTOR_EXPIRY_JOB', deactivated, msg: 'Contas expiradas' });
      }
    } catch (e) {
      this.logger.error({
        action: 'INSTRUCTOR_EXPIRY_JOB',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha na expiração de acessos de instrutores externos',
      });
    }
  }

  async runExpiryJob(now: Date = new Date()): Promise<{ deactivated: number }> {
    let deactivated = 0;
    let lastId = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const users = await this.prisma.user.findMany({
        where: {
          id: { gt: lastId },
          active: true,
          role: { name: INSTRUCTOR_EXTERNO_ROLE },
          accessExpiresAt: { lt: now },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      if (users.length === 0) break;
      for (const u of users) {
        lastId = u.id;
        try {
          if (await this.invites.deactivateUser(u.id, null, 'EXPIRED')) deactivated++;
        } catch (e) {
          this.logger.warn({
            userId: u.id,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao desativar conta expirada',
          });
        }
      }
      if (users.length < BATCH) break;
    }
    return { deactivated };
  }
}

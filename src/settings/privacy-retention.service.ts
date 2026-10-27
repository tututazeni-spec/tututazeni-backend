// Retenção (LPDP): apaga periodicamente dados de baixo valor que excedem `retentionDays`
// (Definições §8). Dados com retenção legal (recibos, presenças, auditoria) NÃO são tocados aqui —
// a auditoria tem o seu próprio prazo (`purgeAuditLogs`) e os recibos seguem a lei fiscal.
// Ver docs/security/politica-retencao-dados.md.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { PrismaService } from '../prisma/prisma.service';
import { ANONYMIZED_DOMAIN, PersonalDataService } from './personal-data.service';
import { parsePrivacySettings } from './privacy-settings';

const DAY_MS = 86_400_000;
const REVOKED_TOKEN_GRACE_DAYS = 30;
const EXIT_ANONYMIZE_BATCH = 100;

@Injectable()
export class PrivacyRetentionService {
  private readonly logger = new Logger(PrivacyRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly personalData: PersonalDataService,
  ) {}

  @Cron('40 3 * * *')
  async run() {
    const result = await this.purge();
    this.logger.log(
      `Retenção: ${result.notifications} notificações e ${result.refreshTokens} refresh tokens apagados; ${result.exitAnonymized} ex-colaboradores anonimizados`,
    );
  }

  async purge(now = new Date()) {
    const id = await resolveDefaultTenantId(this.prisma);
    const t = await this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { privacySettingsJson: true },
    });
    const { retentionDays, exitRetentionYears, anonymizationEnabled } = parsePrivacySettings(
      t.privacySettingsJson,
    );
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const tokenCutoff = new Date(now.getTime() - REVOKED_TOKEN_GRACE_DAYS * DAY_MS);

    const [notifications, refreshTokens] = await Promise.all([
      this.prisma.notificationLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.refreshToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: tokenCutoff } }, { revokedAt: { lt: tokenCutoff } }] },
      }),
    ]);

    // LPDP (art. 11.º, conservação limitada à finalidade): ex-colaboradores deixam de ser
    // identificáveis passado o prazo configurado. Recibos/presenças mantêm-se (obrigações legais).
    let exitAnonymized = 0;
    if (exitRetentionYears > 0 && anonymizationEnabled) {
      const exitCutoff = new Date(now);
      exitCutoff.setFullYear(exitCutoff.getFullYear() - exitRetentionYears);
      const leavers = await this.prisma.user.findMany({
        where: { exitDate: { lt: exitCutoff }, NOT: { email: { endsWith: `@${ANONYMIZED_DOMAIN}` } } },
        select: { id: true },
        take: EXIT_ANONYMIZE_BATCH,
      });
      for (const { id: userId } of leavers) {
        await this.personalData.anonymizeUser(userId).then(
          () => exitAnonymized++,
          err => this.logger.error(`Anonimização do utilizador ${userId} falhou: ${String(err)}`),
        );
      }
    }
    return {
      notifications: notifications.count,
      refreshTokens: refreshTokens.count,
      exitAnonymized,
    };
  }
}

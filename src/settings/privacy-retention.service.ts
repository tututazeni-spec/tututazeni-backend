// Retenção (LPDP): apaga periodicamente dados de baixo valor que excedem `retentionDays`
// (Definições §8). Dados com retenção legal (recibos, presenças, auditoria) NÃO são tocados aqui —
// a auditoria tem o seu próprio prazo (`purgeAuditLogs`) e os recibos seguem a lei fiscal.
// Ver docs/security/politica-retencao-dados.md.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { PrismaService } from '../prisma/prisma.service';
import { parsePrivacySettings } from './privacy-settings';

const DAY_MS = 86_400_000;
const REVOKED_TOKEN_GRACE_DAYS = 30;

@Injectable()
export class PrivacyRetentionService {
  private readonly logger = new Logger(PrivacyRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('40 3 * * *')
  async run() {
    const result = await this.purge();
    this.logger.log(
      `Retenção: ${result.notifications} notificações e ${result.refreshTokens} refresh tokens apagados`,
    );
  }

  async purge(now = new Date()) {
    const id = await resolveDefaultTenantId(this.prisma);
    const t = await this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { privacySettingsJson: true },
    });
    const { retentionDays } = parsePrivacySettings(t.privacySettingsJson);
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const tokenCutoff = new Date(now.getTime() - REVOKED_TOKEN_GRACE_DAYS * DAY_MS);

    const [notifications, refreshTokens] = await Promise.all([
      this.prisma.notificationLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      this.prisma.refreshToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: tokenCutoff } }, { revokedAt: { lt: tokenCutoff } }] },
      }),
    ]);
    return { notifications: notifications.count, refreshTokens: refreshTokens.count };
  }
}

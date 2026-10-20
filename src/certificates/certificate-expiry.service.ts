import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateRecyclingService } from './certificate-recycling.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';

const DAY_MS = 86_400_000;
const BATCH = 200;
const MAX_BATCHES = 50;
const DEFAULT_ALERT_DAYS = [7, 30];

/** "30,7" → [7, 30]: inteiros positivos, sem repetidos, por ordem ascendente. */
export function parseAlertDays(raw: string | undefined): number[] {
  const days = (raw ?? '')
    .split(',')
    .map(s => Number.parseInt(s.trim(), 10))
    .filter(n => Number.isInteger(n) && n > 0);
  const unique = [...new Set(days)].sort((a, b) => a - b);
  return unique.length ? unique : [...DEFAULT_ALERT_DAYS];
}

/**
 * Expiração diária e alertas de validade. Corre em todas as instâncias da app:
 * a reclamação atómica (updateMany condicional) garante um só alerta por
 * certificado e limiar. Nos cursos com reciclagem AUTOMATIC o job abre também a nova
 * realização da matrícula (CertificateRecyclingService); nos restantes o alerta só encaminha.
 */
@Injectable()
export class CertificateExpiryService {
  private readonly logger = new Logger(CertificateExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recycling: CertificateRecyclingService,
  ) {}

  @Cron('0 7 * * *')
  async scheduled(): Promise<void> {
    try {
      await this.runExpiryJob();
    } catch (e) {
      this.logger.error({
        action: 'CERTIFICATE_EXPIRY_JOB',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha na expiração e alertas de certificados',
      });
    }
  }

  async runExpiryJob(
    now: Date = new Date(),
  ): Promise<{ markedExpired: number; alerted: number; recycled: number }> {
    const expired = await this.prisma.certificate.updateMany({
      where: { status: 'ACTIVE', revoked: false, deletedAt: null, expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });

    let alerted = 0;
    // Ascendente: um certificado a 5 dias recebe só o alerta de 7, não também o de 30.
    for (const days of parseAlertDays(process.env.CERT_EXPIRY_ALERT_DAYS)) {
      alerted += await this.alertWindow(now, days);
    }
    // Depois do estado EXPIRED e dos alertas: uma falha na reciclagem não os perde.
    const { started } = await this.recycling.runAutomatic(now);
    return { markedExpired: expired.count, alerted, recycled: started };
  }

  private async alertWindow(now: Date, days: number): Promise<number> {
    const limit = new Date(now.getTime() + days * DAY_MS);
    const notAlerted = [{ lastExpiryAlertDays: null }, { lastExpiryAlertDays: { gt: days } }];
    let sent = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const certs = await this.prisma.certificate.findMany({
        where: {
          status: 'ACTIVE',
          revoked: false,
          deletedAt: null,
          userId: { not: null },
          expiresAt: { gt: now, lte: limit },
          OR: notAlerted,
        },
        take: BATCH,
        select: {
          id: true,
          userId: true,
          title: true,
          expiresAt: true,
          user: { select: { managerId: true, fullName: true } },
        },
      });

      let claimed = 0;
      for (const c of certs) {
        try {
          const claim = await this.prisma.certificate.updateMany({
            where: { id: c.id, OR: notAlerted },
            data: { lastExpiryAlertDays: days },
          });
          if (claim.count !== 1) continue;
          claimed++;
          await this.notify(c, days);
          sent++;
        } catch (e) {
          this.logger.warn({
            certificateId: c.id,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao alertar a validade de um certificado',
          });
        }
      }
      // Sem reclamações ganhas não há progresso (outra instância já tratou ou falhou).
      if (certs.length < BATCH || claimed === 0) break;
    }
    return sent;
  }

  private async notify(
    c: {
      id: number;
      userId: number | null;
      title: string | null;
      expiresAt: Date | null;
      user: { managerId: number | null; fullName: string } | null;
    },
    days: number,
  ): Promise<void> {
    if (!c.userId || !c.expiresAt) return;
    const title = c.title ?? 'formação';
    const date = c.expiresAt.toLocaleDateString('pt-PT');
    await createNotificationSafe(this.prisma, this.logger, {
      userId: c.userId,
      type: 'CERTIFICATE_EXPIRING',
      message: `O seu certificado "${title}" expira a ${date}. Refaça a formação para o renovar (a reciclagem pode ser iniciada pelo RH ou abrir-se automaticamente).`,
      metadata: { certificateId: c.id, alertDays: days },
    });
    if (c.user?.managerId) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: c.user.managerId,
        type: 'CERTIFICATE_EXPIRING',
        message: `O certificado "${title}" de ${c.user.fullName} expira a ${date}.`,
        metadata: { certificateId: c.id, alertDays: days, holderId: c.userId },
      });
    }
  }
}

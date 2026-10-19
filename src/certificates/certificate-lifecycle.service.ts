import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Certificate, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { MailService } from '../mail/mail.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { generateVerificationCode } from './certificate-code';
import { buildVerifyUrl } from './certificate-renderer';
import { effectiveStatus } from './certificates.service';

type CertificateWithUser = Certificate & { user: { fullName: string; email: string } | null };

/** Revogar, reemitir e reenviar. Nunca apaga: preserva sempre o registo original. */
@Injectable()
export class CertificateLifecycleService {
  private readonly logger = new Logger(CertificateLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  private async load(id: number): Promise<CertificateWithUser> {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      include: { user: { select: { fullName: true, email: true } } },
    });
    if (!cert) throw new NotFoundException('Certificado não encontrado');
    return cert;
  }

  async revoke(id: number, reason: string, actorId: number): Promise<Certificate> {
    const cert = await this.load(id);
    if (cert.revoked || cert.status === 'REVOKED') {
      throw new ConflictException('O certificado já está revogado');
    }

    // Reclamação atómica: duas revogações em simultâneo não sobrescrevem o motivo.
    const claim = await this.prisma.certificate.updateMany({
      where: { id, revoked: false },
      data: {
        revoked: true,
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedById: actorId,
        revokeReason: reason,
      },
    });
    if (claim.count === 0) throw new ConflictException('O certificado já está revogado');

    await this.audit.log({
      action: 'CERTIFICATE_REVOKED',
      entity: 'Certificate',
      entityId: id,
      userId: actorId,
      reason,
      before: { status: effectiveStatus(cert) },
      after: { status: 'REVOKED' },
      metadata: { holderId: cert.userId },
      strict: true,
    });
    if (cert.userId) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: cert.userId,
        type: 'CERTIFICATE_REVOKED',
        message: `O certificado "${cert.title ?? 'formação'}" foi revogado.`,
        metadata: { certificateId: id },
      });
    }
    return this.load(id);
  }

  async reissue(
    id: number,
    reason: string,
    actorId: number,
  ): Promise<{ original: Certificate; replacement: Certificate }> {
    const cert = await this.load(id);
    if (cert.origin !== 'INTERNAL') {
      throw new ConflictException('Certificados externos não podem ser reemitidos');
    }
    const status = effectiveStatus(cert);
    if (status !== 'ACTIVE' && status !== 'EXPIRED') {
      throw new ConflictException('Só é possível reemitir certificados válidos ou expirados');
    }

    const now = new Date();
    const cycle = (Number.parseInt(cert.cycleKey, 10) || 1) + 1;
    const base = cert.dedupKey
      ? cert.dedupKey.replace(/:\d+$/, '')
      : `${cert.userId ?? 0}:CERT:${cert.id}`;
    const code = generateVerificationCode();
    const duration = cert.expiresAt ? cert.expiresAt.getTime() - cert.issuedAt.getTime() : null;
    const expiresAt = duration !== null ? new Date(now.getTime() + duration) : null;
    const recipientName = cert.user?.fullName ?? cert.recipientName ?? '';
    const old = this.parseSnapshot(cert.snapshot);
    const snapshot = {
      ...old,
      code,
      recipientName,
      title: cert.title ?? old.title,
      hours: cert.hours ?? old.hours ?? null,
      ...(cert.score !== null ? { score: cert.score } : {}),
      issuedAt: now.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };

    let replacement: Certificate;
    try {
      replacement = await this.prisma.$transaction(async tx => {
        const claim = await tx.certificate.updateMany({
          where: { id, revoked: false },
          data: {
            revoked: true,
            status: 'REVOKED',
            revokedAt: now,
            revokedById: actorId,
            revokeReason: `Reemitido: ${reason}`,
          },
        });
        if (claim.count === 0)
          throw new ConflictException('O certificado já foi revogado ou reemitido');

        // enrollmentId é único e fica com o original; o novo liga-se pelo replacesId.
        return tx.certificate.create({
          data: {
            type: cert.type,
            userId: cert.userId,
            courseId: cert.courseId,
            eventId: cert.eventId,
            activityKind: cert.activityKind,
            activityId: cert.activityId,
            cycleKey: String(cycle),
            dedupKey: `${base}:${cycle}`,
            status: 'ACTIVE',
            validationCode: code,
            code,
            recipientName,
            title: cert.title,
            score: cert.score,
            hours: cert.hours,
            issuerName: cert.issuerName,
            issuedAt: now,
            expiresAt,
            issuedById: actorId,
            snapshot: JSON.stringify(snapshot),
            replacesId: cert.id,
          },
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('O certificado já foi reemitido');
      }
      throw e;
    }

    await this.audit.log({
      action: 'CERTIFICATE_REISSUED',
      entity: 'Certificate',
      entityId: replacement.id,
      userId: actorId,
      reason,
      metadata: { holderId: cert.userId, replacesId: cert.id, replacementId: replacement.id },
      strict: true,
    });
    if (cert.userId) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: cert.userId,
        type: 'CERTIFICATE_REISSUED',
        message: `O certificado "${cert.title ?? 'formação'}" foi reemitido.`,
        metadata: { certificateId: replacement.id, replacesId: cert.id },
      });
    }

    return {
      original: { ...cert, revoked: true, status: 'REVOKED', revokeReason: `Reemitido: ${reason}` },
      replacement,
    };
  }

  async resend(id: number, actorId: number): Promise<{ notified: boolean; emailed: boolean }> {
    const cert = await this.load(id);
    if (effectiveStatus(cert) !== 'ACTIVE' || !cert.userId) {
      throw new ConflictException('Só é possível reenviar certificados válidos');
    }
    const url = buildVerifyUrl(cert.validationCode);
    const title = cert.title ?? 'formação';

    const log = await createNotificationSafe(this.prisma, this.logger, {
      userId: cert.userId,
      type: 'CERTIFICATE_RESENT',
      message: `O seu certificado "${title}" está disponível na plataforma.`,
      metadata: { certificateId: id },
    });

    let emailed = false;
    if (cert.user?.email) {
      try {
        await this.mail.sendNotification(
          cert.user.email,
          `O seu certificado: ${title}`,
          `O seu certificado "${title}" está disponível. Verificação pública: ${url}`,
        );
        emailed = true;
      } catch {
        this.logger.warn({ certificateId: id, msg: 'Falha ao enviar o certificado por e-mail' });
      }
    }

    await this.audit.log({
      action: 'CERTIFICATE_RESENT',
      entity: 'Certificate',
      entityId: id,
      userId: actorId,
      metadata: { holderId: cert.userId, emailed },
      strict: true,
    });
    return { notified: log !== null, emailed };
  }

  private parseSnapshot(
    raw: string | null,
  ): { title?: string; hours?: number | null } & Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed: Record<string, unknown> | null = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
}

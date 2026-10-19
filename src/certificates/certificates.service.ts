import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CertificateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { normalizeVerificationCode } from './certificate-code';
import { buildVerifyUrl, CertificateSnapshot, renderCertificatePdf } from './certificate-renderer';

interface StatusInput {
  status: CertificateStatus;
  revoked: boolean;
  expiresAt: Date | null;
}

/** Estado real no momento da consulta: revogação > expiração > estado gravado. */
export function effectiveStatus(cert: StatusInput, now = new Date()): CertificateStatus {
  if (cert.revoked || cert.status === 'REVOKED') return 'REVOKED';
  if (cert.status === 'PENDING' || cert.status === 'PENDING_APPROVAL') return cert.status;
  if (cert.expiresAt && cert.expiresAt.getTime() < now.getTime()) return 'EXPIRED';
  return cert.status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE';
}

export interface PublicVerifyResult {
  valid: boolean;
  status: CertificateStatus;
  holderName: string;
  title: string;
  issuerName: string;
  hours: number | null;
  issuedAt: Date;
  expiresAt: Date | null;
  type: string;
}

// Códigos legados (CERT-<curso>-<user>-<timestamp>) têm hífens; os novos não.
const LEGACY_CODE = /^[A-Za-z0-9-]{1,64}$/;
const PDF_PRIVILEGED = [Role.ADMIN, Role.RH, Role.AUDITOR];

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(userId: number) {
    const rows = await this.prisma.certificate.findMany({
      where: { userId, deletedAt: null },
      include: {
        course: { select: { id: true, title: true, thumbnailUrl: true, category: true } },
        event: { select: { id: true, title: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
    const now = new Date();
    return rows.map(r => ({
      ...r,
      status: effectiveStatus(r, now),
      displayTitle: r.title ?? r.course?.title ?? r.event?.title ?? 'Certificado',
    }));
  }

  /** Verificação pública: lê sempre o registo actual e expõe só o mínimo necessário. */
  async verifyPublic(rawCode: string): Promise<PublicVerifyResult> {
    const normalized = normalizeVerificationCode(rawCode);
    const trimmed = rawCode.trim();
    const candidates = [normalized, LEGACY_CODE.test(trimmed) ? trimmed : null].filter(
      (c): c is string => !!c,
    );
    if (candidates.length === 0) throw new NotFoundException('Certificado não encontrado');

    const cert = await this.prisma.certificate.findFirst({
      where: { validationCode: { in: candidates }, deletedAt: null },
      include: {
        course: { select: { title: true } },
        event: { select: { title: true } },
        user: { select: { fullName: true } },
      },
    });
    if (!cert) throw new NotFoundException('Certificado não encontrado');

    const status = effectiveStatus(cert);
    if (status === 'PENDING' || status === 'PENDING_APPROVAL') {
      throw new NotFoundException('Certificado não encontrado');
    }

    void this.prisma.certificate
      .update({ where: { id: cert.id }, data: { verifyCount: { increment: 1 } } })
      .catch(() => undefined);

    return {
      valid: status === 'ACTIVE',
      status,
      holderName: cert.recipientName ?? cert.user?.fullName ?? '',
      title: cert.title ?? cert.course?.title ?? cert.event?.title ?? 'Certificado',
      issuerName: cert.issuerName ?? 'INNOVA',
      hours: cert.hours ?? null,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      type: cert.activityKind ?? 'COURSE',
    };
  }

  async getPdfFor(
    id: number,
    user: { id: number; role?: { name: string } | null },
  ): Promise<Buffer> {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        course: { select: { title: true } },
        event: { select: { title: true } },
        user: { select: { fullName: true } },
      },
    });
    assertCanAccess(cert, cert?.userId ?? -1, user, PDF_PRIVILEGED);

    const status = effectiveStatus(cert);
    if (status !== 'ACTIVE' && status !== 'EXPIRED') {
      throw new ConflictException('Certificado indisponível para download');
    }

    const snapshot = this.snapshotOf(cert);
    const buffer = await renderCertificatePdf(snapshot, buildVerifyUrl(cert.validationCode));
    await this.prisma.certificate.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
    return buffer;
  }

  /** Certificados anteriores à migração não têm snapshot: reconstrói a partir dos campos actuais. */
  private snapshotOf(cert: {
    snapshot: string | null;
    validationCode: string;
    recipientName: string | null;
    title: string | null;
    hours: number | null;
    score: number | null;
    issuedAt: Date;
    expiresAt: Date | null;
    issuerName: string | null;
    course: { title: string } | null;
    event: { title: string } | null;
    user: { fullName: string } | null;
  }): CertificateSnapshot {
    if (cert.snapshot) {
      try {
        return JSON.parse(cert.snapshot) as CertificateSnapshot;
      } catch {
        // snapshot corrompido: cai para os campos da linha
      }
    }
    return {
      code: cert.validationCode,
      recipientName: cert.recipientName ?? cert.user?.fullName ?? '',
      title: cert.title ?? cert.course?.title ?? cert.event?.title ?? 'Certificado',
      hours: cert.hours,
      ...(cert.score !== null ? { score: cert.score } : {}),
      issuedAt: cert.issuedAt.toISOString(),
      expiresAt: cert.expiresAt ? cert.expiresAt.toISOString() : null,
      issuerName: cert.issuerName ?? 'INNOVA',
    };
  }
}

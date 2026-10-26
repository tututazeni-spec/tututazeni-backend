import { swallow } from '../common/logging/swallow';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CertificateOrigin, CertificateStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanAccess } from '../common/authz/ownership';
import { Optional } from '@nestjs/common';
import { CertificateAssetsService } from './templates/certificate-assets.service';
import { normalizeVerificationCode } from './certificate-code';
import { buildVerifyUrl, CertificateSnapshot, renderCertificatePdf } from './certificate-renderer';
import { buildLinkedInUrl } from './certificate-share';

import { ADMIN_RH_AUDITOR_ROLES } from '../auth/enums/role-groups';

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
  /** EXTERNAL = importado para a plataforma, não emitido pela academia. */
  origin: CertificateOrigin;
}

// Códigos legados (CERT-<curso>-<user>-<timestamp>) têm hífens; os novos não.
const LEGACY_CODE = /^[A-Za-z0-9-]{1,64}$/;
const PDF_PRIVILEGED = ADMIN_RH_AUDITOR_ROLES;

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly assets?: CertificateAssetsService,
  ) {}

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
    // O documento importado (fileUrl, até 5 MB) e o snapshot nunca vão na lista.
    return rows.map(({ fileUrl: _fileUrl, snapshot: _snapshot, ...r }) => {
      const status = effectiveStatus(r, now);
      const displayTitle = r.title ?? r.course?.title ?? r.event?.title ?? 'Certificado';
      return {
        ...r,
        status,
        displayTitle,
        verifyUrl: buildVerifyUrl(r.validationCode),
        // O LinkedIn só se oferece para certificados válidos (fluxo oficial "Add to profile").
        linkedInUrl:
          status === 'ACTIVE'
            ? buildLinkedInUrl({
                title: displayTitle,
                issuerName: r.issuerName,
                issuedAt: r.issuedAt,
                expiresAt: r.expiresAt,
                validationCode: r.validationCode,
              })
            : undefined,
      };
    });
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
      .catch(swallow('certificates.service', 'operação auxiliar falhou (ignorada)', undefined));

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
      origin: cert.origin,
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
    return this.renderPdf(cert);
  }

  /** Download público pelo código: só certificados válidos; qualquer outro caso é 404 genérico. */
  async getPublicPdf(rawCode: string): Promise<Buffer> {
    const normalized = normalizeVerificationCode(rawCode);
    const trimmed = rawCode.trim();
    const candidates = [normalized, LEGACY_CODE.test(trimmed) ? trimmed : null].filter(
      (c): c is string => !!c,
    );
    const cert = candidates.length
      ? await this.prisma.certificate.findFirst({
          where: { validationCode: { in: candidates }, deletedAt: null },
          include: {
            course: { select: { title: true } },
            event: { select: { title: true } },
            user: { select: { fullName: true } },
          },
        })
      : null;
    if (!cert || effectiveStatus(cert) !== 'ACTIVE') {
      throw new NotFoundException('Certificado não encontrado');
    }
    return this.renderPdf(cert);
  }

  private async renderPdf(
    cert: NonNullable<Awaited<ReturnType<CertificatesService['loadForPdf']>>>,
  ): Promise<Buffer> {
    const id = cert.id;
    if (cert.origin === 'EXTERNAL') {
      // O documento de um certificado externo é o ficheiro carregado, nunca um PDF gerado.
      const external = this.externalPdf(cert.fileUrl);
      if (!external) throw new ConflictException('Documento do certificado externo indisponível');
      await this.prisma.certificate.update({
        where: { id },
        data: { downloadCount: { increment: 1 } },
      });
      return external;
    }

    const snapshot = this.snapshotOf(cert);
    // Imagens do template EMBUTIDO no snapshot (a versão com que foi emitido), não do actual.
    const images = (await this.assets?.loadForRender(snapshot.template?.config.assets ?? {})) ?? {};
    const buffer = await renderCertificatePdf(
      snapshot,
      buildVerifyUrl(cert.validationCode),
      images,
    );
    await this.prisma.certificate.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
    return buffer;
  }

  private loadForPdf(id: number) {
    return this.prisma.certificate.findUnique({
      where: { id },
      include: {
        course: { select: { title: true } },
        event: { select: { title: true } },
        user: { select: { fullName: true } },
      },
    });
  }

  private externalPdf(fileUrl: string | null): Buffer | null {
    const prefix = 'data:application/pdf;base64,';
    if (!fileUrl?.startsWith(prefix)) return null;
    return Buffer.from(fileUrl.slice(prefix.length), 'base64');
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

import { createHash } from 'crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Certificate, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { generateVerificationCode } from './certificate-code';
import { ImportExternalCertificateDto } from './certificates-lifecycle.dto';

/** Importação de certificados obtidos fora da plataforma — sempre marcados como EXTERNOS. */
@Injectable()
export class CertificateExternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async importExternal(
    dto: ImportExternalCertificateDto,
    actorId: number,
  ): Promise<{ outcome: 'IMPORTED' | 'EXISTS'; certificate: Certificate }> {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, fullName: true },
    });
    if (!user) throw new NotFoundException('Titular não encontrado');

    const completedAt = new Date(dto.completedAt);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() < completedAt.getTime()) {
      throw new BadRequestException('A validade não pode ser anterior à data de conclusão');
    }

    // Mesma formação, entidade e data para o mesmo titular → mesmo registo.
    const fingerprint = createHash('sha1')
      .update(`${dto.title}|${dto.issuerName}|${completedAt.toISOString()}`)
      .digest('hex');
    const dedupKey = `${user.id}:EXTERNAL:${fingerprint}`;
    const code = generateVerificationCode();

    let certificate: Certificate;
    try {
      certificate = await this.prisma.certificate.create({
        data: {
          type: 'COURSE',
          origin: 'EXTERNAL',
          userId: user.id,
          status: dto.validated ? 'ACTIVE' : 'PENDING_APPROVAL',
          dedupKey,
          validationCode: code,
          code,
          recipientName: user.fullName,
          title: dto.title,
          issuerName: dto.issuerName,
          hours: dto.hours ?? null,
          observations: dto.observations ?? null,
          issuedAt: completedAt,
          expiresAt,
          issuedById: actorId,
          fileUrl: dto.document,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.certificate.findUnique({ where: { dedupKey } });
        if (existing) return { outcome: 'EXISTS', certificate: existing };
      }
      throw e;
    }

    await this.audit.log({
      action: 'CERTIFICATE_EXTERNAL_IMPORTED',
      entity: 'Certificate',
      entityId: certificate.id,
      userId: actorId,
      metadata: {
        holderId: user.id,
        issuerName: dto.issuerName,
        validated: !!dto.validated,
      },
      strict: true,
    });
    return { outcome: 'IMPORTED', certificate };
  }
}

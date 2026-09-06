import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import {
  CreateTemplateDto,
  IssueCertificateDto,
  CreateBadgeDto,
  IssueBadgeDto,
  RevokeDto,
  FilterCertificateDto,
  MyCertificatesFilterDto,
} from './dto';
import { AuditService } from '../common/services/audit.service';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import {
  certificateToIssuedShape,
  issuedType,
  CERT_TYPE_LEGACY_TO_CANONICAL,
  IssuedShape,
} from './certificate-legacy-adapter';

@Injectable()
export class CertificationService {
  private readonly logger = new Logger(CertificationService.name);

  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── GERAÇÃO DE CÓDIGOS ──────────────────────────────

  private async generateCertCode(): Promise<string> {
    // Fase F2: sequência agora sobre `Certificate` (só os códigos CERT-*, para não
    // colidir com os formatos usados por outros escritores nativos). Força primary.
    const last = await this.prisma.certificate.findFirst({
      where: { code: { startsWith: 'CERT-' } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last?.code ? parseInt(last.code.replace('CERT-', ''), 10) + 1 : 1;
    return `CERT-${String(num).padStart(5, '0')}`;
  }

  /** Resolve o id de rota (cuid legado / uuid sintético / Int) para um `Certificate`. */
  private async resolveCert(id: string) {
    const where = /^\d+$/.test(id)
      ? { OR: [{ legacyIssuedCertId: id }, { id: Number(id) }] }
      : { legacyIssuedCertId: id };
    return this.prisma.certificate.findFirst({
      where,
      include: { user: { select: { fullName: true, email: true } } },
    });
  }

  private async enrichCert(cert: { issuedById: number | null; templateId: string | null }) {
    const [issuedBy, template] = await Promise.all([
      cert.issuedById
        ? this.prisma.read.user.findUnique({
            where: { id: cert.issuedById },
            select: { fullName: true },
          })
        : null,
      cert.templateId
        ? this.prisma.read.certificateTemplate.findUnique({
            where: { id: cert.templateId },
            select: { name: true, html: true },
          })
        : null,
    ]);
    return { issuedBy, template };
  }

  private generateVerificationCode(): string {
    return `INNOVA-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private generateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // ─── TEMPLATES ───────────────────────────────────────

  async createTemplate(dto: CreateTemplateDto, userId: number) {
    if (dto.isDefault) {
      await this.prisma.certificateTemplate.updateMany({
        where: { type: dto.type || 'COURSE', isDefault: true },
        data: { isDefault: false },
      });
    }
    const template = await this.prisma.certificateTemplate.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit.logEntity(userId, 'CREATE', 'CertificateTemplate', template.id, {
      name: dto.name,
    });
    return template;
  }

  async findAllTemplates() {
    return this.prisma.read.certificateTemplate.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { certificates: true } } },
    });
  }

  // ─── EMISSÃO DE CERTIFICADOS ─────────────────────────

  async issueCertificate(dto: IssueCertificateDto, issuerId: number) {
    // Leituras dentro de método de escrita: força primary (consistência forte na emissão).
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { fullName: true, email: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const code = await this.generateCertCode();
    const verificationCode = this.generateVerificationCode();
    const hashCode = this.generateHash(`${dto.userId}-${code}-${verificationCode}`);

    let expiresAt: Date | undefined;
    if (dto.templateId) {
      const template = await this.prisma.certificateTemplate.findUnique({
        where: { id: dto.templateId },
      });
      if (template?.validityDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + template.validityDays);
      }
    }

    const legacyType = dto.type || 'COURSE';
    const legacyIssuedCertId = crypto.randomUUID();
    const [courseId, programId] = await Promise.all([
      this.toExistingFk(dto.courseId, id =>
        this.prisma.course.findUnique({ where: { id }, select: { id: true } }),
      ),
      this.toExistingFk(dto.programId, id =>
        this.prisma.leadershipProgram.findUnique({ where: { id }, select: { id: true } }),
      ),
    ]);

    const certificate = await this.prisma.certificate.create({
      data: {
        code,
        validationCode: verificationCode,
        hashCode,
        userId: dto.userId,
        templateId: dto.templateId,
        courseId,
        programId,
        title: dto.title,
        recipientName: user.fullName,
        type: CERT_TYPE_LEGACY_TO_CANONICAL[legacyType],
        legacyType,
        legacyIssuedCertId,
        score: dto.score,
        publicUrl: `https://innova.evos.co.ao/verify/${verificationCode}`,
        issuedById: issuerId,
        expiresAt,
        metadata: JSON.stringify({
          recipientName: user.fullName,
          recipientEmail: user.email,
          issuedAt: new Date().toISOString(),
        }),
      },
      include: { user: { select: { fullName: true, email: true } } },
    });

    await this.audit.logEntity(issuerId, 'CREATE', 'Certificate', String(certificate.id), {
      code,
      userId: dto.userId,
    });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: dto.userId,
      type: 'CERTIFICATE_ISSUED',
      title: 'Certificado emitido',
      message: `O teu certificado "${dto.title}" está disponível.`,
      metadata: { certificateId: legacyIssuedCertId, verificationCode },
    });
    return certificateToIssuedShape(certificate);
  }

  /** String livre de DTO -> Int se numérico E a linha existe; senão `undefined`. */
  private async toExistingFk(
    value: string | undefined,
    lookup: (id: number) => Promise<{ id: number } | null>,
  ): Promise<number | undefined> {
    if (!value) return undefined;
    const n = Number(value);
    if (!Number.isInteger(n)) return undefined;
    return (await lookup(n)) ? n : undefined;
  }

  async findAllCertificates(filters: FilterCertificateDto) {
    const { type, userId, search, isRevoked, page = 1, limit = 20 } = filters;
    const where: Prisma.CertificateWhereInput = {
      legacyIssuedCertId: { not: null },
      deletedAt: null,
      ...(type && { legacyType: type }),
      ...(userId && { userId }),
      ...(isRevoked !== undefined && { revoked: isRevoked }),
      ...(search && {
        OR: [
          { recipientName: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { validationCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.certificate.findMany({
        where,
        skip,
        take,
        orderBy: { issuedAt: 'desc' },
        include: { user: { select: { fullName: true, email: true } } },
      }),
      this.prisma.read.certificate.count({ where }),
    ]);

    const issuerIds = [
      ...new Set(data.map(c => c.issuedById).filter((v): v is number => v != null)),
    ];
    const issuers = issuerIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: issuerIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const issuerMap = new Map(issuers.map(u => [u.id, { fullName: u.fullName }]));

    const shaped = data.map(c =>
      certificateToIssuedShape(c, {
        issuedBy: c.issuedById ? (issuerMap.get(c.issuedById) ?? null) : null,
      }),
    );
    const { data: pageData, meta } = buildPaginatedResponse(shaped, total, page, limit);
    return { data: pageData, ...meta };
  }

  async findCertificateById(
    id: string,
    user: { id: number; role?: { name: string } | null },
  ): Promise<IssuedShape> {
    const cert = await this.resolveCert(id);
    if (!cert || cert.deletedAt) throw new NotFoundException('Certificado não encontrado');
    assertCanAccess(cert, cert.userId, user, [Role.ADMIN, Role.RH]);
    const enrich = await this.enrichCert(cert);
    return certificateToIssuedShape(cert, enrich);
  }

  // ─── VERIFICAÇÃO PÚBLICA ─────────────────────────────

  async verify(verificationCode: string) {
    const cert = await this.prisma.read.certificate.findFirst({
      where: { validationCode: { in: [verificationCode, `LEG-${verificationCode}`] } },
      include: {
        user: { select: { fullName: true } },
      },
    });

    if (!cert) {
      return { valid: false, reason: 'Código de verificação inválido' };
    }
    if (cert.revoked) {
      return {
        valid: false,
        reason: 'Certificado revogado',
        revokedAt: cert.revokedAt,
        revokeReason: cert.revokeReason,
      };
    }
    if (cert.expiresAt && cert.expiresAt < new Date()) {
      return {
        valid: false,
        reason: 'Certificado expirado',
        expiresAt: cert.expiresAt,
      };
    }

    await this.prisma.certificate.update({
      where: { id: cert.id },
      data: { verifyCount: { increment: 1 } },
    });

    return {
      valid: true,
      certificate: {
        code: cert.code?.startsWith('LEG-') ? cert.code.slice(4) : cert.code,
        holder: cert.recipientName,
        title: cert.title,
        type: issuedType(cert),
        score: cert.score,
        issuer: cert.issuerName ?? 'INNOVA',
        issuedAt: cert.issuedAt,
        expiresAt: cert.expiresAt,
        verificationCode: verificationCode,
        hashCode: cert.hashCode,
      },
    };
  }

  // ─── REVOGAÇÃO ───────────────────────────────────────

  async revokeCertificate(
    id: string,
    dto: RevokeDto,
    user: { id: number; role?: { name: string } | null },
  ): Promise<IssuedShape> {
    const cert = await this.resolveCert(id);
    if (!cert || cert.deletedAt) throw new NotFoundException('Certificado não encontrado');
    assertCanAccess(cert, cert.userId, user, [Role.ADMIN, Role.RH]);
    if (cert.revoked) throw new ConflictException('Certificado já revogado');

    const updated = await this.prisma.certificate.update({
      where: { id: cert.id },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokeReason: dto.reason,
        revokedById: user.id,
      },
      include: { user: { select: { fullName: true, email: true } } },
    });
    await this.audit.logEntity(user.id, 'UPDATE', 'Certificate', String(cert.id), {
      action: 'REVOKE',
      reason: dto.reason,
    });
    if (cert.userId) {
      await createNotificationSafe(this.prisma, this.logger, {
        userId: cert.userId,
        type: 'CERTIFICATE_REVOKED',
        title: 'Certificado revogado',
        message: `O teu certificado "${cert.title}" foi revogado.`,
        metadata: { certificateId: id, reason: dto.reason },
      });
    }
    return certificateToIssuedShape(updated);
  }

  async downloadCertificate(id: string, user: { id: number; role?: { name: string } | null }) {
    const cert = await this.resolveCert(id);
    if (!cert || cert.deletedAt) throw new NotFoundException('Certificado não encontrado');
    assertCanAccess(cert, cert.userId, user, [Role.ADMIN, Role.RH]);
    await this.prisma.certificate.update({
      where: { id: cert.id },
      data: { downloadCount: { increment: 1 } },
    });
    await this.audit.logEntity(user.id, 'DOWNLOAD', 'Certificate', String(cert.id), {
      code: cert.code,
    });
    return { pdfUrl: cert.pdfUrl ?? cert.fileUrl, publicUrl: cert.publicUrl, title: cert.title };
  }

  // ─── BADGES DIGITAIS ─────────────────────────────────

  private async generateBadgeCode(): Promise<string> {
    // Geração de código sequencial: força primary para não gerar códigos duplicados via réplica.
    const last = await this.prisma.digitalBadge.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('BDG-', ''), 10) + 1 : 1;
    return `BDG-${String(num).padStart(5, '0')}`;
  }

  async createBadge(dto: CreateBadgeDto, userId: number) {
    const code = await this.generateBadgeCode();
    const badge = await this.prisma.digitalBadge.create({
      data: { ...dto, code, createdById: userId },
    });
    await this.audit.logEntity(userId, 'CREATE', 'DigitalBadge', badge.id, {
      code,
      name: dto.name,
    });
    return badge;
  }

  async findAllBadges() {
    return this.prisma.read.digitalBadge.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { level: 'asc' },
      include: { _count: { select: { issuances: true } } },
    });
  }

  async issueBadge(dto: IssueBadgeDto, issuerId: number) {
    // Leituras de guard/enrichment dentro de emissão (escrita): força primary.
    const [badge, user] = await this.prisma.$transaction([
      this.prisma.digitalBadge.findUnique({ where: { id: dto.badgeId } }),
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { fullName: true },
      }),
    ]);
    if (!badge) throw new NotFoundException('Badge não encontrado');
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const existing = await this.prisma.badgeIssuance.findUnique({
      where: { badgeId_userId: { badgeId: dto.badgeId, userId: dto.userId } },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('Utilizador já possui este badge');
    }

    const verifyCode = `BADGE-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const issuance = await this.prisma.badgeIssuance.create({
      data: {
        badgeId: dto.badgeId,
        userId: dto.userId,
        verifyCode,
        evidenceUrl: dto.evidenceUrl,
        shareUrl: `https://innova.evos.co.ao/badge/${verifyCode}`,
        issuedById: issuerId,
      },
    });
    await this.audit.logEntity(issuerId, 'CREATE', 'BadgeIssuance', issuance.id, {
      badgeId: dto.badgeId,
      userId: dto.userId,
    });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: dto.userId,
      type: 'BADGE_EARNED',
      title: 'Novo badge conquistado!',
      message: `Conquistaste o badge "${badge.name}".`,
      metadata: { badgeId: badge.id, verifyCode },
    });
    return issuance;
  }

  async getMyBadges(userId: number) {
    return this.prisma.read.badgeIssuance.findMany({
      where: { userId, deletedAt: null, isRevoked: false },
      orderBy: { issuedAt: 'desc' },
      include: { badge: true },
    });
  }

  async getMyCertificates(userId: number, filters: MyCertificatesFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const where: Prisma.CertificateWhereInput = {
      userId,
      legacyIssuedCertId: { not: null },
      deletedAt: null,
    };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.certificate.findMany({
        where,
        skip,
        take,
        orderBy: { issuedAt: 'desc' },
        include: { user: { select: { fullName: true, email: true } } },
      }),
      this.prisma.read.certificate.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(
      data.map(c => certificateToIssuedShape(c)),
      total,
      page,
      limit,
    );
    return { data: pageData, ...meta };
  }

  // ─── DASHBOARD ───────────────────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fase F2: contagens de certificado sobre `Certificate`, restritas aos que
    // vêm do módulo certification (`legacyIssuedCertId != null`) — preserva a
    // semântica histórica e não conta os certificados nativos de course-completion.
    const certScope: Prisma.CertificateWhereInput = {
      legacyIssuedCertId: { not: null },
      deletedAt: null,
    };

    // groupBy() fora do $transaction: dentro do array o TS entra em referência
    // circular no where do groupBy (TS2615). Sem impacto: leitura de dashboard.
    // Agrupa por `legacyType` para manter a granularidade histórica de 6 valores.
    const byTypePromise = this.prisma.read.certificate.groupBy({
      by: ['legacyType'],
      where: certScope,
      _count: { id: true },
    });

    const [
      totalCerts,
      issuedThisMonth,
      revoked,
      expired,
      totalBadges,
      badgesIssued,
      totalTemplates,
      totalVerifications,
      recentCerts,
    ] = await this.prisma.$transaction([
      this.prisma.read.certificate.count({ where: certScope }),
      this.prisma.read.certificate.count({
        where: { ...certScope, issuedAt: { gte: startOfMonth } },
      }),
      this.prisma.read.certificate.count({
        where: { ...certScope, revoked: true },
      }),
      this.prisma.read.certificate.count({
        where: { ...certScope, expiresAt: { lt: now }, revoked: false },
      }),
      this.prisma.read.digitalBadge.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.read.badgeIssuance.count({
        where: { deletedAt: null, isRevoked: false },
      }),
      this.prisma.read.certificateTemplate.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.read.certificate.aggregate({
        _sum: { verifyCount: true },
        where: certScope,
      }),
      this.prisma.read.certificate.findMany({
        where: certScope,
        orderBy: { issuedAt: 'desc' },
        take: 5,
        include: { user: { select: { fullName: true, email: true } } },
      }),
    ]);
    const byTypeRaw = await byTypePromise;
    const byType = byTypeRaw.map(g => ({ type: g.legacyType, _count: g._count }));

    return {
      totals: {
        totalCerts,
        issuedThisMonth,
        revoked,
        expired,
        valid: totalCerts - revoked - expired,
        totalBadges,
        badgesIssued,
        totalTemplates,
        totalVerifications: totalVerifications._sum.verifyCount || 0,
      },
      byType,
      recentCertificates: recentCerts.map(c => certificateToIssuedShape(c)),
    };
  }

  // ─── HELPER ──────────────────────────────────────────
}

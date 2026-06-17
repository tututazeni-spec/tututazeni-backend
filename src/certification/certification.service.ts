import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import {
  CreateTemplateDto,
  IssueCertificateDto,
  CreateBadgeDto,
  IssueBadgeDto,
  RevokeDto,
  FilterCertificateDto,
} from './dto';

@Injectable()
export class CertificationService {
  constructor(private prisma: PrismaService) {}

  // ─── GERAÇÃO DE CÓDIGOS ──────────────────────────────

  private async generateCertCode(): Promise<string> {
    const last = await this.prisma.issuedCertificate.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('CERT-', ''), 10) + 1 : 1;
    return `CERT-${String(num).padStart(5, '0')}`;
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
    await this.audit(userId, 'CREATE', 'CertificateTemplate', template.id, {
      name: dto.name,
    });
    return template;
  }

  async findAllTemplates() {
    return this.prisma.certificateTemplate.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { certificates: true } } },
    });
  }

  // ─── EMISSÃO DE CERTIFICADOS ─────────────────────────

  async issueCertificate(dto: IssueCertificateDto, issuerId: number) {
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

    const certificate = await this.prisma.issuedCertificate.create({
      data: {
        code,
        verificationCode,
        hashCode,
        userId: dto.userId,
        templateId: dto.templateId,
        courseId: dto.courseId,
        programId: dto.programId,
        title: dto.title,
        recipientName: user.fullName,
        type: dto.type || 'COURSE',
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
    });

    await this.audit(issuerId, 'CREATE', 'IssuedCertificate', certificate.id, {
      code,
      userId: dto.userId,
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: dto.userId,
        type: 'CERTIFICATE_ISSUED',
        title: 'Certificado emitido',
        message: `O teu certificado "${dto.title}" está disponível.`,
        metadata: JSON.stringify({
          certificateId: certificate.id,
          verificationCode,
        }),
      },
    });
    return certificate;
  }

  async findAllCertificates(filters: FilterCertificateDto) {
    const { type, userId, search, isRevoked, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      ...(type && { type }),
      ...(userId && { userId }),
      ...(isRevoked !== undefined && { isRevoked }),
      ...(search && {
        OR: [
          { recipientName: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { verificationCode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.issuedCertificate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { issuedAt: 'desc' },
        include: {
          user: { select: { fullName: true } },
          issuedBy: { select: { fullName: true } },
        },
      }),
      this.prisma.issuedCertificate.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findCertificateById(id: string) {
    const cert = await this.prisma.issuedCertificate.findUnique({
      where: { id },
      include: {
        user: { select: { fullName: true, email: true } },
        template: { select: { name: true, html: true } },
        issuedBy: { select: { fullName: true } },
      },
    });
    if (!cert || cert.deletedAt) throw new NotFoundException('Certificado não encontrado');
    return cert;
  }

  // ─── VERIFICAÇÃO PÚBLICA ─────────────────────────────

  async verify(verificationCode: string): Promise<any> {
    const cert = await this.prisma.issuedCertificate.findUnique({
      where: { verificationCode },
      include: {
        user: { select: { fullName: true } },
      },
    });

    if (!cert) {
      return { valid: false, reason: 'Código de verificação inválido' };
    }
    if (cert.isRevoked) {
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

    await this.prisma.issuedCertificate.update({
      where: { id: cert.id },
      data: { verifyCount: { increment: 1 } },
    });

    return {
      valid: true,
      certificate: {
        code: cert.code,
        holder: cert.recipientName,
        title: cert.title,
        type: cert.type,
        score: cert.score,
        issuer: cert.issuerName,
        issuedAt: cert.issuedAt,
        expiresAt: cert.expiresAt,
        verificationCode: cert.verificationCode,
        hashCode: cert.hashCode,
      },
    };
  }

  // ─── REVOGAÇÃO ───────────────────────────────────────

  async revokeCertificate(id: string, dto: RevokeDto, userId: number) {
    const cert = await this.findCertificateById(id);
    if (cert.isRevoked) throw new ConflictException('Certificado já revogado');

    const updated = await this.prisma.issuedCertificate.update({
      where: { id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokeReason: dto.reason,
        revokedById: userId,
      },
    });
    await this.audit(userId, 'UPDATE', 'IssuedCertificate', id, {
      action: 'REVOKE',
      reason: dto.reason,
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: cert.userId,
        type: 'CERTIFICATE_REVOKED',
        title: 'Certificado revogado',
        message: `O teu certificado "${cert.title}" foi revogado.`,
        metadata: JSON.stringify({ certificateId: id, reason: dto.reason }),
      },
    });
    return updated;
  }

  async downloadCertificate(id: string, userId: number) {
    const cert = await this.findCertificateById(id);
    await this.prisma.issuedCertificate.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
    await this.audit(userId, 'DOWNLOAD', 'IssuedCertificate', id, {
      code: cert.code,
    });
    return { pdfUrl: cert.pdfUrl, publicUrl: cert.publicUrl, title: cert.title };
  }

  // ─── BADGES DIGITAIS ─────────────────────────────────

  private async generateBadgeCode(): Promise<string> {
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
    await this.audit(userId, 'CREATE', 'DigitalBadge', badge.id, {
      code,
      name: dto.name,
    });
    return badge;
  }

  async findAllBadges() {
    return this.prisma.digitalBadge.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { level: 'asc' },
      include: { _count: { select: { issuances: true } } },
    });
  }

  async issueBadge(dto: IssueBadgeDto, issuerId: number) {
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
    await this.audit(issuerId, 'CREATE', 'BadgeIssuance', issuance.id, {
      badgeId: dto.badgeId,
      userId: dto.userId,
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: dto.userId,
        type: 'BADGE_EARNED',
        title: 'Novo badge conquistado!',
        message: `Conquistaste o badge "${badge.name}".`,
        metadata: JSON.stringify({ badgeId: badge.id, verifyCode }),
      },
    });
    return issuance;
  }

  async getMyBadges(userId: number) {
    return this.prisma.badgeIssuance.findMany({
      where: { userId, deletedAt: null, isRevoked: false },
      orderBy: { issuedAt: 'desc' },
      include: { badge: true },
    });
  }

  async getMyCertificates(userId: number, page = 1, limit = 20) {
    const where = { userId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.issuedCertificate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.issuedCertificate.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── DASHBOARD ───────────────────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalCerts,
      issuedThisMonth,
      revoked,
      expired,
      byType,
      totalBadges,
      badgesIssued,
      totalTemplates,
      totalVerifications,
      recentCerts,
    ] = await this.prisma.$transaction([
      this.prisma.issuedCertificate.count({ where: { deletedAt: null } }),
      this.prisma.issuedCertificate.count({
        where: { issuedAt: { gte: startOfMonth } },
      }),
      this.prisma.issuedCertificate.count({
        where: { isRevoked: true, deletedAt: null },
      }),
      this.prisma.issuedCertificate.count({
        where: { expiresAt: { lt: now }, isRevoked: false, deletedAt: null },
      }),
      (this.prisma.issuedCertificate.groupBy as any)({
        by: ['type'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.digitalBadge.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.badgeIssuance.count({
        where: { deletedAt: null, isRevoked: false },
      }),
      this.prisma.certificateTemplate.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.issuedCertificate.aggregate({
        _sum: { verifyCount: true },
        where: { deletedAt: null },
      }),
      this.prisma.issuedCertificate.findMany({
        where: { deletedAt: null },
        orderBy: { issuedAt: 'desc' },
        take: 5,
        include: { user: { select: { fullName: true } } },
      }),
    ]);

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
      recentCertificates: recentCerts,
    };
  }

  // ─── HELPER ──────────────────────────────────────────

  private async audit(userId: number, action: string, entity: string, entityId: string, meta: any) {
    // AuditLog.entityId é Int? no schema; os IDs deste módulo são cuid (String),
    // por isso guardamos o id real dentro de metadata (sempre JSON.stringify).
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        metadata: JSON.stringify({ ...meta, entityId }),
      },
    });
  }
}

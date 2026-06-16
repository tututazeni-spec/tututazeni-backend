# INNOVA — Módulo 5: Certificação Digital
> Mesmo padrão dos Módulos 1, 2, 3 e 4
> Referência: Credly + DocuSign + Badgr + Open Badges 2.0

---

## ⚠️ REGRAS ABSOLUTAS DO INNOVA

```
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000
- NOTA: já existe um modelo Certificate no INNOVA.
  Este módulo CRIA novos modelos (templates, badges)
  e EXPANDE o Certificate com verificationCode.
```

---

## CHECKLIST OBRIGATÓRIO

```
□ Schema Prisma (templates + badges + expandir Certificate) + migrate dev
□ DTOs (template + issue-certificate + badge + issue-badge + revoke + filter)
□ Service completo (emissão + verificação pública + revogação + badges + dashboard)
□ Controller completo (Swagger + Guards + rota PÚBLICA de verificação)
□ Module registado no AppModule
□ Spec file (8 testes mínimo)
□ Bruno CLI (6 ficheiros .bru)
□ Frontend page.tsx (lista certificados + loading + paginação)
□ Frontend verify/[code]/page.tsx (página PÚBLICA de verificação)
□ Frontend templates/page.tsx (gestão de templates)
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/certification/ → passa
□ git commit descritivo
```

---

## PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

model CertificateTemplate {
  id           String   @id @default(cuid())
  name         String
  description  String?
  type         CertificateTemplateType @default(COURSE)
  html         String
  cssStyle     String?
  logoUrl      String?
  signatureUrl String?
  signatoryName String?
  signatoryTitle String?
  isDefault    Boolean  @default(false)
  isActive     Boolean  @default(true)
  validityDays Int?
  createdById  String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  createdBy User                 @relation("TemplateCreator", fields: [createdById], references: [id])
  certificates IssuedCertificate[]

  @@index([type])
  @@index([isDefault])
  @@index([isActive])
  @@index([deletedAt])
}

model IssuedCertificate {
  id               String   @id @default(cuid())
  code             String   @unique
  verificationCode String   @unique
  hashCode         String
  userId           String
  templateId       String?
  courseId         String?
  programId        String?
  title            String
  recipientName    String
  issuerName       String   @default("INNOVA")
  type             CertificateTemplateType @default(COURSE)
  score            Float?
  pdfUrl           String?
  publicUrl        String?
  linkedInUrl      String?
  isRevoked        Boolean  @default(false)
  revokedAt        DateTime?
  revokeReason     String?
  revokedById      String?
  issuedAt         DateTime @default(now())
  expiresAt        DateTime?
  downloadCount    Int      @default(0)
  verifyCount      Int      @default(0)
  metadata         String?
  issuedById       String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?

  user      User                 @relation("CertRecipient", fields: [userId],   references: [id])
  template  CertificateTemplate? @relation(fields: [templateId], references: [id])
  issuedBy  User                 @relation("CertIssuer",    fields: [issuedById], references: [id])

  @@index([userId])
  @@index([courseId])
  @@index([type])
  @@index([isRevoked])
  @@index([issuedAt])
  @@index([deletedAt])
}

model DigitalBadge {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  description String
  imageUrl    String
  criteria    String
  skills      String[]
  level       BadgeLevel @default(BASIC)
  issuerName  String   @default("INNOVA")
  courseId    String?
  programId   String?
  isActive    Boolean  @default(true)
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  createdBy User            @relation("BadgeCreator", fields: [createdById], references: [id])
  issuances BadgeIssuance[]

  @@index([level])
  @@index([isActive])
  @@index([deletedAt])
}

model BadgeIssuance {
  id           String   @id @default(cuid())
  badgeId      String
  userId       String
  assertionId  String   @unique @default(cuid())
  verifyCode   String   @unique
  evidenceUrl  String?
  shareUrl     String?
  isRevoked    Boolean  @default(false)
  revokedAt    DateTime?
  revokeReason String?
  issuedAt     DateTime @default(now())
  expiresAt    DateTime?
  issuedById   String
  createdAt    DateTime @default(now())
  deletedAt    DateTime?

  badge    DigitalBadge @relation(fields: [badgeId], references: [id])
  user     User         @relation("BadgeRecipient", fields: [userId],   references: [id])
  issuedBy User         @relation("BadgeIssuer",    fields: [issuedById], references: [id])

  @@unique([badgeId, userId])
  @@index([userId])
  @@index([issuedAt])
  @@index([deletedAt])
}

enum CertificateTemplateType {
  COURSE PROGRAM COMPETENCY ATTENDANCE PARTICIPATION ACHIEVEMENT
}
enum BadgeLevel { BASIC INTERMEDIATE ADVANCED EXPERT MASTER }
```

```bash
npx prisma validate
npx prisma migrate dev --name "add_certification"
npx prisma generate
```

---

## PASSO 2 — DTOs

```typescript
// src/certification/dto/create-template.dto.ts
import {
  IsString, IsOptional, IsEnum, IsBoolean, IsInt, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateTemplateType } from '@prisma/client';

export class CreateTemplateDto {
  @ApiProperty({ example: 'Certificado de Conclusão de Curso' })
  @IsString() @Length(2, 150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CertificateTemplateType, default: 'COURSE' })
  @IsOptional() @IsEnum(CertificateTemplateType)
  type?: CertificateTemplateType;

  @ApiProperty({ description: 'HTML com {{recipientName}}, {{title}}, {{date}}' })
  @IsString()
  html: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  cssStyle?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  signatureUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  signatoryName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  signatoryTitle?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ description: 'Dias de validade (vazio = não expira)' })
  @IsOptional() @IsInt()
  validityDays?: number;
}

// src/certification/dto/issue-certificate.dto.ts
import {
  IsString, IsOptional, IsEnum, IsNumber, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateTemplateType } from '@prisma/client';

export class IssueCertificateDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty({ example: 'Curso de Segurança no Trabalho' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  programId?: string;

  @ApiPropertyOptional({ enum: CertificateTemplateType, default: 'COURSE' })
  @IsOptional() @IsEnum(CertificateTemplateType)
  type?: CertificateTemplateType;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  score?: number;
}

// src/certification/dto/create-badge.dto.ts
import {
  IsString, IsOptional, IsEnum, IsBoolean, IsArray, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadgeLevel } from '@prisma/client';

export class CreateBadgeDto {
  @ApiProperty({ example: 'Especialista em Liderança' })
  @IsString() @Length(2, 150)
  name: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ example: 'https://storage.innova.ao/badges/leadership.png' })
  @IsString()
  imageUrl: string;

  @ApiProperty({ example: 'Concluir 5 cursos de liderança com nota >= 80' })
  @IsString()
  criteria: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ enum: BadgeLevel, default: 'BASIC' })
  @IsOptional() @IsEnum(BadgeLevel)
  level?: BadgeLevel;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  programId?: string;
}

// src/certification/dto/issue-badge.dto.ts
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IssueBadgeDto {
  @ApiProperty()
  @IsString()
  badgeId: string;

  @ApiProperty()
  @IsString()
  userId: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  evidenceUrl?: string;
}

// src/certification/dto/revoke.dto.ts
import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RevokeDto {
  @ApiProperty({ example: 'Certificado emitido por engano' })
  @IsString() @Length(5, 500)
  reason: string;
}

// src/certification/dto/filter-certificate.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateTemplateType } from '@prisma/client';

export class FilterCertificateDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(CertificateTemplateType)
  type?: CertificateTemplateType;

  @ApiPropertyOptional() @IsOptional() @IsString()
  userId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean()
  isRevoked?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}

// src/certification/dto/index.ts
export * from './create-template.dto';
export * from './issue-certificate.dto';
export * from './create-badge.dto';
export * from './issue-badge.dto';
export * from './revoke.dto';
export * from './filter-certificate.dto';
```

---

## PASSO 3 — Service Completo

```typescript
// src/certification/certification.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import {
  CreateTemplateDto, IssueCertificateDto, CreateBadgeDto,
  IssueBadgeDto, RevokeDto, FilterCertificateDto,
} from './dto';

@Injectable()
export class CertificationService {
  constructor(private prisma: PrismaService) {}

  // ─── GERAÇÃO DE CÓDIGOS ──────────────────────────────

  private async generateCertCode(): Promise<string> {
    const last = await this.prisma.issuedCertificate.findFirst({
      orderBy: { code: 'desc' }, select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('CERT-', '')) + 1 : 1;
    return `CERT-${String(num).padStart(5, '0')}`;
  }

  private generateVerificationCode(): string {
    return `INNOVA-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private generateHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // ─── TEMPLATES ───────────────────────────────────────

  async createTemplate(dto: CreateTemplateDto, userId: string) {
    if (dto.isDefault) {
      await this.prisma.certificateTemplate.updateMany({
        where: { type: dto.type || 'COURSE', isDefault: true },
        data: { isDefault: false },
      });
    }
    const template = await this.prisma.certificateTemplate.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'CertificateTemplate', template.id, { name: dto.name });
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

  async issueCertificate(dto: IssueCertificateDto, issuerId: string) {
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
        code, verificationCode, hashCode,
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
      code, userId: dto.userId,
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: dto.userId,
        title: 'Certificado emitido',
        message: `O teu certificado "${dto.title}" está disponível.`,
        metadata: JSON.stringify({ certificateId: certificate.id, verificationCode }),
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
        where, skip: (page - 1) * limit, take: limit,
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

  async verify(verificationCode: string) {
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
        valid: false, reason: 'Certificado revogado',
        revokedAt: cert.revokedAt, revokeReason: cert.revokeReason,
      };
    }
    if (cert.expiresAt && cert.expiresAt < new Date()) {
      return { valid: false, reason: 'Certificado expirado', expiresAt: cert.expiresAt };
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

  async revokeCertificate(id: string, dto: RevokeDto, userId: string) {
    const cert = await this.findCertificateById(id);
    if (cert.isRevoked) throw new ConflictException('Certificado já revogado');

    const updated = await this.prisma.issuedCertificate.update({
      where: { id },
      data: {
        isRevoked: true, revokedAt: new Date(),
        revokeReason: dto.reason, revokedById: userId,
      },
    });
    await this.audit(userId, 'UPDATE', 'IssuedCertificate', id, {
      action: 'REVOKE', reason: dto.reason,
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: cert.userId,
        title: 'Certificado revogado',
        message: `O teu certificado "${cert.title}" foi revogado.`,
        metadata: JSON.stringify({ certificateId: id, reason: dto.reason }),
      },
    });
    return updated;
  }

  async downloadCertificate(id: string, userId: string) {
    const cert = await this.findCertificateById(id);
    await this.prisma.issuedCertificate.update({
      where: { id }, data: { downloadCount: { increment: 1 } },
    });
    await this.audit(userId, 'DOWNLOAD', 'IssuedCertificate', id, { code: cert.code });
    return { pdfUrl: cert.pdfUrl, publicUrl: cert.publicUrl, title: cert.title };
  }

  // ─── BADGES DIGITAIS ─────────────────────────────────

  private async generateBadgeCode(): Promise<string> {
    const last = await this.prisma.digitalBadge.findFirst({
      orderBy: { code: 'desc' }, select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('BDG-', '')) + 1 : 1;
    return `BDG-${String(num).padStart(5, '0')}`;
  }

  async createBadge(dto: CreateBadgeDto, userId: string) {
    const code = await this.generateBadgeCode();
    const badge = await this.prisma.digitalBadge.create({
      data: { ...dto, code, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'DigitalBadge', badge.id, { code, name: dto.name });
    return badge;
  }

  async findAllBadges() {
    return this.prisma.digitalBadge.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { level: 'asc' },
      include: { _count: { select: { issuances: true } } },
    });
  }

  async issueBadge(dto: IssueBadgeDto, issuerId: string) {
    const [badge, user] = await this.prisma.$transaction([
      this.prisma.digitalBadge.findUnique({ where: { id: dto.badgeId } }),
      this.prisma.user.findUnique({
        where: { id: dto.userId }, select: { fullName: true },
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
      badgeId: dto.badgeId, userId: dto.userId,
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: dto.userId,
        title: 'Novo badge conquistado!',
        message: `Conquistaste o badge "${badge.name}".`,
        metadata: JSON.stringify({ badgeId: badge.id, verifyCode }),
      },
    });
    return issuance;
  }

  async getMyBadges(userId: string) {
    return this.prisma.badgeIssuance.findMany({
      where: { userId, deletedAt: null, isRevoked: false },
      orderBy: { issuedAt: 'desc' },
      include: { badge: true },
    });
  }

  async getMyCertificates(userId: string, page = 1, limit = 20) {
    const where = { userId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.issuedCertificate.findMany({
        where, skip: (page - 1) * limit, take: limit,
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
      totalCerts, issuedThisMonth, revoked, expired,
      byType, totalBadges, badgesIssued, totalTemplates,
      totalVerifications, recentCerts,
    ] = await this.prisma.$transaction([
      this.prisma.issuedCertificate.count({ where: { deletedAt: null } }),
      this.prisma.issuedCertificate.count({ where: { issuedAt: { gte: startOfMonth } } }),
      this.prisma.issuedCertificate.count({ where: { isRevoked: true, deletedAt: null } }),
      this.prisma.issuedCertificate.count({
        where: { expiresAt: { lt: now }, isRevoked: false, deletedAt: null },
      }),
      this.prisma.issuedCertificate.groupBy({
        by: ['type'], where: { deletedAt: null }, _count: { id: true },
      }),
      this.prisma.digitalBadge.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.badgeIssuance.count({ where: { deletedAt: null, isRevoked: false } }),
      this.prisma.certificateTemplate.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.issuedCertificate.aggregate({
        _sum: { verifyCount: true }, where: { deletedAt: null },
      }),
      this.prisma.issuedCertificate.findMany({
        where: { deletedAt: null },
        orderBy: { issuedAt: 'desc' }, take: 5,
        include: { user: { select: { fullName: true } } },
      }),
    ]);

    return {
      totals: {
        totalCerts, issuedThisMonth, revoked, expired,
        valid: totalCerts - revoked - expired,
        totalBadges, badgesIssued, totalTemplates,
        totalVerifications: totalVerifications._sum.verifyCount || 0,
      },
      byType,
      recentCertificates: recentCerts,
    };
  }

  // ─── HELPER ──────────────────────────────────────────

  private async audit(userId: string, action: string, entity: string, entityId: string, meta: any) {
    await this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, metadata: JSON.stringify(meta) },
    });
  }
}
```

---

## PASSO 4 — Controller Completo (com rota PÚBLICA)

```typescript
// src/certification/certification.controller.ts
import {
  Controller, Get, Post, Put, Delete, Body,
  Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { Public }       from '../auth/decorators/public.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { CertificationService } from './certification.service';
import {
  CreateTemplateDto, IssueCertificateDto, CreateBadgeDto,
  IssueBadgeDto, RevokeDto, FilterCertificateDto,
} from './dto';

@ApiTags('Certificação Digital')
@Controller('certification')
export class CertificationController {
  constructor(private readonly service: CertificationService) {}

  // ─── ROTA PÚBLICA DE VERIFICAÇÃO (SEM AUTH) ──────────

  @Public()
  @Get('verify/:code')
  @ApiOperation({ summary: 'Verificar autenticidade de certificado (PÚBLICO)' })
  verify(@Param('code') code: string) {
    return this.service.verify(code);
  }

  // ─── TEMPLATES ───────────────────────────────────────

  @Post('templates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar template de certificado' })
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: any) {
    return this.service.createTemplate(dto, user.id);
  }

  @Get('templates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar templates' })
  findAllTemplates() {
    return this.service.findAllTemplates();
  }

  // ─── DASHBOARD ───────────────────────────────────────

  @Get('dashboard')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard de Certificação' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ─── CERTIFICADOS ────────────────────────────────────

  @Post('certificates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Emitir certificado' })
  issueCertificate(@Body() dto: IssueCertificateDto, @CurrentUser() user: any) {
    return this.service.issueCertificate(dto, user.id);
  }

  @Get('certificates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Listar certificados (paginado)' })
  findAllCertificates(@Query() filters: FilterCertificateDto) {
    return this.service.findAllCertificates(filters);
  }

  @Get('my-certificates')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Meus certificados' })
  getMyCertificates(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getMyCertificates(user.id, page, limit);
  }

  @Get('certificates/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Detalhe de certificado' })
  findCertificateById(@Param('id') id: string) {
    return this.service.findCertificateById(id);
  }

  @Post('certificates/:id/download')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Download de certificado' })
  download(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.downloadCertificate(id, user.id);
  }

  @Put('certificates/:id/revoke')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Revogar certificado' })
  revoke(@Param('id') id: string, @Body() dto: RevokeDto, @CurrentUser() user: any) {
    return this.service.revokeCertificate(id, dto, user.id);
  }

  // ─── BADGES ──────────────────────────────────────────

  @Post('badges')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar badge digital' })
  createBadge(@Body() dto: CreateBadgeDto, @CurrentUser() user: any) {
    return this.service.createBadge(dto, user.id);
  }

  @Get('badges')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Listar badges' })
  findAllBadges() {
    return this.service.findAllBadges();
  }

  @Post('badges/issue')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Atribuir badge a utilizador' })
  issueBadge(@Body() dto: IssueBadgeDto, @CurrentUser() user: any) {
    return this.service.issueBadge(dto, user.id);
  }

  @Get('my-badges')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Meus badges' })
  getMyBadges(@CurrentUser() user: any) {
    return this.service.getMyBadges(user.id);
  }
}
```

---

## PASSO 5 — Module

```typescript
// src/certification/certification.module.ts
import { Module }    from '@nestjs/common';
import { CertificationController } from './certification.controller';
import { CertificationService }    from './certification.service';
import { PrismaModule }            from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [CertificationController],
  providers:   [CertificationService],
  exports:     [CertificationService],
})
export class CertificationModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { CertificationModule } from './certification/certification.module';
imports: [ ...existentes..., CertificationModule ],
```

> NOTA: O decorador @Public() deve existir em
> src/auth/decorators/public.decorator.ts.
> Se não existir, cria-o:
> export const Public = () => SetMetadata('isPublic', true);
> E garante que o JwtAuthGuard respeita isPublic.

---

## PASSO 6 — Spec File (8 testes)

```typescript
// src/certification/certification.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { CertificationService } from './certification.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockUser = { fullName: 'João Teste', email: 'joao@teste.com' };
const mockCert = {
  id: 'cert-1', code: 'CERT-00001',
  verificationCode: 'INNOVA-123-ABCD',
  hashCode: 'hash123', userId: 'user-1',
  title: 'Curso Teste', recipientName: 'João Teste',
  type: 'COURSE', isRevoked: false, deletedAt: null,
  expiresAt: null, verifyCount: 0,
  user: mockUser, issuedBy: { fullName: 'Admin' }, template: null,
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
  certificateTemplate: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
    updateMany: jest.fn(), count: jest.fn(),
  },
  issuedCertificate: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
    findFirst: jest.fn(), update: jest.fn(), count: jest.fn(),
    groupBy: jest.fn(), aggregate: jest.fn(),
  },
  digitalBadge: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
    findFirst: jest.fn(), count: jest.fn(),
  },
  badgeIssuance: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(),
  },
  auditLog:        { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction:    jest.fn(),
};

describe('CertificationService', () => {
  let service: CertificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<CertificationService>(CertificationService);
    jest.clearAllMocks();
  });

  describe('issueCertificate', () => {
    it('deve emitir certificado com código e verificação', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.issuedCertificate.findFirst.mockResolvedValue(null);
      mockPrisma.issuedCertificate.create.mockResolvedValue(mockCert);
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.issueCertificate(
        { userId: 'user-1', title: 'Curso Teste' },
        'issuer-1',
      );
      expect(result.code).toBe('CERT-00001');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
    });

    it('deve lançar NotFoundException se utilizador não existir', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.issueCertificate({ userId: 'nao-existe', title: 'X' }, 'issuer-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verify', () => {
    it('deve retornar valid:true para certificado válido', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue(mockCert);
      mockPrisma.issuedCertificate.update.mockResolvedValue({});

      const result = await service.verify('INNOVA-123-ABCD');
      expect(result.valid).toBe(true);
      expect(result.certificate?.holder).toBe('João Teste');
    });

    it('deve retornar valid:false para código inválido', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue(null);
      const result = await service.verify('CODIGO-INVALIDO');
      expect(result.valid).toBe(false);
    });

    it('deve retornar valid:false para certificado revogado', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue({
        ...mockCert, isRevoked: true, revokedAt: new Date(),
      });
      const result = await service.verify('INNOVA-123-ABCD');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('revogado');
    });
  });

  describe('revokeCertificate', () => {
    it('deve revogar e notificar o utilizador', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue(mockCert);
      mockPrisma.issuedCertificate.update.mockResolvedValue({ ...mockCert, isRevoked: true });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.revokeCertificate('cert-1', { reason: 'Erro de emissão' }, 'user-1');
      expect(result.isRevoked).toBe(true);
      expect(mockPrisma.notificationLog.create).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se já revogado', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue({ ...mockCert, isRevoked: true });
      await expect(
        service.revokeCertificate('cert-1', { reason: 'X' }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('issueBadge', () => {
    it('deve lançar ConflictException se já possui o badge', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'badge-1', name: 'Badge Teste' },
        { fullName: 'João Teste' },
      ]);
      mockPrisma.badgeIssuance.findUnique.mockResolvedValue({ id: 'iss-1', deletedAt: null });
      await expect(
        service.issueBadge({ badgeId: 'badge-1', userId: 'user-1' }, 'issuer-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getDashboard', () => {
    it('deve retornar totais de certificados e badges', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        20, 5, 2, 1, [], 3, 8, 4, { _sum: { verifyCount: 50 } }, [],
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result.totals.valid).toBe(17);
      expect(result.totals.totalVerifications).toBe(50);
    });
  });
});
```

---

## PASSO 7 — Bruno CLI (6 ficheiros)

```
# bruno/certification/01-emitir-certificado.bru
meta { name: Emitir Certificado  type: http  seq: 1 }
post { url: {{baseUrl}}/certification/certificates  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "userId": "{{testUserId}}",
    "title": "Curso Bruno de Teste",
    "type": "COURSE",
    "score": 85
  }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código CERT-", function() { expect(res.body.code).to.match(/^CERT-\d{5}$/); });
  test("Tem verificationCode", function() { expect(res.body.verificationCode).to.contain("INNOVA-"); });
}
script:post-response {
  if (res.status === 201) {
    bru.setEnvVar("certId", res.body.id);
    bru.setEnvVar("verifyCode", res.body.verificationCode);
  }
}

---

# bruno/certification/02-verificar-publico.bru
meta { name: Verificar Certificado (Público)  type: http  seq: 2 }
get { url: {{baseUrl}}/certification/verify/{{verifyCode}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Certificado válido", function() { expect(res.body.valid).to.equal(true); });
  test("Tem dados do titular", function() { expect(res.body.certificate).to.have.property("holder"); });
}

---

# bruno/certification/03-listar.bru
meta { name: Listar Certificados  type: http  seq: 3 }
get { url: {{baseUrl}}/certification/certificates?page=1&limit=20  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Paginação", function() { expect(res.body).to.have.property("totalPages"); });
}

---

# bruno/certification/04-dashboard.bru
meta { name: Dashboard Certificação  type: http  seq: 4 }
get { url: {{baseUrl}}/certification/dashboard  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem totais", function() {
    expect(res.body).to.have.property("totals");
    expect(res.body.totals).to.have.property("valid");
  });
}

---

# bruno/certification/05-revogar.bru
meta { name: Revogar Certificado  type: http  seq: 5 }
put { url: {{baseUrl}}/certification/certificates/{{certId}}/revoke  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "reason": "Certificado emitido por engano no teste Bruno" }
}
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Revogado", function() { expect(res.body.isRevoked).to.equal(true); });
}

---

# bruno/certification/06-verificar-revogado.bru
meta { name: Verificar Revogado  type: http  seq: 6 }
get { url: {{baseUrl}}/certification/verify/{{verifyCode}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Inválido após revogação", function() { expect(res.body.valid).to.equal(false); });
  test("Razão revogado", function() { expect(res.body.reason).to.contain("revogado"); });
}
```

---

## PASSO 8 — Frontend (página PÚBLICA de verificação)

```tsx
// frontend/app/verify/[code]/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function VerifyCertificatePage() {
  const params = useParams();
  const code = params.code as string;
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`/api/certification/verify/${code}`);
        const json = await res.json();
        setResult(json);
      } catch {
        setResult({ valid: false, reason: 'Erro ao verificar' });
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, [code]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
        {result?.valid ? (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-green-700 mb-2">Certificado Válido</h1>
            <p className="text-gray-500 mb-6">Este certificado é autêntico e foi emitido pela INNOVA</p>
            <div className="bg-gray-50 rounded-lg p-4 text-left space-y-3">
              <div>
                <span className="text-xs text-gray-400 uppercase">Titular</span>
                <p className="font-semibold">{result.certificate.holder}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">Certificado</span>
                <p className="font-semibold">{result.certificate.title}</p>
              </div>
              {result.certificate.score && (
                <div>
                  <span className="text-xs text-gray-400 uppercase">Nota</span>
                  <p className="font-semibold">{result.certificate.score}%</p>
                </div>
              )}
              <div>
                <span className="text-xs text-gray-400 uppercase">Emitido em</span>
                <p className="font-semibold">
                  {new Date(result.certificate.issuedAt).toLocaleDateString('pt-AO')}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-400 uppercase">Código de Verificação</span>
                <p className="font-mono text-sm">{result.certificate.verificationCode}</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-red-700 mb-2">Certificado Inválido</h1>
            <p className="text-gray-600">{result?.reason}</p>
            {result?.revokeReason && (
              <p className="text-sm text-gray-400 mt-4">Motivo: {result.revokeReason}</p>
            )}
          </>
        )}
        <p className="text-xs text-gray-300 mt-8">INNOVA — Verificação de Certificados</p>
      </div>
    </div>
  );
}
```

```tsx
// frontend/app/certificates/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

export default function MyCertificatesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/certification/my-certificates', { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar certificados');
      const json = await res.json();
      setData(json.data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="p-6 space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
        <button onClick={fetchData} className="ml-4 underline">Tentar novamente</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Os Meus Certificados</h1>
      {data.length === 0 ? (
        <p className="text-gray-400">Ainda não tens certificados emitidos.</p>
      ) : (
        <div className="grid gap-4">
          {data.map((c: any) => (
            <div key={c.id} className="bg-white rounded-lg shadow p-5 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-gray-900">{c.title}</h3>
                <p className="text-sm text-gray-500 font-mono">{c.code}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Emitido em {new Date(c.issuedAt).toLocaleDateString('pt-AO')}
                  {c.isRevoked && <span className="text-red-500 ml-2">• Revogado</span>}
                </p>
              </div>
              <div className="flex gap-2">
                <a href={`/verify/${c.verificationCode}`} target="_blank"
                  className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  Verificar
                </a>
                {!c.isRevoked && (
                  <a href={c.publicUrl} target="_blank"
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                    Descarregar
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## PROMPT PARA O CLAUDE CODE

```
O Módulo 4 (Biblioteca Digital) está completo e aprovado.
Implementa agora o Módulo 5 — Certificação Digital.
Lê o CERTIFICACAO-DIGITAL-GUIDE.md na raiz do projecto.

ATENÇÃO: já existe um modelo Certificate no INNOVA.
Este módulo cria NOVOS modelos:
IssuedCertificate, CertificateTemplate, DigitalBadge, BadgeIssuance.
NÃO modifiques o Certificate antigo — usa IssuedCertificate.

Segue EXACTAMENTE estes 22 passos:

1. Verifica os modelos e enums existentes no schema
   (pode já existir badgeAward — não confundir)

2. Adiciona ao prisma/schema.prisma:
   CertificateTemplate, IssuedCertificate,
   DigitalBadge, BadgeIssuance + enums

3. npx prisma validate
4. npx prisma migrate dev --name "add_certification"
5. npx prisma generate

6. Verifica se existe src/auth/decorators/public.decorator.ts
   Se não existir, cria-o e garante que o JwtAuthGuard
   respeita a metadata isPublic (rota pública de verificação)

7. Cria src/certification/dto/ com os 6 DTOs

8. Cria src/certification/certification.service.ts

9. Cria src/certification/certification.controller.ts
   (com a rota PÚBLICA /verify/:code)

10. Cria src/certification/certification.module.ts

11. Adiciona CertificationModule ao src/app.module.ts

12. npm run build → DEVE PASSAR com 0 erros

13. Cria src/certification/certification.service.spec.ts
    (8 testes conforme o guia)

14. npm run test -- --testPathPattern=certification --forceExit
    → DEVE PASSAR com 0 falhas

15. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

16. Cria bruno/certification/ com os 6 ficheiros .bru
    (precisa de testUserId no environment)

17. Com o backend a correr:
    npx bru run bruno/certification/ --env local
    → TODOS devem passar
    IMPORTANTE: a verificação pública (02 e 06)
    NÃO usa token — confirma que funciona sem auth

18. Cria frontend/app/verify/[code]/page.tsx
    (página PÚBLICA de verificação — sem login)

19. Cria frontend/app/certificates/page.tsx
    (meus certificados com botão verificar/descarregar)

20. Cria frontend/app/certification/templates/page.tsx
    (gestão de templates — só ADMIN/RH)

21. Adiciona ao sidebar: link para /certificates
    E garante que /verify/[code] NÃO precisa de login
    (adiciona ao matcher de excepções do middleware.ts)

22. git add -A
    git commit -m "feat: Certificação Digital completa - verificação pública, badges, 8 specs, 6 bruno" --no-verify
    git push origin main

    Mostra resumo:
    - Build: OK / FALHOU
    - Testes: X/8 passaram
    - Cobertura: X%
    - Bruno: X/6 passaram
    PARA e espera confirmação para Módulo 6

REGRAS ABSOLUTAS DO INNOVA:
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000

EXECUTA UMA OPERAÇÃO DE CADA VEZ.
A CADA 20 MINUTOS FAZ COMMIT PARCIAL.
SE FICAR LENTA (>25 min): commit e para.
```

---

*INNOVA — Certificação Digital Guide v1.0*
*Mesmo padrão dos Módulos 1, 2, 3 e 4*
*Credly + DocuSign + Badgr + Open Badges 2.0*
*Verificação pública + SHA256 + Badges + DTOs + Service + Controller + Module + Spec + Bruno + Frontend*

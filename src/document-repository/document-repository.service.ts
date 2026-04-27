// ─── src/document-repository/document-repository.service.ts ──────────────────
import {
  Injectable, NotFoundException, ForbiddenException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService }  from '../common/services/audit.service';
import * as crypto       from 'crypto';
import {
  DocumentFilterDto,
  CreateDocumentDto, UpdateDocumentDto, NewVersionDto,
  GrantPermissionDto, CreateShareLinkDto, CreateDocCategoryDto,
  DocSensitivity, DocStatus, DocCategory, DocAuditAction, DocPermission,
} from './document-repository.dto';

// ─── Retention policies (Angola defaults, configurável por categoria) ─────────
const DEFAULT_RETENTION: Partial<Record<DocCategory, number>> = {
  [DocCategory.HEALTH]:      20,
  [DocCategory.LABOUR]:      10,
  [DocCategory.PAYROLL]:     10,
  [DocCategory.COMPLIANCE]:  10,
  [DocCategory.CORPORATE]:   5,
  [DocCategory.RECRUITMENT]: 1,
  [DocCategory.LEARNING]:    5,
  [DocCategory.PERSONAL]:    5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAccessWhere(userId: number, userDept?: string, role?: string) {
  if (role === 'ADMIN' || role === 'RH') return {}; // acesso total

  return {
    OR: [
      { sensitivity: DocSensitivity.PUBLIC },
      { sensitivity: DocSensitivity.INTERNAL },
      { createdById: userId },
      { ownerId: userId },
      {
        sensitivity: DocSensitivity.CONFIDENTIAL,
        department: userDept ?? '__NONE__',
      },
      {
        permissions: {
          some: { userId, expiresAt: { OR: [{ gt: new Date() }, { equals: null }] } },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DocumentRepositoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // CATEGORIES
  // ══════════════════════════════════════════════════════════════════

  async createCategory(dto: CreateDocCategoryDto) {
    return this.prisma.docCategoryModel.create({ data: { ...dto, active: dto.active ?? true } });
  }

  async getCategories() {
    return this.prisma.docCategoryModel.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  // ══════════════════════════════════════════════════════════════════
  // DOCUMENTS — LIST / SEARCH
  // ══════════════════════════════════════════════════════════════════

  async findAll(filters: DocumentFilterDto, userId: number, userDept?: string, role?: string) {
    const {
      page = 1, limit = 20, search, category, sensitivity, status = DocStatus.ACTIVE,
      department, ownerId, tag, from, to, expiringSoon, expired,
      sortBy = 'createdAt', sortOrder = 'desc',
    } = filters;
    const skip = (page - 1) * limit;

    const accessWhere = buildAccessWhere(userId, userDept, role);
    const where: any = { ...accessWhere, status };

    if (search) {
      where.AND = [
        { OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { tags: { has: search } },
          { ocrText: { contains: search, mode: 'insensitive' } },
        ]},
      ];
    }

    if (category)    where.category   = category;
    if (sensitivity) where.sensitivity = sensitivity;
    if (department)  where.department  = { contains: department, mode: 'insensitive' };
    if (ownerId)     where.ownerId     = ownerId;
    if (tag)         where.tags        = { has: tag };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }
    if (expiringSoon) {
      const soon = new Date(Date.now() + 30 * 86400000);
      where.expiresAt = { gt: new Date(), lte: soon };
    }
    if (expired) {
      where.expiresAt = { lt: new Date() };
      where.status    = DocStatus.ACTIVE;
    }

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where, skip, take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
          owner:     { select: { id: true, fullName: true } },
          _count:    { select: { versions: true, downloads: true, permissions: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number, requesterId?: number) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        docCategory: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 10 },
        permissions: { include: { user: { select: { id: true, fullName: true } } } },
        _count: { select: { downloads: true, versions: true } },
      },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    if (requesterId) {
      await this.logAudit(id, requesterId, DocAuditAction.VIEWED);
    }

    return doc;
  }

  // ══════════════════════════════════════════════════════════════════
  // DOCUMENTS — CREATE / UPDATE / DELETE
  // ══════════════════════════════════════════════════════════════════

  async create(createdById: number, dto: CreateDocumentDto) {
    // DLP: documentos sensíveis não podem ser PUBLIC
    if (
      [DocSensitivity.CONFIDENTIAL, DocSensitivity.RESTRICTED, DocSensitivity.SECRET].includes(dto.sensitivity) &&
      dto.sensitivity === DocSensitivity.PUBLIC
    ) {
      throw new BadRequestException('Documentos confidenciais não podem ter acesso público');
    }

    // Calcular data de retenção mínima (legal)
    const retentionYears = DEFAULT_RETENTION[dto.category] ?? 5;
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);

    const doc = await this.prisma.document.create({
      data: {
        ...dto,
        tags:          dto.tags ?? [],
        status:        DocStatus.ACTIVE,
        origin:        dto.origin ?? 'UPLOAD',
        version:       '1.0',
        expiresAt:     dto.expiresAt ? new Date(dto.expiresAt) : null,
        retentionUntil,
        createdById,
        // Criar versão inicial
        versions: {
          create: {
            versionNumber: 1,
            fileUrl:       dto.fileUrl,
            mimeType:      dto.mimeType,
            fileSize:      dto.fileSize,
            fileName:      dto.fileName ?? dto.title,
            uploadedById:  createdById,
            changeDescription: 'Versão inicial',
          },
        },
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });

    await this.audit.log({ action: 'DOC_UPLOADED', entityType: 'Document', entityId: doc.id, userId: createdById, metadata: { title: dto.title, category: dto.category } });
    await this.logAudit(doc.id, createdById, DocAuditAction.UPLOADED);

    // Auto-notificar owner se diferente do criador
    if (dto.ownerId && dto.ownerId !== createdById) {
      await this.notify(dto.ownerId, 'DOC_LINKED', `Um documento foi vinculado ao seu perfil: "${dto.title}"`);
    }

    return doc;
  }

  async update(id: number, dto: UpdateDocumentDto, updatedById: number) {
    const current = await this.findOne(id);

    // Protecção: documentos expirados/arquivados não editáveis
    if ([DocStatus.ARCHIVED, DocStatus.DELETED].includes(current.status as DocStatus)) {
      throw new BadRequestException('Documento arquivado ou eliminado não pode ser editado');
    }

    // DLP check
    if (dto.sensitivity && [DocSensitivity.CONFIDENTIAL, DocSensitivity.SECRET].includes(dto.sensitivity as DocSensitivity)) {
      // Só admin/RH pode tornar um doc confidencial (controlado no controller)
    }

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : current.expiresAt,
      },
    });

    await this.logAudit(id, updatedById, DocAuditAction.UPDATED);
    return updated;
  }

  async newVersion(id: number, dto: NewVersionDto, uploadedById: number) {
    const doc = await this.findOne(id);

    const lastVersion = await this.prisma.docVersion.findFirst({
      where: { documentId: id }, orderBy: { versionNumber: 'desc' },
    });
    const nextNum = (lastVersion?.versionNumber ?? 0) + 1;
    const nextVer = `${Math.floor(nextNum)}.0`;

    await this.prisma.docVersion.create({
      data: {
        documentId:    id,
        versionNumber: nextNum,
        fileUrl:       dto.fileUrl,
        mimeType:      dto.mimeType,
        fileSize:      dto.fileSize,
        fileName:      dto.fileName,
        uploadedById,
        changeDescription: dto.changeDescription,
      },
    });

    await this.prisma.document.update({
      where: { id },
      data: { fileUrl: dto.fileUrl, version: nextVer },
    });

    await this.logAudit(id, uploadedById, DocAuditAction.VERSIONED, { version: nextVer });
    return this.findOne(id);
  }

  async restoreVersion(documentId: number, versionId: number, restoredById: number) {
    const version = await this.prisma.docVersion.findUnique({ where: { id: versionId } });
    if (!version || version.documentId !== documentId) throw new NotFoundException('Versão não encontrada');

    await this.prisma.document.update({
      where: { id: documentId },
      data: { fileUrl: version.fileUrl, version: `${version.versionNumber}.0 (restaurado)` },
    });

    await this.logAudit(documentId, restoredById, DocAuditAction.VERSIONED, { restored: version.versionNumber });
    return this.findOne(documentId);
  }

  async archive(id: number, archivedById: number, reason?: string) {
    const doc = await this.findOne(id);

    // Verificar retenção legal: não pode arquivar antes do prazo
    if (doc.retentionUntil && doc.retentionUntil > new Date()) {
      throw new BadRequestException(
        `Documento não pode ser arquivado antes de ${doc.retentionUntil.toLocaleDateString('pt-AO')} (retenção legal)`
      );
    }

    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.ARCHIVED, archivedAt: new Date(), archiveReason: reason },
    });

    await this.logAudit(id, archivedById, DocAuditAction.ARCHIVED, { reason });
    return { message: 'Documento arquivado' };
  }

  async softDelete(id: number, deletedById: number, reason: string) {
    const doc = await this.findOne(id);

    if (doc.retentionUntil && doc.retentionUntil > new Date()) {
      throw new ForbiddenException(
        `Não pode ser eliminado antes de ${doc.retentionUntil.toLocaleDateString('pt-AO')} (retenção legal)`
      );
    }

    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.DELETED, deletedAt: new Date(), deleteReason: reason },
    });

    await this.logAudit(id, deletedById, DocAuditAction.DELETED, { reason });
    return { message: 'Documento marcado para eliminação' };
  }

  // ══════════════════════════════════════════════════════════════════
  // DOWNLOAD
  // ══════════════════════════════════════════════════════════════════

  async download(id: number, userId: number) {
    const doc = await this.findOne(id);

    if (doc.status !== DocStatus.ACTIVE) {
      throw new BadRequestException('Documento não está activo');
    }

    await this.prisma.docDownload.create({ data: { documentId: id, userId } });
    await this.prisma.document.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
    await this.logAudit(id, userId, DocAuditAction.DOWNLOADED);

    return { fileUrl: doc.fileUrl, title: doc.title, mimeType: doc.mimeType, version: doc.version };
  }

  // ══════════════════════════════════════════════════════════════════
  // PERMISSIONS
  // ══════════════════════════════════════════════════════════════════

  async grantPermission(dto: GrantPermissionDto, grantedById: number) {
    const doc = await this.findOne(dto.documentId);

    return this.prisma.docPermission.create({
      data: {
        documentId:  dto.documentId,
        userId:      dto.userId,
        department:  dto.department,
        permissions: dto.permissions,
        expiresAt:   dto.expiresAt ? new Date(dto.expiresAt) : null,
        grantedById,
      },
    });
  }

  async revokePermission(permissionId: number, revokedById: number) {
    return this.prisma.docPermission.delete({ where: { id: permissionId } });
  }

  // ══════════════════════════════════════════════════════════════════
  // SHARE LINKS
  // ══════════════════════════════════════════════════════════════════

  async createShareLink(dto: CreateShareLinkDto, createdById: number) {
    const doc = await this.findOne(dto.documentId);

    // DLP: documentos confidenciais/secretos não compartilháveis externamente
    if ([DocSensitivity.SECRET, DocSensitivity.RESTRICTED].includes(doc.sensitivity as DocSensitivity)) {
      throw new ForbiddenException('Este documento não pode ser partilhado externamente');
    }

    const token      = crypto.randomBytes(32).toString('hex');
    const expiry     = dto.expiresAt ? new Date(dto.expiresAt) : new Date(Date.now() + 7 * 86400000);
    const hashedPass = dto.password ? crypto.createHash('sha256').update(dto.password).digest('hex') : null;

    const link = await this.prisma.docShareLink.create({
      data: {
        documentId:   dto.documentId,
        token,
        access:       dto.access,
        expiresAt:    expiry,
        passwordHash: hashedPass,
        maxDownloads: dto.maxDownloads,
        createdById,
      },
    });

    await this.logAudit(dto.documentId, createdById, DocAuditAction.SHARED, { linkId: link.id });

    return {
      ...link,
      shareUrl: `${process.env.APP_URL ?? 'https://innova.ao'}/share/${token}`,
    };
  }

  async resolveShareLink(token: string, password?: string) {
    const link = await this.prisma.docShareLink.findUnique({
      where: { token },
      include: { document: true },
    });

    if (!link) throw new NotFoundException('Link inválido');
    if (link.expiresAt < new Date()) throw new BadRequestException('Link expirado');
    if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
      throw new BadRequestException('Limite de downloads atingido');
    }

    if (link.passwordHash) {
      const hash = crypto.createHash('sha256').update(password ?? '').digest('hex');
      if (hash !== link.passwordHash) throw new ForbiddenException('Password incorrecta');
    }

    await this.prisma.docShareLink.update({
      where: { token },
      data: { downloadCount: { increment: 1 } },
    });

    return link.document;
  }

  // ══════════════════════════════════════════════════════════════════
  // EXPIRY MANAGEMENT
  // ══════════════════════════════════════════════════════════════════

  async processExpiredDocuments() {
    const now = new Date();
    const expired = await this.prisma.document.findMany({
      where: { expiresAt: { lt: now }, status: DocStatus.ACTIVE },
    });

    for (const doc of expired) {
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: DocStatus.EXPIRED },
      });

      // Notificar owner
      if (doc.ownerId)    await this.notify(doc.ownerId,    'DOC_EXPIRED', `O documento "${doc.title}" expirou`);
      if (doc.createdById) await this.notify(doc.createdById, 'DOC_EXPIRED', `O documento "${doc.title}" expirou`);
    }

    return { processed: expired.length };
  }

  async getExpiringSoon(days = 30) {
    const from = new Date();
    const to   = new Date(Date.now() + days * 86400000);

    return this.prisma.document.findMany({
      where: { expiresAt: { gt: from, lte: to }, status: DocStatus.ACTIVE },
      include: {
        owner:     { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async renewDocument(id: number, newExpiresAt: string, renewedById: number) {
    await this.prisma.document.update({
      where: { id },
      data: { expiresAt: new Date(newExpiresAt), status: DocStatus.ACTIVE },
    });
    await this.logAudit(id, renewedById, DocAuditAction.UPDATED, { action: 'RENEWED', newExpiresAt });
    return this.findOne(id);
  }

  // ══════════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ══════════════════════════════════════════════════════════════════

  async getAuditLog(documentId: number, limit = 50) {
    return this.prisma.docAuditLog.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async getAccessLog(documentId: number) {
    return this.prisma.docDownload.findMany({
      where: { documentId },
      orderBy: { downloadedAt: 'desc' },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // DASHBOARD & ANALYTICS
  // ══════════════════════════════════════════════════════════════════

  async getDashboard() {
    const now = new Date();
    const soon = new Date(Date.now() + 30 * 86400000);

    const [
      total, active, expired, expiringSoon, archived,
      byCategory, totalSize, newThisMonth, recentDownloads,
    ] = await Promise.all([
      this.prisma.document.count(),
      this.prisma.document.count({ where: { status: DocStatus.ACTIVE } }),
      this.prisma.document.count({ where: { status: DocStatus.EXPIRED } }),
      this.prisma.document.count({ where: { expiresAt: { gt: now, lte: soon }, status: DocStatus.ACTIVE } }),
      this.prisma.document.count({ where: { status: DocStatus.ARCHIVED } }),
      this.prisma.document.groupBy({ by: ['category'], where: { status: DocStatus.ACTIVE }, _count: true, orderBy: { _count: { category: 'desc' } } }),
      this.prisma.document.aggregate({ where: { status: DocStatus.ACTIVE }, _sum: { fileSize: true } }),
      this.prisma.document.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } }),
      this.prisma.docDownload.count({ where: { downloadedAt: { gte: new Date(Date.now() - 30 * 86400000) } } }),
    ]);

    return {
      kpis: {
        total, active, expired, expiringSoon, archived,
        newThisMonth, recentDownloads,
        totalSizeGB: +((totalSize._sum.fileSize ?? 0) / 1073741824).toFixed(2),
      },
      byCategory,
    };
  }

  async getStats(department?: string) {
    const where: any = { status: DocStatus.ACTIVE };
    if (department) where.department = { contains: department, mode: 'insensitive' };

    const [byCategory, bySensitivity, topDownloaded, recentUploads] = await Promise.all([
      this.prisma.document.groupBy({ by: ['category'], where, _count: true }),
      this.prisma.document.groupBy({ by: ['sensitivity'], where, _count: true }),
      this.prisma.document.findMany({
        where, orderBy: { downloadCount: 'desc' }, take: 5,
        select: { id: true, title: true, downloadCount: true, category: true },
      }),
      this.prisma.document.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, title: true, createdAt: true, category: true, createdBy: { select: { fullName: true } } },
      }),
    ]);

    return { byCategory, bySensitivity, topDownloaded, recentUploads };
  }

  // ══════════════════════════════════════════════════════════════════
  // TAGS
  // ══════════════════════════════════════════════════════════════════

  async getAllTags() {
    const docs = await this.prisma.document.findMany({
      where: { status: DocStatus.ACTIVE },
      select: { tags: true },
    });
    const tagCount: Record<string, number> = {};
    for (const doc of docs) {
      for (const tag of doc.tags) {
        tagCount[tag] = (tagCount[tag] ?? 0) + 1;
      }
    }
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }

  // ══════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════════════════

  private async logAudit(documentId: number, userId: number, action: DocAuditAction, metadata?: any) {
    try {
      await this.prisma.docAuditLog.create({
        data: { documentId, userId, action, metadata: metadata as any },
      });
    } catch {}
  }

  private async notify(userId: number, type: string, message: string) {
    try {
      await this.prisma.notificationLog.create({ data: { userId, type, message, success: true } });
    } catch {}
  }
}
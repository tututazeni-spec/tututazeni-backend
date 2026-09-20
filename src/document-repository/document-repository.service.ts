// ─── src/document-repository/document-repository.service.ts ──────────────────
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { sanitizeForLog } from '../common/logging/sanitize';
import * as crypto from 'crypto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { hashSharePassword, verifySharePassword } from './share-password';
import {
  DocumentFilterDto,
  CreateDocumentDto,
  UpdateDocumentDto,
  NewVersionDto,
  GrantPermissionDto,
  CreateShareLinkDto,
  CreateDocCategoryDto,
} from './document-repository.dto';
import {
  Prisma,
  DocSensitivity,
  DocStatus,
  DocCategoryType,
  DocAuditAction,
  DocOrigin,
} from '@prisma/client';

// ─── Retention policies (Angola defaults, configurável por categoria) ─────────
const DEFAULT_RETENTION: Partial<Record<DocCategoryType, number>> = {
  [DocCategoryType.HEALTH]: 20,
  [DocCategoryType.LABOUR]: 10,
  [DocCategoryType.PAYROLL]: 10,
  [DocCategoryType.COMPLIANCE]: 10,
  [DocCategoryType.CORPORATE]: 5,
  [DocCategoryType.RECRUITMENT]: 1,
  [DocCategoryType.LEARNING]: 5,
  [DocCategoryType.PERSONAL]: 5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// sortBy vem de DocumentFilterDto só com @IsString() (sem whitelist) — um
// valor arbitrário usado directo como chave dinâmica no orderBy do Prisma
// rebentava sempre com erro de validação (500) em vez de simplesmente
// ignorar/cair no default. Restringido aqui aos campos ordenáveis reais.
const SORTABLE_DOCUMENT_FIELDS = [
  'createdAt',
  'updatedAt',
  'title',
  'downloadCount',
  'expiresAt',
  'fileSize',
] as const;
type SortableDocumentField = (typeof SORTABLE_DOCUMENT_FIELDS)[number];

function resolveSortBy(sortBy: string | undefined): SortableDocumentField {
  return SORTABLE_DOCUMENT_FIELDS.includes(sortBy as SortableDocumentField)
    ? (sortBy as SortableDocumentField)
    : 'createdAt';
}

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
          some: {
            userId,
            OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
          },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DocumentRepositoryService {
  private readonly logger = new Logger(DocumentRepositoryService.name);

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
    return this.prisma.read.docCategoryModel.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // DOCUMENTS — LIST / SEARCH
  // ══════════════════════════════════════════════════════════════════

  async findAll(filters: DocumentFilterDto, userId: number, role?: string) {
    const {
      page = 1,
      limit = 20,
      search,
      category,
      sensitivity,
      status = DocStatus.ACTIVE,
      department,
      ownerId,
      tag,
      from,
      to,
      expiringSoon,
      expired,
      sortBy,
      sortOrder = 'desc',
    } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const orderByField = resolveSortBy(sortBy);

    // CurrentUserData não carrega o departamento do chamador (User não tem
    // relação `employee`) — resolve-se aqui em vez de confiar num campo que
    // é sempre undefined vindo do controller.
    let userDept: string | undefined;
    if (role !== 'ADMIN' && role !== 'RH') {
      const caller = await this.prisma.read.user.findUnique({
        where: { id: userId },
        select: { department: { select: { name: true } } },
      });
      userDept = caller?.department?.name;
    }

    const accessWhere = buildAccessWhere(userId, userDept, role);
    const where: Prisma.DocumentWhereInput = { ...accessWhere, status };

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { tags: { has: search } },
            { ocrText: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (category) where.category = category;
    if (sensitivity) where.sensitivity = sensitivity;
    if (department) where.department = { contains: department, mode: 'insensitive' };
    if (ownerId) where.ownerId = ownerId;
    if (tag) where.tags = { has: tag };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (expiringSoon) {
      const soon = new Date(Date.now() + 30 * 86400000);
      where.expiresAt = { gt: new Date(), lte: soon };
    }
    if (expired) {
      where.expiresAt = { lt: new Date() };
      where.status = DocStatus.ACTIVE;
    }

    const [data, total] = await Promise.all([
      this.prisma.read.document.findMany({
        where,
        skip,
        take,
        orderBy: { [orderByField]: sortOrder },
        include: {
          createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
          owner: { select: { id: true, fullName: true } },
          _count: { select: { versions: true, downloads: true, permissions: true } },
        },
      }),
      this.prisma.read.document.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: number, requesterId?: number) {
    const doc = await this.prisma.read.document.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        docCategory: true,
        versions: { orderBy: { versionNumber: 'desc' }, take: 10 },
        permissions: { include: { user: { select: { id: true, fullName: true } } } },
        elaboratedBy: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } },
        supersedes: { select: { id: true, title: true, documentCode: true } },
        relatedDocument: { select: { id: true, title: true, documentCode: true } },
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

  private async generateDocumentCode(): Promise<string> {
    const last = await this.prisma.document.findFirst({
      where: { documentCode: { not: null } },
      orderBy: { documentCode: 'desc' },
      select: { documentCode: true },
    });
    const num = last?.documentCode ? parseInt(last.documentCode.replace('DOC-', ''), 10) + 1 : 1;
    return `DOC-${String(num).padStart(5, '0')}`;
  }

  async create(createdById: number, dto: CreateDocumentDto) {
    // DLP: documentos sensíveis não podem ser PUBLIC
    const sensitiveLevels: DocSensitivity[] = [
      DocSensitivity.CONFIDENTIAL,
      DocSensitivity.RESTRICTED,
      DocSensitivity.SECRET,
    ];
    if (sensitiveLevels.includes(dto.sensitivity) && dto.sensitivity === DocSensitivity.PUBLIC) {
      throw new BadRequestException('Documentos confidenciais não podem ter acesso público');
    }

    // Calcular data de retenção mínima (legal)
    const retentionYears = DEFAULT_RETENTION[dto.category] ?? 5;
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);

    const documentCode = await this.generateDocumentCode();

    const doc = await this.prisma.document.create({
      data: {
        ...dto,
        tags: dto.tags ?? [],
        targetAudience: dto.targetAudience ?? [],
        // DRAFT arranca o fluxo de aprovação (docs/biblioteca.md); sem
        // indicação explícita, o documento continua a publicar-se de
        // imediato tal como antes desta extensão.
        status: dto.status ?? DocStatus.ACTIVE,
        origin: dto.origin ?? DocOrigin.UPLOAD,
        version: '1.0',
        documentCode,
        elaboratedById: dto.elaboratedById ?? createdById,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        reviewAt: dto.reviewAt ? new Date(dto.reviewAt) : null,
        retentionUntil,
        createdById,
        // Criar versão inicial
        versions: {
          create: {
            versionNumber: 1,
            fileUrl: dto.fileUrl,
            mimeType: dto.mimeType,
            fileSize: dto.fileSize,
            fileName: dto.fileName ?? dto.title,
            uploadedById: createdById,
            changeDescription: 'Versão inicial',
          },
        },
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });

    await this.audit.log({
      action: 'DOC_UPLOADED',
      entityType: 'Document',
      entityId: doc.id,
      userId: createdById,
      metadata: {},
    });
    await this.logAudit(doc.id, createdById, DocAuditAction.UPLOADED);

    // Auto-notificar owner se diferente do criador
    if (dto.ownerId && dto.ownerId !== createdById) {
      await this.notify(
        dto.ownerId,
        'DOC_LINKED',
        `Um documento foi vinculado ao seu perfil: "${dto.title}"`,
      );
    }

    return doc;
  }

  async update(id: number, dto: UpdateDocumentDto, updatedById: number) {
    const current = await this.findOne(id);

    // Protecção: documentos expirados/arquivados não editáveis
    const nonEditableStatuses: DocStatus[] = [DocStatus.ARCHIVED, DocStatus.DELETED];
    if (nonEditableStatuses.includes(current.status)) {
      throw new BadRequestException('Documento arquivado ou eliminado não pode ser editado');
    }

    // DLP check
    const restrictedSensitivities: DocSensitivity[] = [
      DocSensitivity.CONFIDENTIAL,
      DocSensitivity.SECRET,
    ];
    if (dto.sensitivity && restrictedSensitivities.includes(dto.sensitivity)) {
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
    await this.findOne(id);

    const lastVersion = await this.prisma.read.docVersion.findFirst({
      where: { documentId: id },
      orderBy: { versionNumber: 'desc' },
    });
    const nextNum = (lastVersion?.versionNumber ?? 0) + 1;
    const nextVer = `${Math.floor(nextNum)}.0`;

    await this.prisma.docVersion.create({
      data: {
        documentId: id,
        versionNumber: nextNum,
        fileUrl: dto.fileUrl,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        fileName: dto.fileName,
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
    const version = await this.prisma.read.docVersion.findUnique({ where: { id: versionId } });
    if (!version || version.documentId !== documentId)
      throw new NotFoundException('Versão não encontrada');

    await this.prisma.document.update({
      where: { id: documentId },
      data: { fileUrl: version.fileUrl, version: `${version.versionNumber}.0 (restaurado)` },
    });

    await this.logAudit(documentId, restoredById, DocAuditAction.VERSIONED, {
      restored: version.versionNumber,
    });
    return this.findOne(documentId);
  }

  // ══════════════════════════════════════════════════════════════════
  // APPROVAL WORKFLOW (docs/biblioteca.md — "Estados do documento")
  // ══════════════════════════════════════════════════════════════════

  private async requireStatus(id: number, allowed: DocStatus[]) {
    const doc = await this.findOne(id);
    if (!allowed.includes(doc.status)) {
      throw new BadRequestException(
        `Transição inválida: documento está em '${doc.status}', esperado um de [${allowed.join(', ')}]`,
      );
    }
    return doc;
  }

  async submitForReview(id: number, userId: number) {
    await this.requireStatus(id, [DocStatus.DRAFT]);
    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.EM_REVISAO },
    });
    await this.logAudit(id, userId, DocAuditAction.UPDATED, { transition: 'EM_REVISAO' });
    return this.findOne(id);
  }

  async submitForApproval(id: number, userId: number, approverId?: number) {
    await this.requireStatus(id, [DocStatus.EM_REVISAO]);
    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.PENDENTE_APROVACAO, ...(approverId && { approverId }) },
    });
    await this.logAudit(id, userId, DocAuditAction.UPDATED, { transition: 'PENDENTE_APROVACAO' });
    return this.findOne(id);
  }

  async approve(id: number, approverId: number) {
    await this.requireStatus(id, [DocStatus.PENDENTE_APROVACAO]);
    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.APROVADO, approverId, approvedAt: new Date() },
    });
    await this.logAudit(id, approverId, DocAuditAction.UPDATED, { transition: 'APROVADO' });
    return this.findOne(id);
  }

  async reject(id: number, userId: number, reason: string) {
    const doc = await this.requireStatus(id, [DocStatus.EM_REVISAO, DocStatus.PENDENTE_APROVACAO]);
    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.DRAFT },
    });
    await this.logAudit(id, userId, DocAuditAction.UPDATED, {
      transition: 'DRAFT',
      rejectedFrom: doc.status,
      reason,
    });
    return this.findOne(id);
  }

  async publish(id: number, userId: number) {
    await this.requireStatus(id, [DocStatus.APROVADO, DocStatus.DRAFT, DocStatus.SUSPENSO]);
    const doc = await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.ACTIVE, effectiveAt: new Date() },
    });
    await this.logAudit(id, userId, DocAuditAction.UPDATED, { transition: 'ACTIVE' });
    return this.findOne(doc.id);
  }

  async suspend(id: number, userId: number, reason?: string) {
    await this.requireStatus(id, [DocStatus.ACTIVE]);
    await this.prisma.document.update({
      where: { id },
      data: { status: DocStatus.SUSPENSO },
    });
    await this.logAudit(id, userId, DocAuditAction.UPDATED, { transition: 'SUSPENSO', reason });
    return this.findOne(id);
  }

  async supersede(id: number, supersededDocumentId: number, userId: number) {
    if (id === supersededDocumentId) {
      throw new BadRequestException('Um documento não pode substituir-se a si próprio');
    }
    await this.findOne(supersededDocumentId);
    await this.prisma.$transaction([
      this.prisma.document.update({
        where: { id: supersededDocumentId },
        data: { status: DocStatus.SUBSTITUIDO },
      }),
      this.prisma.document.update({
        where: { id },
        data: { supersedesId: supersededDocumentId },
      }),
    ]);
    await this.logAudit(id, userId, DocAuditAction.UPDATED, {
      transition: 'SUPERSEDES',
      supersededDocumentId,
    });
    return this.findOne(id);
  }

  // ══════════════════════════════════════════════════════════════════
  // CONFIRMAÇÃO DE LEITURA (docs/biblioteca.md)
  // ══════════════════════════════════════════════════════════════════

  private async eligibleReaderWhere(doc: {
    targetAudience: string[];
  }): Promise<Prisma.UserWhereInput> {
    if (!doc.targetAudience.length) return { active: true };
    return {
      active: true,
      OR: [
        { role: { name: { in: doc.targetAudience } } },
        { department: { name: { in: doc.targetAudience } } },
      ],
    };
  }

  async markRead(documentId: number, userId: number, ipAddress?: string, userAgent?: string) {
    const doc = await this.findOne(documentId);
    await this.prisma.docReadConfirmation.upsert({
      where: { documentId_userId: { documentId, userId } },
      update: { readAt: new Date(), ipAddress, userAgent },
      create: {
        documentId,
        userId,
        version: doc.version,
        readAt: new Date(),
        ipAddress,
        userAgent,
      },
    });
    return { message: 'Leitura registada' };
  }

  async confirmRead(documentId: number, userId: number, ipAddress?: string, userAgent?: string) {
    const doc = await this.findOne(documentId);
    const now = new Date();
    await this.prisma.docReadConfirmation.upsert({
      where: { documentId_userId: { documentId, userId } },
      update: {
        readAt: { set: now },
        confirmedAt: now,
        version: doc.version,
        ipAddress,
        userAgent,
      },
      create: {
        documentId,
        userId,
        version: doc.version,
        readAt: now,
        confirmedAt: now,
        ipAddress,
        userAgent,
      },
    });
    await this.logAudit(documentId, userId, DocAuditAction.UPDATED, {
      transition: 'READ_CONFIRMED',
    });
    return { message: 'Leitura confirmada' };
  }

  async getMyPendingReads(userId: number) {
    const docs = await this.prisma.read.document.findMany({
      where: { status: DocStatus.ACTIVE, requiresReadConfirmation: true },
      select: {
        id: true,
        title: true,
        category: true,
        version: true,
        effectiveAt: true,
        readDeadlineDays: true,
        targetAudience: true,
      },
    });
    if (!docs.length) return [];

    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { role: { select: { name: true } }, department: { select: { name: true } } },
    });
    const userTags = [user?.role?.name, user?.department?.name].filter((v): v is string => !!v);

    const eligible = docs.filter(
      d => !d.targetAudience.length || d.targetAudience.some(t => userTags.includes(t)),
    );
    if (!eligible.length) return [];

    const confirmations = await this.prisma.read.docReadConfirmation.findMany({
      where: { userId, documentId: { in: eligible.map(d => d.id) } },
    });
    const confirmedMap = new Map(confirmations.map(c => [c.documentId, c]));

    return eligible
      .filter(d => {
        const c = confirmedMap.get(d.id);
        return !c?.confirmedAt || c.version !== d.version;
      })
      .map(d => {
        const deadline =
          d.readDeadlineDays && d.effectiveAt
            ? new Date(d.effectiveAt.getTime() + d.readDeadlineDays * 86400000)
            : null;
        return { ...d, deadline, overdue: deadline ? deadline < new Date() : false };
      });
  }

  async getReadStatus(documentId: number) {
    const doc = await this.findOne(documentId);
    const where = await this.eligibleReaderWhere(doc);
    const [totalRequired, confirmations] = await Promise.all([
      this.prisma.read.user.count({ where }),
      this.prisma.read.docReadConfirmation.findMany({
        where: { documentId },
        include: { user: { select: { id: true, fullName: true, email: true } } },
      }),
    ]);

    const confirmedForVersion = confirmations.filter(
      c => c.confirmedAt && c.version === doc.version,
    );
    const eligibleUsers = await this.prisma.read.user.findMany({
      where,
      select: { id: true, fullName: true, email: true },
    });
    const confirmedIds = new Set(confirmedForVersion.map(c => c.userId));
    const pendingUsers = eligibleUsers.filter(u => !confirmedIds.has(u.id));

    return {
      totalRequired,
      confirmedCount: confirmedForVersion.length,
      percentage: totalRequired
        ? Math.round((confirmedForVersion.length / totalRequired) * 100)
        : 0,
      pendingUsers,
      confirmations: confirmedForVersion,
    };
  }

  async getComplianceOverview() {
    const docs = await this.prisma.read.document.findMany({
      where: { status: DocStatus.ACTIVE, requiresReadConfirmation: true },
      select: { id: true, title: true, category: true, version: true },
    });

    const overview = await Promise.all(
      docs.map(async d => {
        const status = await this.getReadStatus(d.id);
        return {
          id: d.id,
          title: d.title,
          category: d.category,
          totalRequired: status.totalRequired,
          confirmedCount: status.confirmedCount,
          percentage: status.percentage,
        };
      }),
    );

    return overview.sort((a, b) => a.percentage - b.percentage);
  }

  // ══════════════════════════════════════════════════════════════════
  // FAVORITOS / RECENTES (docs/biblioteca.md)
  // ══════════════════════════════════════════════════════════════════

  async toggleFavorite(documentId: number, userId: number) {
    await this.findOne(documentId);
    const existing = await this.prisma.read.auditLog.findFirst({
      where: { userId, action: 'DOC_FAVORITE', entity: 'Document', entityId: documentId },
    });

    if (existing) {
      await this.prisma.auditLog.delete({ where: { id: existing.id } });
      return { favorited: false };
    }

    await this.prisma.auditLog.create({
      data: { userId, action: 'DOC_FAVORITE', entity: 'Document', entityId: documentId },
    });
    return { favorited: true };
  }

  async getMyFavorites(userId: number) {
    const logs = await this.prisma.read.auditLog.findMany({
      where: { userId, action: 'DOC_FAVORITE', entity: 'Document' },
      orderBy: { timestamp: 'desc' },
    });
    const ids = logs.map(l => l.entityId).filter((id): id is number => id !== null);
    if (!ids.length) return [];

    return this.prisma.read.document.findMany({
      where: { id: { in: ids }, status: { notIn: [DocStatus.DELETED] } },
    });
  }

  async getMyRecent(userId: number, limit = 10) {
    const logs = await this.prisma.read.docAuditLog.findMany({
      where: { userId, action: DocAuditAction.VIEWED },
      orderBy: { createdAt: 'desc' },
      take: limit * 3,
      select: { documentId: true },
    });
    const ids = [...new Set(logs.map(l => l.documentId))].slice(0, limit);
    if (!ids.length) return [];

    const docs = await this.prisma.read.document.findMany({ where: { id: { in: ids } } });
    const docMap = new Map(docs.map(d => [d.id, d]));
    return ids.map(id => docMap.get(id)).filter((d): d is NonNullable<typeof d> => !!d);
  }

  async archive(id: number, archivedById: number, reason?: string) {
    const doc = await this.findOne(id);

    // Verificar retenção legal: não pode arquivar antes do prazo
    if (doc.retentionUntil && doc.retentionUntil > new Date()) {
      throw new BadRequestException(
        `Documento não pode ser arquivado antes de ${doc.retentionUntil.toLocaleDateString('pt-AO')} (retenção legal)`,
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
        `Não pode ser eliminado antes de ${doc.retentionUntil.toLocaleDateString('pt-AO')} (retenção legal)`,
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
    await this.findOne(dto.documentId);

    return this.prisma.docPermission.create({
      data: {
        documentId: dto.documentId,
        userId: dto.userId,
        department: dto.department,
        permissions: dto.permissions,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        grantedById,
      },
    });
  }

  async revokePermission(permissionId: number, _revokedById: number) {
    return this.prisma.docPermission.delete({ where: { id: permissionId } });
  }

  // ══════════════════════════════════════════════════════════════════
  // SHARE LINKS
  // ══════════════════════════════════════════════════════════════════

  async createShareLink(dto: CreateShareLinkDto, createdById: number) {
    const doc = await this.findOne(dto.documentId);

    // DLP: documentos confidenciais/secretos não compartilháveis externamente
    const noExternalShare: DocSensitivity[] = [DocSensitivity.SECRET, DocSensitivity.RESTRICTED];
    if (noExternalShare.includes(doc.sensitivity)) {
      throw new ForbiddenException('Este documento não pode ser partilhado externamente');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = dto.expiresAt ? new Date(dto.expiresAt) : new Date(Date.now() + 7 * 86400000);
    const hashedPass = dto.password ? await hashSharePassword(dto.password) : null;

    const link = await this.prisma.docShareLink.create({
      data: {
        documentId: dto.documentId,
        token,
        access: dto.access,
        expiresAt: expiry,
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
    const link = await this.prisma.read.docShareLink.findUnique({
      where: { token },
      include: { document: true },
    });

    if (!link) throw new NotFoundException('Link inválido');
    if (link.expiresAt < new Date()) throw new BadRequestException('Link expirado');
    if (link.maxDownloads && link.downloadCount >= link.maxDownloads) {
      throw new BadRequestException('Limite de downloads atingido');
    }

    if (link.passwordHash) {
      const ok = await verifySharePassword(password ?? '', link.passwordHash);
      if (!ok) throw new ForbiddenException('Password incorrecta');
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
    const expired = await this.prisma.read.document.findMany({
      where: { expiresAt: { lt: now }, status: DocStatus.ACTIVE },
    });

    for (const doc of expired) {
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { status: DocStatus.EXPIRED },
      });

      // Notificar owner
      if (doc.ownerId)
        await this.notify(doc.ownerId, 'DOC_EXPIRED', `O documento "${doc.title}" expirou`);
      if (doc.createdById)
        await this.notify(doc.createdById, 'DOC_EXPIRED', `O documento "${doc.title}" expirou`);
    }

    return { processed: expired.length };
  }

  async getExpiringSoon(days = 30) {
    const from = new Date();
    const to = new Date(Date.now() + days * 86400000);

    return this.prisma.read.document.findMany({
      where: { expiresAt: { gt: from, lte: to }, status: DocStatus.ACTIVE },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
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
    await this.logAudit(id, renewedById, DocAuditAction.UPDATED, {
      action: 'RENEWED',
      newExpiresAt,
    });
    return this.findOne(id);
  }

  // ══════════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ══════════════════════════════════════════════════════════════════

  async getAuditLog(documentId: number, limit = 50) {
    return this.prisma.read.docAuditLog.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async getAccessLog(documentId: number) {
    return this.prisma.read.docDownload.findMany({
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
      total,
      active,
      expired,
      expiringSoon,
      archived,
      byCategory,
      totalSize,
      newThisMonth,
      recentDownloads,
    ] = await Promise.all([
      this.prisma.read.document.count(),
      this.prisma.read.document.count({ where: { status: DocStatus.ACTIVE } }),
      this.prisma.read.document.count({ where: { status: DocStatus.EXPIRED } }),
      this.prisma.read.document.count({
        where: { expiresAt: { gt: now, lte: soon }, status: DocStatus.ACTIVE },
      }),
      this.prisma.read.document.count({ where: { status: DocStatus.ARCHIVED } }),
      this.prisma.read.document.groupBy({
        by: ['category'],
        where: { status: DocStatus.ACTIVE },
        _count: true,
        orderBy: { _count: { category: 'desc' } },
      }),
      this.prisma.read.document.aggregate({
        where: { status: DocStatus.ACTIVE },
        _sum: { fileSize: true },
      }),
      this.prisma.read.document.count({
        where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
      }),
      this.prisma.read.docDownload.count({
        where: { downloadedAt: { gte: new Date(Date.now() - 30 * 86400000) } },
      }),
    ]);

    return {
      kpis: {
        total,
        active,
        expired,
        expiringSoon,
        archived,
        newThisMonth,
        recentDownloads,
        totalSizeGB: +((totalSize._sum.fileSize ?? 0) / 1073741824).toFixed(2),
      },
      byCategory,
    };
  }

  async getStats(department?: string) {
    const where: Prisma.DocumentWhereInput = { status: DocStatus.ACTIVE };
    if (department) where.department = { contains: department, mode: 'insensitive' };

    const [byCategory, bySensitivity, topDownloaded, recentUploads] = await Promise.all([
      this.prisma.read.document.groupBy({ by: ['category'], where, _count: true }),
      this.prisma.read.document.groupBy({ by: ['sensitivity'], where, _count: true }),
      this.prisma.read.document.findMany({
        where,
        orderBy: { downloadCount: 'desc' },
        take: 5,
        select: { id: true, title: true, downloadCount: true, category: true },
      }),
      this.prisma.read.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          createdAt: true,
          category: true,
          createdBy: { select: { fullName: true } },
        },
      }),
    ]);

    return { byCategory, bySensitivity, topDownloaded, recentUploads };
  }

  // ══════════════════════════════════════════════════════════════════
  // TAGS
  // ══════════════════════════════════════════════════════════════════

  async getAllTags() {
    const docs = await this.prisma.read.document.findMany({
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

  private async logAudit(
    documentId: number,
    userId: number,
    action: DocAuditAction,
    metadata?: Prisma.InputJsonValue,
  ) {
    try {
      await this.prisma.docAuditLog.create({
        data: { documentId, userId, action, metadata: metadata },
      });
    } catch (e: unknown) {
      this.logger.warn({
        documentId,
        userId,
        action,
        metadata: sanitizeForLog(metadata),
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao registar audit log de documento',
      });
    }
  }

  private async notify(userId: number, type: string, message: string) {
    await createNotificationSafe(this.prisma, this.logger, { userId, type, message });
  }
}

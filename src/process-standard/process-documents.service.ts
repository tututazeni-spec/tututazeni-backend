// src/process-standard/process-documents.service.ts
// Aba "Documentos" (docs/Modulo_Processes.md §11): os processos guardam
// REFERÊNCIAS a documentos do repositório central (e da Biblioteca) — nunca
// cópias dos ficheiros — com o contexto do processo: etapa, validação,
// validade, confidencialidade, assinatura e histórico de versões. Respeita as
// permissões de acesso do repositório ao expor o ficheiro.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { ProcessStandardService } from './process-standard.service';
import {
  confidentialityFromSensitivity,
  DEFAULT_RETENTION_YEARS,
  effectiveStatus,
  evaluateRequirements,
  expiryInfo,
  matchesRequired,
  maxConfidentiality,
  nextDocVersion,
  renderTemplate,
  retentionDate,
} from './process-documents';
import {
  ArchiveDocumentDto,
  AttachProcessDocumentDto,
  DecideDocumentDto,
  GenerateProcessDocumentDto,
  NewDocumentVersionDto,
  ProcessDocumentFilterDto,
  RequestProcessDocumentDto,
  SubmitDocumentDto,
} from './process-standard.dto';

const MANAGE_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR];
const FULL_VIEW_ROLES = [Role.ADMIN, Role.RH, Role.AUDITOR];
const DECIDE_ROLES = [Role.ADMIN, Role.RH];
const PUBLISHED_DOC_STATUSES = ['ACTIVE', 'APROVADO'] as const;
const EXPIRING_MS = 30 * 86_400_000;
const user3 = { select: { id: true, fullName: true } } as const;

const DOC_INCLUDE = {
  document: {
    select: {
      id: true,
      title: true,
      fileName: true,
      mimeType: true,
      fileUrl: true,
      version: true,
      status: true,
      sensitivity: true,
      documentCode: true,
    },
  },
  instance: {
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      processId: true,
      process: { select: { id: true, code: true, title: true } },
    },
  },
} satisfies Prisma.ProcessDocumentInclude;

type DocRow = Prisma.ProcessDocumentGetPayload<{ include: typeof DOC_INCLUDE }>;

@Injectable()
export class ProcessDocumentsService {
  private readonly logger = new Logger(ProcessDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processes: ProcessStandardService,
  ) {}

  // ─── Permissões ───────────────────────────────────────────────────────────

  private isManager(user: CurrentUserData) {
    return isPrivileged(user, MANAGE_ROLES);
  }

  /** Instâncias que o utilizador pode ver (espelha «Todos os Processos»). */
  private instanceScope(user: CurrentUserData): Prisma.ProcessInstanceWhereInput {
    if (this.isManager(user) || isPrivileged(user, FULL_VIEW_ROLES)) return {};
    return {
      OR: [
        { initiatedById: user.id },
        { targetUserId: user.id },
        { currentResponsibleId: user.id },
        { stepProgress: { some: { OR: [{ assigneeId: user.id }, { reviewerId: user.id }] } } },
      ],
    };
  }

  /**
   * Visibilidade de um documento de processo (§11/§20): ADMIN/RH/AUDITOR vêem
   * tudo; os restantes, apenas dos processos do seu âmbito e conforme a
   * confidencialidade — CONFIDENTIAL exige perfil listado; RESTRICTED só quem
   * foi nomeado (autor, aprovador, destinatário do pedido ou lista de acesso).
   */
  private visibilityWhere(user: CurrentUserData): Prisma.ProcessDocumentWhereInput {
    if (isPrivileged(user, FULL_VIEW_ROLES)) return {};
    const uid = user.id;
    const role = user.role?.name ?? '';
    return {
      AND: [
        { instance: this.instanceScope(user) },
        {
          OR: [
            { confidentiality: { in: ['PUBLIC', 'INTERNAL'] } },
            { addedById: uid },
            { authorId: uid },
            { approverId: uid },
            { requestedFromId: uid },
            { viewerIds: { has: uid } },
            { confidentiality: 'CONFIDENTIAL', viewRoles: { has: role } },
          ],
        },
      ],
    };
  }

  /** Acesso ao ficheiro no repositório central (espelha o DocumentRepository). */
  private async repoAccessWhere(user: CurrentUserData): Promise<Prisma.DocumentWhereInput> {
    if (isPrivileged(user, [Role.ADMIN, Role.RH])) return {};
    const u = await this.prisma.read.user.findUnique({
      where: { id: user.id },
      select: { department: { select: { name: true } } },
    });
    return {
      OR: [
        { sensitivity: 'PUBLIC' },
        { sensitivity: 'INTERNAL' },
        { createdById: user.id },
        { ownerId: user.id },
        { sensitivity: 'CONFIDENTIAL', department: u?.department?.name ?? '__NONE__' },
        {
          permissions: {
            some: {
              userId: user.id,
              OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
            },
          },
        },
      ],
    };
  }

  private async loadDoc(id: number, user: CurrentUserData): Promise<DocRow> {
    const doc = await this.prisma.read.processDocument.findFirst({
      where: { AND: [{ id }, this.visibilityWhere(user)] },
      include: DOC_INCLUDE,
    });
    // 404 (e não 403) para não revelar a existência de documentos alheios.
    if (!doc) throw new NotFoundException('Documento não encontrado');
    return doc;
  }

  private canManageDoc(user: CurrentUserData, doc: Pick<DocRow, 'addedById'>) {
    return this.isManager(user) || doc.addedById === user.id;
  }

  private async loadInstance(instanceId: number, user: CurrentUserData) {
    const inst = await this.prisma.read.processInstance.findFirst({
      where: { AND: [{ id: instanceId }, this.instanceScope(user)] },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        processId: true,
        targetUserId: true,
        initiatedById: true,
        currentResponsibleId: true,
        process: { select: { id: true, ownerId: true, requiredDocuments: true, title: true } },
        targetUser: { select: { fullName: true, department: { select: { name: true } } } },
        currentResponsible: user3,
        initiatedBy: user3,
      },
    });
    if (!inst) throw new NotFoundException('Processo não encontrado');
    return inst;
  }

  private async assertActiveUser(id: number, label: string) {
    const u = await this.prisma.read.user.findUnique({
      where: { id },
      select: { id: true, active: true },
    });
    if (!u || !u.active) throw new BadRequestException(`${label} inválido`);
  }

  private async assertStep(inst: { id: number; processId: number }, stepId: number) {
    const step = await this.prisma.read.processStep.findFirst({
      where: { id: stepId, processId: inst.processId },
      select: { id: true },
    });
    const prog = step
      ? await this.prisma.read.stepProgress.findUnique({
          where: { instanceId_stepId: { instanceId: inst.id, stepId } },
          select: { id: true },
        })
      : null;
    if (!step || !prog) throw new BadRequestException('Etapa inválida para este processo');
  }

  private async notify(
    userId: number | null | undefined,
    actorId: number,
    type: string,
    message: string,
  ) {
    if (!userId || userId === actorId) return;
    await createNotificationSafe(this.prisma, this.logger, { userId, type, message });
  }

  private audit(
    inst: { id: number; processId: number },
    userId: number,
    action: string,
    meta: object,
  ) {
    return this.processes.writeAuditLog({
      instanceId: inst.id,
      processId: inst.processId,
      userId,
      action,
      meta,
    });
  }

  private label(doc: { name: string }, inst: { code: string | null; id: number }) {
    return `"${doc.name}" (${inst.code ?? `#${inst.id}`})`;
  }

  // ─── Mapeamento ───────────────────────────────────────────────────────────

  private async hydrate(rows: DocRow[], user: CurrentUserData, now = new Date()) {
    const userIds = [
      ...new Set(
        rows
          .flatMap(r => [
            r.addedById,
            r.authorId,
            r.approverId,
            r.requestedFromId,
            r.requestedById,
            r.decidedById,
            r.signedById,
          ])
          .filter((v): v is number => v != null),
      ),
    ];
    const docIds = rows.map(r => r.documentId).filter((v): v is number => v != null);
    const libIds = rows.map(r => r.libraryItemId).filter((v): v is string => v != null);
    const repoAccess = docIds.length ? await this.repoAccessWhere(user) : {};
    const [users, accessible, library] = await Promise.all([
      this.prisma.read.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, fullName: true },
      }),
      this.prisma.read.document.findMany({
        where: { AND: [{ id: { in: docIds } }, repoAccess] },
        select: { id: true },
      }),
      this.prisma.read.libraryItem.findMany({
        where: { id: { in: libIds }, deletedAt: null },
        select: {
          id: true,
          title: true,
          fileUrl: true,
          isPublic: true,
          uploadedById: true,
          targetRoles: true,
        },
      }),
    ]);
    const names = new Map(users.map(u => [u.id, u.fullName]));
    const okDoc = new Set(accessible.map(d => d.id));
    const role = user.role?.name ?? '';
    const libMap = new Map(library.map(l => [l.id, l]));
    const person = (id: number | null) => (id ? { id, fullName: names.get(id) ?? `#${id}` } : null);

    return rows.map(r => {
      const exp = expiryInfo(r.validUntil, now);
      const lib = r.libraryItemId ? libMap.get(r.libraryItemId) : undefined;
      const libOk =
        !!lib &&
        (lib.isPublic ||
          lib.uploadedById === user.id ||
          lib.targetRoles.includes(role) ||
          isPrivileged(user, [Role.ADMIN, Role.RH]));
      const canOpen =
        (r.documentId != null && okDoc.has(r.documentId)) || (r.libraryItemId != null && libOk);
      const fileUrl = canOpen ? (r.document?.fileUrl ?? lib?.fileUrl ?? null) : null;
      return {
        id: r.id,
        instance: {
          id: r.instance.id,
          code: r.instance.code ?? `PROC-${r.instance.id}`,
          title: r.instance.title ?? r.instance.process.title,
          status: r.instance.status,
          process: r.instance.process,
        },
        stepId: r.stepId,
        name: r.name,
        docType: r.docType,
        origin: r.origin,
        relatedEntity:
          r.relatedEntityType || r.relatedEntityId
            ? { type: r.relatedEntityType, id: r.relatedEntityId }
            : null,
        source: r.document
          ? {
              kind: 'REPOSITORY' as const,
              id: r.document.id,
              code: r.document.documentCode,
              title: r.document.title,
              fileName: r.document.fileName,
              mimeType: r.document.mimeType,
            }
          : lib
            ? { kind: 'LIBRARY' as const, id: lib.id, title: lib.title }
            : null,
        fileUrl,
        fileRestricted: !canOpen && (r.documentId != null || r.libraryItemId != null),
        generated: r.origin === 'GENERATED',
        version: r.version,
        author: person(r.authorId) ?? (r.authorName ? { id: 0, fullName: r.authorName } : null),
        addedBy: person(r.addedById),
        issuedAt: r.issuedAt,
        validUntil: r.validUntil,
        expired: exp.expired,
        expiringSoon: exp.expiringSoon,
        daysLeft: exp.daysLeft,
        validationStatus: r.validationStatus,
        effectiveStatus: effectiveStatus(r, now),
        required: r.required,
        approver: person(r.approverId),
        decidedAt: r.decidedAt,
        decidedBy: person(r.decidedById),
        decisionNote: r.decisionNote,
        confidentiality: r.confidentiality,
        viewRoles: r.viewRoles,
        viewerIds: r.viewerIds,
        signatureRequired: r.signatureRequired,
        signatureStatus: r.signatureStatus,
        signedAt: r.signedAt,
        signedBy: person(r.signedById),
        requestedFrom: person(r.requestedFromId),
        requestedBy: person(r.requestedById),
        requestedAt: r.requestedAt,
        requestNote: r.requestNote,
        retentionUntil: r.retentionUntil,
        archivedAt: r.archivedAt,
        archiveReason: r.archiveReason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        permissions: {
          canManage: this.canManageDoc(user, r),
          canDecide:
            r.validationStatus === 'PENDING' &&
            !r.archivedAt &&
            (r.approverId === user.id || isPrivileged(user, DECIDE_ROLES)) &&
            (r.addedById !== user.id || isPrivileged(user, DECIDE_ROLES)),
        },
      };
    });
  }

  // ─── Consulta ─────────────────────────────────────────────────────────────

  private buildWhere(f: ProcessDocumentFilterDto, user: CurrentUserData, now = new Date()) {
    const and: Prisma.ProcessDocumentWhereInput[] = [this.visibilityWhere(user)];
    const where: Prisma.ProcessDocumentWhereInput = { AND: and };
    if (f.instanceId) where.instanceId = f.instanceId;
    if (f.stepId) where.stepId = f.stepId;
    if (f.processId) where.instance = { processId: f.processId };
    if (f.docType) where.docType = { equals: f.docType, mode: 'insensitive' };
    if (f.confidentiality) where.confidentiality = f.confidentiality;
    if (f.required) where.required = true;
    where.archivedAt = f.archived ? { not: null } : null;

    switch (f.status) {
      case 'EXPIRED':
        where.validationStatus = 'APPROVED';
        where.validUntil = { lt: now };
        break;
      case 'EXPIRING':
        where.validationStatus = 'APPROVED';
        where.validUntil = { gte: now, lte: new Date(now.getTime() + EXPIRING_MS) };
        break;
      case 'APPROVED':
        where.validationStatus = 'APPROVED';
        and.push({ OR: [{ validUntil: null }, { validUntil: { gte: now } }] });
        break;
      case undefined:
        break;
      default:
        where.validationStatus = f.status;
    }
    if (f.assigned === 'approver') {
      where.approverId = user.id;
      if (!f.status) where.validationStatus = 'PENDING';
    } else if (f.assigned === 'requested') {
      where.requestedFromId = user.id;
      if (!f.status) where.validationStatus = 'REQUESTED';
    } else if (f.assigned === 'mine') {
      where.addedById = user.id;
    }
    const q = f.search?.trim();
    if (q) {
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { docType: { contains: q, mode: 'insensitive' } },
          { relatedEntityId: { contains: q, mode: 'insensitive' } },
          { instance: { code: { contains: q, mode: 'insensitive' } } },
          { instance: { title: { contains: q, mode: 'insensitive' } } },
          { document: { title: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    return where;
  }

  async list(filters: ProcessDocumentFilterDto, user: CurrentUserData) {
    const { page = 1, limit = 20 } = filters;
    const now = new Date();
    const where = this.buildWhere(filters, user, now);
    const vis = this.visibilityWhere(user);
    const live: Prisma.ProcessDocumentWhereInput = { archivedAt: null };
    const approved: Prisma.ProcessDocumentWhereInput = { validationStatus: 'APPROVED' };

    const [rows, total, requested, pending, expiring, expired] = await Promise.all([
      this.prisma.read.processDocument.findMany({
        where,
        include: DOC_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.read.processDocument.count({ where }),
      this.prisma.read.processDocument.count({
        where: { AND: [vis, live, { validationStatus: 'REQUESTED' }] },
      }),
      this.prisma.read.processDocument.count({
        where: { AND: [vis, live, { validationStatus: 'PENDING' }] },
      }),
      this.prisma.read.processDocument.count({
        where: {
          AND: [
            vis,
            live,
            approved,
            { validUntil: { gte: now, lte: new Date(now.getTime() + EXPIRING_MS) } },
          ],
        },
      }),
      this.prisma.read.processDocument.count({
        where: { AND: [vis, live, approved, { validUntil: { lt: now } }] },
      }),
    ]);
    return {
      data: await this.hydrate(rows, user, now),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: { requested, pending, expiring, expired },
    };
  }

  /** Documentos de um processo + estado dos documentos obrigatórios do modelo. */
  async forInstance(instanceId: number, user: CurrentUserData) {
    const inst = await this.loadInstance(instanceId, user);
    const now = new Date();
    const rows = await this.prisma.read.processDocument.findMany({
      where: { AND: [{ instanceId }, this.visibilityWhere(user)] },
      include: DOC_INCLUDE,
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    // Os requisitos avaliam-se sobre TODOS os documentos do processo (não só os visíveis).
    const all = await this.prisma.read.processDocument.findMany({
      where: { instanceId },
      select: {
        id: true,
        name: true,
        docType: true,
        validationStatus: true,
        validUntil: true,
        archivedAt: true,
      },
    });
    const requirements = evaluateRequirements(inst.process.requiredDocuments ?? [], all, now);
    return {
      instance: { id: inst.id, code: inst.code, title: inst.title ?? inst.process.title },
      documents: await this.hydrate(rows, user, now),
      requirements,
      missing: requirements.filter(r => r.state !== 'OK').length,
    };
  }

  async templates() {
    return this.prisma.read.declarationTemplate.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true, type: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Pesquisa no repositório central e na Biblioteca (respeitando o acesso). */
  async searchSources(search: string | undefined, user: CurrentUserData) {
    const q = search?.trim();
    const docWhere: Prisma.DocumentWhereInput = {
      AND: [
        await this.repoAccessWhere(user),
        { deletedAt: null, archivedAt: null, status: { in: [...PUBLISHED_DOC_STATUSES] } },
        ...(q
          ? [
              {
                OR: [
                  { title: { contains: q, mode: 'insensitive' as const } },
                  { documentCode: { contains: q, mode: 'insensitive' as const } },
                  { tags: { has: q } },
                ],
              },
            ]
          : []),
      ],
    };
    const role = user.role?.name ?? '';
    const libWhere: Prisma.LibraryItemWhereInput = {
      deletedAt: null,
      isApproved: true,
      AND: [
        isPrivileged(user, [Role.ADMIN, Role.RH])
          ? {}
          : {
              OR: [{ isPublic: true }, { uploadedById: user.id }, { targetRoles: { has: role } }],
            },
        ...(q
          ? [
              {
                OR: [
                  { title: { contains: q, mode: 'insensitive' as const } },
                  { code: { contains: q, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };
    const [docs, items] = await Promise.all([
      this.prisma.read.document.findMany({
        where: docWhere,
        select: {
          id: true,
          title: true,
          documentCode: true,
          category: true,
          version: true,
          sensitivity: true,
          expiresAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 15,
      }),
      this.prisma.read.libraryItem.findMany({
        where: libWhere,
        select: { id: true, title: true, code: true, type: true, version: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);
    return {
      repository: docs.map(d => ({ ...d, category: String(d.category) })),
      library: items.map(i => ({ ...i, type: String(i.type) })),
    };
  }

  // ─── Acções ───────────────────────────────────────────────────────────────

  async attach(instanceId: number, dto: AttachProcessDocumentDto, user: CurrentUserData) {
    const inst = await this.loadInstance(instanceId, user);
    if (inst.status === 'CANCELLED') {
      throw new BadRequestException('O processo está cancelado — não aceita documentos');
    }
    if (!dto.documentId && !dto.libraryItemId) {
      throw new BadRequestException('Indique o documento do repositório ou da Biblioteca');
    }
    if (dto.documentId && dto.libraryItemId) {
      throw new BadRequestException('Indique apenas uma origem: repositório ou Biblioteca');
    }

    const request = dto.requestId
      ? await this.prisma.read.processDocument.findFirst({
          where: { id: dto.requestId, instanceId, validationStatus: 'REQUESTED', archivedAt: null },
        })
      : null;
    if (dto.requestId && !request)
      throw new NotFoundException('Pedido de documento não encontrado');
    if (
      request &&
      !this.isManager(user) &&
      request.requestedFromId !== user.id &&
      request.addedById !== user.id
    ) {
      throw new ForbiddenException('Este pedido de documento não lhe foi dirigido');
    }

    // Resolve a origem respeitando o acesso do utilizador.
    let src: {
      title: string;
      version: string;
      authorId: number | null;
      issuedAt: Date | null;
      validUntil: Date | null;
      confidentiality: string;
      docType: string;
    };
    if (dto.documentId) {
      const d = await this.prisma.read.document.findFirst({
        where: {
          AND: [
            { id: dto.documentId, deletedAt: null, archivedAt: null },
            await this.repoAccessWhere(user),
          ],
        },
        select: {
          title: true,
          version: true,
          createdById: true,
          createdAt: true,
          expiresAt: true,
          sensitivity: true,
          category: true,
          status: true,
        },
      });
      if (!d) throw new NotFoundException('Documento não encontrado ou sem acesso');
      if (!(PUBLISHED_DOC_STATUSES as readonly string[]).includes(d.status)) {
        throw new BadRequestException('Só documentos publicados podem ser anexados a um processo');
      }
      src = {
        title: d.title,
        version: d.version,
        authorId: d.createdById,
        issuedAt: d.createdAt,
        validUntil: d.expiresAt,
        confidentiality: confidentialityFromSensitivity(d.sensitivity),
        docType: String(d.category),
      };
    } else {
      const role = user.role?.name ?? '';
      const l = await this.prisma.read.libraryItem.findFirst({
        where: {
          id: dto.libraryItemId,
          deletedAt: null,
          isApproved: true,
          ...(isPrivileged(user, [Role.ADMIN, Role.RH])
            ? {}
            : {
                OR: [{ isPublic: true }, { uploadedById: user.id }, { targetRoles: { has: role } }],
              }),
        },
        select: {
          title: true,
          version: true,
          uploadedById: true,
          createdAt: true,
          expiresAt: true,
          isPublic: true,
          type: true,
        },
      });
      if (!l) throw new NotFoundException('Conteúdo da Biblioteca não encontrado ou sem acesso');
      src = {
        title: l.title,
        version: l.version,
        authorId: l.uploadedById,
        issuedAt: l.createdAt,
        validUntil: l.expiresAt,
        confidentiality: l.isPublic ? 'PUBLIC' : 'INTERNAL',
        docType: String(l.type),
      };
    }

    // Sem duplicar referências: o mesmo ficheiro não entra duas vezes no processo.
    const dup = await this.prisma.read.processDocument.findFirst({
      where: {
        instanceId,
        archivedAt: null,
        ...(request ? { id: { not: request.id } } : {}),
        ...(dto.documentId ? { documentId: dto.documentId } : { libraryItemId: dto.libraryItemId }),
      },
      select: { id: true, name: true },
    });
    if (dup)
      throw new ConflictException(`Este documento já está associado ao processo («${dup.name}»)`);

    const stepId = dto.stepId ?? request?.stepId ?? null;
    if (stepId != null) await this.assertStep(inst, stepId);
    if (dto.approverId) await this.assertActiveUser(dto.approverId, 'Aprovador');

    const name = (dto.name ?? request?.name ?? src.title).trim();
    const docType = (dto.docType ?? request?.docType ?? src.docType).trim();
    const required =
      dto.required ??
      request?.required ??
      matchesRequired(inst.process.requiredDocuments ?? [], name, docType);
    const approverId = dto.approverId ?? request?.approverId ?? inst.process.ownerId;
    const data = {
      stepId,
      name,
      docType,
      origin: 'ATTACHED',
      documentId: dto.documentId ?? null,
      libraryItemId: dto.libraryItemId ?? null,
      relatedEntityType: dto.relatedEntityType ?? request?.relatedEntityType ?? null,
      relatedEntityId: dto.relatedEntityId ?? request?.relatedEntityId ?? null,
      version: src.version,
      authorId: src.authorId,
      authorName: dto.authorName ?? null,
      issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : src.issuedAt,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : src.validUntil,
      validationStatus: 'PENDING',
      required,
      approverId,
      decidedAt: null,
      decidedById: null,
      decisionNote: null,
      confidentiality: maxConfidentiality(dto.confidentiality ?? 'INTERNAL', src.confidentiality),
      viewRoles: dto.viewRoles ?? request?.viewRoles ?? [],
      viewerIds: dto.viewerIds ?? request?.viewerIds ?? [],
      signatureRequired: dto.signatureRequired ?? request?.signatureRequired ?? false,
      signatureStatus: null,
      signedAt: null,
      signedById: null,
    };
    const version = {
      version: src.version,
      documentId: dto.documentId ?? null,
      note: request ? 'Entregue em resposta ao pedido' : 'Anexado ao processo',
      validUntil: data.validUntil,
      createdById: user.id,
    };

    const saved = request
      ? await this.prisma.processDocument.update({
          where: { id: request.id },
          data: { ...data, origin: 'ATTACHED', versions: { create: version } },
          include: DOC_INCLUDE,
        })
      : await this.prisma.processDocument.create({
          data: {
            ...data,
            instanceId,
            addedById: user.id,
            retentionUntil: null,
            versions: { create: version },
          },
          include: DOC_INCLUDE,
        });

    // A etapa passa a ter a evidência exigida por `requiresUpload`.
    if (stepId != null && dto.documentId) {
      const prog = await this.prisma.stepProgress.findUnique({
        where: { instanceId_stepId: { instanceId, stepId } },
        select: { evidenceIds: true },
      });
      if (prog && !prog.evidenceIds.includes(dto.documentId)) {
        await this.prisma.stepProgress.update({
          where: { instanceId_stepId: { instanceId, stepId } },
          data: { evidenceIds: { push: dto.documentId } },
        });
      }
    }

    await this.audit(inst, user.id, 'DOCUMENT_ATTACHED', {
      processDocumentId: saved.id,
      name,
      version: src.version,
      stepId,
      source: dto.documentId ? `DOC:${dto.documentId}` : `LIB:${dto.libraryItemId}`,
      fulfilledRequest: request?.id ?? null,
    });
    await this.notify(
      approverId,
      user.id,
      'PROCESS_DOCUMENT_PENDING',
      `O documento ${this.label(saved, inst)} aguarda a sua validação`,
    );
    if (request) {
      await this.notify(
        request.requestedById,
        user.id,
        'PROCESS_DOCUMENT_DELIVERED',
        `O documento pedido ${this.label(saved, inst)} foi entregue`,
      );
    }
    return (await this.hydrate([saved], user))[0];
  }

  async request(instanceId: number, dto: RequestProcessDocumentDto, user: CurrentUserData) {
    const inst = await this.loadInstance(instanceId, user);
    if (inst.status === 'CANCELLED') {
      throw new BadRequestException('O processo está cancelado — não aceita pedidos');
    }
    await this.assertActiveUser(dto.requestedFromId, 'Destinatário do pedido');
    if (dto.stepId != null) await this.assertStep(inst, dto.stepId);
    if (dto.approverId) await this.assertActiveUser(dto.approverId, 'Aprovador');

    const saved = await this.prisma.processDocument.create({
      data: {
        instanceId,
        stepId: dto.stepId ?? null,
        name: dto.name.trim(),
        docType: dto.docType.trim(),
        origin: 'REQUESTED',
        validationStatus: 'REQUESTED',
        required: dto.required ?? true,
        approverId: dto.approverId ?? inst.process.ownerId,
        confidentiality: dto.confidentiality ?? 'INTERNAL',
        viewRoles: dto.viewRoles ?? [],
        viewerIds: dto.viewerIds ?? [],
        relatedEntityType: dto.relatedEntityType ?? null,
        relatedEntityId: dto.relatedEntityId ?? null,
        signatureRequired: dto.signatureRequired ?? false,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        requestedFromId: dto.requestedFromId,
        requestedById: user.id,
        requestedAt: new Date(),
        requestNote: dto.note?.trim() || null,
        addedById: user.id,
      },
      include: DOC_INCLUDE,
    });
    await this.audit(inst, user.id, 'DOCUMENT_REQUESTED', {
      processDocumentId: saved.id,
      name: saved.name,
      requestedFromId: dto.requestedFromId,
    });
    await this.notify(
      dto.requestedFromId,
      user.id,
      'PROCESS_DOCUMENT_REQUESTED',
      `Foi-lhe pedido o documento ${this.label(saved, inst)}${dto.note?.trim() ? `: ${dto.note.trim()}` : ''}`,
    );
    return (await this.hydrate([saved], user))[0];
  }

  async generate(instanceId: number, dto: GenerateProcessDocumentDto, user: CurrentUserData) {
    const inst = await this.loadInstance(instanceId, user);
    if (inst.status === 'CANCELLED') {
      throw new BadRequestException('O processo está cancelado — não aceita documentos');
    }
    const tpl = await this.prisma.read.declarationTemplate.findFirst({
      where: { id: dto.templateId, isActive: true },
      select: { id: true, name: true, type: true, bodyContent: true, content: true },
    });
    if (!tpl) throw new NotFoundException('Modelo de documento não encontrado');
    if (dto.stepId != null) await this.assertStep(inst, dto.stepId);
    if (dto.approverId) await this.assertActiveUser(dto.approverId, 'Aprovador');

    const now = new Date();
    const vars: Record<string, string | null> = {
      'processo.codigo': inst.code ?? `PROC-${inst.id}`,
      'processo.titulo': inst.title ?? inst.process.title,
      codigo: inst.code ?? `PROC-${inst.id}`,
      processo: inst.title ?? inst.process.title,
      'colaborador.nome': inst.targetUser.fullName,
      nome: inst.targetUser.fullName,
      colaborador: inst.targetUser.fullName,
      'colaborador.departamento': inst.targetUser.department?.name ?? null,
      departamento: inst.targetUser.department?.name ?? null,
      'responsavel.nome': inst.currentResponsible?.fullName ?? null,
      responsavel: inst.currentResponsible?.fullName ?? null,
      'solicitante.nome': inst.initiatedBy.fullName,
      solicitante: inst.initiatedBy.fullName,
      data: now.toLocaleDateString('pt-PT'),
      'data.hoje': now.toLocaleDateString('pt-PT'),
    };
    const { text, unresolved } = renderTemplate(tpl.bodyContent || tpl.content, vars);
    const name = (dto.name ?? tpl.name).trim();
    const docType = String(tpl.type);

    const saved = await this.prisma.processDocument.create({
      data: {
        instanceId,
        stepId: dto.stepId ?? null,
        name,
        docType,
        origin: 'GENERATED',
        generatedContent: text,
        templateId: tpl.id,
        authorId: user.id,
        issuedAt: now,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        validationStatus: 'PENDING',
        required:
          dto.required ?? matchesRequired(inst.process.requiredDocuments ?? [], name, docType),
        approverId: dto.approverId ?? inst.process.ownerId,
        confidentiality: dto.confidentiality ?? 'INTERNAL',
        viewRoles: dto.viewRoles ?? [],
        viewerIds: dto.viewerIds ?? [],
        relatedEntityType: dto.relatedEntityType ?? null,
        relatedEntityId: dto.relatedEntityId ?? null,
        signatureRequired: dto.signatureRequired ?? false,
        addedById: user.id,
        versions: {
          create: {
            version: '1.0',
            note: `Gerado a partir do modelo «${tpl.name}»`,
            createdById: user.id,
          },
        },
      },
      include: DOC_INCLUDE,
    });
    await this.audit(inst, user.id, 'DOCUMENT_GENERATED', {
      processDocumentId: saved.id,
      templateId: tpl.id,
      unresolved,
    });
    await this.notify(
      saved.approverId,
      user.id,
      'PROCESS_DOCUMENT_PENDING',
      `O documento ${this.label(saved, inst)} aguarda a sua validação`,
    );
    return { document: (await this.hydrate([saved], user))[0], unresolved };
  }

  async submit(id: number, dto: SubmitDocumentDto, user: CurrentUserData) {
    const doc = await this.loadDoc(id, user);
    if (!this.canManageDoc(user, doc))
      throw new ForbiddenException('Sem permissão sobre este documento');
    this.assertEditable(doc);
    if (doc.validationStatus === 'REQUESTED') {
      throw new BadRequestException('Anexe o documento pedido antes de o submeter para aprovação');
    }
    if (!['PENDING', 'REJECTED'].includes(doc.validationStatus)) {
      throw new BadRequestException(
        'O documento já foi validado — crie uma nova versão para o rever',
      );
    }
    if (dto.approverId) await this.assertActiveUser(dto.approverId, 'Aprovador');
    const approverId = dto.approverId ?? doc.approverId;
    if (!approverId) throw new BadRequestException('Indique o responsável pela aprovação');

    const saved = await this.prisma.processDocument.update({
      where: { id },
      data: {
        validationStatus: 'PENDING',
        approverId,
        decidedAt: null,
        decidedById: null,
        decisionNote: null,
      },
      include: DOC_INCLUDE,
    });
    await this.audit(doc.instance, user.id, 'DOCUMENT_SUBMITTED', {
      processDocumentId: id,
      approverId,
    });
    await this.notify(
      approverId,
      user.id,
      'PROCESS_DOCUMENT_PENDING',
      `O documento ${this.label(saved, doc.instance)} aguarda a sua validação`,
    );
    return (await this.hydrate([saved], user))[0];
  }

  async decide(id: number, dto: DecideDocumentDto, user: CurrentUserData) {
    const doc = await this.loadDoc(id, user);
    this.assertEditable(doc);
    if (doc.validationStatus !== 'PENDING') {
      throw new BadRequestException('Este documento não está pendente de validação');
    }
    const privileged = isPrivileged(user, DECIDE_ROLES);
    if (doc.approverId !== user.id && !privileged) {
      throw new ForbiddenException('Apenas o aprovador designado pode validar este documento');
    }
    // Segregação de funções: quem anexou não valida o próprio documento.
    if (doc.addedById === user.id && !privileged) {
      throw new ForbiddenException('Não pode validar um documento que anexou');
    }
    const note = dto.note?.trim();
    if (dto.decision === 'REJECT' && !note) {
      throw new BadRequestException('A rejeição exige uma justificação');
    }
    const approve = dto.decision === 'APPROVE';
    const saved = await this.prisma.processDocument.update({
      where: { id },
      data: {
        validationStatus: approve ? 'APPROVED' : 'REJECTED',
        decidedAt: new Date(),
        decidedById: user.id,
        decisionNote: note || null,
        signatureStatus: approve && doc.signatureRequired ? 'PENDING' : null,
      },
      include: DOC_INCLUDE,
    });
    await this.audit(doc.instance, user.id, approve ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED', {
      processDocumentId: id,
      version: doc.version,
      note: note ?? null,
    });
    await this.notify(
      doc.addedById,
      user.id,
      approve ? 'PROCESS_DOCUMENT_APPROVED' : 'PROCESS_DOCUMENT_REJECTED',
      `O documento ${this.label(saved, doc.instance)} foi ${approve ? 'aprovado' : `rejeitado${note ? `: ${note}` : ''}`}`,
    );
    return (await this.hydrate([saved], user))[0];
  }

  async sign(id: number, user: CurrentUserData) {
    const doc = await this.loadDoc(id, user);
    this.assertEditable(doc);
    if (
      !doc.signatureRequired ||
      doc.signatureStatus !== 'PENDING' ||
      doc.validationStatus !== 'APPROVED'
    ) {
      throw new BadRequestException('O documento não aguarda assinatura');
    }
    const inst = await this.prisma.read.processInstance.findUnique({
      where: { id: doc.instanceId },
      select: { targetUserId: true },
    });
    const allowed =
      this.isManager(user) || doc.approverId === user.id || inst?.targetUserId === user.id;
    if (!allowed) throw new ForbiddenException('Sem permissão para assinar este documento');
    const saved = await this.prisma.processDocument.update({
      where: { id },
      data: { signatureStatus: 'SIGNED', signedAt: new Date(), signedById: user.id },
      include: DOC_INCLUDE,
    });
    await this.audit(doc.instance, user.id, 'DOCUMENT_SIGNED', {
      processDocumentId: id,
      version: doc.version,
    });
    return (await this.hydrate([saved], user))[0];
  }

  /** Nova versão / renovação: volta a exigir validação (e assinatura, se aplicável). */
  async newVersion(id: number, dto: NewDocumentVersionDto, user: CurrentUserData) {
    const doc = await this.loadDoc(id, user);
    if (!this.canManageDoc(user, doc))
      throw new ForbiddenException('Sem permissão sobre este documento');
    this.assertEditable(doc);
    if (doc.validationStatus === 'REQUESTED') {
      throw new BadRequestException('Anexe o documento pedido antes de criar versões');
    }
    if (!dto.documentId && !dto.validUntil && doc.origin !== 'GENERATED') {
      throw new BadRequestException('Indique um novo ficheiro ou uma nova validade');
    }
    let newDocId = doc.documentId;
    if (dto.documentId) {
      const d = await this.prisma.read.document.findFirst({
        where: {
          AND: [
            { id: dto.documentId, deletedAt: null, archivedAt: null },
            await this.repoAccessWhere(user),
          ],
        },
        select: { id: true, status: true },
      });
      if (!d) throw new NotFoundException('Documento não encontrado ou sem acesso');
      if (!(PUBLISHED_DOC_STATUSES as readonly string[]).includes(d.status)) {
        throw new BadRequestException('Só documentos publicados podem ser anexados a um processo');
      }
      newDocId = d.id;
    }
    const version = nextDocVersion(doc.version);
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : doc.validUntil;
    const saved = await this.prisma.processDocument.update({
      where: { id },
      data: {
        version,
        documentId: newDocId,
        validUntil,
        validationStatus: 'PENDING',
        decidedAt: null,
        decidedById: null,
        decisionNote: null,
        signatureStatus: null,
        signedAt: null,
        signedById: null,
        versions: {
          create: {
            version,
            documentId: newDocId,
            note: dto.note.trim(),
            validUntil,
            createdById: user.id,
          },
        },
      },
      include: DOC_INCLUDE,
    });
    if (doc.stepId != null && newDocId && newDocId !== doc.documentId) {
      await this.prisma.stepProgress.updateMany({
        where: {
          instanceId: doc.instanceId,
          stepId: doc.stepId,
          NOT: { evidenceIds: { has: newDocId } },
        },
        data: { evidenceIds: { push: newDocId } },
      });
    }
    await this.audit(doc.instance, user.id, 'DOCUMENT_VERSION_ADDED', {
      processDocumentId: id,
      from: doc.version,
      to: version,
      note: dto.note.trim(),
    });
    await this.notify(
      saved.approverId,
      user.id,
      'PROCESS_DOCUMENT_PENDING',
      `Nova versão do documento ${this.label(saved, doc.instance)} aguarda a sua validação`,
    );
    return (await this.hydrate([saved], user))[0];
  }

  async versions(id: number, user: CurrentUserData) {
    const doc = await this.loadDoc(id, user);
    const rows = await this.prisma.read.processDocumentVersion.findMany({
      where: { processDocumentId: id },
      orderBy: { createdAt: 'desc' },
    });
    const ids = [...new Set(rows.map(r => r.createdById))];
    const users = ids.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(users.map(u => [u.id, u.fullName]));

    // Histórico do próprio ficheiro no repositório (só se o utilizador tiver acesso).
    let repository: Array<{
      versionNumber: number;
      changeDescription: string;
      createdAt: Date;
      uploadedBy: { id: number; fullName: string };
    }> = [];
    if (doc.documentId) {
      const ok = await this.prisma.read.document.findFirst({
        where: { AND: [{ id: doc.documentId }, await this.repoAccessWhere(user)] },
        select: { id: true },
      });
      if (ok) {
        repository = await this.prisma.read.docVersion.findMany({
          where: { documentId: doc.documentId },
          select: {
            versionNumber: true,
            changeDescription: true,
            createdAt: true,
            uploadedBy: user3,
          },
          orderBy: { versionNumber: 'desc' },
        });
      }
    }
    return {
      current: doc.version,
      versions: rows.map(r => ({
        id: r.id,
        version: r.version,
        documentId: r.documentId,
        note: r.note,
        validUntil: r.validUntil,
        createdAt: r.createdAt,
        author: { id: r.createdById, fullName: names.get(r.createdById) ?? `#${r.createdById}` },
      })),
      repository,
    };
  }

  /** Arquivar (nunca apagar): respeita a retenção e os documentos obrigatórios em vigor. */
  async archive(id: number, dto: ArchiveDocumentDto, user: CurrentUserData) {
    const doc = await this.loadDoc(id, user);
    if (!this.canManageDoc(user, doc))
      throw new ForbiddenException('Sem permissão sobre este documento');
    if (doc.archivedAt) throw new BadRequestException('O documento já está arquivado');
    const live = ['IN_PROGRESS', 'ON_HOLD'].includes(doc.instance.status);
    if (live && doc.required && effectiveStatus(doc) === 'APPROVED') {
      throw new BadRequestException(
        'Documento obrigatório e válido de um processo em curso — só pode ser arquivado depois de o processo terminar',
      );
    }
    const saved = await this.prisma.processDocument.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        archiveReason: dto.reason.trim(),
        retentionUntil: retentionDate(doc.retentionUntil, new Date(), DEFAULT_RETENTION_YEARS),
      },
      include: DOC_INCLUDE,
    });
    await this.audit(doc.instance, user.id, 'DOCUMENT_ARCHIVED', {
      processDocumentId: id,
      reason: dto.reason.trim(),
      retentionUntil: saved.retentionUntil,
    });
    return (await this.hydrate([saved], user))[0];
  }

  /** PDF do documento gerado a partir de um modelo. */
  async generatedPdf(
    id: number,
    user: CurrentUserData,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const doc = await this.loadDoc(id, user);
    if (doc.origin !== 'GENERATED' || !doc.generatedContent) {
      throw new BadRequestException('Este documento não foi gerado a partir de um modelo');
    }
    const pdf = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      pdf.on('data', (c: Buffer) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
    });
    pdf.font('Helvetica-Bold').fontSize(16).text(doc.name);
    pdf
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#666666')
      .text(
        `${doc.instance.code ?? `PROC-${doc.instance.id}`} · versão ${doc.version} · ${new Date().toLocaleDateString('pt-PT')}`,
      )
      .moveDown();
    pdf
      .fillColor('#000000')
      .fontSize(11)
      .text(doc.generatedContent, { align: 'justify', lineGap: 4 });
    pdf.end();
    const safe = doc.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'documento';
    return { buffer: await done, filename: `${safe}.pdf` };
  }

  private assertEditable(doc: DocRow) {
    if (doc.archivedAt) throw new BadRequestException('O documento está arquivado');
    if (doc.instance.status === 'CANCELLED') {
      throw new BadRequestException('O processo está cancelado');
    }
  }
}

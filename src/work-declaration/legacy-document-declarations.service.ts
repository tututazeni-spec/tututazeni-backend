// src/work-declaration/legacy-document-declarations.service.ts
//
// Fase E — serve o caminho legado /declarations/documents/* a partir da tabela
// `declarations` (modelo `Declaration`), com `legacyRequestId`/`legacyStatus`/
// `legacyPurposeId`/`legacyGeneratedAt` a preservar o contrato do frontend.
// DeclarationRequest/DeclarationApproval deixam de ser escritos.
//
// Portado de src/declarations/document-declarations.service.ts (eliminado),
// retargetado de DeclarationRequest -> Declaration. Resolver de variáveis legado
// (nomes {{employee_name}}, {{employee_position}}, ...) preservado tal-e-qual.

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  DeclarationStatus,
  DeclarationType,
  DocumentRequestStatus,
  Prisma,
  TemplateLanguage,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { generateDeclarationTitle } from './declaration-render.helpers';
import { declarationToLegacyRequestShape, LegacyRequestShape } from './declaration-legacy-adapter';
import {
  DeclarationsCreateTemplateDto,
  DeclarationsUpdateTemplateDto,
  CreateDocumentRequestDto,
  ApproveDocumentRequestDto,
  DocumentRequestFilterDto,
} from '../declarations/declarations.dto';

// ─── Resolver de variáveis legado ────────────────────────────────────────────

function resolveVariables(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `[${key}]`);
}

interface DeclarationUserData {
  fullName: string;
  email: string;
  employeeNumber: string | null;
  hireDate: Date | null;
  position: { name: string } | null;
  department: { name: string } | null;
}

function buildVariablesFromUser(
  user: DeclarationUserData | null,
  extra: Record<string, string> = {},
): Record<string, string> {
  const today = new Date().toLocaleDateString('pt-AO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return {
    employee_name: user?.fullName ?? '',
    employee_position: user?.position?.name ?? '',
    employee_department: user?.department?.name ?? '',
    employee_matricula: user?.employeeNumber ?? '',
    employee_email: user?.email ?? '',
    hire_date: user?.hireDate ? new Date(user.hireDate).toLocaleDateString('pt-AO') : '',
    company_name: 'INNOVA Platform',
    today_date: today,
    ...extra,
  };
}

// DocumentRequestStatus (contrato legado) -> DeclarationStatus (lifecycle nativo).
const LEGACY_TO_NATIVE: Record<DocumentRequestStatus, DeclarationStatus> = {
  DRAFT: DeclarationStatus.DRAFT,
  PENDING: DeclarationStatus.PENDING_SIGNATURE,
  APPROVED: DeclarationStatus.PENDING_SIGNATURE,
  GENERATED: DeclarationStatus.SIGNED,
  ISSUED: DeclarationStatus.ISSUED,
  REJECTED: DeclarationStatus.REVOKED,
  EXPIRED: DeclarationStatus.EXPIRED,
};

const REQUEST_INCLUDES = {
  template: true,
  employee: { select: { id: true, fullName: true, email: true } },
  assignedTo: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.DeclarationInclude;

type LegacyDeclaration = Prisma.DeclarationGetPayload<{ include: typeof REQUEST_INCLUDES }>;

@Injectable()
export class LegacyDocumentDeclarationsService {
  private readonly logger = new Logger(LegacyDocumentDeclarationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // TEMPLATES  (modelo DeclarationTemplate — partilhado com /work-declarations)
  // ══════════════════════════════════════════════════════════════════

  async createTemplate(dto: DeclarationsCreateTemplateDto, createdById: number) {
    const detected = [
      ...new Set((dto.content.match(/\{\{(\w+)\}\}/g) ?? []).map(m => m.slice(2, -2))),
    ];
    const tenantId = await resolveDefaultTenantId(this.prisma);

    const template = await this.prisma.declarationTemplate.create({
      data: {
        ...dto,
        tenantId,
        type: DeclarationType.CUSTOM,
        bodyContent: dto.content,
        variables: dto.variables ?? detected,
        active: dto.active ?? true,
        version: 1,
        createdById,
      },
    });

    await this.audit.log({
      action: 'TEMPLATE_CREATED',
      entityType: 'DeclarationTemplate',
      entityId: template.id,
      userId: createdById,
    });
    return template;
  }

  async getTemplates(purposeId?: number, language?: string, activeOnly = true) {
    const where: Prisma.DeclarationTemplateWhereInput = {};
    if (activeOnly) where.active = true;
    if (purposeId) where.purposeId = purposeId;
    if (language) {
      const normalized = language.toUpperCase();
      if (!(Object.values(TemplateLanguage) as string[]).includes(normalized)) {
        throw new BadRequestException(
          `language inválido. Valores aceites: ${Object.values(TemplateLanguage).join(', ')}`,
        );
      }
      where.language = normalized as TemplateLanguage;
    }

    return this.prisma.read.declarationTemplate.findMany({
      where,
      include: { purpose: true },
      orderBy: { name: 'asc' },
    });
  }

  async getTemplate(id: number) {
    const t = await this.prisma.read.declarationTemplate.findUnique({
      where: { id },
      include: { purpose: true },
    });
    if (!t) throw new NotFoundException('Template não encontrado');
    return t;
  }

  async updateTemplate(id: number, dto: DeclarationsUpdateTemplateDto, updatedById: number) {
    const current = await this.getTemplate(id);

    await this.prisma.declarationTemplate.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.content ? { bodyContent: dto.content } : {}),
        version: { increment: 1 },
        variables: dto.content
          ? [...new Set((dto.content.match(/\{\{(\w+)\}\}/g) ?? []).map(m => m.slice(2, -2)))]
          : current.variables,
      },
    });

    await this.audit.log({
      action: 'TEMPLATE_UPDATED',
      entityType: 'DeclarationTemplate',
      entityId: id,
      userId: updatedById,
    });
    return this.getTemplate(id);
  }

  async previewTemplate(templateId: number, userId: number) {
    const template = await this.getTemplate(templateId);
    const user = await this.loadUserData(userId);
    const vars = buildVariablesFromUser(user, {
      purpose: 'PREVIEW',
      addressed_to: '(destinatário)',
    });
    return {
      template,
      previewHtml: resolveVariables(template.content, vars),
      variables: vars,
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // DOCUMENT REQUESTS  (modelo Declaration + colunas legacy*)
  // ══════════════════════════════════════════════════════════════════

  async findAll(filters: DocumentRequestFilterDto): Promise<{
    data: LegacyRequestShape[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const {
      page = 1,
      limit = 20,
      userId,
      templateId,
      purposeId,
      status,
      department,
      from,
      to,
    } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.DeclarationWhereInput = { legacyRequestId: { not: null } };

    if (userId) where.employeeId = userId;
    if (templateId) where.templateId = templateId;
    if (purposeId) where.legacyPurposeId = purposeId;
    if (status) where.legacyStatus = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (department)
      where.employee = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [data, total] = await Promise.all([
      this.prisma.read.declaration.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: REQUEST_INCLUDES,
      }),
      this.prisma.read.declaration.count({ where }),
    ]);

    return {
      data: data.map(declarationToLegacyRequestShape),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number, user?: CurrentUserData): Promise<LegacyRequestShape> {
    const decl = await this.resolveByLegacyId(id);
    if (user) assertCanAccess(decl, decl.employeeId, user, [Role.ADMIN, Role.RH]);

    if (user) {
      await this.audit.log({
        action: 'DECLARATION_VIEWED',
        entityType: 'DeclarationRequest',
        entityId: id,
        userId: user.id,
      });
    }
    return declarationToLegacyRequestShape(decl);
  }

  async request(userId: number, dto: CreateDocumentRequestDto): Promise<LegacyRequestShape> {
    const template = await this.getTemplate(dto.templateId);
    if (!template.active) throw new BadRequestException('Template inactivo');

    const purpose = dto.purposeId
      ? await this.prisma.read.declarationPurpose.findUnique({ where: { id: dto.purposeId } })
      : null;
    const requiresApproval = dto.purposeId
      ? (purpose?.requiresApproval ?? false)
      : template.requiresApproval;

    const legacyStatus: DocumentRequestStatus = dto.saveAsDraft
      ? 'DRAFT'
      : requiresApproval
        ? 'PENDING'
        : 'APPROVED';

    const tenantId = await resolveDefaultTenantId(this.prisma);
    const legacyRequestId = await this.nextLegacyRequestId();
    const locale = (dto.language ?? template.language) as string;

    const created = await this.prisma.declaration.create({
      data: {
        tenantId,
        code: `LEG-PENDING-${legacyRequestId}`,
        templateId: template.id,
        requestedById: userId,
        employeeId: userId,
        type: template.type,
        status: LEGACY_TO_NATIVE[legacyStatus],
        legacyStatus,
        locale: locale === 'EN' || locale === 'FR' ? locale : 'PT',
        title: generateDeclarationTitle(template.type, template.name, locale),
        purpose: purpose?.name ?? null,
        legacyPurposeId: dto.purposeId ?? null,
        legacyRequestId,
        requestNotes:
          [dto.observations || null, dto.addressedTo ? `Destinatário: ${dto.addressedTo}` : null]
            .filter(Boolean)
            .join(' | ') || null,
        employeeSnapshot: {
          extraVariables: (dto.extraVariables as unknown) ?? null,
          addressedTo: dto.addressedTo ?? null,
        } as Prisma.InputJsonObject,
      },
      include: REQUEST_INCLUDES,
    });

    let final = created;
    if (legacyStatus === 'APPROVED') {
      final = await this.doGenerate(legacyRequestId, userId);
    } else {
      await this.notifyUser(
        userId,
        'DECLARATION_REQUESTED',
        `Pedido de "${template.name}" submetido`,
      );
      if (requiresApproval) {
        await this.notifyRH(
          'DECLARATION_PENDING_APPROVAL',
          `Nova declaração "${template.name}" aguarda aprovação`,
        );
      }
    }

    await this.audit.log({
      action: 'DECLARATION_REQUESTED',
      entityType: 'DeclarationRequest',
      entityId: legacyRequestId,
      userId,
      metadata: {},
    });

    return declarationToLegacyRequestShape(final);
  }

  async approve(
    id: number,
    reviewerId: number,
    dto: ApproveDocumentRequestDto,
  ): Promise<LegacyRequestShape> {
    const decl = await this.resolveByLegacyId(id);
    if (decl.legacyStatus !== 'PENDING') throw new BadRequestException('Pedido não está pendente');

    if (dto.approved) {
      await this.prisma.declaration.update({
        where: { id: decl.id },
        data: {
          assignedToId: reviewerId,
          legacyStatus: 'APPROVED',
          status: LEGACY_TO_NATIVE.APPROVED,
          internalNotes: dto.notes ?? null,
        },
      });
      const generated = await this.doGenerate(id, reviewerId);
      await this.audit.log({
        action: 'DECLARATION_APPROVED',
        entityType: 'DeclarationRequest',
        entityId: id,
        userId: reviewerId,
      });
      return declarationToLegacyRequestShape(generated);
    }

    const rejected = await this.prisma.declaration.update({
      where: { id: decl.id },
      data: {
        assignedToId: reviewerId,
        legacyStatus: 'REJECTED',
        status: LEGACY_TO_NATIVE.REJECTED,
        rejectedReason: dto.notes ?? null,
        revokedAt: new Date(),
      },
      include: REQUEST_INCLUDES,
    });
    await this.notifyUser(
      decl.employeeId,
      'DECLARATION_REJECTED',
      `O seu pedido de "${decl.template.name}" foi rejeitado`,
    );
    await this.audit.log({
      action: 'DECLARATION_REJECTED',
      entityType: 'DeclarationRequest',
      entityId: id,
      userId: reviewerId,
    });
    return declarationToLegacyRequestShape(rejected);
  }

  async generate(id: number, generatedById: number): Promise<LegacyRequestShape> {
    const decl = await this.doGenerate(id, generatedById);
    return declarationToLegacyRequestShape(decl);
  }

  async issue(id: number, issuedById: number): Promise<LegacyRequestShape> {
    const decl = await this.resolveByLegacyId(id);
    if (decl.legacyStatus !== 'GENERATED')
      throw new BadRequestException('Declaração não está gerada');

    const issued = await this.prisma.declaration.update({
      where: { id: decl.id },
      data: { legacyStatus: 'ISSUED', status: LEGACY_TO_NATIVE.ISSUED, issuedAt: new Date() },
      include: REQUEST_INCLUDES,
    });

    await this.audit.log({
      action: 'DECLARATION_ISSUED',
      entityType: 'DeclarationRequest',
      entityId: id,
      userId: issuedById,
    });
    return declarationToLegacyRequestShape(issued);
  }

  async verify(verificationCode: string) {
    const decl = await this.prisma.read.declaration.findFirst({
      where: {
        legacyRequestId: { not: null },
        verificationHash: { in: [verificationCode, `LEG-${verificationCode}`] },
      },
      include: {
        template: { select: { name: true } },
        employee: { select: { fullName: true, email: true } },
      },
    });
    if (!decl) return { valid: false, message: 'Código de verificação inválido' };
    if (decl.expiresAt && decl.expiresAt < new Date())
      return { valid: false, message: 'Declaração expirada' };

    return {
      valid: true,
      referenceNumber: decl.code.startsWith('LEG-') ? decl.code.slice(4) : decl.code,
      issuedAt: decl.issuedAt ?? decl.legacyGeneratedAt,
      expiresAt: decl.expiresAt,
      employee: decl.employee?.fullName,
      document: decl.template?.name,
    };
  }

  async getDashboard() {
    const legacyOnly: Prisma.DeclarationWhereInput = { legacyRequestId: { not: null } };
    const [pending, generated, issued, total] = await Promise.all([
      this.prisma.read.declaration.count({ where: { ...legacyOnly, legacyStatus: 'PENDING' } }),
      this.prisma.read.declaration.count({ where: { ...legacyOnly, legacyStatus: 'GENERATED' } }),
      this.prisma.read.declaration.count({ where: { ...legacyOnly, legacyStatus: 'ISSUED' } }),
      this.prisma.read.declaration.count({ where: legacyOnly }),
    ]);

    const byTemplate = await this.prisma.read.declaration.groupBy({
      by: ['templateId'],
      where: legacyOnly,
      _count: true,
      orderBy: { _count: { templateId: 'desc' } },
      take: 5,
    });

    return { pending, generated, issued, total, topTemplates: byTemplate };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async doGenerate(id: number, generatedById: number): Promise<LegacyDeclaration> {
    const decl = await this.resolveByLegacyId(id);
    const template = await this.prisma.read.declarationTemplate.findUnique({
      where: { id: decl.templateId },
    });
    if (!template) throw new BadRequestException('Template não encontrado');

    const user = await this.loadUserData(decl.employeeId);
    const snapshot = (decl.employeeSnapshot ?? {}) as Record<string, unknown>;
    const extra =
      snapshot.extraVariables && typeof snapshot.extraVariables === 'object'
        ? (snapshot.extraVariables as Record<string, string>)
        : {};
    const vars = buildVariablesFromUser(user, {
      purpose: decl.purpose ?? '',
      addressed_to: typeof snapshot.addressedTo === 'string' ? snapshot.addressedTo : '',
      ...extra,
    });

    const resolvedContent = resolveVariables(template.content, vars);
    const refNumber = `DEC-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
    const verificationCode = crypto.randomBytes(8).toString('hex').toUpperCase();
    const expiresAt = template.validDays
      ? new Date(Date.now() + template.validDays * 86400000)
      : null;

    const updated = await this.prisma.declaration.update({
      where: { id: decl.id },
      data: {
        legacyStatus: 'GENERATED',
        status: LEGACY_TO_NATIVE.GENERATED,
        renderedContent: resolvedContent,
        code: `LEG-${refNumber}`,
        verificationHash: `LEG-${verificationCode}`,
        legacyGeneratedAt: new Date(),
        expiresAt,
      },
      include: REQUEST_INCLUDES,
    });

    await this.notifyUser(
      decl.employeeId,
      'DECLARATION_READY',
      `A sua declaração "${template.name}" está disponível`,
    );
    await this.audit.log({
      action: 'DECLARATION_GENERATED',
      entityType: 'DeclarationRequest',
      entityId: id,
      userId: generatedById,
      metadata: { ref: refNumber },
    });
    return updated;
  }

  private async resolveByLegacyId(id: number): Promise<LegacyDeclaration> {
    const decl = await this.prisma.declaration.findUnique({
      where: { legacyRequestId: id },
      include: REQUEST_INCLUDES,
    });
    if (!decl) throw new NotFoundException('Declaração não encontrada');
    return decl;
  }

  /**
   * Id numérico sintético para novos pedidos criados por este caminho — mantém
   * um id estável no contrato legado. Baixo volume; `@unique` rejeita colisões
   * de corrida (raras), caso em que o cliente re-tenta.
   */
  private async nextLegacyRequestId(): Promise<number> {
    const [maxDecl, maxReq] = await Promise.all([
      this.prisma.declaration.aggregate({ _max: { legacyRequestId: true } }),
      this.prisma.declarationRequest.aggregate({ _max: { id: true } }),
    ]);
    return Math.max(maxDecl._max.legacyRequestId ?? 0, maxReq._max.id ?? 0) + 1;
  }

  private async loadUserData(userId: number): Promise<DeclarationUserData | null> {
    return this.prisma.read.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        email: true,
        employeeNumber: true,
        hireDate: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
  }

  private async notifyUser(userId: number, type: string, message: string) {
    await createNotificationSafe(this.prisma, this.logger, { userId, type, message });
  }

  private async notifyRH(type: string, message: string) {
    try {
      const hr = await this.prisma.read.user.findFirst({ where: { role: { code: 'RH' } } });
      if (hr)
        await createNotificationSafe(this.prisma, this.logger, { userId: hr.id, type, message });
    } catch (e: unknown) {
      this.logger.warn({
        type,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao notificar RH',
      });
    }
  }
}

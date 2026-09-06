// ─── src/declarations/document-declarations.service.ts ───────────────────────
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import * as crypto from 'crypto';
import {
  DeclarationsCreateTemplateDto,
  DeclarationsUpdateTemplateDto,
  CreateDeclarationPurposeDto,
  CreateDocumentRequestDto,
  ApproveDocumentRequestDto,
  DocumentRequestFilterDto,
  DocumentRequestStatus,
} from './declarations.dto';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';
import { DeclarationType, Prisma, TemplateLanguage } from '@prisma/client';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';

// ─── Variable resolver ────────────────────────────────────────────────────────

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
    // FIX: user.name → user.fullName (User model)
    employee_name: user?.fullName ?? '',
    // Achado real: `user.employee?.role/.jobTitle/.department/.matricula/
    // .joinedAt` — User NUNCA teve relação `employee` (nem loadUserData()
    // sequer a seleccionava); estes campos avaliavam sempre para `''`,
    // mascarado pelo `any` — toda declaração gerada saía sempre sem
    // posição/departamento/matrícula/data de admissão preenchidos. Estes
    // dados existem directamente em User (position/department/
    // employeeNumber/hireDate), agora seleccionados em loadUserData().
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

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DocumentDeclarationsService {
  private readonly logger = new Logger(DocumentDeclarationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // PURPOSES (Finalidades)
  // ══════════════════════════════════════════════════════════════════

  async createPurpose(dto: CreateDeclarationPurposeDto) {
    return this.prisma.declarationPurpose.create({ data: { ...dto, active: dto.active ?? true } });
  }

  async getPurposes(activeOnly = true) {
    return this.prisma.read.declarationPurpose.findMany({
      where: activeOnly ? { active: true } : {},
      // FIX: fullName → name (DeclarationPurpose has field `name`)
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async updatePurpose(id: number, dto: Partial<CreateDeclarationPurposeDto>) {
    return this.prisma.declarationPurpose.update({ where: { id }, data: dto });
  }

  // ══════════════════════════════════════════════════════════════════
  // TEMPLATES
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
    // Achado real: `language` chega como query string livre do controller
    // (nunca validado contra o enum) e ia directo para where.language — um
    // valor fora de PT/EN/FR (ou em minúsculas, convenção habitual de query
    // params) rebentava com "Invalid value provided" (GET 500). Mascarado
    // antes pelo `where: any`. Normalizado para maiúsculas antes de validar
    // — TemplateLanguage é sempre maiúsculo no schema, mas query params
    // costumam chegar em minúsculas.
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
      // FIX: fullName → name (DeclarationTemplate has field `name`)
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
  // DOCUMENT REQUESTS
  // ══════════════════════════════════════════════════════════════════

  async findAll(filters: DocumentRequestFilterDto) {
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
    const where: Prisma.DeclarationRequestWhereInput = {};

    if (userId) where.userId = userId;
    if (templateId) where.templateId = templateId;
    if (purposeId) where.purposeId = purposeId;
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    // FIX: User has no employee relation — filter by department via User.department relation
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [data, total] = await Promise.all([
      this.prisma.read.declarationRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          // FIX: fullName field exists on DeclarationTemplate as `name`
          template: { select: { id: true, name: true, language: true } },
          // FIX: fullName field exists on DeclarationPurpose as `name`
          purpose: { select: { id: true, name: true, category: true } },
          // FIX: removed employee sub-select — User has no employee relation
          user: { select: { id: true, fullName: true, email: true } },
          approval: { include: { reviewer: { select: { id: true, fullName: true } } } },
        },
      }),
      this.prisma.read.declarationRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number, user?: CurrentUserData) {
    const r = await this.prisma.read.declarationRequest.findUnique({
      where: { id },
      include: {
        template: true,
        purpose: true,
        // FIX: removed employee sub-select
        user: { select: { id: true, fullName: true, email: true } },
        approval: { include: { reviewer: { select: { id: true, fullName: true } } } },
      },
    });
    // Ownership (A3): dono OU ADMIN/RH; senão 404.
    // Quando chamado sem user (contexto interno de confiança), não filtra.
    if (user) assertCanAccess(r, r?.userId, user, [Role.ADMIN, Role.RH]);
    else if (!r) throw new NotFoundException('Declaração não encontrada');

    if (user) {
      await this.audit.log({
        action: 'DECLARATION_VIEWED',
        entityType: 'DeclarationRequest',
        entityId: id,
        userId: user.id,
      });
    }

    return r;
  }

  async request(userId: number, dto: CreateDocumentRequestDto) {
    const template = await this.getTemplate(dto.templateId);
    if (!template.active) throw new BadRequestException('Template inactivo');

    const requiresApproval = dto.purposeId
      ? (await this.prisma.read.declarationPurpose.findUnique({ where: { id: dto.purposeId } }))
          ?.requiresApproval
      : template.requiresApproval;

    const initialStatus = dto.saveAsDraft
      ? DocumentRequestStatus.DRAFT
      : requiresApproval
        ? DocumentRequestStatus.PENDING
        : DocumentRequestStatus.APPROVED;

    const req = await this.prisma.declarationRequest.create({
      data: {
        userId,
        templateId: dto.templateId,
        purposeId: dto.purposeId,
        language: dto.language ?? template.language,
        addressedTo: dto.addressedTo,
        observations: dto.observations,
        extraVariables: dto.extraVariables,
        status: initialStatus,
      },
    });

    if (initialStatus === DocumentRequestStatus.APPROVED) {
      await this.generate(req.id, userId);
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
      entityId: req.id,
      userId,
      metadata: {},
    });

    return req;
  }

  async approve(id: number, reviewerId: number, dto: ApproveDocumentRequestDto) {
    const req = await this.findOne(id);
    if (req.status !== DocumentRequestStatus.PENDING)
      throw new BadRequestException('Pedido não está pendente');

    await this.prisma.declarationApproval.upsert({
      where: { requestId: id },
      create: {
        requestId: id,
        reviewerId,
        approved: dto.approved,
        notes: dto.notes,
        reviewedAt: new Date(),
      },
      update: { reviewerId, approved: dto.approved, notes: dto.notes, reviewedAt: new Date() },
    });

    if (dto.approved) {
      await this.prisma.declarationRequest.update({
        where: { id },
        data: { status: DocumentRequestStatus.APPROVED },
      });
      await this.generate(id, reviewerId);
    } else {
      await this.prisma.declarationRequest.update({
        where: { id },
        data: { status: DocumentRequestStatus.REJECTED },
      });
      // findOne() já inclui `template` por omissão — cast desnecessário.
      await this.notifyUser(
        req.userId,
        'DECLARATION_REJECTED',
        `O seu pedido de "${req.template?.name}" foi rejeitado`,
      );
    }

    await this.audit.log({
      action: dto.approved ? 'DECLARATION_APPROVED' : 'DECLARATION_REJECTED',
      entityType: 'DeclarationRequest',
      entityId: id,
      userId: reviewerId,
    });

    return this.findOne(id);
  }

  async generate(id: number, generatedById: number) {
    const req = await this.findOne(id);

    // findOne() já inclui `template`/`purpose` por omissão — casts abaixo
    // desnecessários.
    if (!req.template) throw new BadRequestException('Template não encontrado');

    const user = await this.loadUserData(req.userId);
    const vars = buildVariablesFromUser(user, {
      purpose: req.purpose?.name ?? req.observations ?? '',
      addressed_to: req.addressedTo ?? '',
      ...((req.extraVariables as Record<string, string>) ?? {}),
    });

    const resolvedContent = resolveVariables(req.template.content, vars);
    const refNumber = `DEC-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
    const verificationCode = crypto.randomBytes(8).toString('hex').toUpperCase();

    const expiresAt = req.template.validDays
      ? new Date(Date.now() + req.template.validDays * 86400000)
      : null;

    await this.prisma.declarationRequest.update({
      where: { id },
      data: {
        status: DocumentRequestStatus.GENERATED,
        generatedContent: resolvedContent,
        referenceNumber: refNumber,
        verificationCode,
        generatedAt: new Date(),
        expiresAt,
      },
    });

    await this.notifyUser(
      req.userId,
      'DECLARATION_READY',
      `A sua declaração "${req.template.name}" está disponível`,
    );

    await this.audit.log({
      action: 'DECLARATION_GENERATED',
      entityType: 'DeclarationRequest',
      entityId: id,
      userId: generatedById,
      metadata: { ref: refNumber },
    });

    return this.findOne(id);
  }

  async issue(id: number, issuedById: number) {
    const req = await this.findOne(id);
    if (req.status !== DocumentRequestStatus.GENERATED)
      throw new BadRequestException('Declaração não está gerada');

    await this.prisma.declarationRequest.update({
      where: { id },
      data: { status: DocumentRequestStatus.ISSUED, issuedAt: new Date() },
    });

    await this.audit.log({
      action: 'DECLARATION_ISSUED',
      entityType: 'DeclarationRequest',
      entityId: id,
      userId: issuedById,
    });
    return this.findOne(id);
  }

  async verify(verificationCode: string) {
    const req = await this.prisma.read.declarationRequest.findFirst({
      where: { verificationCode },
      include: {
        template: { select: { name: true } },
        user: { select: { fullName: true, email: true } },
      },
    });
    if (!req) return { valid: false, message: 'Código de verificação inválido' };
    if (req.expiresAt && req.expiresAt < new Date())
      return { valid: false, message: 'Declaração expirada' };

    return {
      valid: true,
      referenceNumber: req.referenceNumber,
      issuedAt: req.issuedAt ?? req.generatedAt,
      expiresAt: req.expiresAt,
      // FIX: user.name → user.fullName
      employee: req.user?.fullName,
      document: req.template?.name,
    };
  }

  async getDashboard() {
    const [pending, generated, issued, total] = await Promise.all([
      this.prisma.read.declarationRequest.count({
        where: { status: DocumentRequestStatus.PENDING },
      }),
      this.prisma.read.declarationRequest.count({
        where: { status: DocumentRequestStatus.GENERATED },
      }),
      this.prisma.read.declarationRequest.count({
        where: { status: DocumentRequestStatus.ISSUED },
      }),
      this.prisma.read.declarationRequest.count(),
    ]);

    const byTemplate = await this.prisma.read.declarationRequest.groupBy({
      by: ['templateId'],
      _count: true,
      orderBy: { _count: { templateId: 'desc' } },
      take: 5,
    });

    return { pending, generated, issued, total, topTemplates: byTemplate };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadUserData(userId: number) {
    // FIX: removed employee sub-select — User has no employee relation.
    // position/department/employeeNumber/hireDate seleccionados para
    // preencher as variáveis employee_position/employee_department/
    // employee_matricula/hire_date em buildVariablesFromUser() (ver nota lá).
    return this.prisma.read.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
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
      // User has no scalar roleCode — role is a relation, filter via role.code
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

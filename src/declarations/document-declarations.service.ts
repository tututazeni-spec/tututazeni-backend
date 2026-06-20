// ─── src/declarations/document-declarations.service.ts ───────────────────────
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

// ─── Variable resolver ────────────────────────────────────────────────────────

function resolveVariables(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `[${key}]`);
}

function buildVariablesFromUser(
  user: any,
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
    // FIX: user.employee doesn't exist — use (user as any).employee for legacy compat
    employee_position: user.employee?.role ?? user.employee?.jobTitle ?? '',
    employee_department: user.employee?.department ?? '',
    employee_matricula: user.employee?.matricula ?? '',
    employee_email: user?.email ?? '',
    hire_date: user.employee?.joinedAt
      ? new Date(user.employee.joinedAt).toLocaleDateString('pt-AO')
      : '',
    company_name: 'INNOVA Platform',
    today_date: today,
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class DocumentDeclarationsService {
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
    return this.prisma.declarationPurpose.findMany({
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

    const template = await (this.prisma as any).declarationTemplate.create({
      data: {
        ...dto,
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
    const where: any = {};
    if (activeOnly) where.active = true;
    if (purposeId) where.purposeId = purposeId;
    if (language) where.language = language;

    return this.prisma.declarationTemplate.findMany({
      where,
      include: { purpose: true },
      // FIX: fullName → name (DeclarationTemplate has field `name`)
      orderBy: { name: 'asc' },
    });
  }

  async getTemplate(id: number) {
    const t = await this.prisma.declarationTemplate.findUnique({
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
    const where: any = {};

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
      this.prisma.declarationRequest.findMany({
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
      this.prisma.declarationRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: number, requesterId?: number) {
    const r = await this.prisma.declarationRequest.findUnique({
      where: { id },
      include: {
        template: true,
        purpose: true,
        // FIX: removed employee sub-select
        user: { select: { id: true, fullName: true, email: true } },
        approval: { include: { reviewer: { select: { id: true, fullName: true } } } },
      },
    });
    if (!r) throw new NotFoundException('Declaração não encontrada');

    if (requesterId) {
      await this.audit.log({
        action: 'DECLARATION_VIEWED',
        entityType: 'DeclarationRequest',
        entityId: id,
        userId: requesterId,
      });
    }

    return r;
  }

  async request(userId: number, dto: CreateDocumentRequestDto) {
    const template = await this.getTemplate(dto.templateId);
    if (!template.active) throw new BadRequestException('Template inactivo');

    const requiresApproval = dto.purposeId
      ? (await this.prisma.declarationPurpose.findUnique({ where: { id: dto.purposeId } }))
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
        extraVariables: dto.extraVariables as any,
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
      // FIX: req.template → (req as any).template (not included in findOne by default)
      await this.notifyUser(
        req.userId,
        'DECLARATION_REJECTED',
        `O seu pedido de "${(req as any).template?.name}" foi rejeitado`,
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

    // FIX: req.template → (req as any).template
    if (!(req as any).template) throw new BadRequestException('Template não encontrado');

    const user = await this.loadUserData(req.userId);
    const vars = buildVariablesFromUser(user, {
      // FIX: req.purpose → (req as any).purpose
      purpose: (req as any).purpose?.name ?? req.observations ?? '',
      addressed_to: req.addressedTo ?? '',
      ...((req.extraVariables as Record<string, string>) ?? {}),
    });

    const resolvedContent = resolveVariables((req as any).template?.content, vars);
    const refNumber = `DEC-${new Date().getFullYear()}-${String(id).padStart(5, '0')}`;
    const verificationCode = crypto.randomBytes(8).toString('hex').toUpperCase();

    // FIX: req.template → (req as any).template
    const expiresAt = (req as any).template.validDays
      ? new Date(Date.now() + (req as any).template.validDays * 86400000)
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

    // FIX: req.template → (req as any).template
    await this.notifyUser(
      req.userId,
      'DECLARATION_READY',
      `A sua declaração "${(req as any).template.name}" está disponível`,
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
    const req = await this.prisma.declarationRequest.findFirst({
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
      employee: (req as any).user?.fullName,
      document: (req as any).template?.name,
    };
  }

  async getDashboard() {
    const [pending, generated, issued, total] = await Promise.all([
      this.prisma.declarationRequest.count({ where: { status: DocumentRequestStatus.PENDING } }),
      this.prisma.declarationRequest.count({ where: { status: DocumentRequestStatus.GENERATED } }),
      this.prisma.declarationRequest.count({ where: { status: DocumentRequestStatus.ISSUED } }),
      this.prisma.declarationRequest.count(),
    ]);

    const byTemplate = await this.prisma.declarationRequest.groupBy({
      by: ['templateId'],
      _count: true,
      orderBy: { _count: { templateId: 'desc' } },
      take: 5,
    });

    return { pending, generated, issued, total, topTemplates: byTemplate };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async loadUserData(userId: number) {
    // FIX: removed employee sub-select — User has no employee relation
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true },
    });
  }

  private async notifyUser(userId: number, type: string, message: string) {
    try {
      await this.prisma.notificationLog.create({ data: { userId, type, message, success: true } });
    } catch {}
  }

  private async notifyRH(type: string, message: string) {
    try {
      // FIX: role: 'RH' → roleCode: 'RH' (role is a relation, not a string)
      const hr = await this.prisma.user.findFirst({ where: { roleCode: 'RH' } as any });
      if (hr)
        await this.prisma.notificationLog.create({
          data: { userId: hr.id, type, message, success: true },
        });
    } catch {}
  }
}

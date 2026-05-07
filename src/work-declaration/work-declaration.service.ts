// ============================================================
// src/modules/work-declaration/work-declaration.service.ts
// ============================================================

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../pdf/pdf.service';
import * as crypto from 'crypto';
import {
  ChangeDeclarationStatusDto,
  CreateDeclarationDto,
  CreateDeclarationTemplateDto,
  DeclarationQueryDto,
  DeclarationStatus,
  ExportDeclarationDto,
  RequestDeclarationDto,
  SendDeclarationDto,
  SignDeclarationDto,
  TemplatePreviewDto,
  TemplateQueryDto,
  UpdateDeclarationDto,
  UpdateDeclarationTemplateDto,
  UpsertTenantConfigDto,
  VerifyDeclarationDto,
} from './work-declaration.dto';

@Injectable()
export class WorkDeclarationService {
  private readonly logger = new Logger(WorkDeclarationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
  ) {}

  // ══════════════════════════════════════════════════════════
  // TEMPLATES
  // ══════════════════════════════════════════════════════════

  async createTemplate(
    tenantId: string,
    userId: string,
    dto: CreateDeclarationTemplateDto,
  ) {
    // Se novo template for default, remover default anterior do mesmo tipo
    if (dto.isDefault) {
      await (this.prisma as any).declarationTemplate.updateMany({
        where: { tenantId, type: (dto as any).type, isDefault: true },
        data: { isDefault: false },
      });
    }

    return (this.prisma as any).declarationTemplate.create({
      data: {
        ...dto,
        tenantId,
        createdById: userId,
      },
    });
  }

  async updateTemplate(
    tenantId: string,
    userId: string,
    templateId: string,
    dto: UpdateDeclarationTemplateDto,
  ) {
    const template = await this.findTemplateOrThrow(tenantId, templateId);

    if (dto.isDefault) {
      await (this.prisma as any).declarationTemplate.updateMany({
        where: { tenantId, type: (dto as any).type, isDefault: true },
        data: { isDefault: false },
      });
    }

     return (this.prisma as any).declarationTemplate.update({
      where: { id: templateId },
      data: { ...dto, updatedById: userId, version: { increment: 1 } },
    });
  }

  async listTemplates(tenantId: string, query: TemplateQueryDto) {
    const where: any = { tenantId };
    if (query.type) where.type = query.type;
    if (query.locale) where.locale = query.locale;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return (this.prisma as any).declarationTemplate.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }

  async getTemplate(tenantId: string, templateId: string) {
    return this.findTemplateOrThrow(tenantId, templateId);
  }

  async previewTemplate(tenantId: string, dto: TemplatePreviewDto) {
    const template = await this.findTemplateOrThrow(tenantId, dto.templateId);

    let variables: Record<string, string> = {};

    if (dto.employeeId) {
      const employee = await this.buildEmployeeSnapshot(dto.employeeId, tenantId);
      variables = this.buildVariableMap(employee, tenantId);
    }

    if (dto.overrideData) {
      variables = { ...variables, ...dto.overrideData };
    }

    const rendered = this.renderTemplate(template.bodyContent, variables);
    return { rendered, variables, template };
  }

  async deleteTemplate(tenantId: string, templateId: string) {
    await this.findTemplateOrThrow(tenantId, templateId);
    const usage = await (this.prisma as any).declaration.count({ where: { templateId } });
    if (usage > 0) {
      // Soft delete — apenas desativa
       return (this.prisma as any).declarationTemplate.update({
      where: { id: templateId },
        data: { isActive: false },
      });
    }
    return (this.prisma as any).declarationTemplate.delete({ where: { id: templateId } });
  }

  // ══════════════════════════════════════════════════════════
  // DECLARAÇÕES — COLABORADOR
  // ══════════════════════════════════════════════════════════

  /** Colaborador solicita uma declaração */
  async requestDeclaration(
    tenantId: string,
    requestedById: string,
    dto: RequestDeclarationDto,
  ) {
    const template = await this.findTemplateOrThrow(tenantId, dto.templateId);
    const config = await this.getTenantConfig(tenantId);

    const code = await this.generateUniqueCode(tenantId);
    const employeeSnapshot = await this.buildEmployeeSnapshot(requestedById, tenantId);

    const declaration = await (this.prisma as any).declaration.create({
      data: {
        tenantId,
        code,
        templateId: template.id,
        requestedById,
        employeeId: requestedById,
        type: dto.type,
        status: DeclarationStatus.DRAFT,
        locale: dto.locale ?? config?.defaultLocale ?? 'PT',
        layout: dto.layout ?? config?.defaultLayout ?? 'FORMAL',
        title: this.generateTitle(dto.type, template.name, dto.locale),
        purpose: dto.purpose,
        showSalary: dto.showSalary && (config?.allowSalaryExposure ?? false),
        watermark: dto.watermark ?? false,
        employeeSnapshot,
        requestNotes: dto.requestNotes,
        expiresAt: config?.defaultValidity
          ? new Date(Date.now() + config.defaultValidity * 86400 * 1000)
          : undefined,
      },
      include: this.declarationIncludes(),
    });

    await this.createAuditLog(declaration.id, requestedById, 'REQUESTED', null, DeclarationStatus.DRAFT);

    // Notificar RH
    if (config?.emailNotifications) {
      await this.notifyHrTeam(tenantId, declaration);
    }

    return declaration;
  }

  // ══════════════════════════════════════════════════════════
  // DECLARAÇÕES — RH / ADMIN
  // ══════════════════════════════════════════════════════════

  /** RH cria declaração diretamente */
  async createDeclaration(
    tenantId: string,
    createdById: string,
    dto: CreateDeclarationDto,
  ) {
    const template = await this.findTemplateOrThrow(tenantId, dto.templateId);
    const config = await this.getTenantConfig(tenantId);

    const code = await this.generateUniqueCode(tenantId);
    const employeeSnapshot = await this.buildEmployeeSnapshot(dto.employeeId, tenantId);
    const variables = this.buildVariableMap(employeeSnapshot, tenantId, config, dto.customFields);
    const renderedContent = this.renderTemplate(template.bodyContent, variables);

    const declaration = await (this.prisma as any).declaration.create({
      data: {
        tenantId,
        code,
        templateId: template.id,
        requestedById: createdById,
        assignedToId: createdById,
        employeeId: dto.employeeId,
        type: dto.type,
        status: DeclarationStatus.DRAFT,
        locale: dto.locale ?? config?.defaultLocale ?? 'PT',
        layout: dto.layout ?? config?.defaultLayout ?? 'FORMAL',
        title: dto.title,
        purpose: dto.purpose,
        showSalary: dto.showSalary && (config?.allowSalaryExposure ?? false),
        watermark: dto.watermark ?? false,
        employeeSnapshot,
        renderedContent,
        internalNotes: dto.internalNotes,
        expiresAt: config?.defaultValidity
          ? new Date(Date.now() + config.defaultValidity * 86400 * 1000)
          : undefined,
      },
      include: this.declarationIncludes(),
    });

    await this.createAuditLog(declaration.id, createdById, 'CREATED', null, DeclarationStatus.DRAFT);
    return declaration;
  }

  async updateDeclaration(
    tenantId: string,
    userId: string,
    declarationId: string,
    dto: UpdateDeclarationDto,
  ) {
    const declaration = await this.findDeclarationOrThrow(tenantId, declarationId);
    this.assertEditableStatus(declaration.status);

    let renderedContent = declaration.renderedContent;

    // Re-renderizar se campos relevantes mudaram
    if (dto.customFields !== undefined || dto.showSalary !== undefined) {
      const template = await this.findTemplateOrThrow(tenantId, declaration.templateId);
      const config = await this.getTenantConfig(tenantId);
      const variables = this.buildVariableMap(
        declaration.employeeSnapshot as any,
        tenantId,
        config,
        dto.customFields,
      );
      renderedContent = this.renderTemplate(template.bodyContent, variables);
    }

    const updated = await (this.prisma as any).declaration.update({
      where: { id: declarationId },
      data: { ...dto, renderedContent },
      include: this.declarationIncludes(),
    });

    await this.createAuditLog(updated.id, userId, 'UPDATED', declaration.status, declaration.status, { changes: Object.keys(dto) });
    return updated;
  }

  async listDeclarations(tenantId: string, userId: string, role: string, query: DeclarationQueryDto) {
    const where: any = { tenantId };

    // Colaborador vê apenas as suas
    if (role === 'EMPLOYEE') where.employeeId = userId;

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.employeeId && role !== 'EMPLOYEE') where.employeeId = query.employeeId;
    if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
    }
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      (this.prisma as any).declaration.findMany({
        where,
        include: this.declarationListIncludes(),
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip: ((query.page ?? 1) - 1) * (query.limit ?? 20),
        take: query.limit ?? 20,
      }),
      (this.prisma as any).declaration.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    };
  }

  async getDeclaration(tenantId: string, userId: string, role: string, declarationId: string) {
    const declaration = await this.findDeclarationOrThrow(tenantId, declarationId);

    if (role === 'EMPLOYEE' && declaration.employeeId !== userId) {
      throw new ForbiddenException('Sem permissão para aceder a esta declaração.');
    }

    return declaration;
  }

  // ══════════════════════════════════════════════════════════
  // FLUXO DE STATUS
  // ══════════════════════════════════════════════════════════

  async changeStatus(
    tenantId: string,
    userId: string,
    declarationId: string,
    dto: ChangeDeclarationStatusDto,
  ) {
    const declaration = await this.findDeclarationOrThrow(tenantId, declarationId);
    this.validateStatusTransition(declaration.status, dto.status);

    if (dto.status === DeclarationStatus.REVOKED && !dto.reason) {
      throw new BadRequestException('Motivo é obrigatório para revogar uma declaração.');
    }

    const data: any = {
      status: dto.status,
      revokedReason: dto.status === DeclarationStatus.REVOKED ? dto.reason : undefined,
      revokedAt: dto.status === DeclarationStatus.REVOKED ? new Date() : undefined,
      issuedAt: dto.status === DeclarationStatus.ISSUED ? new Date() : undefined,
    };

    // Se emitida, gerar PDF + QR Code
    if (dto.status === DeclarationStatus.ISSUED) {
      const { pdfUrl, qrCodeUrl, verificationHash } = await this.generateDocument(declaration);
      data.pdfUrl = pdfUrl;
      data.qrCodeUrl = qrCodeUrl;
      data.verificationHash = verificationHash;
    }

    const updated = await (this.prisma as any).declaration.update({
      where: { id: declarationId },
      data,
      include: this.declarationIncludes(),
    });

    await this.createAuditLog(updated.id, userId, 'STATUS_CHANGED', declaration.status, dto.status, { reason: dto.reason });

    // Notificar colaborador quando emitida
    if (dto.status === DeclarationStatus.ISSUED) {
      const config = await this.getTenantConfig(tenantId);
      if (config?.emailNotifications) {
        await this.notifyEmployeeIssued(updated);
      }
    }

    return updated;
  }

  // ══════════════════════════════════════════════════════════
  // ASSINATURAS
  // ══════════════════════════════════════════════════════════

  async signDeclaration(
    tenantId: string,
    userId: string,
    declarationId: string,
    dto: SignDeclarationDto,
  ) {
    const declaration = await this.findDeclarationOrThrow(tenantId, declarationId);

    if (![DeclarationStatus.DRAFT, DeclarationStatus.PENDING].includes(declaration.status as DeclarationStatus)) {
      throw new BadRequestException('Esta declaração não pode ser assinada no estado atual.');
    }

    if (dto.type === 'IMAGE_UPLOAD' && !dto.signatureUrl) {
      throw new BadRequestException('URL da assinatura é obrigatória para assinatura por imagem.');
    }

    const signature = await (this.prisma as any).declarationSignature.upsert({
      where: { declarationId_signerId: { declarationId, signerId: userId } },
      create: {
        declarationId,
        signerId: userId,
        signerRole: dto.signerRole,
        type: dto.type,
        signatureUrl: dto.signatureUrl,
        certificateData: dto.certificateData,
      },
      update: {
        type: dto.type,
        signatureUrl: dto.signatureUrl,
        certificateData: dto.certificateData,
        signedAt: new Date(),
      },
    });

    // Verificar se todas as assinaturas necessárias foram coletadas
    const config = await this.getTenantConfig(tenantId);
    await this.checkAndAdvanceStatus(declaration, config);

    await this.createAuditLog(declarationId, userId, 'SIGNED', declaration.status, null, { signerRole: dto.signerRole });

    return signature;
  }

  // ══════════════════════════════════════════════════════════
  // EXPORTAÇÃO
  // ══════════════════════════════════════════════════════════

  async exportDeclaration(
    tenantId: string,
    userId: string,
    declarationId: string,
    dto: ExportDeclarationDto,
  ) {
    const declaration = await this.findDeclarationOrThrow(tenantId, declarationId);

    if (declaration.status === DeclarationStatus.DRAFT) {
      throw new BadRequestException('Não é possível exportar uma declaração em rascunho.');
    }

    await this.createAuditLog(declarationId, userId, 'EXPORTED', null, null, { format: dto.format });
    await (this.prisma as any).declarationAccessLog.create({
      data: {
        declarationId,
        accessedVia: 'DIRECT_LINK',
      },
    });

    if (dto.format === 'PDF') {
      if (declaration.pdfUrl && !dto.includeWatermark) {
        return { url: declaration.pdfUrl };
      }
      const { pdfUrl } = await this.generateDocument(declaration as any, dto.includeWatermark);
      return { url: pdfUrl };
    }

    // DOCX
    const docxUrl = await this.generateDocx(declaration as any);
    return { url: docxUrl };
  }

  async sendDeclaration(
    tenantId: string,
    userId: string,
    declarationId: string,
    dto: SendDeclarationDto,
  ) {
    const declaration = await this.findDeclarationOrThrow(tenantId, declarationId);

    if (!declaration.pdfUrl) {
      throw new BadRequestException('Gere o documento antes de enviá-lo.');
    }

    let secureLink: string | undefined;
    if (dto.generateSecureLink) {
      secureLink = this.generateSecureLink(declaration.code);
    }

    for (const email of dto.recipientEmails) {
  // TODO: enviar email via MailService quando disponível
  this.logger?.log?.(`Declaração a enviar para ${email}`);
    }

    await this.createAuditLog(declarationId, userId, 'SENT', null, null, {
      recipients: dto.recipientEmails,
    });

    return { sent: dto.recipientEmails.length, secureLink };
  }

  // ══════════════════════════════════════════════════════════
  // VERIFICAÇÃO PÚBLICA (sem auth)
  // ══════════════════════════════════════════════════════════

  async verifyDeclaration(dto: VerifyDeclarationDto) {
    const declaration = await (this.prisma as any).declaration.findUnique({
      where: { code: dto.code },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        type: true,
        issuedAt: true,
        expiresAt: true,
        verificationHash: true,
        employeeSnapshot: true,
        tenant: { select: { name: true } },
        signatures: {
          select: { signerRole: true, signedAt: true },
        },
      },
    });

    if (!declaration) {
      return { valid: false, message: 'Declaração não encontrada.' };
    }

    await (this.prisma as any).declarationAccessLog.create({
      data: {
        declarationId: declaration.id,
        accessedVia: 'QR_CODE',
      },
    });

    const isExpired =
      declaration.expiresAt && new Date() > declaration.expiresAt;
    const isRevoked = declaration.status === DeclarationStatus.REVOKED;

    return {
      valid: !isExpired && !isRevoked && declaration.status === DeclarationStatus.ISSUED,
      code: declaration.code,
      title: declaration.title,
      type: declaration.type,
      status: declaration.status,
      issuedAt: declaration.issuedAt,
      expiresAt: declaration.expiresAt,
      company: (declaration.tenant as any)?.name,
      employee: {
        name: (declaration.employeeSnapshot as any)?.name,
        role: (declaration.employeeSnapshot as any)?.role,
      },
      signatures: declaration.signatures,
      hash: declaration.verificationHash,
    };
  }

  // ══════════════════════════════════════════════════════════
  // CONFIGURAÇÕES DO TENANT
  // ══════════════════════════════════════════════════════════

  async upsertTenantConfig(tenantId: string, dto: UpsertTenantConfigDto) {
    return (this.prisma as any).declarationTenantConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: { ...dto },
    });
  }

  async getTenantConfig(tenantId: string) {
    return (this.prisma as any).declarationTenantConfig.findUnique({
      where: { tenantId },
    });
  }

  // ══════════════════════════════════════════════════════════
  // AUDITORIA
  // ══════════════════════════════════════════════════════════

  async getAuditLogs(tenantId: string, declarationId: string) {
    await this.findDeclarationOrThrow(tenantId, declarationId);
    return (this.prisma as any).declarationAuditLog.findMany({
      where: { declarationId },
      include: { actor: { select: { id: true, name: true, email: true } } },
      orderBy: { timestamp: 'desc' },
    });
  }

  // ══════════════════════════════════════════════════════════
  // ESTATÍSTICAS
  // ══════════════════════════════════════════════════════════

  async getStats(tenantId: string) {
    const [total, byStatus, byType, recentActivity] = await Promise.all([
      (this.prisma as any).declaration.count({ where: { tenantId } }),
      (this.prisma as any).declaration.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      (this.prisma as any).declaration.groupBy({
        by: ['type'],
        where: { tenantId },
        _count: true,
      }),
      (this.prisma as any).declaration.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          employee: { select: { name: true } },
        },
      }),
    ]);

    return { total, byStatus, byType, recentActivity };
  }

  // ══════════════════════════════════════════════════════════
  // MÉTODOS PRIVADOS
  // ══════════════════════════════════════════════════════════

  private async findTemplateOrThrow(tenantId: string, templateId: string) {
    const template = await (this.prisma as any).declarationTemplate.findFirst({
      where: { id: templateId, tenantId },
    });
    if (!template) throw new NotFoundException('Template não encontrado.');
    return template;
  }

  private async findDeclarationOrThrow(tenantId: string, declarationId: string) {
    const declaration = await (this.prisma as any).declaration.findFirst({
      where: { id: declarationId, tenantId },
      include: this.declarationIncludes(),
    });
    if (!declaration) throw new NotFoundException('Declaração não encontrada.');
    return declaration;
  }

  private declarationIncludes() {
    return {
      template: true,
      employee: { select: { id: true, fullName: true, email: true } },
      requestedBy: { select: { id: true, fullName: true, email: true } },
      assignedTo: { select: { id: true, fullName: true, email: true } },
      signatures: {
       include: { signer: { select: { id: true, fullName: true } } },
      },
    };
  }

  private declarationListIncludes() {
    return {
      employee: { select: { id: true, fullName: true, email: true } },
      assignedTo: { select: { id: true, fullName: true } },
      template: { select: { id: true, name: true, type: true } },
      signatures: { select: { signerRole: true, signedAt: true } },
    };
  }

  private async generateUniqueCode(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await (this.prisma as any).declaration.count({ where: { tenantId } });
    const seq = String(count + 1).padStart(6, '0');
    return `INNOVA-${year}-${seq}`;
  }

  private generateTitle(type: string, templateName: string, locale?: string): string {
    const titles: Record<string, Record<string, string>> = {
      EMPLOYMENT: { PT: 'Declaração de Vínculo Empregatício', EN: 'Employment Declaration', FR: 'Déclaration d\'Emploi' },
      TRAINING: { PT: 'Declaração de Participação em Formação', EN: 'Training Participation Declaration', FR: 'Déclaration de Formation' },
      ATTENDANCE: { PT: 'Declaração de Frequência', EN: 'Attendance Declaration', FR: 'Déclaration de Présence' },
      PERFORMANCE: { PT: 'Declaração de Desempenho', EN: 'Performance Declaration', FR: 'Déclaration de Performance' },
      BANKING: { PT: 'Declaração para Fins Bancários', EN: 'Banking Purpose Declaration', FR: 'Déclaration Bancaire' },
      LEGAL: { PT: 'Declaração para Fins Legais', EN: 'Legal Declaration', FR: 'Déclaration Légale' },
      ACADEMIC: { PT: 'Declaração para Fins Académicos', EN: 'Academic Declaration', FR: 'Déclaration Académique' },
      CUSTOM: { PT: templateName, EN: templateName, FR: templateName },
    };
    return titles[type]?.[locale ?? 'PT'] ?? templateName;
  }

  private async buildEmployeeSnapshot(employeeId: string, tenantId: string) {
    const employee = await (this.prisma as any).user.findFirst({
    where: { id: employeeId },
    include: {
    department: true,
    position: true,
     },
      });
      if (!employee) throw new NotFoundException('Colaborador não encontrado.');
      return {
      id: employee.id,
      name: employee.fullName,
      email: employee.email,
      role: (employee as any).position?.name ?? '',
      department: (employee as any).department?.name ?? '',
      admissionDate: (employee as any).admissionDate ?? null,
      nationalId: (employee as any).nationalId ?? null,
    };
  }

  private buildVariableMap(
    snapshot: any,
    tenantId: string,
    config?: any,
    customFields?: Record<string, string>,
  ): Record<string, string> {
    const now = new Date();
    return {
      nome: snapshot.name ?? '',
      cargo: snapshot.role ?? '',
      departamento: snapshot.department ?? '',
      data_admissao: snapshot.admissionDate
        ? new Date(snapshot.admissionDate).toLocaleDateString('pt-PT')
        : '',
      empresa: config?.companyName ?? '',
      nif_empresa: config?.companyNif ?? '',
      morada_empresa: config?.companyAddress ?? '',
      contacto_empresa: config?.companyPhone ?? '',
      data: now.toLocaleDateString('pt-PT'),
      data_completa: now.toLocaleDateString('pt-PT', { dateStyle: 'long' }),
      ano: String(now.getFullYear()),
      ...customFields,
    };
  }

  private renderTemplate(bodyContent: string, variables: Record<string, string>): string {
    return bodyContent.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
  }

  private assertEditableStatus(status: string) {
    if (!['DRAFT', 'PENDING_SIGNATURE'].includes(status)) {
      throw new BadRequestException('Declaração não pode ser editada no estado atual.');
    }
  }

  private validateStatusTransition(from: string, to: string) {
    const allowed: Record<string, string[]> = {
      DRAFT: ['PENDING_SIGNATURE', 'ISSUED', 'REVOKED'],
      PENDING_SIGNATURE: ['SIGNED', 'DRAFT', 'REVOKED'],
      SIGNED: ['ISSUED', 'REVOKED'],
      ISSUED: ['REVOKED', 'EXPIRED'],
      EXPIRED: ['REVOKED'],
      REVOKED: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(`Transição de ${from} para ${to} não é permitida.`);
    }
  }

  private async checkAndAdvanceStatus(declaration: any, config: any) {
    const signatures = await (this.prisma as any).declarationSignature.findMany({
      where: { declarationId: declaration.id },
    });

    const hasHr = signatures.some((s) => s.signerRole === 'RH');
    const hasManager = signatures.some((s) => s.signerRole === 'MANAGER');
    const requireManager = config?.requireManagerSignature ?? false;

    const allSigned = hasHr && (!requireManager || hasManager);

    if (allSigned) {
      await (this.prisma as any).declaration.update({
        where: { id: declaration.id },
        data: { status: DeclarationStatus.SIGNED },
      });
    }
  }

  private async generateDocument(declaration: any, withWatermark = false) {
  const config = await this.getTenantConfig(declaration.tenantId);
  const content = declaration.renderedContent ?? '';

  await this.pdf.generateDeclarationPdf({
    content,
    config,
    declaration,
    withWatermark,
  });

  const verificationHash = crypto
    .createHash('sha256')
    .update(content + declaration.code)
    .digest('hex');

  // TODO: integrar StorageService para upload real quando disponível
  const pdfUrl = `${process.env.APP_URL}/declarations/${declaration.code}.pdf`;
  const qrCodeUrl = `${process.env.APP_URL}/declarations/${declaration.code}-qr.png`;

  return { pdfUrl, qrCodeUrl, verificationHash };
}

  private async generateDocx(declaration: any): Promise<string> {
    // Integração com biblioteca docx (eg: docx npm)
    // Placeholder — implementar via docx service
    const docxKey = `declarations/${declaration.tenantId}/${declaration.code}.docx`;
    return `${process.env.STORAGE_BASE_URL}/${docxKey}`;
  }

  generateSecureLink(code: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    // Armazenar token no Redis com TTL de 7 dias (implementar via CacheService)
    return `${process.env.APP_URL}/declarations/secure/${code}?token=${token}`;
  }

  private async notifyHrTeam(tenantId: string, declaration: any) {
  // TODO: notificar via NotificationsService quando disponível
}

  private async notifyEmployeeIssued(declaration: any) {
  // TODO: notificar via NotificationsService quando disponível
}

  private async createAuditLog(
    declarationId: string,
    actorId: string,
    action: string,
    fromStatus: string | null,
    toStatus: string | null,
    details?: object,
  ) {
    await (this.prisma as any).declarationAuditLog.create({
      data: {
        declarationId,
        actorId,
        action,
        fromStatus: fromStatus as any,
        toStatus: toStatus as any,
        details: details ?? {},
      },
    });
  }
}
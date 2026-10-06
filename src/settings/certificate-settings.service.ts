// src/settings/certificate-settings.service.ts
// Módulo Definições §7 (Certificados): valores globais (logo, assinatura,
// texto padrão, numeração) + biblioteca de templates (CertificateTemplate).
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { CertificateTemplateType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import {
  CreateCertificateTemplateDto,
  UpdateCertificateSettingsDto,
  UpdateCertificateTemplateDto,
} from './settings.dto';
import {
  CertificateSettings,
  formatCertificateNumber,
  parseCertificateSettings,
} from './certificate-settings';

@Injectable()
export class CertificateSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async tenant() {
    const id = await resolveDefaultTenantId(this.prisma);
    return this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { id: true, certificateSettingsJson: true },
    });
  }

  private async audit(userId: number | undefined, action: string, metadata: unknown) {
    await writeChainedAuditLog(this.prisma, {
      userId,
      action,
      entity: 'Settings',
      severity: 'MEDIUM',
      metadata: JSON.stringify(metadata),
    }).catch(() => undefined);
  }

  // ─── Definições globais ───────────────────────────────────────────────────

  async get() {
    const t = await this.tenant();
    const settings = parseCertificateSettings(t.certificateSettingsJson);
    return { ...settings, nextNumberPreview: formatCertificateNumber(settings) };
  }

  async update(dto: UpdateCertificateSettingsDto, actorId?: number) {
    const t = await this.tenant();
    const current = parseCertificateSettings(t.certificateSettingsJson);
    const next: CertificateSettings = {
      ...current,
      ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
    };
    await this.prisma.tenantConfig.update({
      where: { id: t.id },
      data: { certificateSettingsJson: JSON.stringify(next) },
    });
    await this.audit(actorId, 'SETTINGS_CERTIFICATES_UPDATE', { before: current, after: next });
    return this.get();
  }

  // ─── Biblioteca de templates ──────────────────────────────────────────────

  async listTemplates() {
    return this.prisma.read.certificateTemplate.findMany({
      where: { deletedAt: null },
      orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  private async unsetDefaultsForType(type: CertificateTemplateType, exceptId?: string) {
    await this.prisma.certificateTemplate.updateMany({
      where: { type, isDefault: true, id: exceptId ? { not: exceptId } : undefined },
      data: { isDefault: false },
    });
  }

  async createTemplate(dto: CreateCertificateTemplateDto, actorId: number) {
    if (dto.isDefault) await this.unsetDefaultsForType(dto.type);
    const template = await this.prisma.certificateTemplate.create({
      data: { ...dto, createdById: actorId },
    });
    await this.audit(actorId, 'SETTINGS_CERTIFICATE_TEMPLATE_CREATE', {
      id: template.id,
      name: template.name,
    });
    return template;
  }

  async updateTemplate(id: string, dto: UpdateCertificateTemplateDto, actorId: number) {
    const existing = await this.prisma.certificateTemplate.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Template não encontrado');
    if (dto.isDefault) await this.unsetDefaultsForType(dto.type ?? existing.type, id);
    const template = await this.prisma.certificateTemplate.update({ where: { id }, data: dto });
    await this.audit(actorId, 'SETTINGS_CERTIFICATE_TEMPLATE_UPDATE', { id, changes: dto });
    return template;
  }

  async deleteTemplate(id: string, actorId: number) {
    const existing = await this.prisma.certificateTemplate.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Template não encontrado');
    if (existing.isDefault) {
      throw new BadRequestException(
        'Este template é o predefinido do seu tipo — defina outro predefinido antes de o remover',
      );
    }
    await this.prisma.certificateTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(actorId, 'SETTINGS_CERTIFICATE_TEMPLATE_DELETE', { id, name: existing.name });
    return { id, deleted: true };
  }

  async setDefaultTemplate(id: string, actorId: number) {
    const existing = await this.prisma.certificateTemplate.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Template não encontrado');
    await this.unsetDefaultsForType(existing.type, id);
    const template = await this.prisma.certificateTemplate.update({
      where: { id },
      data: { isDefault: true },
    });
    await this.audit(actorId, 'SETTINGS_CERTIFICATE_TEMPLATE_SET_DEFAULT', {
      id,
      type: existing.type,
    });
    return template;
  }
}

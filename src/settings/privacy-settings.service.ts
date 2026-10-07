// src/settings/privacy-settings.service.ts
// Módulo Definições §8 (Privacidade / LPDP): textos de consentimento, prazos
// de retenção, contacto do DPO e gestão dos pedidos de direitos dos titulares
// (modelo DataSubjectRequest).
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DsrStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import {
  CreateDataSubjectRequestDto,
  PublishConsentTextDto,
  UpdateDataSubjectRequestDto,
  UpdatePrivacySettingsDto,
} from './settings.dto';
import {
  PrivacySettings,
  currentConsentVersion,
  parsePrivacySettings,
  publishConsentVersion,
} from './privacy-settings';

@Injectable()
export class PrivacySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async tenant() {
    const id = await resolveDefaultTenantId(this.prisma);
    return this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { id: true, privacySettingsJson: true },
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

  // ─── Definições gerais + consentimento ────────────────────────────────────

  async get() {
    const t = await this.tenant();
    const settings = parsePrivacySettings(t.privacySettingsJson);
    const [pending, inProgress] = await Promise.all([
      this.prisma.read.dataSubjectRequest.count({
        where: { tenantId: t.id, status: DsrStatus.PENDING },
      }),
      this.prisma.read.dataSubjectRequest.count({
        where: { tenantId: t.id, status: DsrStatus.IN_PROGRESS },
      }),
    ]);
    return {
      ...settings,
      currentConsentVersion: currentConsentVersion(settings),
      openRequests: pending + inProgress,
    };
  }

  async update(dto: UpdatePrivacySettingsDto, actorId?: number) {
    const t = await this.tenant();
    const current = parsePrivacySettings(t.privacySettingsJson);
    const next: PrivacySettings = {
      ...current,
      ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
    };
    await this.prisma.tenantConfig.update({
      where: { id: t.id },
      data: { privacySettingsJson: JSON.stringify(next) },
    });
    await this.audit(actorId, 'SETTINGS_PRIVACY_UPDATE', { before: current, after: next });
    return this.get();
  }

  async publishConsentText(dto: PublishConsentTextDto, actorId?: number) {
    const t = await this.tenant();
    const current = parsePrivacySettings(t.privacySettingsJson);
    const next = publishConsentVersion(current, dto.text);
    await this.prisma.tenantConfig.update({
      where: { id: t.id },
      data: { privacySettingsJson: JSON.stringify(next) },
    });
    await this.audit(actorId, 'SETTINGS_PRIVACY_CONSENT_PUBLISH', {
      version: currentConsentVersion(next)?.version,
    });
    return this.get();
  }

  async listConsentVersions() {
    const t = await this.tenant();
    return parsePrivacySettings(t.privacySettingsJson).consentVersions.slice().reverse();
  }

  // ─── Pedidos de direitos dos titulares ────────────────────────────────────

  async listRequests(filters: { status?: DsrStatus; page?: number; limit?: number }) {
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = Math.min(filters.limit && filters.limit > 0 ? filters.limit : 20, 100);
    const where = { tenantId, ...(filters.status && { status: filters.status }) };
    const [items, total] = await Promise.all([
      this.prisma.read.dataSubjectRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.read.dataSubjectRequest.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async createRequest(dto: CreateDataSubjectRequestDto, actorId?: number) {
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const request = await this.prisma.dataSubjectRequest.create({
      data: { ...dto, tenantId },
    });
    await this.audit(actorId, 'SETTINGS_PRIVACY_DSR_CREATE', {
      id: request.id,
      type: request.type,
    });
    return request;
  }

  async updateRequest(id: number, dto: UpdateDataSubjectRequestDto, actorId?: number) {
    const existing = await this.prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pedido não encontrado');
    if (existing.status === DsrStatus.COMPLETED || existing.status === DsrStatus.REJECTED) {
      throw new BadRequestException('Este pedido já foi encerrado');
    }
    const resolved = dto.status === DsrStatus.COMPLETED || dto.status === DsrStatus.REJECTED;
    const request = await this.prisma.dataSubjectRequest.update({
      where: { id },
      data: {
        ...dto,
        handledById: actorId,
        resolvedAt: resolved ? new Date() : undefined,
      },
    });
    await this.audit(actorId, 'SETTINGS_PRIVACY_DSR_UPDATE', {
      id,
      before: existing.status,
      after: request.status,
    });
    return request;
  }
}

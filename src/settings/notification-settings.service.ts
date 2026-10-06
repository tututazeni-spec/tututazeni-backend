// src/settings/notification-settings.service.ts
// Módulo Definições §5 (Notificações): canais, eventos e horário permitido de envio.
// Os templates das mensagens continuam em NotificationTemplate
// (GET/POST/PATCH/DELETE /notifications/templates) — aqui só se lêem para o resumo.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { UpdateNotificationSettingsDto } from './settings.dto';
import {
  NOTIFICATION_EVENT_KEYS,
  NotificationSettings,
  isEventDisabled,
  isWithinSendWindow,
  parseNotificationSettings,
} from './notification-settings';

const TTL_MS = 30_000;

@Injectable()
export class NotificationSettingsService {
  private cache: { at: number; settings: NotificationSettings; timeZone: string } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async load() {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache;
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUnique({
      where: { id },
      select: { notificationSettingsJson: true, defaultTimezone: true },
    });
    this.cache = {
      at: Date.now(),
      settings: parseNotificationSettings(row?.notificationSettingsJson),
      timeZone: row?.defaultTimezone ?? 'Africa/Luanda',
    };
    return this.cache;
  }

  async get() {
    const { settings, timeZone } = await this.load();
    const templates = await this.prisma.read.notificationTemplate.count({
      where: { active: true },
    });
    return {
      ...settings,
      timeZone,
      eventKeys: NOTIFICATION_EVENT_KEYS,
      activeTemplates: templates,
    };
  }

  async update(dto: UpdateNotificationSettingsDto, actorId?: number) {
    const id = await resolveDefaultTenantId(this.prisma);
    const row = await this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { notificationSettingsJson: true },
    });
    const current = parseNotificationSettings(row.notificationSettingsJson);
    const strip = <T extends object>(o?: T) =>
      Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));
    const next: NotificationSettings = {
      channels: { ...current.channels, ...strip(dto.channels) },
      events: { ...current.events, ...strip(dto.events) },
      sendWindow: { ...current.sendWindow, ...strip(dto.sendWindow) },
      criticalBypassWindow: dto.criticalBypassWindow ?? current.criticalBypassWindow,
    };
    await this.prisma.tenantConfig.update({
      where: { id },
      data: { notificationSettingsJson: JSON.stringify(next) },
    });
    this.cache = null;
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action: 'SETTINGS_NOTIFICATIONS_UPDATE',
      entity: 'Settings',
      severity: 'MEDIUM',
      metadata: JSON.stringify({ before: current, after: next }),
    }).catch(() => undefined);
    return this.get();
  }

  // ─── Consultas usadas por NotificationsService ────────────────────────────

  /** A organização desligou o evento a que este `type` pertence? */
  async isEventDisabled(type: string): Promise<boolean> {
    return isEventDisabled((await this.load()).settings, type);
  }

  /** Canais globalmente ligados e se o horário permite envio externo agora. */
  async deliveryPlan(critical: boolean): Promise<{
    inApp: boolean;
    email: boolean;
    whatsapp: boolean;
  }> {
    const { settings, timeZone } = await this.load();
    const open = isWithinSendWindow(settings, new Date(), timeZone, critical);
    return {
      inApp: settings.channels.inApp,
      email: settings.channels.email && open,
      whatsapp: settings.channels.whatsapp && open,
    };
  }
}

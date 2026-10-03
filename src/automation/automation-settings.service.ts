// src/automation/automation-settings.service.ts
// §10 — limites de frequência/concorrência, profundidade de cadeias, alertas,
// retenção e política de aprovação. Linha única em AutomationSettings, com cache curto.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAutomationSettingsDto } from './automation-governance.dto';
import { AutomationAuditService, diffFields } from './automation-audit.service';

export interface AutomationLimits {
  maxExecutionsPerMinute: number;
  maxConcurrentPerRule: number;
  maxEventDepth: number;
  requireApprovalCritical: boolean;
  failureAlertThreshold: number;
  failureAlertWindowMinutes: number;
  archiveAfterDays: number;
  retentionDays: number;
  deadLetterRetentionDays: number;
  auditRetentionDays: number;
}

export const DEFAULT_LIMITS: AutomationLimits = {
  maxExecutionsPerMinute: 120,
  maxConcurrentPerRule: 5,
  maxEventDepth: 5,
  requireApprovalCritical: true,
  failureAlertThreshold: 5,
  failureAlertWindowMinutes: 60,
  archiveAfterDays: 90,
  retentionDays: 365,
  deadLetterRetentionDays: 180,
  auditRetentionDays: 730,
};

const CACHE_MS = 15_000;
const KEYS = Object.keys(DEFAULT_LIMITS) as (keyof AutomationLimits)[];

@Injectable()
export class AutomationSettingsService {
  private readonly logger = new Logger(AutomationSettingsService.name);
  private cache: { at: number; value: AutomationLimits } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AutomationAuditService,
  ) {}

  /** Limites em vigor; se a leitura falhar usa os valores por omissão (o motor nunca pára por isto). */
  async get(): Promise<AutomationLimits> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const value: AutomationLimits = { ...DEFAULT_LIMITS };
    try {
      const row = await this.prisma.automationSettings.findUnique({ where: { id: 'default' } });
      if (row) {
        for (const k of KEYS) (value as unknown as Record<string, unknown>)[k] = row[k];
      }
    } catch (e: unknown) {
      this.logger.warn({
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao ler as definições de automação — a usar valores por omissão',
      });
    }
    this.cache = { at: Date.now(), value };
    return value;
  }

  async getDetail() {
    const row = await this.prisma.automationSettings.findUnique({ where: { id: 'default' } });
    return {
      ...(await this.get()),
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  async update(dto: UpdateAutomationSettingsDto, userId: number) {
    const before = await this.get();
    const data: Partial<AutomationLimits> = {};
    for (const k of KEYS) {
      if (dto[k] !== undefined) (data as Record<string, unknown>)[k] = dto[k];
    }
    const retention = data.retentionDays ?? before.retentionDays;
    const archive = data.archiveAfterDays ?? before.archiveAfterDays;
    if (retention < archive) {
      throw new BadRequestException('A retenção tem de ser igual ou superior ao prazo de arquivo');
    }
    await this.prisma.automationSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data, updatedBy: userId },
      update: { ...data, updatedBy: userId },
    });
    this.cache = null;
    const after = await this.get();
    const changed = diffFields(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      entity: 'SETTINGS',
      action: 'SETTINGS_UPDATED',
      entityId: 'default',
      userId,
      ...changed,
    });
    return this.getDetail();
  }
}

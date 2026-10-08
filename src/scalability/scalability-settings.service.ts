// modulo_scalability.md §24 — aba Configurações.
//
// Agrega as definições que governam o módulo: limites (CPU, memória, storage,
// latência, erros, concorrência, filas), regras de alertas (limiar + activar),
// resumo da política de auto scaling (editada na aba Auto Scaling), janelas de
// manutenção, retenção de métricas, frequência de recolha e perfis autorizados.
// Tudo é persistido em ScalabilityInfraSettings e cada alteração vai para o Audit.
// Os limites e regras são lidos de facto pelo motor de alertas; a retenção é
// aplicada por um cron diário; a frequência pelo cron de recolha de métricas.

import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, ScalabilityInfraSettings } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Role } from '../auth/enums/role.enum';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/types/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { buildRules } from './scalability-alerts.service';
import { UpdateScalabilitySettingsDto } from './scalability-settings.dto';
import {
  activeWindow,
  ALERT_THRESHOLD_DEFAULTS,
  MaintenanceWindow,
  parseJson,
  parseWindows,
  resolveThresholds,
  THRESHOLD_KEYS,
  THRESHOLD_RANGES,
} from './scalability-settings.util';

const SETTINGS_ID = 'default';

/** Perfis que o ADMIN pode conceder (além de si próprio) — nunca colaboradores comuns. */
export const GRANTABLE_ROLES = [Role.AUDITOR, Role.DIRECTOR, Role.GESTOR, Role.RH] as const;
const DEFAULT_AUTHORIZED: string[] = [Role.AUDITOR];

@Injectable()
export class ScalabilitySettingsService {
  private readonly logger = new Logger(ScalabilitySettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private row(): Promise<ScalabilityInfraSettings> {
    return this.prisma.scalabilityInfraSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  private authorized(s: ScalabilityInfraSettings): string[] {
    const v = parseJson<unknown>(s.authorizedRolesJson, null);
    return Array.isArray(v) ? (v as string[]) : DEFAULT_AUTHORIZED;
  }

  /** ADMIN sempre; os restantes só se o perfil estiver na lista autorizada. */
  async canAccess(user: CurrentUserData): Promise<boolean> {
    const role = user.role?.name;
    if (!role) return false;
    if (role === Role.ADMIN) return true;
    return this.authorized(await this.row()).includes(role);
  }

  async assertCanAccess(user: CurrentUserData): Promise<void> {
    if (!(await this.canAccess(user))) {
      throw new ForbiddenException('O seu perfil não está autorizado a aceder a esta área');
    }
  }

  async getSettings() {
    const s = await this.row();
    const T = resolveThresholds(s.thresholdsJson);
    const stored = parseJson<Record<string, unknown>>(s.thresholdsJson, {});
    const disabled = new Set(parseJson<string[]>(s.disabledRulesJson, []));
    const windows = parseWindows(s.maintenanceWindowsJson);
    const rules = buildRules(T);
    const defaultRules = buildRules({ ...ALERT_THRESHOLD_DEFAULTS });

    const groupOf = (key: keyof typeof ALERT_THRESHOLD_DEFAULTS) => ({
      key,
      value: T[key],
      default: ALERT_THRESHOLD_DEFAULTS[key],
      customised: typeof stored[key] === 'number' && stored[key] !== ALERT_THRESHOLD_DEFAULTS[key],
      min: THRESHOLD_RANGES[key][0],
      max: THRESHOLD_RANGES[key][1],
    });

    return {
      updatedAt: s.updatedAt.toISOString(),
      limits: {
        // Capacidade (partilhados com a aba Capacidade)
        maxConcurrentUsers: s.maxConcurrentUsers,
        maxApiRps: s.maxApiRps,
        // Limiares das regras de alerta
        cpu: groupOf('cpu'),
        memory: groupOf('ram'),
        storage: groupOf('storage'),
        dbConnections: groupOf('dbConnections'),
        latencyP95Ms: groupOf('p95Ms'),
        latencyP99Ms: groupOf('p99Ms'),
        errorRate: groupOf('errorRate'),
        queuePending: groupOf('queuePending'),
        slowQueryShare: groupOf('slowQueryShare'),
        slowEndpoints: groupOf('slowEndpoints'),
      },
      growth: {
        growthFactor: groupOf('growthFactor'),
        storageGrowthFactor: groupOf('storageGrowthFactor'),
        usersNearLimitMonths: groupOf('usersNearLimitMonths'),
      },
      alertRules: rules.map(r => ({
        key: r.key,
        group: r.group,
        label: r.label,
        severity: r.severity,
        condition: r.condition,
        defaultCondition: defaultRules.find(d => d.key === r.key)?.condition ?? r.condition,
        enabled: !disabled.has(r.key),
      })),
      autoScaling: {
        enabled: s.asEnabled,
        minInstances: s.asMinInstances,
        maxInstances: s.asMaxInstances,
        targetCpu: s.asTargetCpu,
        targetMemory: s.asTargetMemory,
        emergencyEnabled: s.asEmergencyEnabled,
        note: 'Editável na aba Auto Scaling.',
      },
      maintenanceWindows: windows
        .slice()
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map(w => ({ ...w, active: !!activeWindow([w]) })),
      activeMaintenance: activeWindow(windows),
      retention: { metricRetentionDays: s.metricRetentionDays },
      collection: { intervalMinutes: s.collectionIntervalMin },
      authorizedRoles: this.authorized(s),
      grantableRoles: [...GRANTABLE_ROLES],
      note:
        'Os limiares alteram as regras de alerta da aba Alertas (avaliadas de 5 em 5 minutos). ' +
        'Durante uma janela de manutenção não são criados alertas novos. A retenção apaga amostras ' +
        'de métricas mais antigas, uma vez por dia. ADMIN tem sempre acesso.',
    };
  }

  async update(dto: UpdateScalabilitySettingsDto, actorId: number) {
    const before = await this.row();
    const data: Prisma.ScalabilityInfraSettingsUpdateInput = { updatedById: actorId };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const track = (k: string, from: unknown, to: unknown) => {
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
    };

    if (dto.maxConcurrentUsers !== undefined) {
      data.maxConcurrentUsers = dto.maxConcurrentUsers;
      track('maxConcurrentUsers', before.maxConcurrentUsers, dto.maxConcurrentUsers);
    }
    if (dto.maxApiRps !== undefined) {
      data.maxApiRps = dto.maxApiRps;
      track('maxApiRps', before.maxApiRps, dto.maxApiRps);
    }

    if (dto.thresholds) {
      const current = resolveThresholds(before.thresholdsJson);
      const next = { ...current };
      for (const [k, v] of Object.entries(dto.thresholds)) {
        if (!(THRESHOLD_KEYS as string[]).includes(k)) {
          throw new BadRequestException(`Limiar desconhecido: ${k}`);
        }
        const key = k as keyof typeof next;
        const [min, max] = THRESHOLD_RANGES[key];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
          throw new BadRequestException(`${k} deve estar entre ${min} e ${max}`);
        }
        next[key] = v;
      }
      if (next.p99Ms < next.p95Ms) {
        throw new BadRequestException('O limite de P99 não pode ser inferior ao de P95');
      }
      // Só guarda o que difere do padrão — repor o padrão limpa a personalização.
      const diff = Object.fromEntries(
        THRESHOLD_KEYS.filter(k => next[k] !== ALERT_THRESHOLD_DEFAULTS[k]).map(k => [k, next[k]]),
      );
      data.thresholdsJson = Object.keys(diff).length ? JSON.stringify(diff) : null;
      for (const k of THRESHOLD_KEYS) track(`threshold.${k}`, current[k], next[k]);
    }

    if (dto.disabledRules) {
      const valid = new Set(buildRules({ ...ALERT_THRESHOLD_DEFAULTS }).map(r => r.key));
      const bad = dto.disabledRules.filter(k => !valid.has(k));
      if (bad.length) throw new BadRequestException(`Regras desconhecidas: ${bad.join(', ')}`);
      const next = [...new Set(dto.disabledRules)].sort();
      data.disabledRulesJson = next.length ? JSON.stringify(next) : null;
      track('disabledRules', parseJson<string[]>(before.disabledRulesJson, []).sort(), next);
    }

    if (dto.maintenanceWindows) {
      const next: MaintenanceWindow[] = dto.maintenanceWindows.map(w => {
        const start = new Date(w.startsAt);
        const end = new Date(w.endsAt);
        if (!(end.getTime() > start.getTime())) {
          throw new BadRequestException(`Janela "${w.name}": o fim tem de ser posterior ao início`);
        }
        return {
          id: w.id || randomUUID(),
          name: w.name.trim(),
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          note: w.note?.trim() || null,
        };
      });
      data.maintenanceWindowsJson = next.length ? JSON.stringify(next) : null;
      track('maintenanceWindows', parseWindows(before.maintenanceWindowsJson), next);
    }

    if (dto.metricRetentionDays !== undefined) {
      data.metricRetentionDays = dto.metricRetentionDays;
      track('metricRetentionDays', before.metricRetentionDays, dto.metricRetentionDays);
    }
    if (dto.collectionIntervalMinutes !== undefined) {
      data.collectionIntervalMin = dto.collectionIntervalMinutes;
      track('collectionIntervalMin', before.collectionIntervalMin, dto.collectionIntervalMinutes);
    }

    if (dto.authorizedRoles) {
      const allowed = new Set<string>(GRANTABLE_ROLES);
      const bad = dto.authorizedRoles.filter(r => !allowed.has(r));
      if (bad.length) throw new BadRequestException(`Perfil não concedível: ${bad.join(', ')}`);
      const next = [...new Set(dto.authorizedRoles)].sort();
      data.authorizedRolesJson = JSON.stringify(next);
      track('authorizedRoles', [...this.authorized(before)].sort(), next);
    }

    await this.prisma.scalabilityInfraSettings.update({ where: { id: SETTINGS_ID }, data });

    if (Object.keys(changes).length) {
      await this.audit
        .logEntity(
          actorId,
          'SCALABILITY_SETTINGS_UPDATE',
          'ScalabilityInfraSettings',
          SETTINGS_ID,
          {
            changes,
          },
        )
        .catch(err =>
          this.logger.warn(`Auditoria falhou: ${err instanceof Error ? err.message : err}`),
        );
    }
    return this.getSettings();
  }

  /** Retenção: apaga amostras de métricas mais antigas que o período definido. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldMetrics() {
    try {
      const { metricRetentionDays } = await this.row();
      const cutoff = new Date(Date.now() - metricRetentionDays * 86_400_000);
      const r = await this.prisma.scalabilityMetric.deleteMany({
        where: { capturedAt: { lt: cutoff } },
      });
      if (r.count) {
        this.logger.log(
          `Retenção: ${r.count} amostra(s) de métricas anteriores a ${cutoff.toISOString()} apagadas`,
        );
      }
    } catch (err) {
      this.logger.warn(`Retenção de métricas falhou: ${err instanceof Error ? err.message : err}`);
    }
  }
}

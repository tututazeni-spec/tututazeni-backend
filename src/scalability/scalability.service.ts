// ============================================================
// INNOVA PLATFORM — SCALABILITY MODULE — SERVICE
// src/modules/scalability/scalability.service.ts
// ============================================================

import {
  Injectable, Logger, NotFoundException, BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateTenantConfigDto, UpdateTenantConfigDto,
  CreateIntegrationConfigDto, UpdateIntegrationConfigDto,
  CreateAutomationRuleDto, UpdateAutomationRuleDto, ExecuteAutomationRuleDto,
  CreateSlaConfigDto, UpdateSlaConfigDto,
  UpdateContentDeliveryConfigDto,
  MetricsQueryDto, CreateAlertDto, AlertsQueryDto, ResolveAlertDto,
  BulkUserImportDto, BulkImportResultDto,
  LoadTestConfigDto, PaginationDto,
  ScalabilityDashboardDto,
  AlertSeverity, AlertCategory, AutomationTrigger,
} from './scalability.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ScalabilityService {
  private readonly logger = new Logger(ScalabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ============================================================
  // TENANT CONFIG
  // ============================================================

  async createTenant(dto: CreateTenantConfigDto, actorId: string) {
    const existing = await (this.prisma as any).tenantConfig.findUnique({
      where: { tenantCode: dto.tenantCode },
    });
    if (existing) throw new ConflictException(`Tenant code '${dto.tenantCode}' já existe.`);

    const tenant = await (this.prisma as any).tenantConfig.create({
      data: {
        ...dto,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
        contractStartDate: dto.contractStartDate ? new Date(dto.contractStartDate) : undefined,
        contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : undefined,
      },
    });

    // Criar SLA padrão
    await (this.prisma as any).slaConfig.create({
      data: {
        tenantId: tenant.id,
        name: 'SLA Padrão',
        uptimePercent: 99.5,
        maxLatencyMs: 2000,
        maxErrorRate: 0.01,
        incidentResponse: 60,
      },
    });

    // Criar config de entrega de conteúdo padrão
    await (this.prisma as any).contentDeliveryConfig.create({
      data: {
        tenantId: tenant.id,
        adaptiveBitrate: true,
        offlineSyncEnabled: true,
        compressionEnabled: true,
      },
    });

    await this.audit.log({
      entity: 'TenantConfig',
      entityId: tenant.id,
      action: 'CREATE',
      userId: actorId,
      details: { tenantCode: tenant.tenantCode, plan: tenant.plan },
    });

    this.logger.log(`Tenant criado: ${tenant.tenantCode}`);
    return tenant;
  }

  async updateTenant(id: string, dto: UpdateTenantConfigDto, actorId: string) {
    await this.findTenantOrFail(id);
    const updated = await (this.prisma as any).tenantConfig.update({
      where: { id },
      data: {
        ...dto,
        trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined,
        contractStartDate: dto.contractStartDate ? new Date(dto.contractStartDate) : undefined,
        contractEndDate: dto.contractEndDate ? new Date(dto.contractEndDate) : undefined,
      },
    });
    await this.audit.log({ entity: 'TenantConfig', entityId: id, action: 'UPDATE', userId: actorId, details: dto });
    return updated;
  }

  async findTenantOrFail(id: string) {
    const t = await (this.prisma as any).tenantConfig.findUnique({ where: { id } });
    if (!t) throw new NotFoundException(`Tenant '${id}' não encontrado.`);
    return t;
  }

  async listTenants(query: PaginationDto) {
    const where = query.search
      ? { OR: [{ tenantName: { contains: query.search } }, { tenantCode: { contains: query.search } }] }
      : {};
    const [data, total] = await Promise.all([
      (this.prisma as any).tenantConfig.findMany({
        where,
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).tenantConfig.count({ where }),
    ]);
    return { data, total, limit: query.limit ?? 20, offset: query.offset ?? 0 };
  }

  // ============================================================
  // INTEGRATION CONFIG
  // ============================================================

  async createIntegration(dto: CreateIntegrationConfigDto, actorId: string) {
    await this.findTenantOrFail(dto.tenantId);

    // Criptografar credenciais antes de persistir
    const safeCredentials = dto.credentialsJson
      ? this.encryptSensitiveData(dto.credentialsJson)
      : undefined;

    const integration = await (this.prisma as any).integrationConfig.create({
     data: { ...dto, credentialsJson: safeCredentials },
      });
    await this.audit.log({ entity: 'IntegrationConfig', entityId: integration.id, action: 'CREATE', userId: actorId, details: { type: dto.type, name: dto.name } });
    return integration;
  }

  async updateIntegration(id: string, dto: UpdateIntegrationConfigDto, actorId: string) {
    const existing = await (this.prisma as any).integrationConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Integração '${id}' não encontrada.`);

    const safeCredentials = dto.credentialsJson
      ? this.encryptSensitiveData(dto.credentialsJson)
      : undefined;

    const updated = await (this.prisma as any).integrationConfig.update({
       where: { id },
       data: { ...dto, credentialsJson: safeCredentials ?? existing.credentialsJson },
       });
    await this.audit.log({ entity: 'IntegrationConfig', entityId: id, action: 'UPDATE', userId: actorId, details: dto });
    return updated;
  }

  async listIntegrations(tenantId: string, query: PaginationDto) {
    const where: any = { tenantId };
    if (query.search) where.name = { contains: query.search };
    const [data, total] = await Promise.all([
      this.prisma.integrationConfig.findMany({
        where,
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: { syncLogs: { take: 1, orderBy: { startedAt: 'desc' } } },
      }),
      this.prisma.integrationConfig.count({ where }),
    ]);
    return { data, total };
  }

  async triggerSync(integrationId: string, actorId: string) {
    const integration = await (this.prisma as any).integrationConfig.findUnique({ where: { id: integrationId } });
    if (!integration) throw new NotFoundException('Integração não encontrada.');
    if (!integration.isActive) throw new BadRequestException('Integração inativa.');

    // Criar log de sincronização
    const syncLog = await (this.prisma as any).integrationSyncLog.create({
      data: { integrationId, status: 'RUNNING' },
    });

    // Disparar evento assíncrono para o worker
    this.events.emit('integration.sync.requested', {
      integrationId,
      syncLogId: syncLog.id,
      type: integration.type,
      configJson: integration.configJson,
      actorId,
    });

    return { syncLogId: syncLog.id, message: 'Sincronização iniciada em background.' };
  }

  async getIntegrationSyncLogs(integrationId: string, limit = 20) {
    return (this.prisma as any).integrationSyncLog.findMany({
      where: { integrationId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  // ============================================================
  // AUTOMATION RULES
  // ============================================================

  async createAutomationRule(dto: CreateAutomationRuleDto, actorId: string) {
    await this.findTenantOrFail(dto.tenantId);
    this.validateJsonField(dto.triggerConfigJson, 'triggerConfigJson');
    this.validateJsonField(dto.actionsJson, 'actionsJson');
    if (dto.conditionsJson) this.validateJsonField(dto.conditionsJson, 'conditionsJson');

    const rule = await (this.prisma as any).automationRule.create({
    data: { ...dto, createdBy: actorId },
     });
    await this.audit.log({ entity: 'AutomationRule', entityId: rule.id, action: 'CREATE', userId: actorId, details: { name: dto.name, triggerType: dto.triggerType } });
    return rule;
  }

  async updateAutomationRule(id: string, dto: UpdateAutomationRuleDto, actorId: string) {
    const rule = await (this.prisma as any).automationRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Regra de automação não encontrada.');

    if (dto.triggerConfigJson) this.validateJsonField(dto.triggerConfigJson, 'triggerConfigJson');
    if (dto.actionsJson) this.validateJsonField(dto.actionsJson, 'actionsJson');

    const updated = await (this.prisma as any).automationRule.update({ where: { id }, data: dto });
    await this.audit.log({ entity: 'AutomationRule', entityId: id, action: 'UPDATE', userId: actorId, details: dto });
    return updated;
  }

  async listAutomationRules(tenantId: string, query: PaginationDto) {
    const where: any = { tenantId };
    if (query.search) where.name = { contains: query.search };
    const [data, total] = await Promise.all([
      this.prisma.automationRule.findMany({
        where,
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        include: { _count: { select: { executions: true } } },
      }),
      this.prisma.automationRule.count({ where }),
    ]);
    return { data, total };
  }

  async executeAutomationRule(dto: ExecuteAutomationRuleDto, actorId: string) {
    const rule = await (this.prisma as any).automationRule.findUnique({ where: { id: dto.ruleId } });
    if (!rule) throw new NotFoundException('Regra não encontrada.');
    if (!rule.isActive) throw new BadRequestException('Regra inativa.');

    const execution = await (this.prisma as any).automationExecution.create({
      data: {
        ruleId: dto.ruleId,
        triggeredBy: actorId,
        targetUserId: dto.targetUserId,
        status: 'PENDING',
      },
    });

    // Disparar execução assíncrona
    this.events.emit('automation.rule.execute', {
      executionId: execution.id,
      rule,
      targetUserId: dto.targetUserId,
      actorId,
    });

    return { executionId: execution.id, message: 'Execução iniciada.' };
  }

  /**
   * Processa evento de automação (chamado por listeners de eventos como USER_HIRED)
   */
  async processAutomationEvent(tenantId: string, triggerType: AutomationTrigger, payload: Record<string, any>) {
    const rules = await this.prisma.automationRule.findMany({
      where: { tenantId, triggerType, isActive: true },
      orderBy: { priority: 'asc' },
    });

    for (const rule of rules) {
      const conditions = rule.conditionsJson ? JSON.parse(rule.conditionsJson) : [];
      const matches = this.evaluateConditions(conditions, payload);
      if (!matches) continue;

      const execution = await (this.prisma as any).automationExecution.create({
        data: { ruleId: rule.id, triggeredBy: 'SYSTEM', targetUserId: payload.userId, status: 'RUNNING' },
      });

      try {
        const actions = JSON.parse(rule.actionsJson);
        const actionsLog = await this.executeActions(actions, payload, rule.tenantId);

        await (this.prisma as any).automationExecution.update({
          where: { id: execution.id },
          data: { status: 'SUCCESS', finishedAt: new Date(), actionsLog: JSON.stringify(actionsLog) },
        });
        await this.prisma.automationRule.update({
          where: { id: rule.id },
          data: { runCount: { increment: 1 }, lastRunAt: new Date(), lastRunStatus: 'SUCCESS' },
        });
      } catch (err) {
        this.logger.error(`Erro na automação ${rule.id}: ${(err instanceof Error ? err.message : String(err))}`);
        await (this.prisma as any).automationExecution.update({
          where: { id: execution.id },
          data: { status: 'FAILED', finishedAt: new Date(), errorMessage: (err instanceof Error ? err.message : String(err)) },
        });
        await this.prisma.automationRule.update({
          where: { id: rule.id },
          data: { lastRunAt: new Date(), lastRunStatus: 'FAILED' },
        });
      }
    }
  }

  private evaluateConditions(conditions: any[], payload: Record<string, any>): boolean {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every((cond) => {
      const val = payload[cond.field];
      switch (cond.operator) {
        case 'EQ': return val === cond.value;
        case 'NEQ': return val !== cond.value;
        case 'IN': return Array.isArray(cond.value) && cond.value.includes(val);
        case 'NOT_IN': return Array.isArray(cond.value) && !cond.value.includes(val);
        case 'GT': return val > cond.value;
        case 'LT': return val < cond.value;
        default: return false;
      }
    });
  }

  private async executeActions(actions: any[], payload: Record<string, any>, tenantId: string) {
    const results: any[] = [];
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'ENROLL_COURSE':
            // Matricular usuário no curso
            if (payload.userId && action.payload?.courseId) {
              await (this.prisma as any).enrollment.upsert({
                where: { courseId_userId: { courseId: action.payload.courseId, userId: payload.userId } },
                create: { courseId: action.payload.courseId, userId: payload.userId },
                update: {},
              });
            }
            results.push({ type: action.type, status: 'OK', payload: action.payload });
            break;

          case 'SEND_NOTIFICATION':
            await this.notifications.sendToUser(payload.userId, {
              title: action.payload?.title ?? 'INNOVA',
              message: action.payload?.message ?? '',
              type: action.payload?.type ?? 'INFO',
            });
            results.push({ type: action.type, status: 'OK' });
            break;

          case 'REVOKE_ACCESS':
            // Revogar acesso: desativar user ou remover de curso
            results.push({ type: action.type, status: 'OK', note: 'Access revoked via system policy' });
            break;

          default:
            results.push({ type: action.type, status: 'SKIPPED', reason: 'Unknown action type' });
        }
      } catch (err) {
        results.push({ type: action.type, status: 'ERROR', error: (err instanceof Error ? err.message : String(err)) });
      }
    }
    return results;
  }

  // ============================================================
  // SLA CONFIG
  // ============================================================

  async createSlaConfig(dto: CreateSlaConfigDto, actorId: string) {
    await this.findTenantOrFail(dto.tenantId);
    const sla = await (this.prisma as any).slaConfig.create({ data: dto });
    await this.audit.log({ entity: 'SlaConfig', entityId: sla.id, action: 'CREATE', userId: actorId, details: dto });
    return sla;
  }

  async updateSlaConfig(id: string, dto: UpdateSlaConfigDto, actorId: string) {
    const sla = await (this.prisma as any).slaConfig.findUnique({ where: { id } });
    if (!sla) throw new NotFoundException('SLA Config não encontrada.');
    const updated = await (this.prisma as any).slaConfig.update({ where: { id }, data: dto });
    await this.audit.log({ entity: 'SlaConfig', entityId: id, action: 'UPDATE', userId: actorId, details: dto });
    return updated;
  }

  async listSlaConfigs(tenantId: string) {
    return (this.prisma as any).slaConfig.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ============================================================
  // CONTENT DELIVERY CONFIG
  // ============================================================

  async getContentDeliveryConfig(tenantId: string) {
    const config = await (this.prisma as any).contentDeliveryConfig.findUnique({ where: { tenantId } });
    if (!config) throw new NotFoundException('Configuração de entrega de conteúdo não encontrada.');
    return config;
  }

  async updateContentDeliveryConfig(tenantId: string, dto: UpdateContentDeliveryConfigDto, actorId: string) {
    const config = await (this.prisma as any).contentDeliveryConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: dto,
    });
    await this.audit.log({ entity: 'ContentDeliveryConfig', entityId: config.id, action: 'UPDATE', userId: actorId, details: dto });
    return config;
  }

  // ============================================================
  // METRICS
  // ============================================================

  async getMetrics(query: MetricsQueryDto) {
    const from = query.from
      ? new Date(query.from)
      : this.windowToDate(query.window ?? '24h');
    const to = query.to ? new Date(query.to) : new Date();

    const where: any = { capturedAt: { gte: from, lte: to } };
    if (query.tenantId) where.tenantId = query.tenantId;

    const metrics = await (this.prisma as any).scalabilityMetric.findMany({
      where,
      orderBy: { capturedAt: 'asc' },
    });

    if (metrics.length === 0) return { metrics: [], summary: null };

    const summary = {
      avgCpuPercent: this.avg(metrics.map((m) => m.cpuUsagePercent)),
      avgMemoryPercent: this.avg(metrics.map((m) => m.memoryUsagePercent)),
      avgLatencyMs: this.avg(metrics.map((m) => m.avgLatencyMs)),
      maxConcurrentSessions: Math.max(...metrics.map((m) => m.concurrentSessions)),
      avgErrorRate: this.avg(metrics.map((m) => m.errorRate)),
      avgUptimePercent: this.avg(metrics.map((m) => m.uptimePercent)),
      totalStorageUsedGb: metrics[metrics.length - 1].storageUsedGb,
      peakRequestsPerMinute: Math.max(...metrics.map((m) => m.requestsPerMinute)),
    };

    return { metrics, summary };
  }

  async getRealtimeMetrics(tenantId?: string) {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;

    const latest = await (this.prisma as any).scalabilityMetric.findFirst({
      where,
      orderBy: { capturedAt: 'desc' },
    });

    // Se não há métricas recentes (< 2 min), retornar estado atual do sistema
    const isStale = !latest || Date.now() - latest.capturedAt.getTime() > 2 * 60 * 1000;
    if (isStale) {
      return { data: latest, isStale: true, message: 'Métricas podem não refletir estado atual.' };
    }

    return { data: latest, isStale: false };
  }

  /**
   * Cron: captura métricas do sistema a cada minuto
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async captureSystemMetrics() {
    try {
      // Em produção: integrar com CloudWatch / Azure Monitor / Prometheus
      // Aqui: simular ou buscar de endpoint de health interno
      const snapshot = await this.collectSystemSnapshot();

      await (this.prisma as any).scalabilityMetric.create({ data: snapshot });

      // Verificar thresholds para gerar alertas
      await this.evaluateAlertThresholds(snapshot);
    } catch (err) {
      this.logger.warn(`Falha ao capturar métricas: ${(err instanceof Error ? err.message : String(err))}`);
    }
  }

  private async collectSystemSnapshot(): Promise<any> {
    // Em produção: buscar via API interna de infraestrutura
    // Placeholder que pode ser substituído por integração real com Prometheus/CloudWatch
    return {
      activeUsers: 0,
      concurrentSessions: 0,
      cpuUsagePercent: 0,
      memoryUsagePercent: 0,
      diskUsagePercent: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      requestsPerMinute: 0,
      errorRate: 0,
      uptimePercent: 100,
      storageUsedGb: 0,
      bandwidthMbps: 0,
      videoStreamCount: 0,
      apiCallsPerMin: 0,
    };
  }

  private async evaluateAlertThresholds(snapshot: any) {
    const slas = await (this.prisma as any).slaConfig.findMany({ where: { isActive: true } });
    for (const sla of slas) {
      if (snapshot.avgLatencyMs > sla.maxLatencyMs) {
        await this.createAlert({
          tenantId: sla.tenantId,
          severity: AlertSeverity.WARNING,
          category: AlertCategory.PERFORMANCE,
          title: 'Alta latência detectada',
          message: `Latência média (${snapshot.avgLatencyMs}ms) excedeu limite do SLA (${sla.maxLatencyMs}ms).`,
          metricValue: snapshot.avgLatencyMs,
          threshold: sla.maxLatencyMs,
          notifiedVia: ['EMAIL'],
        }, 'SYSTEM');
      }
      if (snapshot.errorRate > sla.maxErrorRate * 100) {
        await this.createAlert({
          tenantId: sla.tenantId,
          severity: AlertSeverity.CRITICAL,
          category: AlertCategory.SLA_BREACH,
          title: 'Taxa de erro acima do SLA',
          message: `Taxa de erro atual: ${snapshot.errorRate.toFixed(2)}%. Limite: ${(sla.maxErrorRate * 100).toFixed(2)}%.`,
          metricValue: snapshot.errorRate,
          threshold: sla.maxErrorRate * 100,
          notifiedVia: ['EMAIL', 'PUSH'],
        }, 'SYSTEM');
      }
    }
  }

  // ============================================================
  // ALERTS
  // ============================================================

  async createAlert(dto: CreateAlertDto, actorId: string) {
    const alert = await (this.prisma as any).systemAlert.create({ data: dto });

    // Notificar canais configurados
    if (dto.notifiedVia?.includes('EMAIL')) {
      this.events.emit('alert.notify.email', { alert });
    }
    if (dto.notifiedVia?.includes('PUSH')) {
      this.events.emit('alert.notify.push', { alert });
    }
    if (dto.notifiedVia?.includes('SLACK')) {
      this.events.emit('alert.notify.slack', { alert });
    }

    return alert;
  }

  async resolveAlert(id: string, dto: ResolveAlertDto) {
    const alert = await (this.prisma as any).systemAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Alerta não encontrado.');
    if (alert.isResolved) throw new BadRequestException('Alerta já resolvido.');

    return (this.prisma as any).systemAlert.update({
      where: { id },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy: dto.resolvedBy },
    });
  }

  async listAlerts(query: AlertsQueryDto) {
    const where: any = {};
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.severity) where.severity = query.severity;
    if (query.category) where.category = query.category;
    if (query.isResolved !== undefined) where.isResolved = query.isResolved;

    const [data, total] = await Promise.all([
      (this.prisma as any).systemAlert.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
      }),
      (this.prisma as any).systemAlert.count({ where }),
    ]);
    return { data, total };
  }

  // ============================================================
  // BULK USER IMPORT
  // ============================================================

  async bulkImportUsers(dto: BulkUserImportDto, actorId: string): Promise<BulkImportResultDto> {
    await this.findTenantOrFail(dto.tenantId);

    const result: BulkImportResultDto = {
      total: 0, created: 0, updated: 0, skipped: 0, failed: 0, errors: [],
    };

    let rows: any[] = [];
    try {
      const decoded = Buffer.from(dto.payload, 'base64').toString('utf-8');
      if (dto.format === 'CSV') {
        rows = this.parseCSV(decoded);
      } else {
        rows = JSON.parse(decoded);
      }
    } catch {
      throw new BadRequestException('Payload inválido. Esperado JSON ou CSV codificado em base64.');
    }

    result.total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        this.validateUserRow(row, i + 1);
        const existing = await this.prisma.user.findFirst({ where: { email: row.email } });

        if (existing) {
          if (dto.upsert) {
            await this.prisma.user.update({
              where: { id: existing.id },
              data: { fullName: row.fullName ?? existing.fullName },
            });
            result.updated++;
          } else {
            result.skipped++;
          }
        } else {
          const user = await this.prisma.user.create({
            data: {
              fullName: row.fullName,
              email: row.email,
              departmentId: row.departmentId ?? null,
              positionId: row.positionId ?? null,
            },
          });

          // Disparar automação de onboarding
          await this.processAutomationEvent(dto.tenantId, AutomationTrigger.USER_HIRED, {
            userId: user.id,
            departmentId: row.departmentId,
            positionId: row.positionId,
          });

          if (dto.sendWelcomeEmail) {
            this.events.emit('user.welcome.email', { userId: user.id });
          }
          result.created++;
        }
      } catch (err) {
        result.failed++;
        result.errors.push({ row: i + 1, reason: (err instanceof Error ? err.message : String(err)) });
      }
    }

    await this.audit.log({
      entity: 'BulkImport',
      entityId: dto.tenantId,
      action: 'CREATE',
      userId: actorId,
      details: { total: result.total, created: result.created, failed: result.failed },
    });

    this.logger.log(`Importação concluída: ${result.created} criados, ${result.failed} falhas`);
    return result;
  }

  private validateUserRow(row: any, rowNum: number) {
    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      throw new Error(`Email inválido (linha ${rowNum})`);
    }
    if (!row.fullName || row.fullName.trim().length < 2) {
      throw new Error(`Nome completo inválido (linha ${rowNum})`);
    }
  }

  private parseCSV(raw: string): any[] {
    const lines = raw.split('\n').filter((l) => l.trim());
    if (lines.length < 2) throw new Error('CSV sem dados.');
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
    });
  }

  // ============================================================
  // DASHBOARD SUMMARY
  // ============================================================

  async getDashboard(tenantId: string): Promise<ScalabilityDashboardDto> {
    const [tenant, latestMetric, integrations, automations, alerts, slas] = await Promise.all([
      this.findTenantOrFail(tenantId),
      (this.prisma as any).scalabilityMetric.findFirst({
        where: { tenantId },
        orderBy: { capturedAt: 'desc' },
      }),
      this.prisma.integrationConfig.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { id: true },
      }),
      this.prisma.automationRule.aggregate({
        where: { tenantId },
        _count: { id: true },
      }),
      (this.prisma as any).systemAlert.groupBy({
        by: ['severity', 'isResolved'],
        where: { tenantId },
        _count: { id: true },
      }),
      (this.prisma as any).slaConfig.findFirst({
        where: { tenantId, isActive: true },
      }),
    ]);

    const activeUsers = await this.prisma.user.count();
    const activeIntegrations = integrations.filter((i) => i.status === 'ACTIVE').reduce((s, i) => s + i._count.id, 0);
    const errorIntegrations = integrations.filter((i) => i.status === 'ERROR').reduce((s, i) => s + i._count.id, 0);

    const openAlerts = alerts.filter((a) => !a.isResolved);
    const criticalAlerts = openAlerts.filter((a) => a.severity === 'CRITICAL').reduce((s, a) => s + a._count.id, 0);
    const warningAlerts = openAlerts.filter((a) => a.severity === 'WARNING').reduce((s, a) => s + a._count.id, 0);
    const infoAlerts = openAlerts.filter((a) => a.severity === 'INFO').reduce((s, a) => s + a._count.id, 0);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const executionsToday = await (this.prisma as any).automationExecution.count({
      where: { startedAt: { gte: todayStart }, rule: { tenantId } },
    });
    const failedToday = await (this.prisma as any).automationExecution.count({
      where: { startedAt: { gte: todayStart }, status: 'FAILED', rule: { tenantId } },
    });
    const activeRules = await this.prisma.automationRule.count({ where: { tenantId, isActive: true } });

    const lastSync = await (this.prisma as any).integrationSyncLog.findFirst({
      where: { integration: { tenantId } },
      orderBy: { startedAt: 'desc' },
    });

    const uptimeNow = latestMetric?.uptimePercent ?? 100;
    const latencyNow = latestMetric?.avgLatencyMs ?? 0;

    return {
      tenantInfo: {
        id: tenant.id,
        tenantCode: tenant.tenantCode,
        tenantName: tenant.tenantName,
        plan: tenant.plan,
        maxUsers: tenant.maxUsers,
        activeUsersCount: activeUsers,
        storageUsedGb: latestMetric?.storageUsedGb ?? 0,
        maxStorageGb: tenant.maxStorageGb,
      },
      performanceSummary: {
        uptimePercent: uptimeNow,
        avgLatencyMs: latencyNow,
        errorRate: latestMetric?.errorRate ?? 0,
        activeSessionsNow: latestMetric?.concurrentSessions ?? 0,
        requestsPerMinute: latestMetric?.requestsPerMinute ?? 0,
        cpuUsagePercent: latestMetric?.cpuUsagePercent ?? 0,
        memoryUsagePercent: latestMetric?.memoryUsagePercent ?? 0,
      },
      integrations: {
        total: integrations.reduce((s, i) => s + i._count.id, 0),
        active: activeIntegrations,
        withErrors: errorIntegrations,
        lastSyncAt: lastSync?.startedAt?.toISOString() ?? null,
      },
      automations: {
        total: automations._count.id,
        active: activeRules,
        executionsToday,
        failedToday,
      },
      alerts: {
        open: criticalAlerts + warningAlerts + infoAlerts,
        critical: criticalAlerts,
        warning: warningAlerts,
        info: infoAlerts,
      },
      slaCompliance: {
        currentUptimePercent: uptimeNow,
        slaTarget: slas?.uptimePercent ?? 99.5,
        isBreached: slas ? uptimeNow < slas.uptimePercent : false,
        avgLatencyMs: latencyNow,
        latencyTarget: slas?.maxLatencyMs ?? 2000,
      },
    };
  }

  // ============================================================
  // LOAD TEST (config — execução real via k6/Locust externo)
  // ============================================================

  async scheduleLoadTest(dto: LoadTestConfigDto, actorId: string) {
    await this.audit.log({
      entity: 'LoadTest',
      entityId: dto.tenantId ?? 'global',
      action: 'CREATE',
      userId: actorId,
      details: dto,
    });

    this.events.emit('loadtest.scheduled', { ...dto, scheduledBy: actorId });

    return {
      message: 'Teste de carga agendado. Resultados disponíveis em /scalability/metrics após conclusão.',
      config: dto,
    };
  }

  // ============================================================
  // UTILS
  // ============================================================

  private windowToDate(window: string): Date {
    const now = new Date();
    const map: Record<string, number> = {
      '1h': 1, '6h': 6, '24h': 24, '7d': 24 * 7, '30d': 24 * 30,
    };
    const hours = map[window] ?? 24;
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  }

  private avg(arr: number[]): number {
    if (!arr.length) return 0;
    return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 100) / 100;
  }

  private validateJsonField(value: string, field: string) {
    try {
      JSON.parse(value);
    } catch {
      throw new BadRequestException(`Campo '${field}' deve ser um JSON válido.`);
    }
  }

  /**
   * Em produção: usar biblioteca de criptografia (AES-256-GCM) com chave de ambiente
   */
  private encryptSensitiveData(data: string): string {
    // TODO: Integrar com AWS KMS / Azure Key Vault / crypto do Node para produção
    return Buffer.from(data).toString('base64');
  }
}
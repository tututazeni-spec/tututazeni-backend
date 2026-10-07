// modulo_scalability.md §15-17 — abas Capacidade, Auto Scaling e Resiliência.
//
// Capacidade: compara o uso actual (métricas reais já expostas pelas outras
// abas) com limites — utilizadores/storage vêm do TenantConfig, ligações da BD
// do max_connections do Postgres, concurrent users/RPS dos limites definidos em
// ScalabilityInfraSettings.
// Auto Scaling: política persistida + avaliação das regras contra a CPU recente.
// A aplicação NÃO escala instâncias — só guarda a política e diz o que ela
// decidiria agora.
// Resiliência: o que a app consegue verificar (BD, replicação, filas) mais factos
// de infra declarados (réplicas, backups, DR) que não são observáveis daqui.

import { SharedResult } from '../common/helpers/shared-result';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, ScalabilityInfraSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { ScalabilityInfraService } from './scalability-infra.service';
import { ScalabilityQueuesService } from './scalability-queues.service';
import { ScalabilityStorageService } from './scalability-storage.service';
import {
  ScheduledScalingDto,
  UpdateAutoScalingDto,
  UpdateCapacityLimitsDto,
  UpdateResilienceDto,
} from './scalability-capacity.dto';

const SETTINGS_ID = 'default';

type Level = 'OK' | 'ATENCAO' | 'CRITICO';

@Injectable()
export class ScalabilityCapacityService {
  private readonly logger = new Logger(ScalabilityCapacityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly infra: ScalabilityInfraService,
    private readonly queues: ScalabilityQueuesService,
    private readonly storage: ScalabilityStorageService,
  ) {}

  private round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  private level(percent: number | null): Level | null {
    if (percent === null) return null;
    return percent >= 90 ? 'CRITICO' : percent >= 70 ? 'ATENCAO' : 'OK';
  }

  private async settings(): Promise<ScalabilityInfraSettings> {
    return this.prisma.scalabilityInfraSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  // Só os campos alterados vão para o rasto de auditoria.
  private async audited(
    actorId: number | undefined,
    action: string,
    before: object,
    after: object,
  ) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, to] of Object.entries(after)) {
      const from = (before as Record<string, unknown>)[k];
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
    }
    if (!Object.keys(changes).length) return;
    await this.audit
      .logEntity(Number(actorId), action, 'ScalabilityInfraSettings', SETTINGS_ID, { changes })
      .catch(err =>
        this.logger.warn(`Auditoria falhou: ${err instanceof Error ? err.message : err}`),
      );
  }

  private latestMetric() {
    return this.prisma.scalabilityMetric.findFirst({
      orderBy: { capturedAt: 'desc' },
      select: {
        capturedAt: true,
        cpuUsagePercent: true,
        memoryUsagePercent: true,
        concurrentSessions: true,
      },
    });
  }

  // ============================================================
  // §15 Capacidade
  // ============================================================

  private readonly getCapacityMetricsShared = new SharedResult();

  getCapacityMetrics() {
    return this.getCapacityMetricsShared.get(() => this.computeGetCapacityMetrics());
  }

  private async computeGetCapacityMetrics() {
    const [s, tenant, api, storage, queue, conn, totalUsers, activeUsers, peak, latest] =
      await Promise.all([
        this.settings(),
        this.prisma.tenantConfig.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { maxUsers: true },
        }),
        this.infra.getApiMetrics().catch(() => null),
        this.storage.getStorageMetrics().catch(() => null),
        this.queues.getQueueMetrics().catch(() => null),
        this.prisma.$queryRaw<{ total: number; max: number }[]>`
            SELECT count(*)::int AS total, current_setting('max_connections')::int AS max
            FROM pg_stat_activity WHERE datname = current_database()`.catch(
          () => [] as { total: number; max: number }[],
        ),
        this.prisma.read.user.count(),
        this.prisma.read.user.count({ where: { active: true } }),
        this.prisma.scalabilityMetric.aggregate({
          where: { capturedAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
          _max: { concurrentSessions: true },
        }),
        this.latestMetric(),
      ]);

    const row = (
      key: string,
      label: string,
      current: number | null,
      capacity: number | null,
      unit: string,
      source: string,
    ) => {
      const percent = current !== null && capacity ? this.round1((current / capacity) * 100) : null;
      return { key, label, current, capacity, unit, percent, level: this.level(percent), source };
    };

    const rps = api?.rates.requestsPerSecond ?? null;
    const resources = [
      row(
        'users',
        'Utilizadores',
        totalUsers,
        tenant?.maxUsers ?? null,
        '',
        'Limite do plano (maxUsers)',
      ),
      row(
        'concurrent',
        'Concurrent users',
        latest?.concurrentSessions ?? 0,
        s.maxConcurrentUsers,
        '',
        'Limite definido',
      ),
      row('rps', 'API RPS', rps, s.maxApiRps, 'req/s', 'Limite definido'),
      row(
        'db',
        'DB connections',
        conn[0]?.total ?? null,
        conn[0]?.max ?? null,
        '',
        'max_connections do Postgres',
      ),
      row(
        'storage',
        'Storage',
        storage?.usedGb ?? null,
        storage?.totalGb ?? null,
        'GB',
        'Limite do plano (maxStorageGb)',
      ),
    ];

    const hot = resources
      .filter(r => r.percent !== null)
      .sort((a, b) => (b.percent as number) - (a.percent as number))[0];

    return {
      current: {
        totalUsers,
        activeUsers,
        concurrentUsers: latest?.concurrentSessions ?? 0,
        concurrentPeak24h: peak._max.concurrentSessions ?? 0,
        requestsPerSecond: rps,
        dbConnections: conn[0]?.total ?? null,
        storageGb: storage?.usedGb ?? null,
        queueThroughputPerMin: queue?.totals.throughputPerMin ?? null,
      },
      resources,
      bottleneck: hot ? { key: hot.key, label: hot.label, percent: hot.percent } : null,
      limits: { maxConcurrentUsers: s.maxConcurrentUsers, maxApiRps: s.maxApiRps },
      note: 'Concurrent users e API RPS não têm um limite físico observável — usam o limite definido nesta aba.',
    };
  }

  async updateCapacityLimits(dto: UpdateCapacityLimitsDto, actorId?: number) {
    const before = await this.settings();
    const data: Prisma.ScalabilityInfraSettingsUpdateInput = {
      ...(dto.maxConcurrentUsers !== undefined && { maxConcurrentUsers: dto.maxConcurrentUsers }),
      ...(dto.maxApiRps !== undefined && { maxApiRps: dto.maxApiRps }),
      updatedById: actorId ?? null,
    };
    await this.prisma.scalabilityInfraSettings.update({ where: { id: SETTINGS_ID }, data });
    await this.audited(
      actorId,
      'CAPACITY_LIMITS_UPDATE',
      { maxConcurrentUsers: before.maxConcurrentUsers, maxApiRps: before.maxApiRps },
      dto,
    );
    return this.getCapacityMetrics();
  }

  // ============================================================
  // §16 Auto Scaling
  // ============================================================

  private parseScheduled(json: string | null): ScheduledScalingDto[] {
    if (!json) return [];
    try {
      const v = JSON.parse(json);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private policyView(s: ScalabilityInfraSettings) {
    return {
      enabled: s.asEnabled,
      minInstances: s.asMinInstances,
      maxInstances: s.asMaxInstances,
      targetCpu: s.asTargetCpu,
      targetMemory: s.asTargetMemory,
      requestsPerInstance: s.asRequestsPerInstance,
      scaleUpThreshold: s.asScaleUpThreshold,
      scaleUpMinutes: s.asScaleUpMinutes,
      scaleDownThreshold: s.asScaleDownThreshold,
      scaleDownMinutes: s.asScaleDownMinutes,
      cooldownMinutes: s.asCooldownMinutes,
      scheduled: this.parseScheduled(s.asScheduledJson),
      emergencyEnabled: s.asEmergencyEnabled,
      emergencyMaxInstances: s.asEmergencyMaxInstances,
    };
  }

  async getAutoScaling() {
    const s = await this.settings();
    const p = this.policyView(s);
    const since = (m: number) => new Date(Date.now() - m * 60_000);
    const [api, latest, upWin, downWin] = await Promise.all([
      this.infra.getApiMetrics().catch(() => null),
      this.latestMetric(),
      this.prisma.scalabilityMetric.findMany({
        where: { capturedAt: { gte: since(p.scaleUpMinutes) } },
        select: { cpuUsagePercent: true },
      }),
      this.prisma.scalabilityMetric.findMany({
        where: { capturedAt: { gte: since(p.scaleDownMinutes) } },
        select: { cpuUsagePercent: true },
      }),
    ]);

    // Uma regra só dispara se houver amostras e TODAS violarem o limiar na janela.
    const upHit = upWin.length > 0 && upWin.every(m => m.cpuUsagePercent > p.scaleUpThreshold);
    const downHit =
      downWin.length > 0 && downWin.every(m => m.cpuUsagePercent < p.scaleDownThreshold);
    const rps = api?.rates.requestsPerSecond ?? null;
    const byRps = rps !== null ? Math.ceil(rps / p.requestsPerInstance) : null;
    const recommended = Math.min(p.maxInstances, Math.max(p.minInstances, byRps ?? p.minInstances));

    return {
      policy: { ...p, updatedAt: s.updatedAt.toISOString() },
      evaluation: {
        cpuNow: latest?.cpuUsagePercent ?? null,
        memoryNow: latest?.memoryUsagePercent ?? null,
        sampleAt: latest ? latest.capturedAt.toISOString() : null,
        requestsPerSecond: rps,
        recommendedInstances: recommended,
        decision: upHit ? 'SCALE_UP' : downHit ? 'SCALE_DOWN' : 'HOLD',
      },
      examples: [
        `CPU > ${p.scaleUpThreshold}% durante ${p.scaleUpMinutes} min → adicionar instância`,
        `CPU < ${p.scaleDownThreshold}% durante ${p.scaleDownMinutes} min → remover instância`,
      ],
      note: 'A INNOVA guarda a política e avalia-a, mas não cria nem remove instâncias — aplicar a decisão cabe à orquestração (Docker/Compose/LB).',
    };
  }

  async updateAutoScaling(dto: UpdateAutoScalingDto, actorId?: number) {
    const before = await this.settings();
    const min = dto.minInstances ?? before.asMinInstances;
    const max = dto.maxInstances ?? before.asMaxInstances;
    const up = dto.scaleUpThreshold ?? before.asScaleUpThreshold;
    const down = dto.scaleDownThreshold ?? before.asScaleDownThreshold;
    const emergency = dto.emergencyMaxInstances ?? before.asEmergencyMaxInstances;
    if (min > max) {
      throw new BadRequestException('minInstances não pode ser superior a maxInstances');
    }
    if (down >= up) {
      throw new BadRequestException('O limiar de scale-down tem de ser inferior ao de scale-up');
    }
    if (emergency < max) {
      throw new BadRequestException('maxInstances de emergência não pode ser inferior ao normal');
    }
    for (const sc of dto.scheduled ?? []) {
      if (sc.minInstances > sc.maxInstances) {
        throw new BadRequestException(`Agendamento "${sc.name}": min superior a max`);
      }
    }

    const data: Prisma.ScalabilityInfraSettingsUpdateInput = {
      ...(dto.enabled !== undefined && { asEnabled: dto.enabled }),
      ...(dto.minInstances !== undefined && { asMinInstances: dto.minInstances }),
      ...(dto.maxInstances !== undefined && { asMaxInstances: dto.maxInstances }),
      ...(dto.targetCpu !== undefined && { asTargetCpu: dto.targetCpu }),
      ...(dto.targetMemory !== undefined && { asTargetMemory: dto.targetMemory }),
      ...(dto.requestsPerInstance !== undefined && {
        asRequestsPerInstance: dto.requestsPerInstance,
      }),
      ...(dto.scaleUpThreshold !== undefined && { asScaleUpThreshold: dto.scaleUpThreshold }),
      ...(dto.scaleUpMinutes !== undefined && { asScaleUpMinutes: dto.scaleUpMinutes }),
      ...(dto.scaleDownThreshold !== undefined && { asScaleDownThreshold: dto.scaleDownThreshold }),
      ...(dto.scaleDownMinutes !== undefined && { asScaleDownMinutes: dto.scaleDownMinutes }),
      ...(dto.cooldownMinutes !== undefined && { asCooldownMinutes: dto.cooldownMinutes }),
      ...(dto.scheduled !== undefined && { asScheduledJson: JSON.stringify(dto.scheduled) }),
      ...(dto.emergencyEnabled !== undefined && { asEmergencyEnabled: dto.emergencyEnabled }),
      ...(dto.emergencyMaxInstances !== undefined && {
        asEmergencyMaxInstances: dto.emergencyMaxInstances,
      }),
      updatedById: actorId ?? null,
    };
    const updated = await this.prisma.scalabilityInfraSettings.update({
      where: { id: SETTINGS_ID },
      data,
    });
    await this.audited(
      actorId,
      'AUTO_SCALING_UPDATE',
      this.policyView(before),
      this.policyView(updated),
    );
    return this.getAutoScaling();
  }

  // ============================================================
  // §17 Resiliência
  // ============================================================

  private readonly getResilienceMetricsShared = new SharedResult();

  getResilienceMetrics() {
    return this.getResilienceMetricsShared.get(() => this.computeGetResilienceMetrics());
  }

  private async computeGetResilienceMetrics() {
    const s = await this.settings();
    const t0 = Date.now();
    const [dbPing, replicas, inRecovery, queueMetrics] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_stat_replication`
        .then(r => r[0]?.n ?? 0)
        .catch(() => null),
      this.prisma.$queryRaw<{ r: boolean }[]>`SELECT pg_is_in_recovery() AS r`
        .then(r => r[0]?.r ?? false)
        .catch(() => false),
      this.queues.getQueueMetrics().catch(() => null),
    ]);
    const dbLatencyMs = Date.now() - t0;

    const minutesAgo = (d: Date | null) =>
      d ? Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000)) : null;
    const backupAge = minutesAgo(s.lastBackupAt);
    const testAge = minutesAgo(s.lastRecoveryTestAt);
    // O RPO só é cumprido se o último backup for mais recente que o objectivo.
    const rpoMet = backupAge === null ? null : backupAge <= s.rpoMinutes;

    interface Check {
      key: string;
      label: string;
      status: Level;
      detail: string;
      source: 'MEDIDO' | 'DECLARADO';
    }
    const checks: Check[] = [
      {
        key: 'health',
        label: 'Health checks',
        status: dbPing ? 'OK' : 'CRITICO',
        detail: dbPing
          ? `Base de dados responde em ${dbLatencyMs} ms`
          : 'Base de dados não responde',
        source: 'MEDIDO',
      },
      {
        key: 'api',
        label: 'Redundância da API',
        status: s.apiReplicas >= 2 ? 'OK' : 'CRITICO',
        detail: `${s.apiReplicas} réplica(s) declarada(s)${s.apiReplicas < 2 ? ' — ponto único de falha' : ''}`,
        source: 'DECLARADO',
      },
      {
        key: 'dbRedundancy',
        label: 'Redundância da base de dados',
        status: (replicas ?? 0) > 0 || inRecovery ? 'OK' : s.dbReplication ? 'ATENCAO' : 'CRITICO',
        detail:
          replicas === null
            ? 'Não foi possível consultar a replicação'
            : `${replicas} réplica(s) ligada(s) ao primário${s.dbReplication && !replicas ? ' (declarada, mas nenhuma ligada)' : ''}`,
        source: 'MEDIDO',
      },
      {
        key: 'backups',
        label: 'Backups',
        status: rpoMet ? 'OK' : 'CRITICO',
        detail:
          backupAge === null
            ? 'Nenhum backup registado'
            : `Último backup há ${backupAge} min (RPO ${s.rpoMinutes} min)`,
        source: 'DECLARADO',
      },
      {
        key: 'failover',
        label: 'Failover',
        status: s.failoverEnabled ? 'OK' : 'ATENCAO',
        detail: s.failoverEnabled ? 'Failover automático declarado' : 'Sem failover automático',
        source: 'DECLARADO',
      },
      {
        key: 'lb',
        label: 'Load balancing',
        status: s.loadBalancer ? 'OK' : 'ATENCAO',
        detail: s.loadBalancer ? 'Load balancer declarado' : 'Sem load balancer',
        source: 'DECLARADO',
      },
      {
        key: 'cdn',
        label: 'CDN',
        status: s.cdnEnabled ? 'OK' : 'ATENCAO',
        detail: s.cdnEnabled ? 'CDN activa' : 'Sem CDN',
        source: 'DECLARADO',
      },
      {
        key: 'queues',
        label: 'Filas / Redis',
        status: queueMetrics ? 'OK' : 'ATENCAO',
        detail: queueMetrics ? 'Filas acessíveis' : 'Filas indisponíveis ou desactivadas',
        source: 'MEDIDO',
      },
      {
        key: 'dr',
        label: 'Disaster recovery',
        status: !s.drPlanDocumented ? 'CRITICO' : s.lastRecoveryTestOk === true ? 'OK' : 'ATENCAO',
        detail: !s.drPlanDocumented
          ? 'Plano de DR não documentado'
          : s.lastRecoveryTestOk === true
            ? 'Plano documentado e testado'
            : 'Plano documentado, sem teste de recuperação bem-sucedido',
        source: 'DECLARADO',
      },
    ];

    const overall: Level = checks.some(c => c.status === 'CRITICO')
      ? 'CRITICO'
      : checks.some(c => c.status === 'ATENCAO')
        ? 'ATENCAO'
        : 'OK';
    const points = checks.reduce(
      (n, c) => n + (c.status === 'OK' ? 1 : c.status === 'ATENCAO' ? 0.5 : 0),
      0,
    );

    return {
      overall,
      score: Math.round((points / checks.length) * 100),
      indicators: {
        rpoMinutes: s.rpoMinutes,
        rtoMinutes: s.rtoMinutes,
        rpoMet,
        lastBackupAt: s.lastBackupAt ? s.lastBackupAt.toISOString() : null,
        lastBackupMinutesAgo: backupAge,
        lastRecoveryTestAt: s.lastRecoveryTestAt ? s.lastRecoveryTestAt.toISOString() : null,
        lastRecoveryTestMinutesAgo: testAge,
        lastRecoveryTestOk: s.lastRecoveryTestOk,
      },
      settings: {
        apiReplicas: s.apiReplicas,
        dbReplication: s.dbReplication,
        failoverEnabled: s.failoverEnabled,
        loadBalancer: s.loadBalancer,
        cdnEnabled: s.cdnEnabled,
        drPlanDocumented: s.drPlanDocumented,
      },
      checks,
      note: 'Verificações "Declarado" dependem do que foi registado nesta aba — a aplicação não consegue observar réplicas, backups externos ou DR.',
    };
  }

  async updateResilience(dto: UpdateResilienceDto, actorId?: number) {
    const before = await this.settings();
    const data: Prisma.ScalabilityInfraSettingsUpdateInput = {
      ...(dto.rpoMinutes !== undefined && { rpoMinutes: dto.rpoMinutes }),
      ...(dto.rtoMinutes !== undefined && { rtoMinutes: dto.rtoMinutes }),
      ...(dto.apiReplicas !== undefined && { apiReplicas: dto.apiReplicas }),
      ...(dto.dbReplication !== undefined && { dbReplication: dto.dbReplication }),
      ...(dto.failoverEnabled !== undefined && { failoverEnabled: dto.failoverEnabled }),
      ...(dto.loadBalancer !== undefined && { loadBalancer: dto.loadBalancer }),
      ...(dto.cdnEnabled !== undefined && { cdnEnabled: dto.cdnEnabled }),
      ...(dto.drPlanDocumented !== undefined && { drPlanDocumented: dto.drPlanDocumented }),
      ...(dto.lastBackupAt !== undefined && { lastBackupAt: new Date(dto.lastBackupAt) }),
      ...(dto.lastRecoveryTestAt !== undefined && {
        lastRecoveryTestAt: new Date(dto.lastRecoveryTestAt),
      }),
      ...(dto.lastRecoveryTestOk !== undefined && { lastRecoveryTestOk: dto.lastRecoveryTestOk }),
      updatedById: actorId ?? null,
    };
    await this.prisma.scalabilityInfraSettings.update({ where: { id: SETTINGS_ID }, data });
    await this.audited(actorId, 'RESILIENCE_UPDATE', before, dto);
    return this.getResilienceMetrics();
  }
}

// modulo_scalability.md §20 — aba Testes de Carga.
//
// Regista a configuração e os resultados MEDIDOS de testes (Artillery, k6…) —
// a INNOVA não os executa. Ciclo: Planeado → Em curso → Concluído/Cancelado.
// Concluir exige os resultados-chave (P95, P99, erros, throughput); o veredicto
// só existe em testes concluídos. As datas de início/fim seguem o estado.

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ScalabilityLoadTest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateLoadTestDto,
  ListLoadTestsQueryDto,
  UpdateLoadTestDto,
} from './scalability-loadtests.dto';
import { LOAD_TEST_THRESHOLDS, findBreaches, suggestVerdict } from './scalability-loadtests.math';

@Injectable()
export class ScalabilityLoadTestsService {
  private readonly logger = new Logger(ScalabilityLoadTestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async log(actorId: number, action: string, id: string, meta: object) {
    await this.audit
      .logEntity(actorId, action, 'ScalabilityLoadTest', id, meta)
      .catch(err =>
        this.logger.warn(`Auditoria falhou: ${err instanceof Error ? err.message : err}`),
      );
  }

  private view(t: ScalabilityLoadTest) {
    const results = { p95Ms: t.p95Ms, p99Ms: t.p99Ms, errorRate: t.errorRate };
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      status: t.status,
      environment: t.environment,
      appVersion: t.appVersion,
      scenario: t.scenario,
      modules: t.modules,
      simulatedUsers: t.simulatedUsers,
      targetRps: t.targetRps,
      durationSec: t.durationSec,
      scheduledAt: t.scheduledAt?.toISOString() ?? null,
      startedAt: t.startedAt?.toISOString() ?? null,
      finishedAt: t.finishedAt?.toISOString() ?? null,
      results: {
        throughputRps: t.throughputRps,
        p95Ms: t.p95Ms,
        p99Ms: t.p99Ms,
        errorRate: t.errorRate,
        cpuPeak: t.cpuPeak,
        ramPeak: t.ramPeak,
        dbPeakConn: t.dbPeakConn,
        queuePeak: t.queuePeak,
        peakConcurrent: t.peakConcurrent,
      },
      verdict: t.verdict,
      suggestedVerdict: t.status === 'COMPLETED' ? suggestVerdict(results) : null,
      breaches: t.status === 'COMPLETED' ? findBreaches(results) : [],
      observations: t.observations,
      createdAt: t.createdAt.toISOString(),
    };
  }

  async list(q: ListLoadTestsQueryDto) {
    const where: Prisma.ScalabilityLoadTestWhereInput = {
      ...(q.type && { type: q.type }),
      ...(q.status && { status: q.status }),
    };
    const [rows, completed, total, planned] = await Promise.all([
      this.prisma.scalabilityLoadTest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.scalabilityLoadTest.findMany({
        where: { status: 'COMPLETED' },
        orderBy: { finishedAt: 'desc' },
        select: { id: true, name: true, type: true, verdict: true, finishedAt: true },
      }),
      this.prisma.scalabilityLoadTest.count(),
      this.prisma.scalabilityLoadTest.count({ where: { status: 'PLANNED' } }),
    ]);
    const judged = completed.filter(t => t.verdict);
    const passed = judged.filter(t => t.verdict !== 'FAILED').length;
    const last = completed[0] ?? null;
    return {
      tests: rows.map(r => this.view(r)),
      summary: {
        total,
        completed: completed.length,
        planned,
        passRatePercent: judged.length ? Math.round((passed / judged.length) * 100) : null,
        lastTest: last
          ? {
              id: last.id,
              name: last.name,
              type: last.type,
              finishedAt: last.finishedAt?.toISOString() ?? null,
              verdict: last.verdict,
            }
          : null,
      },
      thresholds: LOAD_TEST_THRESHOLDS,
    };
  }

  async create(dto: CreateLoadTestDto, actorId: number) {
    const created = await this.prisma.scalabilityLoadTest.create({
      data: {
        name: dto.name.trim(),
        type: dto.type,
        environment: dto.environment,
        appVersion: dto.appVersion?.trim() || null,
        scenario: dto.scenario?.trim() || null,
        modules: dto.modules ?? [],
        simulatedUsers: dto.simulatedUsers ?? null,
        targetRps: dto.targetRps ?? null,
        durationSec: dto.durationSec ?? null,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdById: actorId,
      },
    });
    await this.log(actorId, 'SCALABILITY_LOADTEST_CREATE', created.id, {
      name: created.name,
      type: created.type,
      environment: created.environment,
    });
    return this.view(created);
  }

  async update(id: string, dto: UpdateLoadTestDto, actorId: number) {
    const before = await this.prisma.scalabilityLoadTest.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Teste de carga não encontrado');

    const status = dto.status ?? before.status;
    const merged = {
      throughputRps: dto.throughputRps ?? before.throughputRps,
      p95Ms: dto.p95Ms ?? before.p95Ms,
      p99Ms: dto.p99Ms ?? before.p99Ms,
      errorRate: dto.errorRate ?? before.errorRate,
      verdict: dto.verdict ?? before.verdict,
    };
    if (
      status === 'COMPLETED' &&
      (merged.throughputRps === null ||
        merged.p95Ms === null ||
        merged.p99Ms === null ||
        merged.errorRate === null)
    ) {
      throw new BadRequestException(
        'Para concluir indique throughput, P95, P99 e taxa de erros do teste',
      );
    }
    if (dto.verdict && status !== 'COMPLETED') {
      throw new BadRequestException('O veredicto só pode ser definido em testes concluídos');
    }
    if (merged.p95Ms !== null && merged.p99Ms !== null && merged.p99Ms < merged.p95Ms) {
      throw new BadRequestException('P99 não pode ser inferior ao P95');
    }

    const now = new Date();
    const data: Prisma.ScalabilityLoadTestUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name.trim() }),
      ...(dto.type !== undefined && { type: dto.type }),
      ...(dto.environment !== undefined && { environment: dto.environment }),
      ...(dto.appVersion !== undefined && { appVersion: dto.appVersion.trim() || null }),
      ...(dto.scenario !== undefined && { scenario: dto.scenario.trim() || null }),
      ...(dto.modules !== undefined && { modules: dto.modules }),
      ...(dto.simulatedUsers !== undefined && { simulatedUsers: dto.simulatedUsers }),
      ...(dto.targetRps !== undefined && { targetRps: dto.targetRps }),
      ...(dto.durationSec !== undefined && { durationSec: dto.durationSec }),
      ...(dto.scheduledAt !== undefined && { scheduledAt: new Date(dto.scheduledAt) }),
      ...(dto.throughputRps !== undefined && { throughputRps: dto.throughputRps }),
      ...(dto.p95Ms !== undefined && { p95Ms: dto.p95Ms }),
      ...(dto.p99Ms !== undefined && { p99Ms: dto.p99Ms }),
      ...(dto.errorRate !== undefined && { errorRate: dto.errorRate }),
      ...(dto.cpuPeak !== undefined && { cpuPeak: dto.cpuPeak }),
      ...(dto.ramPeak !== undefined && { ramPeak: dto.ramPeak }),
      ...(dto.dbPeakConn !== undefined && { dbPeakConn: dto.dbPeakConn }),
      ...(dto.queuePeak !== undefined && { queuePeak: dto.queuePeak }),
      ...(dto.peakConcurrent !== undefined && { peakConcurrent: dto.peakConcurrent }),
      ...(dto.observations !== undefined && { observations: dto.observations.trim() || null }),
      status,
      startedAt: status === 'PLANNED' ? null : (before.startedAt ?? now),
      finishedAt:
        status === 'COMPLETED' || status === 'CANCELLED' ? (before.finishedAt ?? now) : null,
      // Reabrir ou cancelar um teste invalida o veredicto anterior.
      verdict: status === 'COMPLETED' ? (dto.verdict ?? before.verdict) : null,
    };

    const updated = await this.prisma.scalabilityLoadTest.update({ where: { id }, data });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(dto) as (keyof UpdateLoadTestDto)[]) {
      const from = (before as Record<string, unknown>)[k];
      const to = (updated as Record<string, unknown>)[k];
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
    }
    if (Object.keys(changes).length) {
      await this.log(
        actorId,
        dto.verdict && dto.verdict !== before.verdict
          ? 'SCALABILITY_LOADTEST_VERDICT'
          : dto.status && dto.status !== before.status
            ? 'SCALABILITY_LOADTEST_STATUS'
            : 'SCALABILITY_LOADTEST_UPDATE',
        id,
        { changes },
      );
    }
    return this.view(updated);
  }
}

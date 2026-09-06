// src/metrics-aggregation/metrics-aggregation.service.ts
//
// MetricsAggregationService (Fase H) — serviço de leitura único e canónico para
// as métricas do domínio 10 (headcount / turnover / trainingRoi / alerts /
// managerDashboard). Substitui as ~10 implementações divergentes espalhadas por
// `dashboard`, `dashboard-rh`, `reports`, `analytics` e `roi-impact`.
//
// Regras fixas:
//  - SÓ leitura. Zero create/update/delete. Todas as queries via `this.prisma.read.*`.
//  - Fórmulas canónicas: docs/superpowers/plans/notes/fase-h-metrics-variants.md.
//    Task 2 implementa `headcount` (§1.2) + `headcountTrend` (§1.3). As restantes
//    4 métricas chegam nas Tasks 3-5 (interfaces já em metrics.types.ts).
//  - `active:false` sozinho NÃO é "saiu" (mistura SUSPENDED). O sinal de saída é
//    `exitDate` preenchido; o de entrada é `hireDate` (§0/§2.0).

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  HeadcountBreakdownEntry,
  HeadcountParams,
  HeadcountResult,
  HeadcountTrendParams,
  HeadcountTrendPoint,
  MetricScopeFilter,
} from './metrics.types';

const MONTH_MS = 30 * 86400000;

/** where escalar comum a headcount / trend (departmentId / managerId / positionId). */
function scopeWhere(f: MetricScopeFilter): Record<string, number> {
  const where: Record<string, number> = {};
  if (f.departmentId != null) where.departmentId = f.departmentId;
  if (f.managerId != null) where.managerId = f.managerId;
  if (f.positionId != null) where.positionId = f.positionId;
  return where;
}

/** meses (aprox. 30 dias) desde `since` até agora. Base = hireDate ?? createdAt. */
function tenureMonths(since: Date): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / MONTH_MS);
}

function round(value: number, dp: number): number {
  return +value.toFixed(dp);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

@Injectable()
export class MetricsAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════════════════
  // headcount — nota §1.2
  // ══════════════════════════════════════════════════════════════════

  async headcount(params: HeadcountParams): Promise<HeadcountResult> {
    const to = params.to ?? new Date();
    const from =
      params.from ??
      new Date(to.getFullYear() - 1, to.getMonth(), to.getDate(), to.getHours(), to.getMinutes());
    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs);

    const where = scopeWhere(params);

    const [total, active, newHires, newHiresPrev] = await Promise.all([
      this.prisma.read.user.count({ where }),
      this.prisma.read.user.count({ where: { ...where, active: true } }),
      this.prisma.read.user.count({ where: { ...where, hireDate: { gte: from, lte: to } } }),
      this.prisma.read.user.count({
        where: { ...where, hireDate: { gte: prevFrom, lt: from } },
      }),
    ]);

    const [deptRows, posRows, tenureUsers] = await Promise.all([
      this.prisma.read.department.findMany({
        select: {
          id: true,
          name: true,
          _count: { select: { users: { where: { active: true } } } },
        },
      }),
      this.prisma.read.position.findMany({
        select: {
          id: true,
          name: true,
          level: true,
          _count: { select: { users: { where: { active: true } } } },
        },
        orderBy: { users: { _count: 'desc' } },
        take: 10,
      }),
      this.prisma.read.user.findMany({
        where: { ...where, active: true },
        select: { hireDate: true, createdAt: true },
      }),
    ]);

    const byDepartment: HeadcountBreakdownEntry[] = deptRows
      .map(d => ({ id: d.id, name: d.name, count: d._count.users }))
      .sort((a, b) => b.count - a.count);

    const byPosition: HeadcountBreakdownEntry[] = posRows.map(p => {
      const entry: HeadcountBreakdownEntry = { id: p.id, name: p.name, count: p._count.users };
      if (p.level != null) entry.level = p.level as unknown as number;
      return entry;
    });

    const byTenure = { '<1yr': 0, '1-2yr': 0, '2-5yr': 0, '5+yr': 0 };
    let tenureSum = 0;
    for (const u of tenureUsers) {
      const months = tenureMonths(u.hireDate ?? u.createdAt);
      tenureSum += months;
      if (months < 12) byTenure['<1yr']++;
      else if (months < 24) byTenure['1-2yr']++;
      else if (months < 60) byTenure['2-5yr']++;
      else byTenure['5+yr']++;
    }
    const avgTenureMonths = tenureUsers.length ? round(tenureSum / tenureUsers.length, 1) : 0;

    const newHiresTrend =
      newHiresPrev > 0 ? round(((newHires - newHiresPrev) / newHiresPrev) * 100, 1) : 0;

    return {
      total,
      active,
      inactive: total - active,
      newHires,
      newHiresPrev,
      newHiresTrend,
      avgTenureMonths,
      byTenure,
      byDepartment,
      byPosition,
      period: { from, to },
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════════════════
  // headcountTrend — nota §1.3
  // ══════════════════════════════════════════════════════════════════

  async headcountTrend(params: HeadcountTrendParams): Promise<HeadcountTrendPoint[]> {
    const months = params.months ?? 6;
    const where = scopeWhere(params);
    const now = new Date();

    const points: HeadcountTrendPoint[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

      const [headcount, added, left] = await Promise.all([
        this.prisma.read.user.count({
          where: {
            ...where,
            hireDate: { lte: mEnd },
            OR: [{ exitDate: null }, { exitDate: { gt: mEnd } }],
          },
        }),
        this.prisma.read.user.count({
          where: { ...where, hireDate: { gte: mStart, lte: mEnd } },
        }),
        this.prisma.read.user.count({
          where: { ...where, exitDate: { gte: mStart, lte: mEnd } },
        }),
      ]);

      points.push({
        month: `${mEnd.getFullYear()}-${pad2(mEnd.getMonth() + 1)}`,
        headcount,
        new: added,
        left,
      });
    }
    return points;
  }
}

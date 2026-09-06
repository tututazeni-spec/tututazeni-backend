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
  TurnoverParams,
  TurnoverResult,
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

/**
 * where para "activos ponto-a-ponto" numa dada fronteira temporal:
 * já admitidos (`hireDate <= boundary`) e ainda não saídos nesse instante
 * (`exitDate == null || exitDate > boundary`). Mesmo padrão do `headcountTrend`.
 */
function activeAsOfWhere(scope: Record<string, number>, boundary: Date): Record<string, unknown> {
  return {
    ...scope,
    hireDate: { lte: boundary },
    OR: [{ exitDate: null }, { exitDate: { gt: boundary } }],
  };
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
      if (p.level != null) entry.level = p.level as string;
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

  // ══════════════════════════════════════════════════════════════════
  // turnover — nota §2.2
  // ══════════════════════════════════════════════════════════════════
  //
  // Numerador = `exitDate` na janela (== hrStatus:'TERMINATED', escritos juntos em
  // users.service.remove). NUNCA `updatedAt` (bumped por qualquer edição de perfil),
  // NUNCA `active:false` sozinho (inclui SUSPENDED). Denominador canónico =
  // `avgHeadcount = (headcountStart + headcountEnd) / 2` (ruling do controller,
  // Task 1 review 2026-09-06). Trend vs janela anterior de igual duração.
  //
  // Cobertura de dados: se a BD tiver muitos `hireDate`/`exitDate` nulos (legado),
  // `leavers`/`newHires`/tenure ficam subcontados — é o número *correcto*, ainda que
  // baixo (nota §8 risco 2). `avgTenureMonths` usa `hireDate ?? createdAt` como base.

  async turnover(params: TurnoverParams): Promise<TurnoverResult> {
    const to = params.to ?? new Date();
    const from =
      params.from ??
      new Date(to.getFullYear() - 1, to.getMonth(), to.getDate(), to.getHours(), to.getMinutes());
    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs);

    const where = scopeWhere(params);

    const [leavers, headcountStart, headcountEnd, leaversPrev, headcountPrevStart, newHires] =
      await Promise.all([
        this.prisma.read.user.count({ where: { ...where, exitDate: { gte: from, lte: to } } }),
        this.prisma.read.user.count({ where: activeAsOfWhere(where, from) }),
        this.prisma.read.user.count({ where: activeAsOfWhere(where, to) }),
        this.prisma.read.user.count({
          where: { ...where, exitDate: { gte: prevFrom, lt: from } },
        }),
        this.prisma.read.user.count({ where: activeAsOfWhere(where, prevFrom) }),
        this.prisma.read.user.count({ where: { ...where, hireDate: { gte: from, lte: to } } }),
      ]);

    const avgHeadcount = (headcountStart + headcountEnd) / 2;
    const turnoverRate = avgHeadcount > 0 ? round((leavers / avgHeadcount) * 100, 1) : 0;
    const retentionRate = round(100 - turnoverRate, 1);

    // janela anterior: reutiliza `headcountStart` actual como fim da janela anterior
    const prevAvgHeadcount = (headcountPrevStart + headcountStart) / 2;
    const turnoverRatePrev =
      prevAvgHeadcount > 0 ? round((leaversPrev / prevAvgHeadcount) * 100, 1) : 0;
    const turnoverTrend = round(turnoverRate - turnoverRatePrev, 1);

    const tenureUsers = await this.prisma.read.user.findMany({
      where: { ...where, active: true },
      select: { hireDate: true, createdAt: true },
    });
    let tenureSum = 0;
    for (const u of tenureUsers) {
      tenureSum += tenureMonths(u.hireDate ?? u.createdAt);
    }
    const avgTenureMonths = tenureUsers.length ? round(tenureSum / tenureUsers.length, 1) : 0;

    return {
      leavers,
      avgHeadcount,
      turnoverRate,
      retentionRate,
      turnoverRatePrev,
      turnoverTrend,
      newHires,
      netHeadcountChange: newHires - leavers,
      avgTenureMonths,
      insights: this.buildTurnoverInsights(turnoverRate, leavers),
      period: { from, to },
    };
  }

  // ── helpers privados ──────────────────────────────────────────────

  // Portado de `src/dashboard-rh/dashboard-rh.service.ts:1255` (variante emoji,
  // thresholds 10% / 20% — nota §8 risco 4). Existe uma 2ª cópia sem emojis em
  // `src/reports/reports.service.ts:1134`. As duas originais são removidas nas
  // Tasks 6/8, que passam a ler `result.insights` (Task 9 assere
  // `grep buildTurnoverInsights == 1`). O 2º argumento é o `leavers` da janela
  // analisada; o texto da 2ª linha foi tornado neutro à janela ("no período") —
  // o original do dashboard-rh dizia "nos últimos 3 meses" porque lá recebia um
  // sub-total de 3 meses, o que não se aplica a esta janela configurável.
  private buildTurnoverInsights(rate: number, leavers: number): string[] {
    const out: string[] = [];
    if (rate > 20) out.push(`🚨 Turnover crítico: ${rate}% — investigar causas urgentemente`);
    else if (rate > 10) out.push(`⚠️ Turnover acima da média: ${rate}%`);
    else out.push(`✅ Turnover saudável: ${rate}%`);
    if (leavers > 0) out.push(`${leavers} saída(s) no período`);
    return out;
  }
}

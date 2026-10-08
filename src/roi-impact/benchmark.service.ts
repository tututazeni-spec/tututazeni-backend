// src/roi-impact/benchmark.service.ts
// "Benchmarks" (docs/roi-impact.md §9) — CRUD dos registos manuais
// (tipicamente EXTERNO com fonte registada, ou INTERNO quando o RH regista
// uma meta/referência explícita) + as comparações computadas do spec:
// "Internos" (entre departamentos/unidades/ciclos, melhor/pior por tipo de
// iniciativa) são sempre calculadas em runtime a partir de RoiAnalysis —
// nunca persistidas, para nunca divergirem das análises reais (mesma
// disciplina de RoiImpactService#getRoiAnalysisOverview). "Externos" usa os
// Benchmark EXTERNO efectivamente registados — nunca inventa uma referência
// de mercado sem fonte.
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBenchmarkDto,
  UpdateBenchmarkDto,
  BenchmarkFilterDto,
  BenchmarkComparisonFilterDto,
  BenchmarkType,
} from './roi-impact.dto';

function groupAvg<K extends string | number>(
  rows: { key: K | null; value: number | null }[],
): { key: K; avgValue: number; count: number }[] {
  const map = new Map<K, { sum: number; count: number }>();
  for (const { key, value } of rows) {
    if (key == null || value == null) continue;
    const entry = map.get(key) ?? { sum: 0, count: 0 };
    entry.sum += value;
    entry.count += 1;
    map.set(key, entry);
  }
  return Array.from(map.entries()).map(([key, { sum, count }]) => ({
    key,
    avgValue: +(sum / count).toFixed(1),
    count,
  }));
}

@Injectable()
export class BenchmarkService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // CRUD
  // ══════════════════════════════════════════════════════

  async findAll(filter: BenchmarkFilterDto = {}) {
    const where = {
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.kpiDefinitionId ? { kpiDefinitionId: filter.kpiDefinitionId } : {}),
      ...(filter.referenceYear ? { referenceYear: filter.referenceYear } : {}),
    };
    const benchmarks = await this.prisma.read.benchmark.findMany({
      where,
      orderBy: [{ referenceYear: 'desc' }, { name: 'asc' }],
    });
    return { total: benchmarks.length, benchmarks };
  }

  async findOne(id: number) {
    const benchmark = await this.prisma.read.benchmark.findUnique({ where: { id } });
    if (!benchmark) throw new NotFoundException(`Benchmark ${id} não encontrado`);
    return benchmark;
  }

  async create(dto: CreateBenchmarkDto, createdById: number) {
    return this.prisma.benchmark.create({
      data: {
        name: dto.name,
        type: dto.type,
        source: dto.source,
        referenceYear: dto.referenceYear,
        value: dto.value,
        unit: dto.unit,
        kpiDefinitionId: dto.kpiDefinitionId ?? null,
        indicatorName: dto.indicatorName ?? null,
        observations: dto.observations ?? null,
        createdById,
      },
    });
  }

  async update(id: number, dto: UpdateBenchmarkDto) {
    await this.findOne(id);
    return this.prisma.benchmark.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.referenceYear !== undefined ? { referenceYear: dto.referenceYear } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.kpiDefinitionId !== undefined ? { kpiDefinitionId: dto.kpiDefinitionId } : {}),
        ...(dto.indicatorName !== undefined ? { indicatorName: dto.indicatorName } : {}),
        ...(dto.observations !== undefined ? { observations: dto.observations } : {}),
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.benchmark.delete({ where: { id } });
  }

  // ══════════════════════════════════════════════════════
  // COMPARAÇÕES INTERNAS (docs/roi-impact.md §9 "Internos")
  // ══════════════════════════════════════════════════════

  async getInternalComparisons(filter: BenchmarkComparisonFilterDto = {}) {
    const analyses = await this.prisma.read.roiAnalysis.findMany({
      where: {
        roiPercent: { not: null },
        ...(filter.initiativeType ? { initiativeType: filter.initiativeType } : {}),
      },
      include: { department: { select: { id: true, name: true } } },
    });

    const byDepartment = groupAvg(
      analyses.map(a => ({ key: a.department?.name ?? null, value: a.roiPercent })),
    );
    const byUnit = groupAvg(analyses.map(a => ({ key: a.unit, value: a.roiPercent })));
    const byCycle = groupAvg(
      analyses.map(a => ({ key: a.createdAt.getFullYear(), value: a.roiPercent })),
    );

    const byType = new Map<string, typeof analyses>();
    for (const a of analyses) {
      const list = byType.get(a.initiativeType) ?? [];
      list.push(a);
      byType.set(a.initiativeType, list);
    }
    const bestWorstByType = Array.from(byType.entries()).map(([initiativeType, list]) => {
      const sorted = [...list].sort(
        (a, b) => (b.roiPercent ?? -Infinity) - (a.roiPercent ?? -Infinity),
      );
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      return {
        initiativeType,
        best: best ? { id: best.id, name: best.name, roiPercent: best.roiPercent } : null,
        // Sem "pior" distinto quando só há uma análise medida deste tipo —
        // nunca repete a mesma análise como melhor e pior em simultâneo.
        worst:
          worst && worst.id !== best?.id
            ? { id: worst.id, name: worst.name, roiPercent: worst.roiPercent }
            : null,
      };
    });

    return { totalAnalyses: analyses.length, byDepartment, byUnit, byCycle, bestWorstByType };
  }

  // ══════════════════════════════════════════════════════
  // COMPARAÇÃO SECTORIAL (docs/roi-impact.md §9 "Externos")
  // ══════════════════════════════════════════════════════

  async getSectorRoiComparison() {
    const analyses = await this.prisma.read.roiAnalysis.findMany({
      where: { roiPercent: { not: null } },
      select: { roiPercent: true },
    });
    const internalAvgRoi = analyses.length
      ? +(analyses.reduce((sum, a) => sum + (a.roiPercent ?? 0), 0) / analyses.length).toFixed(1)
      : null;

    const externalBenchmarks = await this.prisma.read.benchmark.findMany({
      where: {
        type: BenchmarkType.EXTERNO,
        OR: [
          { indicatorName: { contains: 'roi', mode: 'insensitive' } },
          { name: { contains: 'roi', mode: 'insensitive' } },
        ],
      },
      orderBy: { referenceYear: 'desc' },
    });

    return {
      internalAvgRoi,
      sampleSize: analyses.length,
      externalBenchmarks,
      note:
        externalBenchmarks.length === 0
          ? 'Sem benchmarks externos de ROI registados para comparação — regista um benchmark EXTERNO com fonte para contextualizar.'
          : null,
    };
  }
}

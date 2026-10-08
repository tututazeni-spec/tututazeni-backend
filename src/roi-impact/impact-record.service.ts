// src/roi-impact/impact-record.service.ts
// "Impacto no Negócio" (docs/roi-impact.md §3) — liga uma iniciativa de
// RH/Academia a um indicador de negócio real. A iniciativa nunca é copiada
// (mesma FK solta initiativeType/initiativeId de RoiAnalysis, resolvida via
// RoiAnalysisService#resolveInitiative); o "valor atribuído" (variação ×
// grau de atribuição) é sempre calculado em runtime, nunca guardado, para
// nunca divergir se a % de atribuição for revista mais tarde.
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoiAnalysisService } from './roi-analysis.service';
import {
  CreateImpactRecordDto,
  UpdateImpactRecordDto,
  ValidateImpactRecordDto,
  ImpactRecordFilterDto,
  ImpactSubjectType,
  ImpactCategory,
  RoiInitiativeType,
} from './roi-impact.dto';

interface ImpactRecordRow {
  id: number;
  subjectType: ImpactSubjectType;
  initiativeType: RoiInitiativeType;
  initiativeId: number | null;
  category: ImpactCategory;
  indicatorName: string;
  valueBefore: number | null;
  valueAfter: number | null;
  observationPeriodStart: Date | null;
  observationPeriodEnd: Date | null;
  attributionPercent: number | null;
  dataSource: string | null;
  validatedById: number | null;
  validatedAt: Date | null;
  team: string | null;
  user: { fullName: string } | null;
  department: { name: string } | null;
}

function computeVariation(before: number | null, after: number | null): number | null {
  return before != null && after != null ? +(after - before).toFixed(2) : null;
}

function computeAttributedImpact(
  variation: number | null,
  attributionPercent: number | null,
): number | null {
  return variation != null && attributionPercent != null
    ? +((variation * attributionPercent) / 100).toFixed(2)
    : null;
}

@Injectable()
export class ImpactRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisSvc: RoiAnalysisService,
  ) {}

  async create(dto: CreateImpactRecordDto, createdById: number) {
    return this.prisma.impactRecord.create({
      data: {
        subjectType: dto.subjectType,
        userId: dto.userId ?? null,
        team: dto.team ?? null,
        departmentId: dto.departmentId ?? null,
        initiativeType: dto.initiativeType,
        initiativeId: dto.initiativeId ?? null,
        category: dto.category,
        indicatorName: dto.indicatorName,
        valueBefore: dto.valueBefore ?? null,
        valueAfter: dto.valueAfter ?? null,
        observationPeriodStart: dto.observationPeriodStart
          ? new Date(dto.observationPeriodStart)
          : null,
        observationPeriodEnd: dto.observationPeriodEnd ? new Date(dto.observationPeriodEnd) : null,
        attributionPercent: dto.attributionPercent ?? null,
        dataSource: dto.dataSource ?? null,
        createdById,
      },
    });
  }

  async update(id: number, dto: UpdateImpactRecordDto) {
    await this.findOrThrow(id);
    const { observationPeriodStart, observationPeriodEnd, ...rest } = dto;
    return this.prisma.impactRecord.update({
      where: { id },
      data: {
        ...rest,
        ...(observationPeriodStart !== undefined
          ? {
              observationPeriodStart: observationPeriodStart
                ? new Date(observationPeriodStart)
                : null,
            }
          : {}),
        ...(observationPeriodEnd !== undefined
          ? { observationPeriodEnd: observationPeriodEnd ? new Date(observationPeriodEnd) : null }
          : {}),
      },
    });
  }

  async validate(id: number, dto: ValidateImpactRecordDto) {
    await this.findOrThrow(id);
    return this.prisma.impactRecord.update({
      where: { id },
      data: { validatedById: dto.validatedById, validatedAt: new Date() },
    });
  }

  private async findOrThrow(id: number) {
    const record = await this.prisma.read.impactRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException(`Registo de impacto ${id} não encontrado`);
    return record;
  }

  async findAll(filter: ImpactRecordFilterDto = {}) {
    const where = {
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.initiativeType ? { initiativeType: filter.initiativeType } : {}),
      ...(filter.subjectType ? { subjectType: filter.subjectType } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
    };

    const records = await this.prisma.read.impactRecord.findMany({
      where,
      include: {
        user: { select: { fullName: true } },
        department: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = await Promise.all(records.map((r: ImpactRecordRow) => this.toRow(r)));
    return { total: rows.length, records: rows };
  }

  async findOne(id: number) {
    const record = await this.prisma.read.impactRecord.findUnique({
      where: { id },
      include: {
        user: { select: { fullName: true } },
        department: { select: { name: true } },
      },
    });
    if (!record) throw new NotFoundException(`Registo de impacto ${id} não encontrado`);
    return this.toRow(record);
  }

  private async toRow(r: ImpactRecordRow) {
    const initiative = await this.analysisSvc.resolveInitiative(r.initiativeType, r.initiativeId);
    const variation = computeVariation(r.valueBefore, r.valueAfter);
    const attributedImpact = computeAttributedImpact(variation, r.attributionPercent);
    const subjectLabel =
      r.subjectType === 'COLABORADOR'
        ? (r.user?.fullName ?? null)
        : r.subjectType === 'EQUIPA'
          ? r.team
          : (r.department?.name ?? null);

    return {
      id: r.id,
      subjectType: r.subjectType,
      subjectLabel,
      initiativeType: r.initiativeType,
      initiative: initiative?.label ?? null,
      category: r.category,
      indicatorName: r.indicatorName,
      valueBefore: r.valueBefore,
      valueAfter: r.valueAfter,
      variation,
      observationPeriodStart: r.observationPeriodStart,
      observationPeriodEnd: r.observationPeriodEnd,
      attributionPercent: r.attributionPercent,
      attributedImpact,
      dataSource: r.dataSource,
      validatedById: r.validatedById,
      validatedAt: r.validatedAt,
    };
  }

  // ══════════════════════════════════════════════════════
  // CATEGORIAS DE IMPACTO — resumo para a aba (docs/roi-impact.md §3)
  // ══════════════════════════════════════════════════════

  async getCategorySummary(filter: ImpactRecordFilterDto = {}) {
    const { records } = await this.findAll(filter);
    const map = new Map<
      string,
      { count: number; attributionSum: number; attributionCount: number; attributedTotal: number }
    >();
    for (const r of records) {
      const entry = map.get(r.category) ?? {
        count: 0,
        attributionSum: 0,
        attributionCount: 0,
        attributedTotal: 0,
      };
      entry.count += 1;
      if (r.attributionPercent != null) {
        entry.attributionSum += r.attributionPercent;
        entry.attributionCount += 1;
      }
      if (r.attributedImpact != null) entry.attributedTotal += r.attributedImpact;
      map.set(r.category, entry);
    }
    return Array.from(map.entries()).map(([category, e]) => ({
      category,
      count: e.count,
      avgAttributionPercent:
        e.attributionCount > 0 ? +(e.attributionSum / e.attributionCount).toFixed(1) : null,
      attributedTotal: +e.attributedTotal.toFixed(2),
    }));
  }
}

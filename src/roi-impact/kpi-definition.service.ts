// src/roi-impact/kpi-definition.service.ts
// "Indicadores & KPIs" (docs/roi-impact.md §6) — CRUD da biblioteca central
// de KPIs. Os 10 exemplos do spec (Taxa de rotatividade voluntária, custo
// de substituição por saída, ...) são semeados em prisma/seed.ts — mesmo
// padrão de RoiEvaluationModel (ver roi-evaluation-model.service.ts) — para
// nunca serem recriados silenciosamente por um pedido de leitura.
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateKpiDefinitionDto,
  UpdateKpiDefinitionDto,
  KpiDefinitionFilterDto,
  KpiCategory,
} from './roi-impact.dto';

@Injectable()
export class KpiDefinitionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: KpiDefinitionFilterDto = {}) {
    const where = {
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const kpis = await this.prisma.read.kpiDefinition.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return { total: kpis.length, kpis };
  }

  async findOne(id: number) {
    const kpi = await this.prisma.read.kpiDefinition.findUnique({ where: { id } });
    if (!kpi) throw new NotFoundException(`KPI ${id} não encontrado`);
    return kpi;
  }

  async create(dto: CreateKpiDefinitionDto, createdById: number) {
    try {
      return await this.prisma.kpiDefinition.create({
        data: {
          name: dto.name,
          code: dto.code.trim().toUpperCase(),
          category: dto.category,
          description: dto.description ?? null,
          unit: dto.unit,
          formula: dto.formula ?? null,
          dataSource: dto.dataSource ?? null,
          frequency: dto.frequency,
          targetValue: dto.targetValue ?? null,
          benchmarkNote: dto.benchmarkNote ?? null,
          responsibleId: dto.responsibleId ?? null,
          createdById,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Já existe um KPI com o código "${dto.code}"`);
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateKpiDefinitionDto) {
    await this.findOne(id);
    return this.prisma.kpiDefinition.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.formula !== undefined ? { formula: dto.formula } : {}),
        ...(dto.dataSource !== undefined ? { dataSource: dto.dataSource } : {}),
        ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
        ...(dto.targetValue !== undefined ? { targetValue: dto.targetValue } : {}),
        ...(dto.benchmarkNote !== undefined ? { benchmarkNote: dto.benchmarkNote } : {}),
        ...(dto.responsibleId !== undefined ? { responsibleId: dto.responsibleId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
  }

  // ══════════════════════════════════════════════════════
  // RESUMO POR CATEGORIA — para a aba (docs/roi-impact.md §6)
  // ══════════════════════════════════════════════════════

  async getCategorySummary() {
    const { kpis } = await this.findAll();
    const map = new Map<KpiCategory, number>();
    for (const k of kpis) map.set(k.category, (map.get(k.category) ?? 0) + 1);
    return Array.from(map.entries()).map(([category, count]) => ({ category, count }));
  }
}

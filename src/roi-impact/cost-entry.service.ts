// src/roi-impact/cost-entry.service.ts
// "Custos & Investimento" (docs/roi-impact.md §5) — consolida o custo real
// de cada iniciativa sem duplicar Payroll/Trainings. CostEntry guarda só as
// linhas de custo geridas manualmente pelo RH; a consolidação por
// iniciativa (getConsolidation) agrega essas linhas EM RUNTIME com os
// campos de custo que já existem em Training (instructorCost/materialCost/
// transportCost/foodCost/lodgingCost/otherCosts/cost) quando a iniciativa é
// uma FORMACAO — nunca copia esses valores para CostEntry.
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoiAnalysisService } from './roi-analysis.service';
import {
  CreateCostEntryDto,
  UpdateCostEntryDto,
  CostEntryFilterDto,
  EstimateLaborCostDto,
  CostCategory,
  CostSubCategory,
  RoiInitiativeType,
} from './roi-impact.dto';

// Deriva `category` de `subCategory` — nunca aceite directamente do
// cliente, para as duas colunas nunca divergirem uma da outra.
const CATEGORY_BY_SUBCATEGORY: Record<CostSubCategory, CostCategory> = {
  FORMADOR_CONSULTOR: CostCategory.DIRETO,
  MATERIAL_DIDATICO: CostCategory.DIRETO,
  PLATAFORMA_LICENCAS: CostCategory.DIRETO,
  SALA_LOGISTICA: CostCategory.DIRETO,
  DESLOCACAO_ALOJAMENTO: CostCategory.DIRETO,
  CERTIFICACAO: CostCategory.DIRETO,
  HORAS_TRABALHO_PERDIDAS: CostCategory.INDIRETO,
  SUBSTITUICAO_COBERTURA: CostCategory.INDIRETO,
  COORDENACAO_GESTAO_RH: CostCategory.INDIRETO,
  PRODUCAO_NAO_REALIZADA: CostCategory.OPORTUNIDADE,
  ATRASO_PROJETOS: CostCategory.OPORTUNIDADE,
};

// Jornada padrão usada para converter salário mensal em salário/hora
// (22 dias úteis × 8h) — mesmo padrão de estimativa usado noutros módulos
// financeiros deste projecto na ausência de um valor configurado
// (RoiImpactService.DEFAULTS segue a mesma lógica de "assunção documentada
// em vez de inventar precisão falsa").
const STANDARD_MONTHLY_HOURS = 176;

@Injectable()
export class CostEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisSvc: RoiAnalysisService,
  ) {}

  async create(dto: CreateCostEntryDto, createdById: number) {
    return this.prisma.costEntry.create({
      data: {
        initiativeType: dto.initiativeType,
        initiativeId: dto.initiativeId ?? null,
        subCategory: dto.subCategory,
        category: CATEGORY_BY_SUBCATEGORY[dto.subCategory],
        description: dto.description ?? null,
        amount: dto.amount,
        source: dto.source ?? null,
        incurredAt: dto.incurredAt ? new Date(dto.incurredAt) : null,
        createdById,
      },
    });
  }

  async update(id: number, dto: UpdateCostEntryDto) {
    await this.findOrThrow(id);
    const { incurredAt, ...rest } = dto;
    return this.prisma.costEntry.update({
      where: { id },
      data: {
        ...rest,
        ...(rest.subCategory !== undefined
          ? { category: CATEGORY_BY_SUBCATEGORY[rest.subCategory] }
          : {}),
        ...(incurredAt !== undefined
          ? { incurredAt: incurredAt ? new Date(incurredAt) : null }
          : {}),
      },
    });
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.costEntry.delete({ where: { id } });
    return { deleted: true };
  }

  private async findOrThrow(id: number) {
    const entry = await this.prisma.read.costEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(`Entrada de custo ${id} não encontrada`);
    return entry;
  }

  async findAll(filter: CostEntryFilterDto = {}) {
    const where = {
      ...(filter.initiativeType ? { initiativeType: filter.initiativeType } : {}),
      ...(filter.initiativeId != null ? { initiativeId: filter.initiativeId } : {}),
      ...(filter.category ? { category: filter.category } : {}),
      ...(filter.subCategory ? { subCategory: filter.subCategory } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
    };
    const entries = await this.prisma.read.costEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return { total: entries.length, entries };
  }

  // ══════════════════════════════════════════════════════
  // "Custo de horas perdidas" — apoio a partir de Payroll (Fontes §5)
  // ══════════════════════════════════════════════════════
  //
  // Lê o salário mais recente de cada colaborador (Payslip) para estimar o
  // custo das horas em formação — nunca guarda nada aqui, só devolve o
  // valor sugerido para o RH rever e, se aceitar, submeter como CostEntry.
  async estimateLaborCost(dto: EstimateLaborCostDto) {
    const payslips = await this.prisma.read.payslip.findMany({
      where: { userId: { in: dto.userIds } },
      orderBy: { period: 'desc' },
      select: { userId: true, grossSalary: true, period: true },
    });

    const latestByUser = new Map<number, { grossSalary: number; period: string }>();
    for (const p of payslips) {
      if (!latestByUser.has(p.userId)) latestByUser.set(p.userId, p);
    }

    const users = await this.prisma.read.user.findMany({
      where: { id: { in: dto.userIds } },
      select: { id: true, fullName: true },
    });

    const breakdown = users.map(u => {
      const payslip = latestByUser.get(u.id);
      const hourlyRate = payslip
        ? +(payslip.grossSalary / STANDARD_MONTHLY_HOURS).toFixed(2)
        : null;
      const cost = hourlyRate != null ? +(hourlyRate * dto.hours).toFixed(2) : null;
      return {
        userId: u.id,
        fullName: u.fullName,
        hourlyRate,
        cost,
        payslipPeriod: payslip?.period ?? null,
        confidence: payslip ? 'HIGH' : 'LOW',
      };
    });

    const totalCost = breakdown.reduce((sum, b) => sum + (b.cost ?? 0), 0);
    const missing = breakdown.filter(b => b.hourlyRate == null).length;

    return {
      hours: dto.hours,
      breakdown,
      totalCost: +totalCost.toFixed(2),
      note:
        missing > 0
          ? `${missing} colaborador(es) sem recibo de vencimento registado — custo estimado como 0 para esses casos.`
          : null,
    };
  }

  // ══════════════════════════════════════════════════════
  // CONSOLIDAÇÃO POR INICIATIVA (tabela da secção 5)
  // ══════════════════════════════════════════════════════

  async getConsolidation(filter: CostEntryFilterDto = {}) {
    const { entries } = await this.findAll(filter);

    const byInitiative = new Map<
      string,
      { initiativeType: RoiInitiativeType; initiativeId: number | null; entries: typeof entries }
    >();
    for (const e of entries) {
      const key = `${e.initiativeType}:${e.initiativeId ?? 'null'}`;
      const bucket = byInitiative.get(key) ?? {
        initiativeType: e.initiativeType,
        initiativeId: e.initiativeId,
        entries: [],
      };
      bucket.entries.push(e);
      byInitiative.set(key, bucket);
    }

    const rows = await Promise.all(
      Array.from(byInitiative.values()).map(async bucket => {
        const initiative = await this.analysisSvc.resolveInitiative(
          bucket.initiativeType,
          bucket.initiativeId,
        );

        let costDirect = bucket.entries
          .filter(e => e.category === CostCategory.DIRETO)
          .reduce((s, e) => s + e.amount, 0);
        const costIndirect = bucket.entries
          .filter(e => e.category === CostCategory.INDIRETO)
          .reduce((s, e) => s + e.amount, 0);
        const costOpportunity = bucket.entries
          .filter(e => e.category === CostCategory.OPORTUNIDADE)
          .reduce((s, e) => s + e.amount, 0);

        // Fonte "Trainings → custo por turma/sessão/formador": quando a
        // iniciativa é uma Formação sem nenhuma linha directa manual ainda,
        // usa os campos de custo já existentes em Training como base — lidos
        // em runtime, nunca copiados para CostEntry.
        if (
          bucket.initiativeType === RoiInitiativeType.FORMACAO &&
          bucket.initiativeId != null &&
          costDirect === 0
        ) {
          const training = await this.prisma.read.training.findUnique({
            where: { id: bucket.initiativeId },
            select: {
              instructorCost: true,
              materialCost: true,
              transportCost: true,
              foodCost: true,
              lodgingCost: true,
              otherCosts: true,
              cost: true,
            },
          });
          if (training) {
            const sum =
              (training.instructorCost ?? 0) +
              (training.materialCost ?? 0) +
              (training.transportCost ?? 0) +
              (training.foodCost ?? 0) +
              (training.lodgingCost ?? 0) +
              (training.otherCosts ?? 0);
            costDirect = sum > 0 ? sum : (training.cost ?? 0);
          }
        }

        const costTotal = costDirect + costIndirect + costOpportunity;
        const participants = initiative?.participants ?? 0;

        return {
          initiativeType: bucket.initiativeType,
          initiativeId: bucket.initiativeId,
          initiative: initiative?.label ?? null,
          participants,
          costDirect: +costDirect.toFixed(2),
          costIndirect: +costIndirect.toFixed(2),
          costOpportunity: +costOpportunity.toFixed(2),
          costTotal: +costTotal.toFixed(2),
          costPerParticipant: participants > 0 ? +(costTotal / participants).toFixed(2) : null,
          entryCount: bucket.entries.length,
        };
      }),
    );

    rows.sort((a, b) => b.costTotal - a.costTotal);

    return {
      total: rows.length,
      rows,
      grandTotal: {
        direct: +rows.reduce((s, r) => s + r.costDirect, 0).toFixed(2),
        indirect: +rows.reduce((s, r) => s + r.costIndirect, 0).toFixed(2),
        opportunity: +rows.reduce((s, r) => s + r.costOpportunity, 0).toFixed(2),
        total: +rows.reduce((s, r) => s + r.costTotal, 0).toFixed(2),
      },
    };
  }
}

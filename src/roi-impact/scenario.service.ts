// src/roi-impact/scenario.service.ts
// "Cenários & Simulações" (docs/roi-impact.md §8) — simula o impacto
// financeiro de uma iniciativa FUTURA ainda não executada. Ao contrário de
// RoiAnalysisService (mede uma iniciativa real já decorrida), aqui não há
// dados de execução para ler: o benefício esperado vem OU de uma RoiAnalysis
// semelhante já medida (BCR aplicado ao custo estimado) OU de uma premissa
// manual do RH — nunca inventado quando nenhum dos dois está disponível
// (mesma disciplina de RoiAnalysisService#computeResult devolver dados em
// falta em vez de um número definitivo sem base).
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScenarioDto, UpdateScenarioDto, ScenarioFilterDto } from './roi-impact.dto';

// Horizonte de projecção do spec (ver exemplo §8: "ROI projetado: 145% em 12
// meses") — usado para converter o benefício esperado (anual) num payback em
// meses.
const HORIZON_MONTHS = 12;

// Bandas de sensibilidade dos três casos do spec (Otimista/Realista/
// Pessimista): o caso Realista usa sempre o custo/benefício tal como
// resolvidos; Otimista/Pessimista aplicam uma variação simétrica-razoável
// sobre benefício e custo, não um intervalo estatístico calculado (o spec
// não define uma metodologia de variância — isto é uma banda de gestão,
// não uma projecção estatística).
type ScenarioCase = 'OTIMISTA' | 'REALISTA' | 'PESSIMISTA';
const CASE_ADJUSTMENTS: Record<ScenarioCase, { benefitFactor: number; costFactor: number }> = {
  OTIMISTA: { benefitFactor: 1.2, costFactor: 1.0 },
  REALISTA: { benefitFactor: 1.0, costFactor: 1.0 },
  PESSIMISTA: { benefitFactor: 0.8, costFactor: 1.15 },
};

interface CaseProjection {
  cost: number;
  benefit: number;
  roiPercent: number;
  paybackMonths: number | null;
}

function roiFormula(benefit: number, cost: number): number {
  return cost > 0 ? +(((benefit - cost) / cost) * 100).toFixed(1) : 0;
}

@Injectable()
export class ScenarioService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // CRIAÇÃO / EDIÇÃO
  // ══════════════════════════════════════════════════════

  async create(dto: CreateScenarioDto, createdById: number) {
    const { expectedBenefit, note } = await this.resolveExpectedBenefit({
      expectedBenefit: dto.expectedBenefit,
      basedOnAnalysisId: dto.basedOnAnalysisId,
      estimatedCost: dto.estimatedCost,
    });
    const { projections, roiPercent, paybackMonths } = this.buildProjections(
      dto.estimatedCost,
      expectedBenefit,
    );

    return this.prisma.scenario.create({
      data: {
        name: dto.name,
        initiativeType: dto.initiativeType,
        description: dto.description ?? null,
        departmentId: dto.departmentId ?? null,
        targetAudienceCount: dto.targetAudienceCount ?? null,
        estimatedCost: dto.estimatedCost,
        basedOnAnalysisId: dto.basedOnAnalysisId ?? null,
        expectedBenefit,
        assumptions: dto.assumptions ?? null,
        note,
        roiPercent,
        paybackMonths,
        projections: (projections as unknown as Prisma.InputJsonValue) ?? Prisma.DbNull,
        createdById,
      },
    });
  }

  async update(id: number, dto: UpdateScenarioDto) {
    const existing = await this.findOrThrow(id);

    const estimatedCost = dto.estimatedCost ?? existing.estimatedCost;
    // Só re-resolve o benefício esperado quando o custo, a premissa manual
    // ou a análise de referência mudam — nunca recalcula "à borla" quando o
    // RH só editou nome/descrição/assunções.
    const recomputeNeeded =
      dto.estimatedCost !== undefined ||
      dto.expectedBenefit !== undefined ||
      dto.basedOnAnalysisId !== undefined;

    let expectedBenefit = existing.expectedBenefit;
    let note = existing.note;
    let projections = existing.projections as Prisma.InputJsonValue | null;
    let roiPercent = existing.roiPercent;
    let paybackMonths = existing.paybackMonths;

    if (recomputeNeeded) {
      const effectiveBasedOnAnalysisId =
        dto.basedOnAnalysisId !== undefined
          ? dto.basedOnAnalysisId
          : (existing.basedOnAnalysisId ?? undefined);
      // Se o cenário original era baseado numa análise, uma alteração isolada
      // de estimatedCost deve re-escalar o benefício a partir dela — só usa
      // o valor manual anterior se o cenário nunca teve análise de origem.
      const effectiveManualBenefit =
        dto.expectedBenefit !== undefined
          ? dto.expectedBenefit
          : existing.basedOnAnalysisId == null
            ? (existing.expectedBenefit ?? undefined)
            : undefined;

      const resolved = await this.resolveExpectedBenefit({
        expectedBenefit: effectiveManualBenefit,
        basedOnAnalysisId: effectiveBasedOnAnalysisId,
        estimatedCost,
      });
      expectedBenefit = resolved.expectedBenefit;
      note = resolved.note;

      const built = this.buildProjections(estimatedCost, expectedBenefit);
      projections = built.projections as unknown as Prisma.InputJsonValue | null;
      roiPercent = built.roiPercent;
      paybackMonths = built.paybackMonths;
    }

    return this.prisma.scenario.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId } : {}),
        ...(dto.targetAudienceCount !== undefined
          ? { targetAudienceCount: dto.targetAudienceCount }
          : {}),
        ...(dto.assumptions !== undefined ? { assumptions: dto.assumptions } : {}),
        ...(dto.basedOnAnalysisId !== undefined
          ? { basedOnAnalysisId: dto.basedOnAnalysisId }
          : {}),
        estimatedCost,
        expectedBenefit,
        note,
        roiPercent,
        paybackMonths,
        projections: projections ?? Prisma.DbNull,
      },
    });
  }

  async remove(id: number) {
    await this.findOrThrow(id);
    await this.prisma.scenario.delete({ where: { id } });
  }

  // ══════════════════════════════════════════════════════
  // CONSULTA
  // ══════════════════════════════════════════════════════

  async findAll(filter: ScenarioFilterDto = {}) {
    const where = {
      ...(filter.initiativeType ? { initiativeType: filter.initiativeType } : {}),
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    };
    const scenarios = await this.prisma.read.scenario.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return { total: scenarios.length, scenarios };
  }

  async findOne(id: number) {
    const scenario = await this.findOrThrow(id);
    const basedOnAnalysis =
      scenario.basedOnAnalysisId != null
        ? await this.prisma.read.roiAnalysis.findUnique({
            where: { id: scenario.basedOnAnalysisId },
            select: {
              id: true,
              name: true,
              roiPercent: true,
              computedBenefit: true,
              computedCost: true,
            },
          })
        : null;
    return { ...scenario, basedOnAnalysis };
  }

  // ══════════════════════════════════════════════════════
  // COMPARAÇÃO ENTRE CENÁRIOS ALTERNATIVOS
  // ══════════════════════════════════════════════════════

  async compare(ids: number[]) {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length < 2)
      throw new BadRequestException('Indica pelo menos 2 cenários para comparar');

    const scenarios = await this.prisma.read.scenario.findMany({
      where: { id: { in: uniqueIds } },
    });
    const foundIds = new Set(scenarios.map(s => s.id));
    const missing = uniqueIds.filter(id => !foundIds.has(id));
    if (missing.length > 0)
      throw new NotFoundException(`Cenário(s) não encontrado(s): ${missing.join(', ')}`);

    const ranked = [...scenarios].sort(
      (a, b) => (b.roiPercent ?? -Infinity) - (a.roiPercent ?? -Infinity),
    );
    return {
      scenarios: ranked,
      bestId: ranked[0]?.roiPercent != null ? ranked[0].id : null,
    };
  }

  // ══════════════════════════════════════════════════════
  // RESOLUÇÃO DO BENEFÍCIO ESPERADO
  // ══════════════════════════════════════════════════════

  private async resolveExpectedBenefit(input: {
    expectedBenefit?: number;
    basedOnAnalysisId?: number;
    estimatedCost: number;
  }): Promise<{ expectedBenefit: number | null; note: string | null }> {
    if (input.expectedBenefit != null)
      return { expectedBenefit: input.expectedBenefit, note: null };

    if (input.basedOnAnalysisId != null) {
      const analysis = await this.prisma.read.roiAnalysis.findUnique({
        where: { id: input.basedOnAnalysisId },
      });
      if (!analysis)
        throw new NotFoundException(`Análise de ROI ${input.basedOnAnalysisId} não encontrada`);

      if (
        analysis.computedCost == null ||
        !(analysis.computedCost > 0) ||
        analysis.computedBenefit == null
      ) {
        return {
          expectedBenefit: null,
          note: `A análise de ROI "${analysis.name}" (#${analysis.id}) ainda não tem resultado calculado (Etapa 5) — indica um benefício esperado manual ou aguarda o cálculo dessa análise.`,
        };
      }

      const bcr = analysis.computedBenefit / analysis.computedCost;
      return {
        expectedBenefit: +(input.estimatedCost * bcr).toFixed(2),
        note: `Benefício esperado projectado a partir do rácio benefício/custo (BCR ${bcr.toFixed(2)}) da análise de ROI "${analysis.name}" (#${analysis.id}).`,
      };
    }

    return {
      expectedBenefit: null,
      note: 'Sem benefício esperado indicado (nem premissa manual, nem análise de ROI semelhante) — projecção de ROI/payback indisponível.',
    };
  }

  // ══════════════════════════════════════════════════════
  // PROJECÇÕES — Otimista / Realista / Pessimista
  // ══════════════════════════════════════════════════════

  private buildProjections(
    estimatedCost: number,
    expectedBenefit: number | null,
  ): {
    projections: Record<ScenarioCase, CaseProjection> | null;
    roiPercent: number | null;
    paybackMonths: number | null;
  } {
    if (expectedBenefit == null)
      return { projections: null, roiPercent: null, paybackMonths: null };

    const projections = {} as Record<ScenarioCase, CaseProjection>;
    for (const caseName of Object.keys(CASE_ADJUSTMENTS) as ScenarioCase[]) {
      const adj = CASE_ADJUSTMENTS[caseName];
      const cost = +(estimatedCost * adj.costFactor).toFixed(2);
      const benefit = +(expectedBenefit * adj.benefitFactor).toFixed(2);
      const paybackMonths = benefit > 0 ? +(cost / (benefit / HORIZON_MONTHS)).toFixed(1) : null;
      projections[caseName] = {
        cost,
        benefit,
        roiPercent: roiFormula(benefit, cost),
        paybackMonths,
      };
    }

    const realista = projections.REALISTA;
    return { projections, roiPercent: realista.roiPercent, paybackMonths: realista.paybackMonths };
  }

  private async findOrThrow(id: number) {
    const scenario = await this.prisma.read.scenario.findUnique({ where: { id } });
    if (!scenario) throw new NotFoundException(`Cenário ${id} não encontrado`);
    return scenario;
  }
}

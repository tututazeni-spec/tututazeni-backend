// src/roi-impact/roi-analysis.service.ts
// "ROI da Formação" (docs/roi-impact.md §2) — CRUD da análise + wizard de 5
// etapas. Nunca copia dados de Course/Training/LearningPath/LegacyPdi/
// Mentoring/Event: `initiativeType` + `initiativeId` são resolvidos em
// runtime via `resolveInitiative`, à semelhança de AuditLog.entity/entityId.
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRoiAnalysisDto,
  UpdateRoiAnalysisDto,
  ComputeRoiAnalysisDto,
  ApproveRoiAnalysisDto,
  RoiAnalysisFilterDto,
  RoiInitiativeType,
  RoiAnalysisStatus,
} from './roi-impact.dto';

export interface InitiativeInfo {
  label: string;
  participants: number;
  departmentId: number | null;
}

function roiFormula(benefit: number, cost: number): number {
  return cost > 0 ? +(((benefit - cost) / cost) * 100).toFixed(1) : 0;
}

function bcrFormula(benefit: number, cost: number): number {
  return cost > 0 ? +(benefit / cost).toFixed(2) : 0;
}

@Injectable()
export class RoiAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // ETAPA 1 — Identificação
  // ══════════════════════════════════════════════════════

  async create(dto: CreateRoiAnalysisDto, createdById: number) {
    return this.prisma.roiAnalysis.create({
      data: {
        name: dto.name,
        initiativeType: dto.initiativeType,
        initiativeId: dto.initiativeId ?? null,
        departmentId: dto.departmentId ?? null,
        unit: dto.unit ?? null,
        responsibleId: dto.responsibleId ?? null,
        referencePeriodStart: dto.referencePeriodStart ? new Date(dto.referencePeriodStart) : null,
        referencePeriodEnd: dto.referencePeriodEnd ? new Date(dto.referencePeriodEnd) : null,
        measurementPeriodDays: dto.measurementPeriodDays ?? null,
        status: RoiAnalysisStatus.EM_PREPARACAO,
        createdById,
      },
    });
  }

  // ══════════════════════════════════════════════════════
  // ETAPAS 2–4 — Custos, Benefícios esperados, Metodologia
  // ══════════════════════════════════════════════════════

  async update(id: number, dto: UpdateRoiAnalysisDto) {
    await this.findOrThrow(id);
    const { referencePeriodStart, referencePeriodEnd, ...rest } = dto;
    return this.prisma.roiAnalysis.update({
      where: { id },
      data: {
        ...rest,
        ...(referencePeriodStart !== undefined
          ? { referencePeriodStart: referencePeriodStart ? new Date(referencePeriodStart) : null }
          : {}),
        ...(referencePeriodEnd !== undefined
          ? { referencePeriodEnd: referencePeriodEnd ? new Date(referencePeriodEnd) : null }
          : {}),
      },
    });
  }

  // ══════════════════════════════════════════════════════
  // ETAPA 5 — Resultado
  // ══════════════════════════════════════════════════════
  //
  // O benefício monetário nunca é inferido automaticamente de um indicador
  // não-financeiro (ex.: pontos de NPS) — o spec deixa essa conversão a
  // cargo do RH (`benefitConversionNote`). Sem um valor monetário validado,
  // a análise fica DADOS_INSUFICIENTES em vez de apresentar um ROI como
  // número definitivo (ver "Princípio orientador" em docs/roi-impact.md).
  async computeResult(id: number, dto: ComputeRoiAnalysisDto) {
    const analysis = await this.findOrThrow(id);

    const costParts = [analysis.costDirect, analysis.costIndirect, analysis.costOpportunity];
    const hasCost = costParts.some(v => v != null);
    const computedCost = hasCost ? costParts.reduce((sum: number, v) => sum + (v ?? 0), 0) : null;

    const computedBenefit = dto.monetaryBenefitOverride ?? null;

    if (computedCost == null || computedBenefit == null) {
      return this.prisma.roiAnalysis.update({
        where: { id },
        data: {
          computedCost,
          computedBenefit,
          roiPercent: null,
          bcr: null,
          paybackMonths: null,
          confidenceLevel: null,
          status: RoiAnalysisStatus.DADOS_INSUFICIENTES,
          observations: dto.observations ?? analysis.observations,
        },
      });
    }

    const measurementMonths = (analysis.measurementPeriodDays ?? 180) / 30;
    const paybackMonths =
      computedBenefit > 0
        ? +((computedCost * measurementMonths) / computedBenefit).toFixed(1)
        : null;

    return this.prisma.roiAnalysis.update({
      where: { id },
      data: {
        computedCost,
        computedBenefit,
        roiPercent: roiFormula(computedBenefit, computedCost),
        bcr: bcrFormula(computedBenefit, computedCost),
        paybackMonths,
        confidenceLevel: this.confidenceFor(analysis),
        status: RoiAnalysisStatus.CALCULADO,
        observations: dto.observations ?? analysis.observations,
      },
    });
  }

  async approve(id: number, dto: ApproveRoiAnalysisDto) {
    await this.findOrThrow(id);
    return this.prisma.roiAnalysis.update({
      where: { id },
      data: {
        status: dto.status,
        approvedById: dto.approvedById,
        approvedAt: new Date(),
        observations: dto.observations,
      },
    });
  }

  private confidenceFor(analysis: {
    hasControlGroup: boolean;
    isolationFactor: number | null;
    dataSource: string | null;
  }): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (analysis.hasControlGroup && analysis.isolationFactor != null && analysis.dataSource)
      return 'HIGH';
    if (analysis.isolationFactor != null || analysis.dataSource) return 'MEDIUM';
    return 'LOW';
  }

  private async findOrThrow(id: number) {
    const analysis = await this.prisma.read.roiAnalysis.findUnique({ where: { id } });
    if (!analysis) throw new NotFoundException(`Análise de ROI ${id} não encontrada`);
    return analysis;
  }

  // ══════════════════════════════════════════════════════
  // TABELA — "ROI da Formação" (lista todas as análises)
  // ══════════════════════════════════════════════════════

  async findAll(filter: RoiAnalysisFilterDto = {}) {
    const where = {
      ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
      ...(filter.initiativeType ? { initiativeType: filter.initiativeType } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
    };

    const analyses = await this.prisma.read.roiAnalysis.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const rows = await Promise.all(
      analyses.map(async a => {
        const initiative = await this.resolveInitiative(a.initiativeType, a.initiativeId);
        const totalCost =
          a.computedCost ??
          [a.costDirect, a.costIndirect, a.costOpportunity].reduce(
            (sum: number, v) => sum + (v ?? 0),
            0,
          );
        const participants = initiative?.participants ?? 0;
        return {
          id: a.id,
          name: a.name,
          initiativeType: a.initiativeType,
          initiative: initiative?.label ?? null,
          departmentId: a.departmentId ?? initiative?.departmentId ?? null,
          unit: a.unit,
          participants,
          totalCost,
          costPerParticipant: participants > 0 ? +(totalCost / participants).toFixed(2) : null,
          estimatedBenefit: a.benefitExpectedValue,
          realizedBenefit: a.computedBenefit,
          roiPercent: a.roiPercent,
          paybackMonths: a.paybackMonths,
          confidenceLevel: a.confidenceLevel,
          status: a.status,
          measurementPeriodDays: a.measurementPeriodDays,
        };
      }),
    );

    return { total: rows.length, analyses: rows };
  }

  async findOne(id: number) {
    const analysis = await this.findOrThrow(id);
    const initiative = await this.resolveInitiative(analysis.initiativeType, analysis.initiativeId);
    return { ...analysis, initiative };
  }

  // ══════════════════════════════════════════════════════
  // RESOLUÇÃO DA INICIATIVA (sem duplicar dados de origem)
  // ══════════════════════════════════════════════════════

  async resolveInitiative(
    type: RoiInitiativeType,
    id: number | null | undefined,
  ): Promise<InitiativeInfo | null> {
    if (id == null) return null;

    switch (type) {
      case RoiInitiativeType.CURSO: {
        const course = await this.prisma.read.course.findUnique({
          where: { id },
          select: { title: true, departmentId: true },
        });
        if (!course) return null;
        const participants = await this.prisma.read.enrollment.count({ where: { courseId: id } });
        return { label: course.title, participants, departmentId: course.departmentId ?? null };
      }
      case RoiInitiativeType.FORMACAO: {
        const training = await this.prisma.read.training.findUnique({
          where: { id },
          select: { title: true },
        });
        if (!training) return null;
        const participants = await this.prisma.read.trainingParticipant.count({
          where: { trainingId: id },
        });
        return { label: training.title, participants, departmentId: null };
      }
      case RoiInitiativeType.PERCURSO: {
        const path = await this.prisma.read.learningPath.findUnique({
          where: { id },
          select: { title: true },
        });
        if (!path) return null;
        const participants = await this.prisma.read.learningPathEnrollment.count({
          where: { learningPathId: id },
        });
        return { label: path.title, participants, departmentId: null };
      }
      case RoiInitiativeType.PDI: {
        const pdi = await this.prisma.read.legacyPdi.findUnique({
          where: { id },
          select: { employee: { select: { name: true } } },
        });
        if (!pdi) return null;
        return { label: `PDI: ${pdi.employee.name}`, participants: 1, departmentId: null };
      }
      case RoiInitiativeType.MENTORIA: {
        const mentoring = await this.prisma.read.mentoring.findUnique({
          where: { id },
          select: {
            mentor: { select: { fullName: true } },
            mentee: { select: { fullName: true } },
          },
        });
        if (!mentoring) return null;
        return {
          label: `Mentoria: ${mentoring.mentor.fullName} → ${mentoring.mentee.fullName}`,
          participants: 2,
          departmentId: null,
        };
      }
      case RoiInitiativeType.EVENTO: {
        const event = await this.prisma.read.event.findUnique({
          where: { id },
          select: { title: true, departmentId: true },
        });
        if (!event) return null;
        const participants = await this.prisma.read.eventParticipant.count({
          where: { eventId: id },
        });
        return { label: event.title, participants, departmentId: event.departmentId ?? null };
      }
      default:
        return null;
    }
  }

  // ══════════════════════════════════════════════════════
  // OPÇÕES DA INICIATIVA (dropdown da Etapa 1 do wizard)
  // ══════════════════════════════════════════════════════

  async listInitiativeOptions(type: RoiInitiativeType): Promise<{ id: number; label: string }[]> {
    switch (type) {
      case RoiInitiativeType.CURSO: {
        const courses = await this.prisma.read.course.findMany({
          select: { id: true, title: true },
          orderBy: { title: 'asc' },
        });
        return courses.map(c => ({ id: c.id, label: c.title }));
      }
      case RoiInitiativeType.FORMACAO: {
        const trainings = await this.prisma.read.training.findMany({
          select: { id: true, title: true },
          orderBy: { title: 'asc' },
        });
        return trainings.map(t => ({ id: t.id, label: t.title }));
      }
      case RoiInitiativeType.PERCURSO: {
        const paths = await this.prisma.read.learningPath.findMany({
          select: { id: true, title: true },
          orderBy: { title: 'asc' },
        });
        return paths.map(p => ({ id: p.id, label: p.title }));
      }
      case RoiInitiativeType.PDI: {
        const pdis = await this.prisma.read.legacyPdi.findMany({
          select: { id: true, title: true, employee: { select: { name: true } } },
          orderBy: { id: 'desc' },
        });
        return pdis.map(p => ({ id: p.id, label: `${p.title} — ${p.employee.name}` }));
      }
      case RoiInitiativeType.MENTORIA: {
        const mentorings = await this.prisma.read.mentoring.findMany({
          select: {
            id: true,
            mentor: { select: { fullName: true } },
            mentee: { select: { fullName: true } },
          },
          orderBy: { id: 'desc' },
        });
        return mentorings.map(m => ({
          id: m.id,
          label: `${m.mentor.fullName} → ${m.mentee.fullName}`,
        }));
      }
      case RoiInitiativeType.EVENTO: {
        const events = await this.prisma.read.event.findMany({
          select: { id: true, title: true },
          orderBy: { startAt: 'desc' },
        });
        return events.map(e => ({ id: e.id, label: e.title }));
      }
      default:
        return [];
    }
  }
}

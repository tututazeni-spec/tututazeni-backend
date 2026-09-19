// src/trainings/training-plan.service.ts
// docs/trainings-detalhado.md pt.2 — Plano de Formação. Serviço distinto de
// TrainingService: agrega necessidades/prioridades estratégicas e o conjunto
// de Formações previstas (Training.trainingPlanId) — "planeado vs. realizado"
// é sempre calculado a partir das Training ligadas (nunca guardado), mesmo
// padrão de computeTotalCost em trainings.service.ts.
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanAccess, isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/types/current-user';
import { buildCsvString } from '../common/utils/csv-export.util';
import {
  CreateTrainingPlanDto,
  UpdateTrainingPlanDto,
  RejectTrainingPlanDto,
  AddTrainingToPlanDto,
  TrainingPlanFilterDto,
} from './trainings.dto';

const PRIVILEGED_ROLES = [Role.ADMIN, Role.RH];

@Injectable()
export class TrainingPlanService {
  constructor(private prisma: PrismaService) {}

  private async assertCanManage(id: number, user: CurrentUserData) {
    const plan = await this.prisma.read.trainingPlan.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
    if (!plan) throw new NotFoundException('Plano de formação não encontrado');
    assertCanAccess(plan, plan.createdById ?? -1, user, PRIVILEGED_ROLES);
    return plan;
  }

  async findAll(filters: TrainingPlanFilterDto, user: CurrentUserData) {
    const { page = 1, limit = 20, search, year, period, status } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.TrainingPlanWhereInput = {};
    if (year) where.year = year;
    if (period) where.period = period;
    if (status) where.status = status;
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    if (!isPrivileged(user, PRIVILEGED_ROLES)) where.createdById = user.id;

    const [data, total] = await Promise.all([
      this.prisma.read.trainingPlan.findMany({
        where,
        skip,
        take: limit,
        include: {
          responsible: { select: { id: true, fullName: true } },
          approver: { select: { id: true, fullName: true } },
          _count: { select: { trainings: true } },
        },
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.read.trainingPlan.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const plan = await this.prisma.read.trainingPlan.findUnique({
      where: { id },
      include: {
        responsible: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        competencies: { include: { competency: { select: { id: true, name: true } } } },
        trainings: {
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            startDate: true,
            endDate: true,
            plannedBudget: true,
            cost: true,
            instructorCost: true,
            materialCost: true,
            transportCost: true,
            foodCost: true,
            lodgingCost: true,
            otherCosts: true,
            workloadHours: true,
            _count: { select: { participants: true } },
          },
        },
      },
    });
    if (!plan) throw new NotFoundException('Plano de formação não encontrado');
    return plan;
  }

  private async syncCompetencies(trainingPlanId: number, competencyIds?: number[]) {
    if (competencyIds === undefined) return;
    await this.prisma.trainingPlanCompetency.deleteMany({ where: { trainingPlanId } });
    if (competencyIds.length === 0) return;
    await this.prisma.trainingPlanCompetency.createMany({
      data: competencyIds.map(competencyId => ({ trainingPlanId, competencyId })),
      skipDuplicates: true,
    });
  }

  async create(dto: CreateTrainingPlanDto, creatorId: number) {
    const { competencyIds, ...data } = dto;
    const plan = await this.prisma.trainingPlan.create({
      data: {
        name: data.name,
        code: data.code,
        year: data.year,
        period: data.period ?? 'ANNUAL',
        description: data.description,
        objectives: data.objectives,
        identifiedNeeds: data.identifiedNeeds,
        strategicPriorities: data.strategicPriorities,
        targetDeptIds: data.targetDeptIds ?? [],
        targetUnitIds: data.targetUnitIds ?? [],
        targetPositionIds: data.targetPositionIds ?? [],
        targetAudience: data.targetAudience,
        expectedParticipants: data.expectedParticipants,
        expectedHours: data.expectedHours,
        modality: data.modality,
        plannedBudget: data.plannedBudget,
        priority: data.priority ?? 'MEDIUM',
        responsibleId: data.responsibleId,
        approverId: data.approverId,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        notes: data.notes,
        createdById: creatorId,
      },
    });
    await this.syncCompetencies(plan.id, competencyIds);
    return plan;
  }

  async update(id: number, dto: UpdateTrainingPlanDto, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    const { competencyIds, ...data } = dto;
    const plan = await this.prisma.trainingPlan.update({
      where: { id },
      data: {
        ...data,
        targetDeptIds: data.targetDeptIds ?? undefined,
        targetUnitIds: data.targetUnitIds ?? undefined,
        targetPositionIds: data.targetPositionIds ?? undefined,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
    if (competencyIds !== undefined) await this.syncCompetencies(id, competencyIds);
    return plan;
  }

  async duplicate(id: number, user: CurrentUserData) {
    const plan = await this.findOne(id);
    return this.create(
      {
        name: `${plan.name} (cópia)`,
        year: plan.year,
        period: plan.period,
        description: plan.description ?? undefined,
        objectives: plan.objectives ?? undefined,
        identifiedNeeds: plan.identifiedNeeds ?? undefined,
        strategicPriorities: plan.strategicPriorities ?? undefined,
        targetDeptIds: plan.targetDeptIds,
        targetUnitIds: plan.targetUnitIds,
        targetPositionIds: plan.targetPositionIds,
        targetAudience: plan.targetAudience ?? undefined,
        competencyIds: plan.competencies.map(c => c.competencyId),
        expectedParticipants: plan.expectedParticipants ?? undefined,
        expectedHours: plan.expectedHours ?? undefined,
        modality: plan.modality ?? undefined,
        plannedBudget: plan.plannedBudget ?? undefined,
        priority: plan.priority,
        responsibleId: plan.responsibleId ?? undefined,
        approverId: plan.approverId ?? undefined,
        notes: plan.notes ?? undefined,
      },
      user.id,
    );
  }

  // ─── Workflow: submeter → aprovar/rejeitar → publicar → arquivar ─────────

  async submit(id: number, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    const plan = await this.prisma.read.trainingPlan.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!plan || (plan.status !== 'DRAFT' && plan.status !== 'REJECTED')) {
      throw new ConflictException('Só um plano em rascunho ou rejeitado pode ser submetido');
    }
    return this.prisma.trainingPlan.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
  }

  async approve(id: number) {
    const plan = await this.prisma.read.trainingPlan.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!plan) throw new NotFoundException('Plano de formação não encontrado');
    if (plan.status !== 'SUBMITTED') {
      throw new ConflictException('Só um plano submetido pode ser aprovado');
    }
    return this.prisma.trainingPlan.update({
      where: { id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });
  }

  async reject(id: number, dto: RejectTrainingPlanDto) {
    const plan = await this.prisma.read.trainingPlan.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!plan) throw new NotFoundException('Plano de formação não encontrado');
    if (plan.status !== 'SUBMITTED') {
      throw new ConflictException('Só um plano submetido pode ser rejeitado');
    }
    return this.prisma.trainingPlan.update({
      where: { id },
      data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: dto.reason },
    });
  }

  async publish(id: number, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    const plan = await this.prisma.read.trainingPlan.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!plan || plan.status !== 'APPROVED') {
      throw new ConflictException('Só um plano aprovado pode ser publicado');
    }
    return this.prisma.trainingPlan.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  async archive(id: number, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    return this.prisma.trainingPlan.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  // ─── Formações do plano ───────────────────────────────────────────────────

  async addTraining(id: number, dto: AddTrainingToPlanDto, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    const training = await this.prisma.read.training.findUnique({
      where: { id: dto.trainingId },
      select: { id: true },
    });
    if (!training) throw new NotFoundException('Treinamento não encontrado');
    await this.prisma.training.update({
      where: { id: dto.trainingId },
      data: { trainingPlanId: id },
    });
    return { message: 'Formação associada ao plano' };
  }

  async removeTraining(id: number, trainingId: number, user: CurrentUserData) {
    await this.assertCanManage(id, user);
    await this.prisma.training.updateMany({
      where: { id: trainingId, trainingPlanId: id },
      data: { trainingPlanId: null },
    });
    return { message: 'Formação desassociada do plano' };
  }

  // ─── Execução: planeado vs. realizado ─────────────────────────────────────

  async getExecution(id: number) {
    const plan = await this.findOne(id);

    let realizedBudget = 0;
    let realizedParticipants = 0;
    let realizedHours = 0;
    let completedTrainings = 0;

    for (const t of plan.trainings) {
      const costParts = [
        t.instructorCost,
        t.materialCost,
        t.transportCost,
        t.foodCost,
        t.lodgingCost,
        t.otherCosts,
      ];
      const anySet = costParts.some(p => p != null);
      realizedBudget += anySet
        ? costParts.reduce((sum: number, p) => sum + (p ?? 0), 0)
        : (t.cost ?? 0);
      realizedParticipants += t._count.participants;
      realizedHours += t.workloadHours ?? 0;
      if (t.status === 'COMPLETED') completedTrainings += 1;
    }

    return {
      planned: {
        participants: plan.expectedParticipants ?? 0,
        hours: plan.expectedHours ?? 0,
        budget: plan.plannedBudget ?? 0,
        trainingsCount: plan.trainings.length,
      },
      realized: {
        participants: realizedParticipants,
        hours: realizedHours,
        budget: realizedBudget,
        trainingsCount: plan.trainings.length,
        completedTrainings,
      },
      executionRate: {
        participants:
          plan.expectedParticipants && plan.expectedParticipants > 0
            ? Math.round((realizedParticipants / plan.expectedParticipants) * 100)
            : null,
        hours:
          plan.expectedHours && plan.expectedHours > 0
            ? Math.round((realizedHours / plan.expectedHours) * 100)
            : null,
        budget:
          plan.plannedBudget && plan.plannedBudget > 0
            ? Math.round((realizedBudget / plan.plannedBudget) * 100)
            : null,
        trainings:
          plan.trainings.length > 0
            ? Math.round((completedTrainings / plan.trainings.length) * 100)
            : null,
      },
    };
  }

  // ─── Exportar ──────────────────────────────────────────────────────────────

  async exportCsv(id: number): Promise<string> {
    const plan = await this.findOne(id);
    const rows = plan.trainings.map(t => ({
      formacao: t.title,
      estado: t.status,
      tipo: t.type,
      inicio: t.startDate?.toISOString().slice(0, 10) ?? '',
      fim: t.endDate?.toISOString().slice(0, 10) ?? '',
      participantes: t._count.participants,
      horas: t.workloadHours ?? 0,
      orcamentoPrevisto: t.plannedBudget ?? 0,
    }));
    return buildCsvString(rows, [
      'formacao',
      'estado',
      'tipo',
      'inicio',
      'fim',
      'participantes',
      'horas',
      'orcamentoPrevisto',
    ]);
  }
}

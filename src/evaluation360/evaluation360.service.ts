// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — SERVICE
// src/modules/evaluation360/evaluation360.service.ts
// ============================================================

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/services/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CreateCompetencyDto,
  UpdateCompetencyDto,
  CreateEvaluationCycleDto,
  UpdateEvaluationCycleDto,
  PublishCycleDto,
  CreateQuestionDto,
  AddParticipantsDto,
  ConsentDto,
  SuggestEvaluatorsDto,
  BulkAssignEvaluatorsDto,
  ApproveEvaluatorsDto,
  SubmitResponseDto,
  CreateContinuousFeedbackDto,
  CreatePulseSurveyDto,
  SubmitPulseSurveyDto,
  AnalyticsQueryDto,
  NineBoxQueryDto,
  GenerateReportDto,
  CalibrateScoreDto,
  SendRemindersDto,
  PaginationDto,
  EvaluatorRole,
  CycleStatus,
  AnonymityMode,
} from './evaluation360.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class Evaluation360Service {
  private readonly logger = new Logger(Evaluation360Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ============================================================
  // BANCO DE COMPETÊNCIAS
  // ============================================================

  async createCompetency(dto: CreateCompetencyDto, actorId: string) {
    const competency = await (this.prisma as any).competency.create({
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        category: dto.category,
        scaleMin: dto.scaleMin ?? 1,
        scaleMax: dto.scaleMax ?? 5,
        isGlobal: dto.isGlobal ?? true,
        tenantId: dto.tenantId,
        indicators: dto.indicators?.length
          ? {
              create: dto.indicators.map(ind => ({
                level: ind.level,
                description: ind.description,
                examples: ind.examples,
              })),
            }
          : undefined,
      },
      include: { indicators: true },
    });
    await this.audit.log({
      entity: 'Competency',
      entityId: competency.id,
      action: 'CREATE',
      userId: actorId,
      details: { name: dto.name, type: dto.type },
    });
    return competency;
  }

  async updateCompetency(id: string, dto: UpdateCompetencyDto, actorId: string) {
    const comp = await (this.prisma as any).competency.findUnique({ where: { id } });
    if (!comp) throw new NotFoundException('Competência não encontrada.');
    const updated = await (this.prisma as any).competency.update({ where: { id }, data: dto });
    await this.audit.log({
      entity: 'Competency',
      entityId: id,
      action: 'UPDATE',
      userId: actorId,
      details: dto,
    });
    return updated;
  }

  async listCompetencies(tenantId?: string, query?: PaginationDto) {
    const where: any = { isActive: true };
    if (tenantId) where.OR = [{ isGlobal: true }, { tenantId }];
    else where.isGlobal = true;
    if (query?.search) where.name = { contains: query.search };
    return (this.prisma as any).competency.findMany({
      where,
      include: { indicators: { orderBy: { level: 'asc' } } },
      orderBy: { name: 'asc' },
      skip: query?.offset ?? 0,
      take: query?.limit ?? 50,
    });
  }

  // ============================================================
  // CICLOS DE AVALIAÇÃO
  // ============================================================

  async createCycle(dto: CreateEvaluationCycleDto, actorId: string) {
    this.validateWeights(dto);
    this.validateDates(dto.startDate, dto.endDate);

    const cycle = await (this.prisma as any).evaluationCycle.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        description: dto.description,
        model: dto.model,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        gracePeriodDays: dto.gracePeriodDays ?? 3,
        anonymityMode: dto.anonymityMode ?? 'ANONYMOUS',
        quorumMinimum: dto.quorumMinimum ?? 3,
        weightSelf: dto.weightSelf ?? 10,
        weightManager: dto.weightManager ?? 40,
        weightPeer: dto.weightPeer ?? 30,
        weightSubordinate: dto.weightSubordinate ?? 20,
        weightExternal: dto.weightExternal ?? 0,
        cutoffPromotion: dto.cutoffPromotion,
        cutoffBonus: dto.cutoffBonus,
        cutoffProgram: dto.cutoffProgram,
        linkedToPdi: dto.linkedToPdi ?? true,
        linkedToBonus: dto.linkedToBonus ?? false,
        linkedToOkrs: dto.linkedToOkrs ?? false,
        createdBy: actorId,
        competencies: dto.competencies?.length
          ? {
              create: dto.competencies.map(c => ({
                competencyId: c.competencyId,
                weight: c.weight ?? 1,
                isRequired: c.isRequired ?? true,
                order: c.order ?? 0,
              })),
            }
          : undefined,
      },
      include: { competencies: { include: { competency: true } } },
    });

    await this.audit.log({
      entity: 'EvaluationCycle',
      entityId: cycle.id,
      action: 'CREATE',
      userId: actorId,
      details: { name: dto.name, model: dto.model },
    });
    return cycle;
  }

  async updateCycle(id: string, dto: UpdateEvaluationCycleDto, actorId: string) {
    const cycle = await this.findCycleOrFail(id);
    if ([CycleStatus.IN_PROGRESS, CycleStatus.COMPLETED].includes(cycle.status as CycleStatus)) {
      throw new BadRequestException('Ciclo em curso ou concluído não pode ser alterado.');
    }
    if (dto.weightSelf !== undefined || dto.weightManager !== undefined)
      this.validateWeights({ ...cycle, ...dto });
    const updated = await (this.prisma as any).evaluationCycle.update({ where: { id }, data: dto });
    await this.audit.log({
      entity: 'EvaluationCycle',
      entityId: id,
      action: 'UPDATE',
      userId: actorId,
      details: dto,
    });
    return updated;
  }

  async publishCycle(id: string, dto: PublishCycleDto, actorId: string) {
    const cycle = await this.findCycleOrFail(id);
    if (cycle.status !== CycleStatus.DRAFT)
      throw new BadRequestException('Apenas ciclos em rascunho podem ser publicados.');

    const participantCount = await (this.prisma as any).cycleParticipant.count({
      where: { cycleId: id },
    });
    if (participantCount === 0)
      throw new BadRequestException(
        'O ciclo precisa de pelo menos 1 participante antes de ser publicado.',
      );

    const questionCount = await (this.prisma as any).evaluationQuestion.count({
      where: { cycleId: id },
    });
    if (questionCount === 0)
      throw new BadRequestException(
        'O ciclo precisa de pelo menos 1 questão antes de ser publicado.',
      );

    const updated = await (this.prisma as any).evaluationCycle.update({
      where: { id },
      data: { status: CycleStatus.PUBLISHED },
    });

    if (dto.sendInvitesNow) {
      await this.sendCycleInvites(id, actorId);
    }

    await this.audit.log({
      entity: 'EvaluationCycle',
      entityId: id,
      action: 'PUBLISH',
      userId: actorId,
      details: { sendInvitesNow: dto.sendInvitesNow },
    });
    this.events.emit('cycle.published', { cycleId: id });
    return updated;
  }

  async listCycles(tenantId: string, query: PaginationDto) {
    const where: any = { tenantId };
    if (query.search) where.name = { contains: query.search };
    const [data, total] = await Promise.all([
      (this.prisma as any).evaluationCycle.findMany({
        where,
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { participants: true, evaluatorAssignments: true, responses: true } },
        },
      }),
      (this.prisma as any).evaluationCycle.count({ where }),
    ]);
    return { data, total };
  }

  async getCycleDetail(id: string) {
    const cycle = await (this.prisma as any).evaluationCycle.findUnique({
      where: { id },
      include: {
        competencies: {
          include: { competency: { include: { indicators: true } } },
          orderBy: { order: 'asc' },
        },
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { participants: true, evaluatorAssignments: true, responses: true } },
      },
    });
    if (!cycle) throw new NotFoundException('Ciclo não encontrado.');
    return cycle;
  }

  // ============================================================
  // QUESTÕES
  // ============================================================

  async createQuestion(dto: CreateQuestionDto, actorId: string) {
    const question = await (this.prisma as any).evaluationQuestion.create({ data: dto });
    await this.audit.log({
      entity: 'EvaluationQuestion',
      entityId: question.id,
      action: 'CREATE',
      userId: actorId,
      details: { text: dto.text },
    });
    return question;
  }

  async listQuestions(cycleId?: string, competencyId?: string) {
    const where: any = {};
    if (cycleId) where.cycleId = cycleId;
    if (competencyId) where.competencyId = competencyId;
    return (this.prisma as any).evaluationQuestion.findMany({ where, orderBy: { order: 'asc' } });
  }

  // ============================================================
  // PARTICIPANTES
  // ============================================================

  async addParticipants(cycleId: string, dto: AddParticipantsDto, actorId: string) {
    await this.findCycleOrFail(cycleId);
    const results = { added: 0, skipped: 0 };

    for (const userId of dto.userIds) {
      try {
        await (this.prisma as any).cycleParticipant.create({
          data: { cycleId, userId, status: 'PENDING' },
        });
        results.added++;
      } catch {
        results.skipped++; // já existia
      }
    }
    await this.audit.log({
      entity: 'CycleParticipant',
      entityId: cycleId,
      action: 'CREATE',
      userId: actorId,
      details: results,
    });
    return results;
  }

  async giveConsent(cycleId: string, userId: string, dto: ConsentDto) {
    const participant = await (this.prisma as any).cycleParticipant.findUnique({
      where: { cycleId_userId: { cycleId, userId } },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado.');
    return (this.prisma as any).cycleParticipant.update({
      where: { cycleId_userId: { cycleId, userId } },
      data: { consentGiven: dto.consent, consentAt: dto.consent ? new Date() : null },
    });
  }

  async getParticipantProgress(cycleId: string, userId: string) {
    const assignments = await (this.prisma as any).evaluatorAssignment.findMany({
      where: { cycleId, evaluateeId: userId },
    });
    const totalAssigned = assignments.length;
    const completed = assignments.filter(a => a.status === 'COMPLETED').length;
    const pending = assignments.filter(
      a => a.status === 'PENDING' || a.status === 'INVITED',
    ).length;

    return {
      totalAssigned,
      completed,
      pending,
      completionPercent: totalAssigned ? Math.round((completed / totalAssigned) * 100) : 0,
    };
  }

  // ============================================================
  // MOTOR DE AVALIADORES
  // ============================================================

  async suggestEvaluators(cycleId: string, dto: SuggestEvaluatorsDto) {
    await this.findCycleOrFail(cycleId);
    const evaluatee = await (this.prisma as any).user.findUnique({
      where: { id: dto.evaluateeId },
    });
    if (!evaluatee) throw new NotFoundException('Avaliado não encontrado.');

    const suggestions: { userId: any; role: EvaluatorRole; reason: string }[] = [];
    const maxPerRole = dto.maxPerRole ?? 5;

    // 1. Autoavaliação
    suggestions.push({
      userId: dto.evaluateeId,
      role: EvaluatorRole.SELF,
      reason: 'Autoavaliação obrigatória',
    });

    // 2. Gestor direto
    if (evaluatee.managerId) {
      suggestions.push({
        userId: evaluatee.managerId,
        role: EvaluatorRole.MANAGER,
        reason: 'Gestor directo',
      });
    }

    // 3. Pares (mesmo departamento, não subordinados)
    if (evaluatee.departmentId) {
      const peers = await (this.prisma as any).user.findMany({
        where: {
          departmentId: evaluatee.departmentId,
          id: { not: dto.evaluateeId },
          managerId: evaluatee.managerId ?? undefined,
        },
        take: maxPerRole,
      });
      peers.forEach(p =>
        suggestions.push({
          userId: p.id,
          role: EvaluatorRole.PEER,
          reason: 'Par do mesmo departamento',
        }),
      );
    }

    // 4. Subordinados diretos
    const subordinates = await (this.prisma as any).user.findMany({
      where: { managerId: dto.evaluateeId },
      take: maxPerRole,
    });
    subordinates.forEach(s =>
      suggestions.push({
        userId: s.id,
        role: EvaluatorRole.SUBORDINATE,
        reason: 'Subordinado directo',
      }),
    );

    return suggestions;
  }

  async assignEvaluators(cycleId: string, dto: BulkAssignEvaluatorsDto, actorId: string) {
    await this.findCycleOrFail(cycleId);
    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const assign of dto.assignments) {
      // Prevenir auto-avaliação incorreta
      if (assign.evaluatorId === assign.evaluateeId && assign.role !== EvaluatorRole.SELF) {
        results.errors.push(
          `Avaliador ${assign.evaluatorId} não pode ser o mesmo que o avaliado em role ${assign.role}`,
        );
        continue;
      }
      try {
        await (this.prisma as any).evaluatorAssignment.create({
          data: {
            cycleId,
            evaluateeId: assign.evaluateeId,
            evaluatorId: assign.evaluatorId,
            role: assign.role,
            status: 'PENDING',
            suggestedBy: actorId,
          },
        });
        results.created++;
      } catch {
        results.skipped++;
      }
    }

    await this.audit.log({
      entity: 'EvaluatorAssignment',
      entityId: cycleId,
      action: 'CREATE',
      userId: actorId,
      details: { created: results.created },
    });
    return results;
  }

  async approveEvaluators(cycleId: string, dto: ApproveEvaluatorsDto, actorId: string) {
    const updated = await (this.prisma as any).evaluatorAssignment.updateMany({
      where: { id: { in: dto.assignmentIds }, cycleId },
      data: {
        status: 'INVITED',
        approvedBy: actorId,
        approvedAt: new Date(),
        invitedAt: new Date(),
      },
    });
    // Disparar notificações de convite
    for (const id of dto.assignmentIds) {
      const assign = await (this.prisma as any).evaluatorAssignment.findUnique({ where: { id } });
      if (assign) this.events.emit('evaluation.invitation.send', { assignment: assign });
    }
    return { approved: updated.count };
  }

  // ============================================================
  // ENVIO DE CONVITES
  // ============================================================

  async sendCycleInvites(cycleId: string, actorId: string) {
    const pending = await (this.prisma as any).evaluatorAssignment.findMany({
      where: { cycleId, status: 'PENDING' },
    });
    for (const assign of pending) {
      await (this.prisma as any).evaluatorAssignment.update({
        where: { id: assign.id },
        data: { status: 'INVITED', invitedAt: new Date() },
      });
      this.events.emit('evaluation.invitation.send', { assignment: assign });
    }
    return { sent: pending.length };
  }

  async sendReminders(cycleId: string, dto: SendRemindersDto, actorId: string) {
    const where: any = { cycleId, status: { in: ['INVITED', 'IN_PROGRESS'] } };
    if (dto.assignmentIds?.length) where.id = { in: dto.assignmentIds };

    const pending = await (this.prisma as any).evaluatorAssignment.findMany({ where });
    for (const assign of pending) {
      await (this.prisma as any).evaluatorAssignment.update({
        where: { id: assign.id },
        data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() },
      });
      this.events.emit('evaluation.reminder.send', {
        assignment: assign,
        channels: dto.channels ?? ['EMAIL'],
      });
    }
    await this.audit.log({
      entity: 'EvaluationCycle',
      entityId: cycleId,
      action: 'REMIND',
      userId: actorId,
      details: { sent: pending.length },
    });
    return { reminded: pending.length };
  }

  // ============================================================
  // RESPOSTA A AVALIAÇÕES
  // ============================================================

  async getEvaluationForm(cycleId: string, evaluatorId: string, evaluateeId: string) {
    const assignment = await (this.prisma as any).evaluatorAssignment.findFirst({
      where: { cycleId, evaluatorId, evaluateeId },
    });
    if (!assignment) throw new NotFoundException('Atribuição de avaliação não encontrada.');
    if (assignment.status === 'EXPIRED')
      throw new BadRequestException('Prazo de avaliação expirado.');
    if (assignment.status === 'COMPLETED') throw new BadRequestException('Avaliação já submetida.');

    const cycle = await (this.prisma as any).evaluationCycle.findUnique({
      where: { id: cycleId },
      include: { competencies: { include: { competency: { include: { indicators: true } } } } },
    });

    const questions = await (this.prisma as any).evaluationQuestion.findMany({
      where: {
        cycleId,
        OR: [{ applicableTo: { isEmpty: true } }, { applicableTo: { has: assignment.role } }],
      },
      orderBy: { order: 'asc' },
    });

    // Verificar se há rascunho existente
    const existingResponse = await (this.prisma as any).evaluationResponse.findFirst({
      where: { cycleId, evaluatorId, evaluateeId, status: 'DRAFT' },
      include: { answers: true },
    });

    return { assignment, cycle, questions, existingResponse };
  }

  async submitResponse(
    cycleId: string,
    evaluatorId: string,
    evaluateeId: string,
    dto: SubmitResponseDto,
    actorId: string,
  ) {
    const assignment = await (this.prisma as any).evaluatorAssignment.findFirst({
      where: { cycleId, evaluatorId, evaluateeId },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada.');
    if (assignment.status === 'COMPLETED')
      throw new BadRequestException('Avaliação já submetida. Edição não permitida.');

    const cycle = await this.findCycleOrFail(cycleId);
    const now = new Date();
    const deadline = new Date(cycle.endDate);
    deadline.setDate(deadline.getDate() + (cycle.gracePeriodDays ?? 0));
    if (now > deadline) throw new BadRequestException('Prazo de avaliação encerrado.');

    // Validar questões obrigatórias
    const requiredQs = await (this.prisma as any).evaluationQuestion.findMany({
      where: { cycleId, isRequired: true },
    });
    for (const q of requiredQs) {
      const answered = dto.answers.find(a => a.questionId === q.id);
      if (
        !answered ||
        (answered.numericValue === undefined && !answered.textValue && !answered.choiceValue)
      ) {
        throw new BadRequestException(`Questão obrigatória sem resposta: "${q.text}"`);
      }
    }

    // Upsert response
    const response = await (this.prisma as any).evaluationResponse.upsert({
      where: { assignmentId: assignment.id },
      create: {
        cycleId,
        assignmentId: assignment.id,
        evaluateeId,
        evaluatorId,
        evaluatorRole: assignment.role,
        status: dto.submit ? 'SUBMITTED' : 'DRAFT',
        startedAt: new Date(),
        submittedAt: dto.submit ? new Date() : null,
        isAnonymized: cycle.anonymityMode === AnonymityMode.ANONYMOUS,
      },
      update: {
        status: dto.submit ? 'SUBMITTED' : 'DRAFT',
        submittedAt: dto.submit ? new Date() : null,
      },
    });

    // Upsert answers
    for (const answer of dto.answers) {
      await (this.prisma as any).evaluationAnswer.upsert({
        where: {
          responseId_questionId: { responseId: response.id, questionId: answer.questionId },
        },
        create: {
          responseId: response.id,
          questionId: answer.questionId,
          numericValue: answer.numericValue,
          textValue: answer.textValue,
          choiceValue: answer.choiceValue,
        },
        update: {
          numericValue: answer.numericValue,
          textValue: answer.textValue,
          choiceValue: answer.choiceValue,
        },
      });
    }

    if (dto.submit) {
      await (this.prisma as any).evaluatorAssignment.update({
        where: { id: assignment.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await (this.prisma as any).cycleParticipant.updateMany({
        where: { cycleId, userId: evaluateeId },
        data: { status: 'IN_PROGRESS' },
      });
      // Análise de sentimento assíncrona
      this.events.emit('response.submitted', { responseId: response.id, cycleId });
    }

    await this.audit.log({
      entity: 'EvaluationResponse',
      entityId: response.id,
      action: dto.submit ? 'SUBMIT' : 'SAVE_DRAFT',
      userId: actorId,
      details: { evaluateeId },
    });
    return response;
  }

  // ============================================================
  // CÁLCULO DE RESULTADOS
  // ============================================================

  async calculateCycleResults(cycleId: string, actorId: string) {
    const cycle = await (this.prisma as any).evaluationCycle.findUnique({
      where: { id: cycleId },
      include: { competencies: { include: { competency: true } } },
    });
    if (!cycle) throw new NotFoundException('Ciclo não encontrado.');

    await (this.prisma as any).evaluationCycle.update({
      where: { id: cycleId },
      data: { status: 'PROCESSING' },
    });

    const participants = await (this.prisma as any).cycleParticipant.findMany({
      where: { cycleId },
    });

    for (const participant of participants) {
      await this.calculateParticipantResult(cycle, participant.userId);
    }

    await (this.prisma as any).evaluationCycle.update({
      where: { id: cycleId },
      data: { status: 'COMPLETED' },
    });
    await this.audit.log({
      entity: 'EvaluationCycle',
      entityId: cycleId,
      action: 'CALCULATE_RESULTS',
      userId: actorId,
      details: { participants: participants.length },
    });
    this.events.emit('cycle.results.ready', { cycleId });
    return { processed: participants.length };
  }

  private async calculateParticipantResult(cycle: any, participantId: string) {
    const responses = await (this.prisma as any).evaluationResponse.findMany({
      where: { cycleId: cycle.id, evaluateeId: participantId, status: 'SUBMITTED' },
      include: { answers: { include: { question: { include: { competency: true } } } } },
    });

    // Verificar quorum mínimo por grupo
    const byRole: Record<string, any[]> = {};
    for (const r of responses) {
      const role = r.evaluatorRole;
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(r);
    }

    const peerResponses = byRole['PEER'] ?? [];
    if (
      peerResponses.length < cycle.quorumMinimum &&
      peerResponses.length > 0 &&
      peerResponses.length < cycle.quorumMinimum
    ) {
      this.logger.warn(
        `[360] Participante ${participantId}: pares abaixo do quorum (${peerResponses.length}/${cycle.quorumMinimum}) — dados de pares ocultados.`,
      );
    }

    // Score por tipo de avaliador (média das respostas numéricas)
    const getAvgScore = (rs: any[]): number | null => {
      const nums = rs.flatMap(r =>
        r.answers
          .filter((a: any) => a.numericValue !== null)
          .map((a: any) => a.numericValue as number),
      );
      return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
    };

    const selfScore = getAvgScore(byRole['SELF'] ?? []);
    const managerScore = getAvgScore(byRole['MANAGER'] ?? []);
    const peerScore =
      peerResponses.length >= cycle.quorumMinimum ? getAvgScore(peerResponses) : null;
    const subScore = getAvgScore(byRole['SUBORDINATE'] ?? []);
    const extScore = getAvgScore(byRole['EXTERNAL'] ?? []);

    // Score ponderado
    const totalWeight =
      cycle.weightSelf +
      cycle.weightManager +
      cycle.weightPeer +
      cycle.weightSubordinate +
      cycle.weightExternal;
    let weightedSum = 0;
    let appliedWeight = 0;
    if (selfScore !== null) {
      weightedSum += selfScore * cycle.weightSelf;
      appliedWeight += cycle.weightSelf;
    }
    if (managerScore !== null) {
      weightedSum += managerScore * cycle.weightManager;
      appliedWeight += cycle.weightManager;
    }
    if (peerScore !== null) {
      weightedSum += peerScore * cycle.weightPeer;
      appliedWeight += cycle.weightPeer;
    }
    if (subScore !== null) {
      weightedSum += subScore * cycle.weightSubordinate;
      appliedWeight += cycle.weightSubordinate;
    }
    if (extScore !== null) {
      weightedSum += extScore * cycle.weightExternal;
      appliedWeight += cycle.weightExternal;
    }
    const weightedScore = appliedWeight > 0 ? weightedSum / appliedWeight : 0;
    const overallScore = getAvgScore(responses) ?? 0;

    // Score por competência
    const scoresByCompetency: Record<string, any> = {};
    const allCompetencies = cycle.competencies.map((c: any) => c.competency);

    for (const comp of allCompetencies) {
      const compAnswers = responses.flatMap(r =>
        r.answers
          .filter((a: any) => a.question?.competencyId === comp.id && a.numericValue !== null)
          .map((a: any) => ({ role: r.evaluatorRole, value: a.numericValue as number })),
      );
      const allVals = compAnswers.map(a => a.value);
      const selfVals = compAnswers.filter(a => a.role === 'SELF').map(a => a.value);
      const otherVals = compAnswers.filter(a => a.role !== 'SELF').map(a => a.value);

      const avg = (arr: number[]) =>
        arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      const score = avg(allVals);
      const selfCompScore = avg(selfVals);
      const othersCompScore = avg(otherVals);
      const gap =
        selfCompScore !== null && othersCompScore !== null ? selfCompScore - othersCompScore : null;

      scoresByCompetency[comp.id] = {
        name: comp.name,
        score,
        selfScore: selfCompScore,
        othersScore: othersCompScore,
        gap,
      };
    }

    // Identificar gaps e forças
    const entries = Object.entries(scoresByCompetency).filter(([, v]: any) => v.score !== null);
    const sorted = entries.sort((a: any, b: any) => (a[1].score ?? 0) - (b[1].score ?? 0));
    const gaps = sorted.slice(0, 3).map(([id, v]: any) => ({
      competencyId: id,
      name: v.name,
      score: v.score,
      gap: v.gap,
      priority: 'HIGH',
    }));
    const strengths = sorted
      .slice(-3)
      .reverse()
      .map(([id, v]: any) => ({ competencyId: id, name: v.name, score: v.score }));

    // Elegibilidade
    const isEligiblePromotion = cycle.cutoffPromotion
      ? weightedScore >= cycle.cutoffPromotion
      : false;
    const isEligibleBonus = cycle.cutoffBonus ? weightedScore >= cycle.cutoffBonus : false;
    const bonusMultiplier = this.calculateBonusMultiplier(weightedScore, cycle);

    // Upsert resultado
    const result = await (this.prisma as any).evaluationResult.upsert({
      where: { cycleId_participantId: { cycleId: cycle.id, participantId } },
      create: {
        cycleId: cycle.id,
        participantId,
        overallScore,
        weightedScore,
        selfScore: selfScore ?? undefined,
        managerScore: managerScore ?? undefined,
        peerScore: peerScore ?? undefined,
        subordinateScore: subScore ?? undefined,
        externalScore: extScore ?? undefined,
        scoresByCompetency: JSON.stringify(scoresByCompetency),
        gaps: JSON.stringify(gaps),
        strengths: JSON.stringify(strengths),
        isEligiblePromotion,
        isEligibleBonus,
        bonusMultiplier,
      },
      update: {
        overallScore,
        weightedScore,
        selfScore: selfScore ?? undefined,
        managerScore: managerScore ?? undefined,
        peerScore: peerScore ?? undefined,
        subordinateScore: subScore ?? undefined,
        externalScore: extScore ?? undefined,
        scoresByCompetency: JSON.stringify(scoresByCompetency),
        gaps: JSON.stringify(gaps),
        strengths: JSON.stringify(strengths),
        isEligiblePromotion,
        isEligibleBonus,
        bonusMultiplier,
        calculatedAt: new Date(),
      },
    });

    // Atualizar participante
    await (this.prisma as any).cycleParticipant.updateMany({
      where: { cycleId: cycle.id, userId: participantId },
      data: {
        status: 'COMPLETED',
        finalScore: weightedScore,
        completedAt: new Date(),
        isEligiblePromotion,
        isEligibleBonus,
        scoreByEvaluatorType: JSON.stringify({
          SELF: selfScore,
          MANAGER: managerScore,
          PEER: peerScore,
          SUBORDINATE: subScore,
        }),
      },
    });

    // Criar PDI automaticamente se configurado
    if (cycle.linkedToPdi && gaps.length > 0) {
      await this.generateAutomaticPdi(participantId, cycle.id, gaps, result.id);
    }

    return result;
  }

  private calculateBonusMultiplier(score: number, cycle: any): number | null {
    if (!cycle.linkedToBonus || !cycle.cutoffBonus) return null;
    if (score < cycle.cutoffBonus) return 0;
    const normalized = (score - cycle.cutoffBonus) / (cycle.scaleMax ?? 5 - cycle.cutoffBonus);
    return Math.min(1 + normalized * 0.5, 1.5); // máx 1.5x
  }

  private async generateAutomaticPdi(
    userId: string,
    cycleId: string,
    gaps: any[],
    resultId: string,
  ) {
    try {
      const actions = gaps.map((gap: any) => ({
        title: `Desenvolvimento em ${gap.name}`,
        description: `Gap identificado: ${gap.gap?.toFixed(1) ?? 'N/A'}. Competência com score ${gap.score?.toFixed(1) ?? 'N/A'}.`,
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 dias
        status: 'PENDING',
        priority: gap.priority,
      }));

      // Criar PDI via evento (o módulo PDI escuta e processa)
      this.events.emit('pdi.auto.create', {
        userId,
        cycleId,
        gaps,
        actions,
        sourceResultId: resultId,
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao criar PDI automático: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ============================================================
  // ANALYTICS
  // ============================================================

  async getParticipantResult(
    cycleId: string,
    participantId: string,
    requesterId: string,
    requesterRole: string,
  ) {
    const result = await (this.prisma as any).evaluationResult.findUnique({
      where: { cycleId_participantId: { cycleId, participantId } },
    });
    if (!result) throw new NotFoundException('Resultado não encontrado.');

    const cycle = await this.findCycleOrFail(cycleId);
    const canSeeFull = requesterRole === 'ADMIN' || requesterRole === 'RH';
    const isOwnResult = requesterId === participantId;

    if (!canSeeFull && !isOwnResult)
      throw new ForbiddenException('Sem permissão para ver este resultado.');

    return {
      ...result,
      scoresByCompetency: JSON.parse(result.scoresByCompetency),
      gaps: result.gaps ? JSON.parse(result.gaps) : [],
      strengths: result.strengths ? JSON.parse(result.strengths) : [],
      // Colaborador vê dados agregados, não individuais por avaliador
      rawByEvaluator: canSeeFull ? result : null,
    };
  }

  async getTeamAnalytics(cycleId: string, managerId: string) {
    const managedUsers = await (this.prisma as any).user.findMany({
      where: { managerId },
      select: { id: true, fullName: true },
    });
    const userIds = managedUsers.map(u => u.id);

    const results = await (this.prisma as any).evaluationResult.findMany({
      where: { cycleId, participantId: { in: userIds } },
    });

    return results.map(r => ({
      participantId: r.participantId,
      participantName:
        managedUsers.find(u => u.id === r.participantId)?.fullName ?? r.participantId,
      weightedScore: r.weightedScore,
      overallScore: r.overallScore,
      isEligiblePromotion: r.isEligiblePromotion,
      isEligibleBonus: r.isEligibleBonus,
      gaps: r.gaps ? JSON.parse(r.gaps) : [],
      strengths: r.strengths ? JSON.parse(r.strengths) : [],
    }));
  }

  async getOrganizationalAnalytics(query: AnalyticsQueryDto) {
    const where: any = {};
    if (query.cycleId) where.cycleId = query.cycleId;

    const results = await (this.prisma as any).evaluationResult.findMany({
      where,
      select: {
        overallScore: true,
        weightedScore: true,
        scoresByCompetency: true,
        isEligiblePromotion: true,
      },
    });

    const avgOverall = results.length
      ? results.reduce((s, r) => s + r.overallScore, 0) / results.length
      : 0;
    const avgWeighted = results.length
      ? results.reduce((s, r) => s + r.weightedScore, 0) / results.length
      : 0;
    const eligiblePromotion = results.filter(r => r.isEligiblePromotion).length;

    // Média por competência (cross-participants)
    const compScores: Record<string, number[]> = {};
    for (const r of results) {
      const sc = JSON.parse(r.scoresByCompetency);
      for (const [cId, data] of Object.entries(sc) as any) {
        if (!compScores[cId]) compScores[cId] = [];
        if (data.score !== null) compScores[cId].push(data.score);
      }
    }
    const compAverages = Object.entries(compScores).map(([compId, scores]) => ({
      competencyId: compId,
      average: scores.reduce((s, v) => s + v, 0) / scores.length,
    }));

    return {
      totalParticipants: results.length,
      avgOverall,
      avgWeighted,
      eligiblePromotion,
      competencyAverages: compAverages,
    };
  }

  async getNineBox(query: NineBoxQueryDto) {
    const results = await (this.prisma as any).evaluationResult.findMany({
      where: { cycleId: query.cycleId },
      select: { participantId: true, weightedScore: true },
    });

    // Nine-Box: X = Performance (weightedScore), Y = Potencial (a integrar com OKRs)
    // Por agora: usar selfScore como proxy de potencial (auto-percepção)
    const withSelf = await (this.prisma as any).evaluationResult.findMany({
      where: { cycleId: query.cycleId },
      select: { participantId: true, weightedScore: true, selfScore: true },
    });

    const max = Math.max(...withSelf.map(r => r.weightedScore ?? 0), 5);
    const boxes = withSelf.map(r => {
      const perf = r.weightedScore / max;
      const potential = (r.selfScore ?? r.weightedScore) / max;
      const perfBox = perf >= 0.67 ? 'HIGH' : perf >= 0.33 ? 'MID' : 'LOW';
      const potBox = potential >= 0.67 ? 'HIGH' : potential >= 0.33 ? 'MID' : 'LOW';
      return {
        participantId: r.participantId,
        performance: perfBox,
        potential: potBox,
        box: `${perfBox}_${potBox}`,
      };
    });

    return boxes;
  }

  // ============================================================
  // FEEDBACK CONTÍNUO
  // ============================================================

  async createContinuousFeedback(dto: CreateContinuousFeedbackDto, actorId: string) {
    const feedback = await (this.prisma as any).continuousFeedback.create({
      data: { ...dto, fromUserId: actorId },
    });
    this.events.emit('feedback.continuous.created', { feedback });
    return feedback;
  }

  async listFeedbackForUser(userId: string, query: PaginationDto) {
    const [data, total] = await Promise.all([
      (this.prisma as any).continuousFeedback.findMany({
        where: { toUserId: userId, isPrivate: false },
        orderBy: { createdAt: 'desc' },
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
      }),
      (this.prisma as any).continuousFeedback.count({
        where: { toUserId: userId, isPrivate: false },
      }),
    ]);
    return { data, total };
  }

  // ============================================================
  // PULSE SURVEYS
  // ============================================================

  async createPulseSurvey(dto: CreatePulseSurveyDto, actorId: string) {
    return (this.prisma as any).pulseSurvey.create({
      data: { ...dto, closesAt: new Date(dto.closesAt), createdBy: actorId, sentAt: new Date() },
    });
  }

  async submitPulseSurveyResponse(surveyId: string, userId: string, dto: SubmitPulseSurveyDto) {
    return (this.prisma as any).pulseSurveyResponse.upsert({
      where: { surveyId_userId: { surveyId, userId } },
      create: { surveyId, userId, answersJson: dto.answersJson },
      update: { answersJson: dto.answersJson },
    });
  }

  // ============================================================
  // CALIBRAÇÃO (RH)
  // ============================================================

  async calibrateScore(cycleId: string, dto: CalibrateScoreDto, actorId: string) {
    const result = await (this.prisma as any).evaluationResult.findFirst({
      where: { cycleId, participantId: dto.participantId },
    });
    if (!result) throw new NotFoundException('Resultado não encontrado.');

    await (this.prisma as any).evaluationResult.update({
      where: { id: result.id },
      data: { weightedScore: dto.calibratedScore },
    });
    await this.audit.log({
      entity: 'EvaluationResult',
      entityId: result.id,
      action: 'CALIBRATE',
      userId: actorId,
      details: {
        original: result.weightedScore,
        calibrated: dto.calibratedScore,
        justification: dto.justification,
      },
    });
    return { message: 'Score calibrado com sucesso.', newScore: dto.calibratedScore };
  }

  // ============================================================
  // RELATÓRIOS
  // ============================================================

  async generateReport(dto: GenerateReportDto, requesterId: string) {
    const cycle = await this.findCycleOrFail(dto.cycleId);
    if (dto.scope === 'INDIVIDUAL' && dto.participantId) {
      const result = await (this.prisma as any).evaluationResult.findUnique({
        where: {
          cycleId_participantId: { cycleId: dto.cycleId, participantId: dto.participantId },
        },
      });
      if (!result) throw new NotFoundException('Resultado não encontrado.');
      return {
        scope: 'INDIVIDUAL',
        cycleName: cycle.name,
        result: {
          ...result,
          scoresByCompetency: JSON.parse(result.scoresByCompetency),
          gaps: result.gaps ? JSON.parse(result.gaps) : [],
          strengths: result.strengths ? JSON.parse(result.strengths) : [],
        },
        aiInsights: dto.includeAiInsights ? await this.generateAiInsights(result) : null,
      };
    }
    return this.getOrganizationalAnalytics({ cycleId: dto.cycleId });
  }

  private async generateAiInsights(result: any): Promise<string> {
    // Em produção: integrar com Anthropic API ou OpenAI para análise de texto
    const gaps = result.gaps ? JSON.parse(result.gaps) : [];
    const strengths = result.strengths ? JSON.parse(result.strengths) : [];
    return `Pontos fortes identificados: ${strengths.map((s: any) => s.name).join(', ')}. Áreas prioritárias para desenvolvimento: ${gaps.map((g: any) => g.name).join(', ')}.`;
  }

  // ============================================================
  // CRON: Verificar ciclos expirados e enviar lembretes
  // ============================================================

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async processDailyReminders() {
    const activeCycles = await (this.prisma as any).evaluationCycle.findMany({
      where: { status: { in: ['PUBLISHED', 'IN_PROGRESS'] } },
    });
    for (const cycle of activeCycles) {
      const daysToEnd = Math.ceil(
        (new Date(cycle.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if ([7, 3, 1].includes(daysToEnd)) {
        await this.sendReminders(cycle.id, {}, 'SYSTEM');
      }
      // Expirar assignments após prazo
      if (daysToEnd < 0 - (cycle.gracePeriodDays ?? 0)) {
        await (this.prisma as any).evaluatorAssignment.updateMany({
          where: { cycleId: cycle.id, status: { in: ['PENDING', 'INVITED', 'IN_PROGRESS'] } },
          data: { status: 'EXPIRED' },
        });
      }
    }
  }

  // ============================================================
  // UTILS
  // ============================================================

  private async findCycleOrFail(id: string) {
    const cycle = await (this.prisma as any).evaluationCycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException('Ciclo de avaliação não encontrado.');
    return cycle;
  }

  private validateWeights(dto: any) {
    const total =
      (dto.weightSelf ?? 0) +
      (dto.weightManager ?? 0) +
      (dto.weightPeer ?? 0) +
      (dto.weightSubordinate ?? 0) +
      (dto.weightExternal ?? 0);
    if (total !== 100)
      throw new BadRequestException(`A soma dos pesos deve ser 100. Actual: ${total}.`);
  }

  private validateDates(start: string, end: string) {
    if (new Date(start) >= new Date(end))
      throw new BadRequestException('Data de início deve ser anterior à data de fim.');
  }
}

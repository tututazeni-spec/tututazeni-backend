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
import { Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/services/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrentUserData } from '../common/decorators';
import { isPrivileged } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CompetenciesService } from '../competencies/competencies.service';
import { CreateCompetencyDto, UpdateCompetencyDto } from '../competencies/competencies.dto';
import {
  Evaluation360CreateCompetencyDto,
  Evaluation360UpdateCompetencyDto,
  CreateEvaluationCycleDto,
  UpdateEvaluationCycleDto,
  PublishCycleDto,
  Evaluation360CreateQuestionDto,
  AddParticipantsDto,
  AddParticipantsByDepartmentDto,
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
  Evaluation360CalibrateScoreDto,
  SendRemindersDto,
  Evaluation360PaginationDto,
  EvaluatorRole,
  Eval360CycleStatus,
  AnonymityMode,
} from './evaluation360.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

type CalcCycle = Prisma.Eval360CycleGetPayload<{
  include: { competencies: { include: { competency: true } } };
}>;

type ResponseWithAnswers = Prisma.EvaluationResponseGetPayload<{
  include: { answers: { include: { question: { include: { competency: true } } } } };
}>;

interface CompetencyScoreEntry {
  name: string;
  category: string;
  type: string;
  score: number | null;
  selfScore: number | null;
  othersScore: number | null;
  managerScore: number | null;
  peerScore: number | null;
  gap: number | null;
  // Média de todas as respostas submetidas no ciclo para esta competência
  // (todos os participantes) — referência comparativa real, não um
  // "benchmark de cargo" fabricado (o schema não tem dados de mercado).
  benchmark: number | null;
}

export interface CompetencyGapEntry {
  competencyId: string;
  name: string;
  score: number | null;
  gap: number | null;
  priority: string;
}

interface CompetencyStrengthEntry {
  competencyId: string;
  name: string;
  score: number | null;
}

// Doutrina fixa de avaliação 360º da INNOVA: os 8 critérios pedidos, cada um
// com uma pergunta-padrão (escala 1-5, Nunca..Sempre) usada quando um ciclo é
// criado sem lista explícita de competências — ver prisma/seed.ts, que
// semeia estas mesmas 8 competências (por nome) + os seus indicadores.
const STANDARD_EVAL360_COMPETENCY_NAMES = [
  'Liderança',
  'Comunicação',
  'Foco em Resultados',
  'Trabalho em Equipa',
  'Pensamento Estratégico',
  'Resiliência',
  'Inovação',
  'Bem-estar e Disciplina',
] as const;

const STANDARD_EVAL360_QUESTIONS: Record<string, string> = {
  'Liderança':
    'Com que frequência este colaborador inspira a equipa, dá feedback, toma decisões e desenvolve pessoas?',
  'Comunicação':
    'Com que frequência este colaborador comunica de forma clara, escuta activamente e adapta a comunicação ao público?',
  'Foco em Resultados':
    'Com que frequência este colaborador cumpre objectivos, assume responsabilidade e procura melhoria contínua?',
  'Trabalho em Equipa':
    'Com que frequência este colaborador colabora com os colegas, partilha informação e resolve conflitos?',
  'Pensamento Estratégico':
    'Com que frequência este colaborador demonstra visão a médio/longo prazo, capacidade de antecipação e alinhamento com os objectivos da organização?',
  'Resiliência':
    'Com que frequência este colaborador gere a pressão, se adapta a mudanças e mantém o foco?',
  'Inovação':
    'Com que frequência este colaborador gera novas ideias, está aberto a novas abordagens e procura melhoria contínua?',
  'Bem-estar e Disciplina':
    'Com que frequência este colaborador gere o stress, mantém equilíbrio emocional, contribui para um ambiente positivo, cumpre prazos, é pontual e cumpre normas e procedimentos?',
};

@Injectable()
export class Evaluation360Service {
  private readonly logger = new Logger(Evaluation360Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly competencies: CompetenciesService,
  ) {}

  // ============================================================
  // BANCO DE COMPETÊNCIAS
  // ============================================================

  // O modelo `Competency` tem um único dono de escrita — `CompetenciesService`
  // (Fase G1). Estes métodos delegam e mantêm apenas a auditoria específica de
  // Avaliação 360º e a conversão de `id` string→number das rotas deste módulo.

  async createCompetency(dto: Evaluation360CreateCompetencyDto, actorId: string) {
    const competency = await this.competencies.create({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      type: dto.type,
      scaleMin: dto.scaleMin,
      scaleMax: dto.scaleMax,
      isGlobal: dto.isGlobal,
      tenantId: dto.tenantId,
      indicators: dto.indicators,
    } as CreateCompetencyDto);
    await this.audit.log({
      entity: 'Competency',
      entityId: competency.id,
      action: 'CREATE',
      userId: actorId,
      details: { name: dto.name, type: dto.type },
    });
    return competency;
  }

  async updateCompetency(id: string, dto: Evaluation360UpdateCompetencyDto, actorId: string) {
    const updated = await this.competencies.update(+id, dto as unknown as UpdateCompetencyDto);
    await this.audit.log({
      entity: 'Competency',
      entityId: id,
      action: 'UPDATE',
      userId: actorId,
      details: dto,
    });
    return updated;
  }

  async listCompetencies(tenantId?: string, query?: Evaluation360PaginationDto) {
    return this.competencies.listCatalogue({
      tenantId,
      search: query?.search,
      offset: query?.offset,
      limit: query?.limit,
    });
  }

  // ============================================================
  // CICLOS DE AVALIAÇÃO
  // ============================================================

  async createCycle(dto: CreateEvaluationCycleDto, actorId: string) {
    this.validateWeights(dto);
    this.validateDates(dto.startDate, dto.endDate);

    const cycle = await this.prisma.eval360Cycle.create({
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
        // Pesos por omissão: 10% autoavaliação, 30% gestor directo, 20%
        // pares (mesma função), 40% equipa/subordinados.
        weightSelf: dto.weightSelf ?? 10,
        weightManager: dto.weightManager ?? 30,
        weightPeer: dto.weightPeer ?? 20,
        weightSubordinate: dto.weightSubordinate ?? 40,
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
                competencyId: +c.competencyId,
                weight: c.weight ?? 1,
                isRequired: c.isRequired ?? true,
                order: c.order ?? 0,
              })),
            }
          : undefined,
      },
      include: { competencies: { include: { competency: true } } },
    });

    // Sem competências explícitas: aplica-se sempre a doutrina fixa de
    // avaliação 360º da INNOVA (8 competências + 1 questão cada) em vez de
    // deixar o ciclo sem nada para publicar (publishCycle exige >=1 questão).
    let finalCycle = cycle;
    if (!dto.competencies?.length) {
      const attached = await this.attachStandardCompetencies(cycle.id);
      finalCycle = { ...cycle, competencies: attached };
    }

    await this.audit.log({
      entity: 'EvaluationCycle',
      entityId: cycle.id,
      action: 'CREATE',
      userId: actorId,
      details: { name: dto.name, model: dto.model },
    });
    return finalCycle;
  }

  // Anexa as 8 competências-padrão (semeadas em prisma/seed.ts, procuradas
  // por nome — se o seed ainda não correu, fica noop e o ciclo sai sem
  // competências, tal como antes desta alteração) e gera uma questão FREQUENCY
  // (escala 1-5, Nunca..Sempre) por competência.
  private async attachStandardCompetencies(cycleId: string) {
    const competencies = await this.prisma.competency.findMany({
      where: { name: { in: [...STANDARD_EVAL360_COMPETENCY_NAMES] } },
    });
    // Devolve no mesmo formato do `include: { competencies: { include: {
    // competency: true } } }` do create() do ciclo — evita um segundo
    // round-trip só para reler o ciclo com as competências acabadas de anexar.
    const created: (Prisma.Eval360CycleCompetencyGetPayload<{
      include: { competency: true };
    }>)[] = [];
    for (const [order, competency] of competencies.entries()) {
      const cycleCompetency = await this.prisma.eval360CycleCompetency.create({
        data: { cycleId, competencyId: competency.id, weight: 1, isRequired: true, order },
      });
      await this.prisma.eval360Question.create({
        data: {
          cycleId,
          competencyId: competency.id,
          text:
            STANDARD_EVAL360_QUESTIONS[competency.name] ??
            `Com que frequência este colaborador demonstra a competência "${competency.name}"?`,
          type: 'FREQUENCY',
          isRequired: true,
          order,
          scaleMin: 1,
          scaleMax: 5,
          scaleLabels: 'Nunca,Raramente,Às vezes,Frequentemente,Sempre',
          applicableTo: [],
        },
      });
      created.push({ ...cycleCompetency, competency });
    }
    return created;
  }

  async updateCycle(id: string, dto: UpdateEvaluationCycleDto, actorId: string) {
    const cycle = await this.findCycleOrFail(id);
    const lockedStatuses: Eval360CycleStatus[] = [
      Eval360CycleStatus.IN_PROGRESS,
      Eval360CycleStatus.COMPLETED,
    ];
    if (lockedStatuses.includes(cycle.status as Eval360CycleStatus)) {
      throw new BadRequestException('Ciclo em curso ou concluído não pode ser alterado.');
    }
    if (dto.weightSelf !== undefined || dto.weightManager !== undefined)
      this.validateWeights({ ...cycle, ...dto });
    // competencies é uma relação (create aninhado) — não é atribuível
    // directamente num update de campos escalares; updateCycle() nunca
    // implementou a substituição de competências do ciclo.
    const { competencies, ...data } = dto;
    const updated = await this.prisma.eval360Cycle.update({ where: { id }, data });
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
    if (cycle.status !== Eval360CycleStatus.DRAFT)
      throw new BadRequestException('Apenas ciclos em rascunho podem ser publicados.');

    const participantCount = await this.prisma.cycleParticipant.count({
      where: { cycleId: id },
    });
    if (participantCount === 0)
      throw new BadRequestException(
        'O ciclo precisa de pelo menos 1 participante antes de ser publicado.',
      );

    const questionCount = await this.prisma.eval360Question.count({
      where: { cycleId: id },
    });
    if (questionCount === 0)
      throw new BadRequestException(
        'O ciclo precisa de pelo menos 1 questão antes de ser publicado.',
      );

    const updated = await this.prisma.eval360Cycle.update({
      where: { id },
      data: { status: Eval360CycleStatus.PUBLISHED },
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

  async listCycles(tenantId: string, query: Evaluation360PaginationDto) {
    const where: Prisma.Eval360CycleWhereInput = { tenantId };
    if (query.search) where.name = { contains: query.search };
    const [data, total] = await Promise.all([
      this.prisma.eval360Cycle.findMany({
        where,
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { participants: true, assignments: true, responses: true } },
        },
      }),
      this.prisma.eval360Cycle.count({ where }),
    ]);
    // _count.participants é o total; o frontend também precisa de quantos já
    // concluíram para a barra de progresso (Visão Geral/separador Ciclos).
    const completedCounts = await Promise.all(
      data.map(c =>
        this.prisma.cycleParticipant.count({ where: { cycleId: c.id, status: 'COMPLETED' } }),
      ),
    );
    const withCompleted = data.map((c, i) => ({
      ...c,
      completedParticipants: completedCounts[i],
    }));
    return { data: withCompleted, total };
  }

  async getCycleDetail(id: string) {
    const cycle = await this.prisma.eval360Cycle.findUnique({
      where: { id },
      include: {
        competencies: {
          include: { competency: { include: { indicators: true } } },
          orderBy: { order: 'asc' },
        },
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { participants: true, assignments: true, responses: true } },
      },
    });
    if (!cycle) throw new NotFoundException('Ciclo não encontrado.');
    return cycle;
  }

  // ============================================================
  // QUESTÕES
  // ============================================================

  async createQuestion(dto: Evaluation360CreateQuestionDto, actorId: string) {
    // Eval360Question.competencyId é Int? — o DTO recebe-o como string (como
    // todos os outros ids neste módulo), tinha de ser convertido antes do create.
    // isOpen existe no DTO mas nunca foi migrado para Eval360Question — não é
    // persistido (o resto dos campos do DTO tem correspondência 1:1 no schema).
    const { isOpen, ...rest } = dto;
    const question = await this.prisma.eval360Question.create({
      data: {
        ...rest,
        cycleId: dto.cycleId!,
        competencyId: dto.competencyId ? +dto.competencyId : undefined,
      },
    });
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
    const where: Prisma.Eval360QuestionWhereInput = {};
    if (cycleId) where.cycleId = cycleId;
    if (competencyId) where.competencyId = +competencyId;
    return this.prisma.eval360Question.findMany({ where, orderBy: { order: 'asc' } });
  }

  // ============================================================
  // PARTICIPANTES
  // ============================================================

  async addParticipants(cycleId: string, dto: AddParticipantsDto, actorId: string) {
    await this.findCycleOrFail(cycleId);
    const results = { added: 0, skipped: 0 };

    for (const userId of dto.userIds) {
      try {
        await this.prisma.cycleParticipant.create({
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

  // Alternativa a addParticipants() para distribuição em massa: RH/GESTOR/
  // DIRECTOR/LIDER escolhem departamentos inteiros em vez de listar IDs de
  // utilizador um a um (usado pelo botão "Criar e Distribuir" do frontend).
  async addParticipantsByDepartment(
    cycleId: string,
    dto: AddParticipantsByDepartmentDto,
    actorId: string,
  ) {
    await this.findCycleOrFail(cycleId);
    const departmentIds = dto.departmentIds.map(id => +id);
    const users = await this.prisma.user.findMany({
      where: { departmentId: { in: departmentIds }, active: true },
      select: { id: true },
    });

    const results = { added: 0, skipped: 0 };
    for (const u of users) {
      try {
        await this.prisma.cycleParticipant.create({
          data: { cycleId, userId: String(u.id), status: 'PENDING' },
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
      details: { ...results, departmentIds: dto.departmentIds },
    });
    return results;
  }

  async giveConsent(cycleId: string, userId: string, dto: ConsentDto) {
    const participant = await this.prisma.cycleParticipant.findUnique({
      where: { cycleId_userId: { cycleId, userId } },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado.');
    return this.prisma.cycleParticipant.update({
      where: { cycleId_userId: { cycleId, userId } },
      data: { consentGiven: dto.consent, consentAt: dto.consent ? new Date() : null },
    });
  }

  // "Quem tenho de avaliar neste ciclo" — sem isto o frontend não tinha forma
  // de descobrir os evaluateeId válidos para preencher o separador "Avaliar"
  // (a avaliação 360º é por atribuição: só se pode avaliar quem aparece aqui).
  // Aberto a qualquer autenticado — é sempre "as minhas próprias" atribuições
  // (evaluatorId = utilizador autenticado), nunca as de outro.
  async listMyAssignments(cycleId: string, evaluatorId: string) {
    const assignments = await this.prisma.evaluatorAssignment.findMany({
      where: { cycleId, evaluatorId },
      orderBy: { role: 'asc' },
    });
    const evaluateeIds = [...new Set(assignments.map(a => +a.evaluateeId))];
    const users = evaluateeIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: evaluateeIds } },
          select: { id: true, fullName: true, department: { select: { name: true } } },
        })
      : [];
    const byId = new Map(users.map(u => [u.id, u]));
    return assignments.map(a => ({
      ...a,
      evaluateeName: byId.get(+a.evaluateeId)?.fullName ?? 'Colaborador',
      evaluateeDepartment: byId.get(+a.evaluateeId)?.department?.name ?? null,
    }));
  }

  async getParticipantProgress(cycleId: string, userId: string) {
    const assignments = await this.prisma.evaluatorAssignment.findMany({
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
    return this.buildEvaluatorSuggestions(dto.evaluateeId, dto.maxPerRole);
  }

  // Extraído de suggestEvaluators() para ser reutilizado por distributeCycle()
  // (distribuição automática — ver secção "DISTRIBUIÇÃO AUTOMÁTICA").
  private async buildEvaluatorSuggestions(
    evaluateeId: string,
    maxPerRole?: number,
  ): Promise<{ userId: string; role: EvaluatorRole; reason: string }[]> {
    const evaluatee = await this.prisma.user.findUnique({
      where: { id: +evaluateeId },
    });
    if (!evaluatee) throw new NotFoundException('Avaliado não encontrado.');

    // userId consistentemente string — EvaluatorAssignment.evaluatorId/
    // evaluateeId são String no schema, evaluatee.managerId/peers[].id/
    // subordinates[].id vêm de User.id (Int) e têm de ser convertidos.
    const suggestions: { userId: string; role: EvaluatorRole; reason: string }[] = [];

    // 1. Autoavaliação
    suggestions.push({
      userId: evaluateeId,
      role: EvaluatorRole.SELF,
      reason: 'Autoavaliação obrigatória',
    });

    // 2. Gestor direto
    if (evaluatee.managerId) {
      suggestions.push({
        userId: String(evaluatee.managerId),
        role: EvaluatorRole.MANAGER,
        reason: 'Gestor directo',
      });
    }

    // 3. Pares — qualquer colega activo do mesmo departamento pode avaliar
    // (já não se restringe ao mesmo gestor directo: a 360º está aberta a todo
    // o departamento). Sem maxPerRole explícito, sem cap — a suggestEvaluators
    // pública continua a aceitar um cap opcional para uso ad-hoc, mas a
    // distribuição automática (distributeCycle) não passa nenhum.
    if (evaluatee.departmentId) {
      const peers = await this.prisma.user.findMany({
        where: {
          departmentId: evaluatee.departmentId,
          id: { not: +evaluateeId },
          active: true,
        },
        ...(maxPerRole ? { take: maxPerRole } : {}),
      });
      peers.forEach(p =>
        suggestions.push({
          userId: String(p.id),
          role: EvaluatorRole.PEER,
          reason: 'Colega do mesmo departamento',
        }),
      );
    }

    // 4. Subordinados diretos
    const subordinates = await this.prisma.user.findMany({
      where: { managerId: +evaluateeId },
      take: maxPerRole ?? 5,
    });
    subordinates.forEach(s =>
      suggestions.push({
        userId: String(s.id),
        role: EvaluatorRole.SUBORDINATE,
        reason: 'Subordinado directo',
      }),
    );

    return suggestions;
  }

  async assignEvaluators(cycleId: string, dto: BulkAssignEvaluatorsDto, user: CurrentUserData) {
    await this.findCycleOrFail(cycleId);
    const actorId = String(user.id);
    const privileged = isPrivileged(user, [Role.ADMIN, Role.RH]);
    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const assign of dto.assignments) {
      // Prevenir auto-avaliação incorreta
      if (assign.evaluatorId === assign.evaluateeId && assign.role !== EvaluatorRole.SELF) {
        results.errors.push(
          `Avaliador ${assign.evaluatorId} não pode ser o mesmo que o avaliado em role ${assign.role}`,
        );
        continue;
      }
      // Ownership: sem esta verificação, um GESTOR/LIDER conseguia atribuir
      // avaliadores a colaboradores de qualquer equipa, não só a sua.
      // evaluateeId/evaluatorId são Strings sem FK — o User.id real é Int.
      if (!privileged && user.id !== Number(assign.evaluateeId)) {
        const isTeamMember = await this.prisma.read.user.count({
          where: { id: Number(assign.evaluateeId), managerId: user.id },
        });
        if (!isTeamMember) {
          results.errors.push(`Colaborador ${assign.evaluateeId} não encontrado na sua equipa`);
          continue;
        }
      }
      try {
        await this.prisma.evaluatorAssignment.create({
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

  async approveEvaluators(cycleId: string, dto: ApproveEvaluatorsDto, user: CurrentUserData) {
    const actorId = String(user.id);

    if (!isPrivileged(user, [Role.ADMIN, Role.RH])) {
      // Ownership: mesmo gap do assignEvaluators — sem isto, um GESTOR/LIDER
      // conseguia aprovar avaliadores de colaboradores de outra equipa.
      const targets = await this.prisma.evaluatorAssignment.findMany({
        where: { id: { in: dto.assignmentIds }, cycleId },
        select: { evaluateeId: true },
      });
      const otherTeamIds = [
        ...new Set(targets.map(t => Number(t.evaluateeId)).filter(id => id !== user.id)),
      ];
      if (otherTeamIds.length) {
        const teamCount = await this.prisma.read.user.count({
          where: { id: { in: otherTeamIds }, managerId: user.id },
        });
        if (teamCount !== otherTeamIds.length) {
          throw new NotFoundException('Atribuição não encontrada na sua equipa');
        }
      }
    }

    const updated = await this.prisma.evaluatorAssignment.updateMany({
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
      const assign = await this.prisma.evaluatorAssignment.findUnique({ where: { id } });
      if (assign) this.events.emit('evaluation.invitation.send', { assignment: assign });
    }
    return { approved: updated.count };
  }

  // ============================================================
  // ENVIO DE CONVITES
  // ============================================================

  async sendCycleInvites(cycleId: string, _actorId: string) {
    const pending = await this.prisma.evaluatorAssignment.findMany({
      where: { cycleId, status: 'PENDING' },
    });
    for (const assign of pending) {
      await this.prisma.evaluatorAssignment.update({
        where: { id: assign.id },
        data: { status: 'INVITED', invitedAt: new Date() },
      });
      this.events.emit('evaluation.invitation.send', { assignment: assign });
    }
    return { sent: pending.length };
  }

  // ============================================================
  // DISTRIBUIÇÃO AUTOMÁTICA
  // ============================================================

  // Substitui o fluxo manual suggestEvaluators→assignEvaluators→
  // approveEvaluators→sendInvites por uma única acção (só ADMIN/GESTOR/RH/
  // DIRECTOR/LIDER, ver controller): para cada participante já no ciclo,
  // gera as sugestões (self/gestor/pares do departamento/subordinados),
  // cria as atribuições que ainda não existem, publica o ciclo se ainda
  // DRAFT e dispara os convites — sem passo de aprovação manual. Idempotente:
  // re-correr não duplica atribuições já criadas.
  async distributeCycle(cycleId: string, actorId: string) {
    const cycle = await this.findCycleOrFail(cycleId);
    const participants = await this.prisma.cycleParticipant.findMany({ where: { cycleId } });
    if (participants.length === 0) {
      throw new BadRequestException(
        'O ciclo precisa de pelo menos 1 participante antes de distribuir.',
      );
    }

    const existing = await this.prisma.evaluatorAssignment.findMany({
      where: { cycleId },
      select: { evaluateeId: true, evaluatorId: true, role: true },
    });
    const existingKeys = new Set(
      existing.map(a => `${a.evaluateeId}:${a.evaluatorId}:${a.role}`),
    );

    let created = 0;
    for (const participant of participants) {
      const suggestions = await this.buildEvaluatorSuggestions(participant.userId);
      for (const s of suggestions) {
        const key = `${participant.userId}:${s.userId}:${s.role}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        await this.prisma.evaluatorAssignment.create({
          data: {
            cycleId,
            evaluateeId: participant.userId,
            evaluatorId: s.userId,
            role: s.role,
            status: 'PENDING',
            suggestedBy: actorId,
          },
        });
        created++;
      }
    }

    if (cycle.status === Eval360CycleStatus.DRAFT) {
      await this.publishCycle(cycleId, { sendInvitesNow: false }, actorId);
    }
    const { sent } = await this.sendCycleInvites(cycleId, actorId);

    await this.audit.log({
      entity: 'EvaluationCycle',
      entityId: cycleId,
      action: 'DISTRIBUTE',
      userId: actorId,
      details: { participants: participants.length, assignmentsCreated: created, invitesSent: sent },
    });

    return { participants: participants.length, assignmentsCreated: created, invitesSent: sent };
  }

  async sendReminders(cycleId: string, dto: SendRemindersDto, actorId: string) {
    const where: Prisma.EvaluatorAssignmentWhereInput = {
      cycleId,
      status: { in: ['INVITED', 'IN_PROGRESS'] },
    };
    if (dto.assignmentIds?.length) where.id = { in: dto.assignmentIds };

    const pending = await this.prisma.evaluatorAssignment.findMany({ where });
    for (const assign of pending) {
      await this.prisma.evaluatorAssignment.update({
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
    const assignment = await this.prisma.evaluatorAssignment.findFirst({
      where: { cycleId, evaluatorId, evaluateeId },
    });
    if (!assignment) throw new NotFoundException('Atribuição de avaliação não encontrada.');
    if (assignment.status === 'EXPIRED')
      throw new BadRequestException('Prazo de avaliação expirado.');
    if (assignment.status === 'COMPLETED') throw new BadRequestException('Avaliação já submetida.');

    const cycle = await this.prisma.eval360Cycle.findUnique({
      where: { id: cycleId },
      include: { competencies: { include: { competency: { include: { indicators: true } } } } },
    });

    const questions = await this.prisma.eval360Question.findMany({
      where: {
        cycleId,
        OR: [{ applicableTo: { isEmpty: true } }, { applicableTo: { has: assignment.role } }],
      },
      orderBy: { order: 'asc' },
      // Nome da competência incluído directamente — sem isto o frontend só
      // tinha o competencyId em bruto para mostrar por cima de cada pergunta.
      include: { competency: { select: { name: true } } },
    });

    // Verificar se há rascunho existente
    const existingResponse = await this.prisma.evaluationResponse.findFirst({
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
    const assignment = await this.prisma.evaluatorAssignment.findFirst({
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
    const requiredQs = await this.prisma.eval360Question.findMany({
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
    const response = await this.prisma.evaluationResponse.upsert({
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
      await this.prisma.evaluationAnswer.upsert({
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
      await this.prisma.evaluatorAssignment.update({
        where: { id: assignment.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await this.prisma.cycleParticipant.updateMany({
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
    const cycle = await this.prisma.eval360Cycle.findUnique({
      where: { id: cycleId },
      include: { competencies: { include: { competency: true } } },
    });
    if (!cycle) throw new NotFoundException('Ciclo não encontrado.');

    await this.prisma.eval360Cycle.update({
      where: { id: cycleId },
      data: { status: 'PROCESSING' },
    });

    const participants = await this.prisma.cycleParticipant.findMany({
      where: { cycleId },
    });

    // Referência comparativa por competência: média de TODAS as respostas
    // submetidas neste ciclo (todos os participantes/avaliadores) — dado
    // real do ciclo, não um "benchmark de cargo" fabricado.
    const benchmarks = await this.computeCycleCompetencyBenchmarks(
      cycleId,
      cycle.competencies.map(c => c.competencyId),
    );

    for (const participant of participants) {
      await this.calculateParticipantResult(cycle, participant.userId, benchmarks);
    }

    await this.prisma.eval360Cycle.update({
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

  private async computeCycleCompetencyBenchmarks(
    cycleId: string,
    competencyIds: number[],
  ): Promise<Record<number, number>> {
    if (competencyIds.length === 0) return {};
    const answers = await this.prisma.evaluationAnswer.findMany({
      where: {
        numericValue: { not: null },
        question: { cycleId, competencyId: { in: competencyIds } },
        response: { status: 'SUBMITTED' },
      },
      select: { numericValue: true, question: { select: { competencyId: true } } },
    });
    const sums = new Map<number, { total: number; count: number }>();
    for (const a of answers) {
      const compId = a.question.competencyId;
      if (compId == null || a.numericValue == null) continue;
      const entry = sums.get(compId) ?? { total: 0, count: 0 };
      entry.total += a.numericValue;
      entry.count += 1;
      sums.set(compId, entry);
    }
    const result: Record<number, number> = {};
    for (const [id, { total, count }] of sums) result[id] = total / count;
    return result;
  }

  private async calculateParticipantResult(
    cycle: CalcCycle,
    participantId: string,
    benchmarks: Record<number, number> = {},
  ) {
    const responses = await this.prisma.evaluationResponse.findMany({
      where: { cycleId: cycle.id, evaluateeId: participantId, status: 'SUBMITTED' },
      include: { answers: { include: { question: { include: { competency: true } } } } },
    });

    // Verificar quorum mínimo por grupo
    const byRole: Record<string, ResponseWithAnswers[]> = {};
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
      this.logger.warn({
        entityId: participantId,
        action: 'EVAL360_PEER_QUORUM_NOT_MET',
        cycleId: cycle.id,
        peerCount: peerResponses.length,
        quorumMinimum: cycle.quorumMinimum,
        msg: '[360] Participante com pares abaixo do quorum — dados de pares ocultados',
      });
    }

    // Score por tipo de avaliador (média das respostas numéricas)
    const getAvgScore = (rs: ResponseWithAnswers[]): number | null => {
      const nums = rs.flatMap(r =>
        r.answers.filter(a => a.numericValue !== null).map(a => a.numericValue as number),
      );
      return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
    };

    const selfScore = getAvgScore(byRole['SELF'] ?? []);
    const managerScore = getAvgScore(byRole['MANAGER'] ?? []);
    const peerScore =
      peerResponses.length >= cycle.quorumMinimum ? getAvgScore(peerResponses) : null;
    const subScore = getAvgScore(byRole['SUBORDINATE'] ?? []);
    const extScore = getAvgScore(byRole['EXTERNAL'] ?? []);

    // Score ponderado — normalizado por `appliedWeight` (soma dos pesos dos
    // papéis que efectivamente responderam), não pela soma configurada no
    // ciclo (`weightSelf+weightManager+...`): se um papel ficar de fora (ex.:
    // pares abaixo do quorum), dividir pelo total configurado penalizaria
    // incorrectamente a ausência de dados que nem deviam contar.
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
    const scoresByCompetency: Record<string, CompetencyScoreEntry> = {};
    const allCompetencies = cycle.competencies.map(c => c.competency);

    for (const comp of allCompetencies) {
      const compAnswers = responses.flatMap(r =>
        r.answers
          .filter(a => a.question?.competencyId === comp.id && a.numericValue !== null)
          .map(a => ({ role: r.evaluatorRole, value: a.numericValue as number })),
      );
      const allVals = compAnswers.map(a => a.value);
      const selfVals = compAnswers.filter(a => a.role === 'SELF').map(a => a.value);
      const otherVals = compAnswers.filter(a => a.role !== 'SELF').map(a => a.value);
      const managerVals = compAnswers.filter(a => a.role === 'MANAGER').map(a => a.value);
      const peerVals = compAnswers.filter(a => a.role === 'PEER').map(a => a.value);

      const avg = (arr: number[]) =>
        arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      const score = avg(allVals);
      const selfCompScore = avg(selfVals);
      const othersCompScore = avg(otherVals);
      const gap =
        selfCompScore !== null && othersCompScore !== null ? selfCompScore - othersCompScore : null;

      scoresByCompetency[comp.id] = {
        name: comp.name,
        category: comp.category,
        type: comp.type,
        score,
        selfScore: selfCompScore,
        othersScore: othersCompScore,
        managerScore: avg(managerVals),
        peerScore: avg(peerVals),
        gap,
        benchmark: benchmarks[comp.id] ?? null,
      };
    }

    // Identificar gaps e forças
    const entries = Object.entries(scoresByCompetency).filter(([, v]) => v.score !== null);
    const sorted = entries.sort((a, b) => (a[1].score ?? 0) - (b[1].score ?? 0));
    const gaps: CompetencyGapEntry[] = sorted.slice(0, 3).map(([id, v]) => ({
      competencyId: id,
      name: v.name,
      score: v.score,
      gap: v.gap,
      priority: 'HIGH',
    }));
    const strengths: CompetencyStrengthEntry[] = sorted
      .slice(-3)
      .reverse()
      .map(([id, v]) => ({ competencyId: id, name: v.name, score: v.score }));

    // Elegibilidade
    const isEligiblePromotion = cycle.cutoffPromotion
      ? weightedScore >= cycle.cutoffPromotion
      : false;
    const isEligibleBonus = cycle.cutoffBonus ? weightedScore >= cycle.cutoffBonus : false;
    const bonusMultiplier = this.calculateBonusMultiplier(weightedScore, cycle);

    // Upsert resultado
    const result = await this.prisma.evaluationResult.upsert({
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
    await this.prisma.cycleParticipant.updateMany({
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

  private calculateBonusMultiplier(score: number, cycle: CalcCycle): number | null {
    if (!cycle.linkedToBonus || !cycle.cutoffBonus) return null;
    if (score < cycle.cutoffBonus) return 0;
    // Eval360Cycle não tem scaleMax (esse campo é por-competência, em
    // Competency) — fallback fixo em 5, comportamento pré-existente.
    const normalized = (score - cycle.cutoffBonus) / (5 - cycle.cutoffBonus);
    return Math.min(1 + normalized * 0.5, 1.5); // máx 1.5x
  }

  private async generateAutomaticPdi(
    userId: string,
    cycleId: string,
    gaps: CompetencyGapEntry[],
    resultId: string,
  ) {
    try {
      const actions = gaps.map(gap => ({
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
    } catch (err: unknown) {
      this.logger.warn({
        userId,
        action: 'EVAL360_AUTO_PDI_CREATE',
        entityId: resultId,
        cycleId,
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao criar PDI automático a partir de resultados de avaliação 360',
      });
    }
  }

  // ============================================================
  // ANALYTICS
  // ============================================================

  async getParticipantResult(cycleId: string, participantId: string, requesterId: string) {
    const result = await this.prisma.evaluationResult.findUnique({
      where: { cycleId_participantId: { cycleId, participantId } },
    });
    if (!result) throw new NotFoundException('Resultado não encontrado.');

    await this.findCycleOrFail(cycleId);
    // Regra explícita do produto: ninguém vê o resultado de outro utilizador
    // — nem ADMIN nem RH têm excepção aqui (diferente de getTeamAnalytics/
    // getOrganizationalAnalytics/calibrateScore, que continuam a mostrar
    // dados agregados de equipa/organização a esses papéis). requesterId
    // chega como number (User.id via JWT) e participantId como string
    // (route param) — comparação estrita nunca era true sem o String().
    const isOwnResult = String(requesterId) === String(participantId);
    if (!isOwnResult) throw new ForbiddenException('Sem permissão para ver este resultado.');

    return {
      ...result,
      scoresByCompetency: JSON.parse(result.scoresByCompetency),
      gaps: result.gaps ? JSON.parse(result.gaps) : [],
      strengths: result.strengths ? JSON.parse(result.strengths) : [],
      // Nunca dados individuais por avaliador, nem para o próprio dono do
      // resultado — manteria a identidade do avaliador rastreável.
      rawByEvaluator: null,
    };
  }

  async getTeamAnalytics(cycleId: string, managerId: string) {
    const managedUsers = await this.prisma.user.findMany({
      where: { managerId: +managerId },
      select: { id: true, fullName: true },
    });
    const userIds = managedUsers.map(u => u.id);

    const results = await this.prisma.evaluationResult.findMany({
      where: { cycleId, participantId: { in: userIds.map(String) } },
    });

    return results.map(r => ({
      participantId: r.participantId,
      participantName:
        managedUsers.find(u => String(u.id) === r.participantId)?.fullName ?? r.participantId,
      weightedScore: r.weightedScore,
      overallScore: r.overallScore,
      isEligiblePromotion: r.isEligiblePromotion,
      isEligibleBonus: r.isEligibleBonus,
      gaps: r.gaps ? JSON.parse(r.gaps) : [],
      strengths: r.strengths ? JSON.parse(r.strengths) : [],
    }));
  }

  async getOrganizationalAnalytics(query: AnalyticsQueryDto) {
    const where: Prisma.EvaluationResultWhereInput = {};
    if (query.cycleId) where.cycleId = query.cycleId;

    const results = await this.prisma.evaluationResult.findMany({
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
      const sc: Record<string, CompetencyScoreEntry> = JSON.parse(r.scoresByCompetency ?? '{}');
      for (const [cId, data] of Object.entries(sc)) {
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
    // Nine-Box: X = Performance (weightedScore), Y = Potencial (a integrar com OKRs)
    // Por agora: usar selfScore como proxy de potencial (auto-percepção).
    // FIX: havia uma 1ª query idêntica (sem `selfScore`) cujo resultado nunca
    // era lido — `withSelf` já tem tudo o que essa continha, era uma
    // segunda ida à BD redundante.
    const withSelf = await this.prisma.evaluationResult.findMany({
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
    // Eval360Feedback.competencyId é Int? — o DTO recebe-o como string.
    const feedback = await this.prisma.eval360Feedback.create({
      data: {
        ...dto,
        fromUserId: actorId,
        competencyId: dto.competencyId ? +dto.competencyId : undefined,
      },
    });
    this.events.emit('feedback.continuous.created', { feedback });
    return feedback;
  }

  async listFeedbackForUser(userId: string, query: Evaluation360PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.eval360Feedback.findMany({
        where: { toUserId: userId, isPrivate: false },
        orderBy: { createdAt: 'desc' },
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
      }),
      this.prisma.eval360Feedback.count({
        where: { toUserId: userId, isPrivate: false },
      }),
    ]);

    // Eval360Feedback.fromUserId/competencyId não têm FK/relation no schema
    // — resolvem-se aqui para o frontend não ter de mostrar IDs em bruto.
    // (Feedback contínuo não é anónimo, ao contrário das respostas 360º.)
    const fromIds = [...new Set(data.map(f => +f.fromUserId))];
    const competencyIds = [...new Set(data.map(f => f.competencyId).filter((id): id is number => id != null))];
    const [fromUsers, competencies] = await Promise.all([
      fromIds.length
        ? this.prisma.user.findMany({ where: { id: { in: fromIds } }, select: { id: true, fullName: true } })
        : Promise.resolve([]),
      competencyIds.length
        ? this.prisma.competency.findMany({ where: { id: { in: competencyIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const nameById = new Map(fromUsers.map(u => [u.id, u.fullName]));
    const competencyNameById = new Map(competencies.map(c => [c.id, c.name]));
    const withNames = data.map(f => ({
      ...f,
      fromName: nameById.get(+f.fromUserId) ?? 'Colega',
      competencyName: f.competencyId ? (competencyNameById.get(f.competencyId) ?? null) : null,
    }));

    return { data: withNames, total };
  }

  // ============================================================
  // PULSE SURVEYS
  // ============================================================

  async createPulseSurvey(dto: CreatePulseSurveyDto, actorId: string) {
    return this.prisma.pulseSurvey.create({
      data: { ...dto, closesAt: new Date(dto.closesAt), createdBy: actorId, sentAt: new Date() },
    });
  }

  async submitPulseSurveyResponse(surveyId: string, userId: string, dto: SubmitPulseSurveyDto) {
    return this.prisma.pulseSurveyResponse.upsert({
      where: { surveyId_userId: { surveyId, userId } },
      create: { surveyId, userId, answersJson: dto.answersJson },
      update: { answersJson: dto.answersJson },
    });
  }

  // ============================================================
  // CALIBRAÇÃO (RH)
  // ============================================================

  async calibrateScore(cycleId: string, dto: Evaluation360CalibrateScoreDto, actorId: string) {
    const result = await this.prisma.evaluationResult.findFirst({
      where: { cycleId, participantId: dto.participantId },
    });
    if (!result) throw new NotFoundException('Resultado não encontrado.');

    await this.prisma.evaluationResult.update({
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

  async generateReport(dto: GenerateReportDto, _requesterId: string) {
    const cycle = await this.findCycleOrFail(dto.cycleId);
    if (dto.scope === 'INDIVIDUAL' && dto.participantId) {
      const result = await this.prisma.evaluationResult.findUnique({
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

  private async generateAiInsights(
    result: Prisma.EvaluationResultGetPayload<object>,
  ): Promise<string> {
    // Em produção: integrar com Anthropic API ou OpenAI para análise de texto
    const gaps: CompetencyGapEntry[] = result.gaps ? JSON.parse(result.gaps) : [];
    const strengths: CompetencyStrengthEntry[] = result.strengths
      ? JSON.parse(result.strengths)
      : [];
    return `Pontos fortes identificados: ${strengths.map(s => s.name).join(', ')}. Áreas prioritárias para desenvolvimento: ${gaps.map(g => g.name).join(', ')}.`;
  }

  // ============================================================
  // CRON: Verificar ciclos expirados e enviar lembretes
  // ============================================================

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async processDailyReminders() {
    const activeCycles = await this.prisma.eval360Cycle.findMany({
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
        await this.prisma.evaluatorAssignment.updateMany({
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
    const cycle = await this.prisma.eval360Cycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException('Ciclo de avaliação não encontrado.');
    return cycle;
  }

  private validateWeights(dto: {
    weightSelf?: number;
    weightManager?: number;
    weightPeer?: number;
    weightSubordinate?: number;
    weightExternal?: number;
  }) {
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

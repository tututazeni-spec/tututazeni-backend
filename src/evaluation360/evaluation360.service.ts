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
  CycleReportQueryDto,
  CycleEvolutionQueryDto,
  CycleFeedbackQueryDto,
  SendRemindersDto,
  Evaluation360PaginationDto,
  ListEvaluationCyclesDto,
  ListCycleParticipantsDto,
  ListCycleEvaluatorsDto,
  CreateEvaluationQuestionnaireDto,
  UpdateEvaluationQuestionnaireDto,
  ListQuestionnairesDto,
  QuestionnaireQuestionDto,
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
  // "Avaliação dos subordinados"/"Outras avaliações" (docs/evaluation360.md
  // §7) — subordinateScore e externalScore não tinham breakdown por
  // competência, só ao nível do resultado global (selfScore/managerScore/...
  // em EvaluationResult); precisos para a tabela de Resultados.
  subordinateScore: number | null;
  externalScore: number | null;
  // Nº de respostas numéricas consideradas nesta competência (todos os
  // grupos, já com o quorum de pares aplicado) — coluna "Nº de respostas".
  responseCount: number;
  gap: number | null;
  // Média de todas as respostas submetidas no ciclo para esta competência
  // (todos os participantes) — referência comparativa real, não um
  // "benchmark de cargo" fabricado (o schema não tem dados de mercado).
  benchmark: number | null;
  // "Nível esperado"/"Gap" face ao esperado (docs/evaluation360.md §3/§7) —
  // vem de Eval360CycleCompetency.expectedLevel quando configurado; gapToExpected
  // é distinto do `gap` acima (que é auto vs. outros).
  expectedLevel: number | null;
  gapToExpected: number | null;
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
  Liderança:
    'Com que frequência este colaborador inspira a equipa, dá feedback, toma decisões e desenvolve pessoas?',
  Comunicação:
    'Com que frequência este colaborador comunica de forma clara, escuta activamente e adapta a comunicação ao público?',
  'Foco em Resultados':
    'Com que frequência este colaborador cumpre objectivos, assume responsabilidade e procura melhoria contínua?',
  'Trabalho em Equipa':
    'Com que frequência este colaborador colabora com os colegas, partilha informação e resolve conflitos?',
  'Pensamento Estratégico':
    'Com que frequência este colaborador demonstra visão a médio/longo prazo, capacidade de antecipação e alinhamento com os objectivos da organização?',
  Resiliência:
    'Com que frequência este colaborador gere a pressão, se adapta a mudanças e mantém o foco?',
  Inovação:
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

  async listCompetencies(tenantId?: string, query?: Evaluation360PaginationDto, tag?: string) {
    return this.competencies.listCatalogue({
      tenantId,
      search: query?.search,
      offset: query?.offset,
      limit: query?.limit,
      tag,
    });
  }

  // ============================================================
  // CICLOS DE AVALIAÇÃO
  // ============================================================

  async createCycle(dto: CreateEvaluationCycleDto, actorId: string) {
    this.validateWeights(dto);
    this.validateDates(dto.startDate, dto.endDate);

    // Questionário (docs/evaluation360.md §6) — quando indicado, sobrepõe-se
    // a `dto.competencies`/doutrina-padrão: fornece já competências +
    // perguntas curadas e reutilizáveis entre ciclos.
    let questionnaire: Prisma.Eval360QuestionnaireGetPayload<{
      include: { competencies: true; questions: true };
    }> | null = null;
    if (dto.questionnaireId) {
      questionnaire = await this.prisma.eval360Questionnaire.findUnique({
        where: { id: dto.questionnaireId },
        include: { competencies: true, questions: true },
      });
      if (!questionnaire) throw new NotFoundException('Questionário não encontrado.');
    }

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
        questionnaireId: questionnaire?.id,
        competencies: questionnaire
          ? {
              create: questionnaire.competencies.map(c => ({
                competencyId: c.competencyId,
                weight: 1,
                isRequired: true,
                order: c.order,
              })),
            }
          : dto.competencies?.length
            ? {
                create: dto.competencies.map(c => ({
                  competencyId: +c.competencyId,
                  weight: c.weight ?? 1,
                  isRequired: c.isRequired ?? true,
                  order: c.order ?? 0,
                  expectedLevel: c.expectedLevel,
                })),
              }
            : undefined,
      },
      include: { competencies: { include: { competency: true } } },
    });

    // Sem competências explícitas nem questionário: aplica-se sempre a
    // doutrina fixa de avaliação 360º da INNOVA (8 competências + 1 questão
    // cada) em vez de deixar o ciclo sem nada para publicar (publishCycle
    // exige >=1 questão).
    let finalCycle = cycle;
    if (questionnaire) {
      // Clona as perguntas do questionário para este ciclo — âmbito próprio,
      // tal como as questões geradas pela doutrina-padrão/attachDefaultQuestions;
      // o questionário em si permanece intacto e reutilizável noutros ciclos.
      for (const q of questionnaire.questions) {
        await this.prisma.eval360Question.create({
          data: {
            cycleId: cycle.id,
            competencyId: q.competencyId ?? undefined,
            text: q.text,
            type: q.type,
            isRequired: q.isRequired,
            order: q.order,
            scaleMin: q.scaleMin ?? questionnaire.scaleMin,
            scaleMax: q.scaleMax ?? questionnaire.scaleMax,
            scaleLabels: q.scaleLabels ?? questionnaire.scaleLabels ?? undefined,
            options: q.options ?? undefined,
            applicableTo: [],
          },
        });
      }
    } else if (!dto.competencies?.length) {
      const attached = await this.attachStandardCompetencies(cycle.id);
      finalCycle = { ...cycle, competencies: attached };
    } else {
      // Competências escolhidas explicitamente (docs/evaluation360.md §3):
      // o `create` aninhado acima só grava Eval360CycleCompetency — sem isto
      // o ciclo fica sem nenhuma Eval360Question e o formulário do avaliador
      // (GET /cycles/:id/form) sai vazio. Gera a mesma questão FREQUENCY
      // por omissão que attachStandardCompetencies usa para as 8 fixas; RH
      // pode substituir/complementar depois via POST /evaluation360/questions.
      await this.attachDefaultQuestions(cycle.id, cycle.competencies);
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
    const created: Prisma.Eval360CycleCompetencyGetPayload<{
      include: { competency: true };
    }>[] = [];
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

  // Mesma questão FREQUENCY por omissão que attachStandardCompetencies cria,
  // aplicada às competências explicitamente escolhidas em createCycle (em
  // vez das 8 fixas). Não recria questão para uma competência que já a
  // tenha (ex.: updateCycle a adicionar competências a um ciclo existente).
  private async attachDefaultQuestions(
    cycleId: string,
    cycleCompetencies: { competencyId: number; order: number; competency: { name: string } }[],
  ) {
    if (!cycleCompetencies.length) return;
    const existing = await this.prisma.eval360Question.findMany({
      where: { cycleId, competencyId: { in: cycleCompetencies.map(c => c.competencyId) } },
      select: { competencyId: true },
    });
    const existingIds = new Set(existing.map(q => q.competencyId));
    for (const cc of cycleCompetencies) {
      if (existingIds.has(cc.competencyId)) continue;
      await this.prisma.eval360Question.create({
        data: {
          cycleId,
          competencyId: cc.competencyId,
          text:
            STANDARD_EVAL360_QUESTIONS[cc.competency.name] ??
            `Com que frequência este colaborador demonstra a competência "${cc.competency.name}"?`,
          type: 'FREQUENCY',
          isRequired: true,
          order: cc.order,
          scaleMin: 1,
          scaleMax: 5,
          scaleLabels: 'Nunca,Raramente,Às vezes,Frequentemente,Sempre',
          applicableTo: [],
        },
      });
    }
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

  async listCycles(tenantId: string, query: ListEvaluationCyclesDto) {
    // deletedAt: null — ciclos eliminados (soft delete, ver deleteCycle) saem
    // da listagem normal; continuam acessíveis só via listDeletedCycles
    // (separador "Apagados" do módulo de auditoria).
    const where: Prisma.Eval360CycleWhereInput = { tenantId, deletedAt: null };
    if (query.search) where.name = { contains: query.search };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.createdBy) where.createdBy = query.createdBy;
    if (query.from || query.to) {
      where.startDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    // Departamento/Unidade/Cargo não são campos do ciclo — filtram pelos
    // avaliados (CycleParticipant.userId) cujo User pertença a essa entidade.
    if (query.departmentId || query.unitId || query.positionId) {
      const userWhere: Prisma.UserWhereInput = {};
      if (query.departmentId) userWhere.departmentId = Number(query.departmentId);
      if (query.unitId) userWhere.unitId = Number(query.unitId);
      if (query.positionId) userWhere.positionId = Number(query.positionId);
      const matchingUsers = await this.prisma.user.findMany({
        where: userWhere,
        select: { id: true },
      });
      where.participants = { some: { userId: { in: matchingUsers.map(u => String(u.id)) } } };
    }

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
    // concluíram para a barra de progresso, de quantos avaliadores distintos
    // (não atribuições) e de quantos já responderam para a Taxa de
    // Participação pedida em docs/evaluation360.md §2.
    const [completedCounts, evaluatorSets, respondedCounts] = await Promise.all([
      Promise.all(
        data.map(c =>
          this.prisma.cycleParticipant.count({ where: { cycleId: c.id, status: 'COMPLETED' } }),
        ),
      ),
      Promise.all(
        data.map(c =>
          this.prisma.evaluatorAssignment.findMany({
            where: { cycleId: c.id },
            select: { evaluatorId: true },
            distinct: ['evaluatorId'],
          }),
        ),
      ),
      Promise.all(
        data.map(c =>
          this.prisma.evaluationResponse.count({ where: { cycleId: c.id, status: 'SUBMITTED' } }),
        ),
      ),
    ]);
    const createdByNames = await this.resolveActorNames(data.map(c => c.createdBy));

    const withDetails = data.map((c, i) => {
      const evaluatorsCount = evaluatorSets[i].length;
      const respondedCount = respondedCounts[i];
      return {
        ...c,
        code: this.buildCycleCode(c),
        createdByName: createdByNames.get(c.createdBy) ?? c.createdBy,
        completedParticipants: completedCounts[i],
        evaluatorsCount,
        respondedCount,
        participationRate: evaluatorsCount
          ? Math.round((respondedCount / evaluatorsCount) * 100)
          : 0,
      };
    });
    return { data: withDetails, total };
  }

  // "Código" pedido em docs/evaluation360.md §2 — o schema não tem um campo
  // dedicado (Eval360Cycle.id é um cuid não amigável), por isso é derivado
  // do ano de criação + sufixo do id, nunca persistido.
  private buildCycleCode(cycle: { id: string; createdAt: Date }): string {
    return `C360-${cycle.createdAt.getFullYear()}-${cycle.id.slice(-6).toUpperCase()}`;
  }

  // Resolve ids de actor "soltos" (String, ver comentário em createdBy/
  // deletedById no schema) para fullName — usado por listCycles/getOverview
  // para mostrar "Criado por" e "Últimas avaliações realizadas".
  private async resolveActorNames(actorIds: string[]): Promise<Map<string, string>> {
    const numericIds = [...new Set(actorIds.map(id => Number(id)).filter(id => !Number.isNaN(id)))];
    if (!numericIds.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: numericIds } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map(u => [String(u.id), u.fullName]));
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
    // deletedAt — ciclo eliminado (soft delete) sai da vista normal, mesmo
    // pelo detalhe directo; só listDeletedCycles/restoreCycle o veem.
    if (!cycle || cycle.deletedAt) throw new NotFoundException('Ciclo não encontrado.');
    return cycle;
  }

  // ============================================================
  // ELIMINAÇÃO E RESTAURO (soft delete, auditável)
  // ============================================================
  //
  // ADMIN/DIRECTOR podem eliminar um ciclo (@Roles no controller) — a linha
  // nunca sai da BD, só fica marcada com deletedAt e escondida de
  // listCycles/getCycleDetail/findCycleOrFail. Um snapshot completo do ciclo
  // (config, competências, contagens) fica gravado no AuditLog no momento da
  // eliminação, e listDeletedCycles/restoreCycle dão ao separador "Apagados"
  // do módulo de auditoria tudo o que precisa para mostrar e reverter a
  // eliminação sem depender desse snapshot (a própria linha continua completa).

  /** Ciclos eliminados (soft delete) — alimenta o separador "Apagados" da auditoria. */
  async listDeletedCycles(tenantId?: string) {
    const where: Prisma.Eval360CycleWhereInput = { deletedAt: { not: null } };
    if (tenantId) where.tenantId = tenantId;
    return this.prisma.eval360Cycle.findMany({
      where,
      orderBy: { deletedAt: 'desc' },
      include: {
        competencies: { include: { competency: true }, orderBy: { order: 'asc' } },
        _count: { select: { participants: true, assignments: true, responses: true } },
      },
    });
  }

  async deleteCycle(id: string, actorId: string) {
    const cycle = await this.prisma.eval360Cycle.findUnique({
      where: { id },
      include: {
        competencies: { include: { competency: true }, orderBy: { order: 'asc' } },
        _count: { select: { participants: true, assignments: true, responses: true } },
      },
    });
    if (!cycle || cycle.deletedAt)
      throw new NotFoundException('Ciclo de avaliação não encontrado.');

    await this.prisma.eval360Cycle.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actorId },
    });

    // logEntity (não .log()) — Eval360Cycle.id é cuid (String); AuditLog.entityId
    // é Int?, por isso o id real vai dentro do metadata, tal como o resto do
    // snapshot "dados completos auditáveis" pedido para o separador Apagados.
    await this.audit.logEntity(Number(actorId), 'DELETE', 'EvaluationCycle', id, {
      snapshot: {
        id: cycle.id,
        tenantId: cycle.tenantId,
        name: cycle.name,
        description: cycle.description,
        model: cycle.model,
        type: cycle.type,
        status: cycle.status,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        anonymityMode: cycle.anonymityMode,
        quorumMinimum: cycle.quorumMinimum,
        weightSelf: cycle.weightSelf,
        weightManager: cycle.weightManager,
        weightPeer: cycle.weightPeer,
        weightSubordinate: cycle.weightSubordinate,
        weightExternal: cycle.weightExternal,
        cutoffPromotion: cycle.cutoffPromotion,
        cutoffBonus: cycle.cutoffBonus,
        cutoffProgram: cycle.cutoffProgram,
        linkedToPdi: cycle.linkedToPdi,
        linkedToBonus: cycle.linkedToBonus,
        linkedToOkrs: cycle.linkedToOkrs,
        createdBy: cycle.createdBy,
        createdAt: cycle.createdAt,
        competencies: cycle.competencies.map(c => ({
          id: c.competencyId,
          name: c.competency.name,
          category: c.competency.category,
        })),
        counts: cycle._count,
      },
    });
    return { id, deletedAt: new Date() };
  }

  async restoreCycle(id: string, actorId: string) {
    const cycle = await this.prisma.eval360Cycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException('Ciclo de avaliação não encontrado.');
    if (!cycle.deletedAt) throw new BadRequestException('Este ciclo não está eliminado.');

    const restored = await this.prisma.eval360Cycle.update({
      where: { id },
      data: { deletedAt: null, deletedById: null },
    });
    await this.audit.logEntity(Number(actorId), 'RESTORE', 'EvaluationCycle', id, {
      name: cycle.name,
    });
    return restored;
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
  // QUESTIONÁRIOS (docs/evaluation360.md §6) — banco reutilizável, distinto
  // das Eval360Question (sempre presas a um ciclo concreto). createCycle()
  // clona competências+perguntas daqui para o ciclo quando questionnaireId
  // é indicado — ver comentário nesse método.
  // ============================================================

  private async findQuestionnaireOrFail(id: string) {
    const questionnaire = await this.prisma.eval360Questionnaire.findUnique({ where: { id } });
    if (!questionnaire) throw new NotFoundException('Questionário não encontrado.');
    return questionnaire;
  }

  async createQuestionnaire(dto: CreateEvaluationQuestionnaireDto, actorId: string) {
    const existing = await this.prisma.eval360Questionnaire.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new BadRequestException('Já existe um questionário com este código.');

    const questionnaire = await this.prisma.eval360Questionnaire.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        instructions: dto.instructions,
        scaleMin: dto.scaleMin ?? 1,
        scaleMax: dto.scaleMax ?? 5,
        scaleLabels: dto.scaleLabels,
        createdBy: actorId,
        competencies: dto.competencies?.length
          ? {
              create: dto.competencies.map((c, i) => ({
                competencyId: +c.competencyId,
                order: c.order ?? i,
              })),
            }
          : undefined,
        questions: dto.questions?.length
          ? {
              create: dto.questions.map((q, i) => ({
                competencyId: q.competencyId ? +q.competencyId : undefined,
                text: q.text,
                type: q.type,
                isRequired: q.isRequired ?? true,
                allowComment: q.allowComment ?? true,
                order: q.order ?? i,
                scaleMin: q.scaleMin,
                scaleMax: q.scaleMax,
                scaleLabels: q.scaleLabels,
                options: q.options,
              })),
            }
          : undefined,
      },
      include: { competencies: { include: { competency: true } }, questions: true },
    });
    await this.audit.log({
      entity: 'Eval360Questionnaire',
      entityId: questionnaire.id,
      action: 'CREATE',
      userId: actorId,
      details: { name: dto.name, code: dto.code },
    });
    return questionnaire;
  }

  async updateQuestionnaire(id: string, dto: UpdateEvaluationQuestionnaireDto, actorId: string) {
    const questionnaire = await this.findQuestionnaireOrFail(id);
    if (questionnaire.status !== 'DRAFT') {
      throw new BadRequestException(
        'Apenas questionários em rascunho podem ser editados — publique uma nova versão.',
      );
    }
    // competencies/questions são relações geridas pelos endpoints dedicados
    // (addQuestionnaireQuestion/removeQuestionnaireQuestion), tal como
    // updateCycle() já faz para Eval360CycleCompetency.
    const { competencies, questions, ...data } = dto;
    const updated = await this.prisma.eval360Questionnaire.update({ where: { id }, data });
    await this.audit.log({
      entity: 'Eval360Questionnaire',
      entityId: id,
      action: 'UPDATE',
      userId: actorId,
      details: data,
    });
    return updated;
  }

  async listQuestionnaires(query: ListQuestionnairesDto) {
    const where: Prisma.Eval360QuestionnaireWhereInput = {};
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.status) where.status = query.status;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.eval360Questionnaire.findMany({
        where,
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { competencies: true, questions: true } } },
      }),
      this.prisma.eval360Questionnaire.count({ where }),
    ]);

    return {
      data: data.map(q => ({
        id: q.id,
        name: q.name,
        code: q.code,
        description: q.description,
        version: q.version,
        scaleMin: q.scaleMin,
        scaleMax: q.scaleMax,
        questionCount: q._count.questions,
        competencyCount: q._count.competencies,
        status: q.status,
        createdBy: q.createdBy,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      })),
      total,
    };
  }

  async getQuestionnaireDetail(id: string) {
    const questionnaire = await this.prisma.eval360Questionnaire.findUnique({
      where: { id },
      include: {
        competencies: { include: { competency: true }, orderBy: { order: 'asc' } },
        questions: { orderBy: { order: 'asc' } },
      },
    });
    if (!questionnaire) throw new NotFoundException('Questionário não encontrado.');
    return questionnaire;
  }

  async publishQuestionnaire(id: string, actorId: string) {
    const questionnaire = await this.findQuestionnaireOrFail(id);
    if (questionnaire.status !== 'DRAFT')
      throw new BadRequestException('Apenas questionários em rascunho podem ser publicados.');

    const questionCount = await this.prisma.eval360QuestionnaireQuestion.count({
      where: { questionnaireId: id },
    });
    if (questionCount === 0)
      throw new BadRequestException(
        'O questionário precisa de pelo menos 1 pergunta antes de ser publicado.',
      );

    const published = await this.prisma.eval360Questionnaire.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });
    await this.audit.log({
      entity: 'Eval360Questionnaire',
      entityId: id,
      action: 'PUBLISH',
      userId: actorId,
      details: {},
    });
    return published;
  }

  async archiveQuestionnaire(id: string, actorId: string) {
    await this.findQuestionnaireOrFail(id);
    const archived = await this.prisma.eval360Questionnaire.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    await this.audit.log({
      entity: 'Eval360Questionnaire',
      entityId: id,
      action: 'ARCHIVE',
      userId: actorId,
      details: {},
    });
    return archived;
  }

  async deleteQuestionnaire(id: string, actorId: string) {
    const questionnaire = await this.findQuestionnaireOrFail(id);
    if (questionnaire.status !== 'DRAFT')
      throw new BadRequestException(
        'Apenas questionários em rascunho podem ser eliminados — arquive-o se já foi usado.',
      );
    const inUse = await this.prisma.eval360Cycle.count({ where: { questionnaireId: id } });
    if (inUse > 0)
      throw new BadRequestException('Este questionário já foi usado por um ciclo — arquive-o.');

    await this.prisma.eval360Questionnaire.delete({ where: { id } });
    await this.audit.log({
      entity: 'Eval360Questionnaire',
      entityId: id,
      action: 'DELETE',
      userId: actorId,
      details: { name: questionnaire.name },
    });
    return { id };
  }

  async addQuestionnaireQuestion(
    questionnaireId: string,
    dto: QuestionnaireQuestionDto,
    actorId: string,
  ) {
    const questionnaire = await this.findQuestionnaireOrFail(questionnaireId);
    if (questionnaire.status !== 'DRAFT')
      throw new BadRequestException(
        'Apenas questionários em rascunho podem receber novas perguntas.',
      );

    const question = await this.prisma.eval360QuestionnaireQuestion.create({
      data: {
        questionnaireId,
        competencyId: dto.competencyId ? +dto.competencyId : undefined,
        text: dto.text,
        type: dto.type,
        isRequired: dto.isRequired ?? true,
        allowComment: dto.allowComment ?? true,
        order: dto.order ?? 0,
        scaleMin: dto.scaleMin,
        scaleMax: dto.scaleMax,
        scaleLabels: dto.scaleLabels,
        options: dto.options,
      },
    });
    await this.audit.log({
      entity: 'Eval360QuestionnaireQuestion',
      entityId: question.id,
      action: 'CREATE',
      userId: actorId,
      details: { text: dto.text },
    });
    return question;
  }

  async removeQuestionnaireQuestion(questionnaireId: string, questionId: string, actorId: string) {
    const questionnaire = await this.findQuestionnaireOrFail(questionnaireId);
    if (questionnaire.status !== 'DRAFT')
      throw new BadRequestException(
        'Apenas questionários em rascunho podem ter perguntas removidas.',
      );
    const question = await this.prisma.eval360QuestionnaireQuestion.findFirst({
      where: { id: questionId, questionnaireId },
    });
    if (!question) throw new NotFoundException('Pergunta não encontrada neste questionário.');

    await this.prisma.eval360QuestionnaireQuestion.delete({ where: { id: questionId } });
    await this.audit.log({
      entity: 'Eval360QuestionnaireQuestion',
      entityId: questionId,
      action: 'DELETE',
      userId: actorId,
      details: {},
    });
    return { id: questionId };
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
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            department: { select: { name: true } },
          },
        })
      : [];
    const byId = new Map(users.map(u => [u.id, u]));
    return assignments.map(a => ({
      ...a,
      evaluateeName: byId.get(+a.evaluateeId)?.fullName ?? 'Colaborador',
      evaluateeDepartment: byId.get(+a.evaluateeId)?.department?.name ?? null,
      // Foto do avaliado — carregada por ele próprio (ver User.avatarUrl) —
      // pedida explicitamente no card do separador "Avaliar".
      evaluateeAvatarUrl: byId.get(+a.evaluateeId)?.avatarUrl ?? null,
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

  // Separador "Avaliados" (docs/evaluation360.md §4) — tabela de gestão dos
  // participantes de um ciclo, distinta de listMyAssignments (que é "quem eu
  // avalio") e getParticipantProgress (só a % de um participante). ADMIN/RH/
  // DIRECTOR vêem todo o ciclo; GESTOR/LIDER só a sua equipa directa
  // (managerId = actor), mesmo âmbito usado em assignEvaluators/
  // approveEvaluators. "Resultado final" só é devolvido a ADMIN/RH — decisão
  // explícita desta sessão: a regra "ninguém vê o resultado de outro"
  // (getParticipantResult) protege o colaborador de colegas/gestores, não de
  // quem administra o módulo; a identidade de avaliador individual por
  // resposta continua sempre oculta (isso não mudou).
  async listCycleParticipants(
    cycleId: string,
    query: ListCycleParticipantsDto,
    user: CurrentUserData,
  ) {
    await this.findCycleOrFail(cycleId);
    const fullAccess = isPrivileged(user, [Role.ADMIN, Role.RH, Role.DIRECTOR]);
    const canSeeScore = isPrivileged(user, [Role.ADMIN, Role.RH]);

    const where: Prisma.CycleParticipantWhereInput = { cycleId };
    if (query.status) where.status = query.status;

    const userWhere: Prisma.UserWhereInput = {};
    if (query.departmentId) userWhere.departmentId = Number(query.departmentId);
    if (!fullAccess) userWhere.managerId = user.id;
    if (Object.keys(userWhere).length) {
      const allowedUsers = await this.prisma.read.user.findMany({
        where: userWhere,
        select: { id: true },
      });
      where.userId = { in: allowedUsers.map(u => String(u.id)) };
    }

    const [participants, total] = await Promise.all([
      this.prisma.read.cycleParticipant.findMany({
        where,
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.cycleParticipant.count({ where }),
    ]);

    const userIds = participants.map(p => Number(p.userId));
    const users = userIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            fullName: true,
            employeeNumber: true,
            avatarUrl: true,
            position: { select: { name: true } },
            department: { select: { name: true } },
            unit: { select: { name: true } },
            manager: { select: { fullName: true } },
          },
        })
      : [];
    const byId = new Map(users.map(u => [u.id, u]));

    const [assignmentsByParticipant, responseCounts] = await Promise.all([
      Promise.all(
        participants.map(p =>
          this.prisma.read.evaluatorAssignment.findMany({
            where: { cycleId, evaluateeId: p.userId },
            select: { status: true },
          }),
        ),
      ),
      Promise.all(
        participants.map(p =>
          this.prisma.read.evaluationResponse.count({
            where: { cycleId, evaluateeId: p.userId, status: 'SUBMITTED' },
          }),
        ),
      ),
    ]);

    return {
      data: participants.map((p, i) => {
        const u = byId.get(Number(p.userId));
        const assignments = assignmentsByParticipant[i];
        const confirmedEvaluators = assignments.filter(a => a.status !== 'PENDING').length;
        return {
          userId: p.userId,
          fullName: u?.fullName ?? 'Colaborador',
          employeeNumber: u?.employeeNumber ?? null,
          position: u?.position?.name ?? null,
          department: u?.department?.name ?? null,
          unit: u?.unit?.name ?? null,
          managerName: u?.manager?.fullName ?? null,
          avatarUrl: u?.avatarUrl ?? null,
          evaluatorsCount: assignments.length,
          confirmedEvaluators,
          responsesReceived: responseCounts[i],
          progressPercent: assignments.length
            ? Math.round((responseCounts[i] / assignments.length) * 100)
            : 0,
          status: p.status,
          finalScore: canSeeScore ? p.finalScore : null,
          completedAt: p.completedAt,
        };
      }),
      total,
    };
  }

  // "Ao abrir um colaborador" (docs/evaluation360.md §4): perfil, competências
  // avaliadas, avaliadores atribuídos, progresso, resultados e comentários.
  // Ownership igual a listCycleParticipants (equipa directa para GESTOR/LIDER);
  // `result`/comparação entre perspectivas só sai preenchido para ADMIN/RH —
  // mesma decisão desta sessão sobre visibilidade de resultado agregado.
  // Nunca liga um comentário/resposta a um avaliador identificável — só ao
  // papel (SELF/MANAGER/PEER/...), preservando a garantia de anonimato que
  // getParticipantResult já aplica à vista pessoal.
  async getParticipantDetailForAdmin(cycleId: string, userId: string, user: CurrentUserData) {
    await this.findCycleOrFail(cycleId);
    const participant = await this.prisma.read.cycleParticipant.findUnique({
      where: { cycleId_userId: { cycleId, userId } },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado neste ciclo.');

    const fullAccess = isPrivileged(user, [Role.ADMIN, Role.RH, Role.DIRECTOR]);
    if (!fullAccess) {
      const isTeamMember = await this.prisma.read.user.count({
        where: { id: Number(userId), managerId: user.id },
      });
      if (!isTeamMember) throw new NotFoundException('Avaliado não encontrado na sua equipa.');
    }
    const canSeeScore = isPrivileged(user, [Role.ADMIN, Role.RH]);

    const [profileUser, assignments, progress, result] = await Promise.all([
      this.prisma.read.user.findUnique({
        where: { id: Number(userId) },
        select: {
          id: true,
          fullName: true,
          employeeNumber: true,
          avatarUrl: true,
          position: { select: { name: true } },
          department: { select: { name: true } },
          unit: { select: { name: true } },
          manager: { select: { fullName: true } },
        },
      }),
      this.prisma.read.evaluatorAssignment.findMany({ where: { cycleId, evaluateeId: userId } }),
      this.getParticipantProgress(cycleId, userId),
      this.prisma.read.evaluationResult.findUnique({
        where: { cycleId_participantId: { cycleId, participantId: userId } },
      }),
    ]);

    const evaluatorIds = [...new Set(assignments.map(a => Number(a.evaluatorId)))];
    const evaluators = evaluatorIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: evaluatorIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const evaluatorById = new Map(evaluators.map(e => [e.id, e]));

    // Comentários abertos (Eval360Question.type OPEN_TEXT) das respostas já
    // submetidas para este avaliado — por papel do avaliador, nunca por
    // identidade individual.
    const comments = await this.prisma.read.evaluationAnswer.findMany({
      where: {
        textValue: { not: null },
        response: { cycleId, evaluateeId: userId, status: 'SUBMITTED' },
      },
      select: {
        textValue: true,
        response: { select: { evaluatorRole: true } },
        question: {
          select: { text: true, competencyId: true, competency: { select: { name: true } } },
        },
      },
    });

    return {
      profile: {
        userId,
        fullName: profileUser?.fullName ?? 'Colaborador',
        employeeNumber: profileUser?.employeeNumber ?? null,
        position: profileUser?.position?.name ?? null,
        department: profileUser?.department?.name ?? null,
        unit: profileUser?.unit?.name ?? null,
        managerName: profileUser?.manager?.fullName ?? null,
        avatarUrl: profileUser?.avatarUrl ?? null,
      },
      competencies: result ? JSON.parse(result.scoresByCompetency ?? '{}') : {},
      evaluators: assignments.map(a => ({
        id: a.id,
        evaluatorId: a.evaluatorId,
        evaluatorName: evaluatorById.get(Number(a.evaluatorId))?.fullName ?? 'Colaborador',
        role: a.role,
        status: a.status,
        invitedAt: a.invitedAt,
        completedAt: a.completedAt,
      })),
      progress,
      status: participant.status,
      // Comparação entre perspectivas (docs/evaluation360.md §4/§7): auto vs.
      // gestor vs. pares vs. subordinados vs. global — só ADMIN/RH.
      result:
        result && canSeeScore
          ? {
              overallScore: result.overallScore,
              weightedScore: result.weightedScore,
              selfScore: result.selfScore,
              managerScore: result.managerScore,
              peerScore: result.peerScore,
              subordinateScore: result.subordinateScore,
              externalScore: result.externalScore,
              gaps: result.gaps ? JSON.parse(result.gaps) : [],
              strengths: result.strengths ? JSON.parse(result.strengths) : [],
            }
          : null,
      comments: comments.map(c => ({
        text: c.textValue,
        evaluatorRole: c.response.evaluatorRole,
        question: c.question.text,
        competencyId: c.question.competencyId,
        competencyName: c.question.competency?.name ?? null,
      })),
    };
  }

  // Separador "Resultados" (docs/evaluation360.md §7) para quem gere o
  // módulo: uma linha por (avaliado × competência) do ciclo, com a mesma
  // comparação self/gestor/pares/subordinados/outras já calculada em
  // scoresByCompetency (calculateParticipantResult). Só ADMIN/RH — mesma
  // regra de canSeeScore em getParticipantDetailForAdmin; ninguém mais vê o
  // resultado de outro utilizador (getParticipantResult continua a ser a
  // única via de acesso para o próprio colaborador ver o seu).
  async getCycleResultsMatrix(cycleId: string) {
    await this.findCycleOrFail(cycleId);

    const results = await this.prisma.read.evaluationResult.findMany({ where: { cycleId } });
    if (results.length === 0) return { data: [] };

    const userIds = results.map(r => Number(r.participantId));
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        fullName: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    const userById = new Map(users.map(u => [u.id, u]));

    const data: Array<{
      userId: string;
      fullName: string;
      position: string | null;
      department: string | null;
      competencyId: string;
      competencyName: string;
      selfScore: number | null;
      managerScore: number | null;
      peerScore: number | null;
      subordinateScore: number | null;
      externalScore: number | null;
      overallScore: number | null;
      expectedLevel: number | null;
      gap: number | null;
      responseCount: number;
    }> = [];

    for (const r of results) {
      const u = userById.get(Number(r.participantId));
      const scoresByCompetency: Record<string, CompetencyScoreEntry> = JSON.parse(
        r.scoresByCompetency ?? '{}',
      );
      for (const [competencyId, v] of Object.entries(scoresByCompetency)) {
        data.push({
          userId: r.participantId,
          fullName: u?.fullName ?? 'Colaborador',
          position: u?.position?.name ?? null,
          department: u?.department?.name ?? null,
          competencyId,
          competencyName: v.name,
          selfScore: v.selfScore,
          managerScore: v.managerScore,
          peerScore: v.peerScore,
          subordinateScore: v.subordinateScore,
          externalScore: v.externalScore,
          overallScore: v.score,
          expectedLevel: v.expectedLevel,
          gap: v.gapToExpected ?? v.gap,
          responseCount: v.responseCount,
        });
      }
    }
    return { data };
  }

  // Separador "Feedback" (docs/evaluation360.md §8) — todos os comentários
  // qualitativos (Eval360Question.type OPEN_TEXT) já submetidos num ciclo,
  // distinto do feedback contínuo (Eval360Feedback, sempre "recebido por
  // mim" fora de qualquer ciclo). Mesma regra de anonimato de
  // getParticipantDetailForAdmin: nunca liga um comentário à identidade do
  // avaliador, só ao papel — `visibility` reflecte o anonymityMode
  // configurado no ciclo, não uma identidade real exposta.
  // Ownership: ADMIN/RH/DIRECTOR veem tudo; GESTOR/LIDER só os avaliados da
  // sua equipa directa (mesmo critério de getParticipantDetailForAdmin).
  async getCycleFeedback(cycleId: string, query: CycleFeedbackQueryDto, user: CurrentUserData) {
    const cycle = await this.findCycleOrFail(cycleId);
    const fullAccess = isPrivileged(user, [Role.ADMIN, Role.RH, Role.DIRECTOR]);

    let evaluateeScope: string[] | undefined;
    if (!fullAccess) {
      const team = await this.prisma.read.user.findMany({
        where: { managerId: user.id },
        select: { id: true },
      });
      evaluateeScope = team.map(u => String(u.id));
      if (query.evaluateeId && !evaluateeScope.includes(query.evaluateeId)) {
        throw new ForbiddenException('Sem permissão para ver o feedback deste avaliado.');
      }
    }
    if (query.evaluateeId) evaluateeScope = [query.evaluateeId];
    // GESTOR/LIDER sem equipa e sem evaluateeId pedido explícito: nada a
    // devolver (não é "sem filtro" — é "ninguém no alcance").
    if (!fullAccess && (!evaluateeScope || evaluateeScope.length === 0))
      return { data: [], total: 0 };

    const answers = await this.prisma.read.evaluationAnswer.findMany({
      where: {
        textValue: { not: null },
        response: {
          cycleId,
          status: 'SUBMITTED',
          ...(evaluateeScope ? { evaluateeId: { in: evaluateeScope } } : {}),
          ...(query.evaluatorRole ? { evaluatorRole: query.evaluatorRole } : {}),
        },
        ...(query.competencyId ? { question: { competencyId: Number(query.competencyId) } } : {}),
      },
      select: {
        textValue: true,
        response: { select: { evaluateeId: true, evaluatorRole: true, submittedAt: true } },
        question: {
          select: { competencyId: true, competency: { select: { name: true } } },
        },
      },
      orderBy: { response: { submittedAt: 'desc' } },
      take: 300,
    });

    const evaluateeIds = [...new Set(answers.map(a => Number(a.response.evaluateeId)))];
    const [evaluatees, results] = await Promise.all([
      this.prisma.read.user.findMany({
        where: { id: { in: evaluateeIds } },
        select: { id: true, fullName: true },
      }),
      this.prisma.read.evaluationResult.findMany({
        where: { cycleId, participantId: { in: evaluateeIds.map(String) } },
        select: { participantId: true, scoresByCompetency: true },
      }),
    ]);
    const evaluateeById = new Map(evaluatees.map(u => [u.id, u]));
    const scoresByParticipant = new Map(
      results.map(r => [
        r.participantId,
        JSON.parse(r.scoresByCompetency ?? '{}') as Record<string, CompetencyScoreEntry>,
      ]),
    );

    const visibilityLabel: Record<AnonymityMode, string> = {
      ANONYMOUS: 'Anónimo',
      SEMI_ANONYMOUS: 'Semi-anónimo',
      OPEN: 'Identificado',
    };

    const data = answers.map(a => {
      const competencyScore = a.question.competencyId
        ? scoresByParticipant.get(a.response.evaluateeId)?.[String(a.question.competencyId)]?.score
        : null;
      // "Pode separar: pontos fortes / oportunidades de melhoria" (§8) — sem
      // um campo de categoria próprio no schema, deriva-se da pontuação já
      // calculada para a mesma competência deste avaliado (>=4 ponto forte,
      // <=2.5 oportunidade de melhoria), nunca inventado a partir do texto.
      const category =
        competencyScore == null
          ? null
          : competencyScore >= 4
            ? 'STRENGTH'
            : competencyScore <= 2.5
              ? 'IMPROVEMENT'
              : null;
      return {
        evaluateeId: a.response.evaluateeId,
        evaluateeName: evaluateeById.get(Number(a.response.evaluateeId))?.fullName ?? 'Colaborador',
        competencyId: a.question.competencyId ? String(a.question.competencyId) : null,
        competencyName: a.question.competency?.name ?? null,
        comment: a.textValue,
        evaluatorRole: a.response.evaluatorRole,
        date: a.response.submittedAt,
        status: 'SUBMITTED' as const,
        visibility: visibilityLabel[cycle.anonymityMode],
        category,
      };
    });

    return { data, total: data.length };
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

  // Separador "Avaliadores" (docs/evaluation360.md §5) — tabela de gestão das
  // atribuições de um ciclo, uma linha por EvaluatorAssignment (avaliador +
  // avaliado). Mesmo âmbito de acesso de listCycleParticipants: ADMIN/RH/
  // DIRECTOR vêem tudo, GESTOR/LIDER só atribuições cujo avaliado é da sua
  // equipa directa. "Relação com o avaliado" e "Tipo de avaliador" pedidos
  // como colunas separadas no documento mapeiam para o mesmo campo `role` —
  // o schema não guarda um segundo campo distinto (o `reason` textual usado
  // em buildEvaluatorSuggestions é só efémero, nunca persistido); cabe ao
  // frontend apresentar os dois rótulos a partir do mesmo valor.
  async listCycleEvaluators(cycleId: string, query: ListCycleEvaluatorsDto, user: CurrentUserData) {
    await this.findCycleOrFail(cycleId);
    const fullAccess = isPrivileged(user, [Role.ADMIN, Role.RH, Role.DIRECTOR]);

    const where: Prisma.EvaluatorAssignmentWhereInput = { cycleId };
    if (query.status) where.status = query.status;
    if (query.role) where.role = query.role;
    if (query.evaluateeId) where.evaluateeId = query.evaluateeId;

    if (!fullAccess) {
      const teamMembers = await this.prisma.read.user.findMany({
        where: { managerId: user.id },
        select: { id: true },
      });
      const teamIds = teamMembers.map(u => String(u.id));
      where.evaluateeId = query.evaluateeId
        ? teamIds.includes(query.evaluateeId)
          ? query.evaluateeId
          : '__none__'
        : { in: teamIds };
    }

    const [assignments, total] = await Promise.all([
      this.prisma.read.evaluatorAssignment.findMany({
        where,
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.evaluatorAssignment.count({ where }),
    ]);

    const userIds = [
      ...new Set([
        ...assignments.map(a => Number(a.evaluatorId)),
        ...assignments.map(a => Number(a.evaluateeId)),
      ]),
    ];
    const users = userIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: userIds } },
          select: {
            id: true,
            fullName: true,
            position: { select: { name: true } },
            department: { select: { name: true } },
          },
        })
      : [];
    const byId = new Map(users.map(u => [u.id, u]));

    // Progresso do avaliador: quantas das SUAS atribuições neste ciclo
    // (não só a desta linha) já estão concluídas — pedido explicitamente
    // como coluna "Progresso" em docs/evaluation360.md §5.
    const evaluatorIds = [...new Set(assignments.map(a => a.evaluatorId))];
    const allAssignmentsByEvaluator = evaluatorIds.length
      ? await this.prisma.read.evaluatorAssignment.findMany({
          where: { cycleId, evaluatorId: { in: evaluatorIds } },
          select: { evaluatorId: true, status: true },
        })
      : [];
    const progressByEvaluator = new Map<string, { total: number; completed: number }>();
    for (const a of allAssignmentsByEvaluator) {
      const entry = progressByEvaluator.get(a.evaluatorId) ?? { total: 0, completed: 0 };
      entry.total++;
      if (a.status === 'COMPLETED') entry.completed++;
      progressByEvaluator.set(a.evaluatorId, entry);
    }

    return {
      data: assignments.map(a => {
        const evaluator = byId.get(Number(a.evaluatorId));
        const evaluatee = byId.get(Number(a.evaluateeId));
        const progress = progressByEvaluator.get(a.evaluatorId) ?? { total: 0, completed: 0 };
        return {
          id: a.id,
          evaluatorId: a.evaluatorId,
          evaluatorName: evaluator?.fullName ?? 'Colaborador',
          position: evaluator?.position?.name ?? null,
          department: evaluator?.department?.name ?? null,
          role: a.role,
          evaluateeId: a.evaluateeId,
          evaluateeName: evaluatee?.fullName ?? 'Colaborador',
          invitedAt: a.invitedAt,
          respondedAt: a.completedAt,
          status: a.status,
          progressPercent: progress.total
            ? Math.round((progress.completed / progress.total) * 100)
            : 0,
        };
      }),
      total,
    };
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
    const existingKeys = new Set(existing.map(a => `${a.evaluateeId}:${a.evaluatorId}:${a.role}`));

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
      details: {
        participants: participants.length,
        assignmentsCreated: created,
        invitesSent: sent,
      },
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
    if (!cycle || cycle.deletedAt) throw new NotFoundException('Ciclo não encontrado.');

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
    const expectedLevelByCompetency = new Map(
      cycle.competencies.map(c => [c.competencyId, c.expectedLevel ?? null]),
    );

    for (const cc of cycle.competencies) {
      const comp = cc.competency;
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
      const subVals = compAnswers.filter(a => a.role === 'SUBORDINATE').map(a => a.value);
      const extVals = compAnswers.filter(a => a.role === 'EXTERNAL').map(a => a.value);

      const avg = (arr: number[]) =>
        arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      const score = avg(allVals);
      const selfCompScore = avg(selfVals);
      const othersCompScore = avg(otherVals);
      const gap =
        selfCompScore !== null && othersCompScore !== null ? selfCompScore - othersCompScore : null;
      // Mesmo quorum aplicado ao peerScore agregado acima (linha ~1105): sem
      // isto, um par abaixo do quorum ficava protegido no cartão "Pares" mas
      // continuava exposto aqui, por competência — na prática destapando a
      // resposta individual desse par (n=1 ou 2) no radar/heatmap. A
      // anonimato é por definição do produto, não só no resumo.
      const peerCompScore = peerResponses.length >= cycle.quorumMinimum ? avg(peerVals) : null;
      // Nº de respostas efectivamente contabilizadas nesta competência —
      // exclui os valores de pares escondidos pelo quorum, tal como
      // peerCompScore acima (docs/evaluation360.md §7 "Nº de respostas").
      const responseCount =
        selfVals.length +
        managerVals.length +
        (peerResponses.length >= cycle.quorumMinimum ? peerVals.length : 0) +
        subVals.length +
        extVals.length;
      const expectedLevel = expectedLevelByCompetency.get(comp.id) ?? null;
      const gapToExpected = score !== null && expectedLevel !== null ? score - expectedLevel : null;

      scoresByCompetency[comp.id] = {
        name: comp.name,
        category: comp.category,
        type: comp.type,
        score,
        selfScore: selfCompScore,
        othersScore: othersCompScore,
        managerScore: avg(managerVals),
        peerScore: peerCompScore,
        subordinateScore: avg(subVals),
        externalScore: avg(extVals),
        responseCount,
        gap,
        benchmark: benchmarks[comp.id] ?? null,
        expectedLevel,
        gapToExpected,
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
    // — nem ADMIN nem RH têm excepção aqui. getTeamAnalytics/
    // getOrganizationalAnalytics continuam a existir mas só devolvem dados
    // agregados (médias, contagens) sem identificar ninguém; calibrateScore
    // foi removido — calibrar era, por definição, aceder/substituir o
    // resultado individual de outra pessoa. requesterId chega como number
    // (User.id via JWT) e participantId como string (route param) —
    // comparação estrita nunca era true sem o String().
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

  // Analytics agregados da equipa de um gestor — nunca resultados
  // individuais. Devolvia antes participantId/participantName + score/gaps/
  // strengths por pessoa, o que violava a mesma regra de getParticipantResult
  // (ninguém vê o resultado de outro, nem sequer o próprio gestor sobre um
  // subordinado). Agora só médias/contagens da equipa como um todo, no mesmo
  // espírito de getOrganizationalAnalytics — dá ao gestor o pulso da equipa
  // sem identificar ninguém.
  async getTeamAnalytics(cycleId: string, managerId: string) {
    const managedUsers = await this.prisma.user.findMany({
      where: { managerId: +managerId },
      select: { id: true },
    });
    const teamSize = managedUsers.length;
    if (teamSize === 0) {
      return {
        teamSize: 0,
        evaluatedCount: 0,
        avgOverall: 0,
        avgWeighted: 0,
        eligiblePromotionCount: 0,
        eligibleBonusCount: 0,
        competencyAverages: [],
      };
    }

    const results = await this.prisma.evaluationResult.findMany({
      where: { cycleId, participantId: { in: managedUsers.map(u => String(u.id)) } },
      select: {
        overallScore: true,
        weightedScore: true,
        scoresByCompetency: true,
        isEligiblePromotion: true,
        isEligibleBonus: true,
      },
    });

    const avgOverall = results.length
      ? results.reduce((s, r) => s + r.overallScore, 0) / results.length
      : 0;
    const avgWeighted = results.length
      ? results.reduce((s, r) => s + r.weightedScore, 0) / results.length
      : 0;

    return {
      teamSize,
      evaluatedCount: results.length,
      avgOverall,
      avgWeighted,
      eligiblePromotionCount: results.filter(r => r.isEligiblePromotion).length,
      eligibleBonusCount: results.filter(r => r.isEligibleBonus).length,
      competencyAverages: this.averageCompetencyScores(results),
    };
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

    return {
      totalParticipants: results.length,
      avgOverall,
      avgWeighted,
      eligiblePromotion,
      competencyAverages: this.averageCompetencyScores(results),
    };
  }

  // Média por competência entre participantes (cross-participants) — usado
  // por getTeamAnalytics e getOrganizationalAnalytics, os dois analytics
  // agregados que sobrevivem à regra "ninguém vê o resultado de outro".
  private averageCompetencyScores(
    results: { scoresByCompetency: string | null }[],
  ): { competencyId: string; average: number }[] {
    const compScores: Record<string, number[]> = {};
    for (const r of results) {
      const sc: Record<string, CompetencyScoreEntry> = JSON.parse(r.scoresByCompetency ?? '{}');
      for (const [cId, data] of Object.entries(sc)) {
        if (!compScores[cId]) compScores[cId] = [];
        if (data.score !== null) compScores[cId].push(data.score);
      }
    }
    return Object.entries(compScores).map(([competencyId, scores]) => ({
      competencyId,
      average: scores.reduce((s, v) => s + v, 0) / scores.length,
    }));
  }

  // Variante de averageCompetencyScores() que preserva o nome (a versão
  // simples só guarda o id) — usado por getOverview() para "Competências com
  // maior/menor pontuação" (docs/evaluation360.md §1), que precisam de um
  // rótulo apresentável, não só o id interno.
  private averageCompetencyScoresNamed(
    results: { scoresByCompetency: string | null }[],
  ): { competencyId: string; name: string; average: number }[] {
    const compScores: Record<string, { name: string; scores: number[] }> = {};
    for (const r of results) {
      const sc: Record<string, CompetencyScoreEntry> = JSON.parse(r.scoresByCompetency ?? '{}');
      for (const [cId, data] of Object.entries(sc)) {
        if (!compScores[cId]) compScores[cId] = { name: data.name, scores: [] };
        if (data.score !== null) compScores[cId].scores.push(data.score);
      }
    }
    return Object.entries(compScores)
      .filter(([, v]) => v.scores.length > 0)
      .map(([competencyId, v]) => ({
        competencyId,
        name: v.name,
        average: v.scores.reduce((s, x) => s + x, 0) / v.scores.length,
      }));
  }

  // Painel geral (docs/evaluation360.md §1) — visão agregada de todos os
  // ciclos 360° de um tenant, sem identificar ninguém individualmente (mesma
  // regra de getTeamAnalytics/getOrganizationalAnalytics).
  async getOverview(tenantId?: string) {
    const cycles = await this.prisma.eval360Cycle.findMany({
      where: { deletedAt: null, ...(tenantId ? { tenantId } : {}) },
      select: {
        id: true,
        name: true,
        status: true,
        endDate: true,
        updatedAt: true,
        createdBy: true,
      },
    });
    const cycleIds = cycles.map(c => c.id);
    const countByStatus = (status: Eval360CycleStatus) =>
      cycles.filter(c => c.status === status).length;
    // "Encerradas" (docs/evaluation360.md §1) não é o enum CANCELLED — esse
    // mapeia para "Arquivada" no vocabulário de 8 estados apresentáveis
    // (ver cycleStatusDisplay no frontend, components/evaluation360/colors.ts).
    // Aqui significa um ciclo cujo prazo já passou mas que ainda não foi
    // processado/concluído — mesma semântica derivada de data, não um valor
    // de BD próprio. "Abertas"/"Em preenchimento" excluem estes casos para
    // não contar o mesmo ciclo em dois baldes.
    const now = new Date();
    const isPastDeadline = (c: { status: string; endDate: Date }) =>
      (c.status === 'PUBLISHED' || c.status === 'IN_PROGRESS') && c.endDate < now;
    const openCount = cycles.filter(c => c.status === 'PUBLISHED' && !isPastDeadline(c)).length;
    const inProgressCount = cycles.filter(
      c => c.status === 'IN_PROGRESS' && !isPastDeadline(c),
    ).length;
    const closedCount = cycles.filter(isPastDeadline).length;

    const [participants, assignments, results] = await Promise.all([
      this.prisma.cycleParticipant.findMany({
        where: { cycleId: { in: cycleIds } },
        select: { userId: true, status: true },
      }),
      this.prisma.evaluatorAssignment.findMany({
        where: { cycleId: { in: cycleIds } },
        select: { evaluatorId: true, invitedAt: true, status: true },
      }),
      this.prisma.evaluationResult.findMany({
        where: { cycleId: { in: cycleIds } },
        select: { overallScore: true, scoresByCompetency: true },
      }),
    ]);

    const evaluatedUserIds = new Set(participants.map(p => p.userId));
    const invitedEvaluatorIds = new Set(
      assignments.filter(a => a.invitedAt !== null).map(a => a.evaluatorId),
    );
    const respondedEvaluatorIds = new Set(
      assignments.filter(a => a.status === 'COMPLETED').map(a => a.evaluatorId),
    );
    const pendingAssignments = assignments.filter(
      a => a.status === 'PENDING' || a.status === 'INVITED' || a.status === 'IN_PROGRESS',
    ).length;
    const completedParticipants = participants.filter(p => p.status === 'COMPLETED').length;

    const avgOverall = results.length
      ? results.reduce((s, r) => s + (r.overallScore ?? 0), 0) / results.length
      : 0;
    const competencyAverages = this.averageCompetencyScoresNamed(results).sort(
      (a, b) => b.average - a.average,
    );

    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingDeadline = cycles
      .filter(
        c =>
          (c.status === 'PUBLISHED' || c.status === 'IN_PROGRESS') &&
          c.endDate >= now &&
          c.endDate <= in7Days,
      )
      .sort((a, b) => a.endDate.getTime() - b.endDate.getTime())
      .map(c => ({ id: c.id, name: c.name, endDate: c.endDate }));

    const recentCompletedCycles = cycles
      .filter(c => c.status === 'COMPLETED')
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 5);
    const creatorNames = await this.resolveActorNames(recentCompletedCycles.map(c => c.createdBy));
    const recentCompleted = recentCompletedCycles.map(c => ({
      id: c.id,
      name: c.name,
      endDate: c.endDate,
      createdByName: creatorNames.get(c.createdBy) ?? c.createdBy,
    }));

    return {
      totalCycles: cycles.length,
      inPreparation: countByStatus('DRAFT'),
      open: openCount,
      inProgress: inProgressCount,
      completed: countByStatus('COMPLETED'),
      closed: closedCount,
      evaluatedCount: evaluatedUserIds.size,
      invitedEvaluatorsCount: invitedEvaluatorIds.size,
      respondedEvaluatorsCount: respondedEvaluatorIds.size,
      participationRate: invitedEvaluatorIds.size
        ? Math.round((respondedEvaluatorIds.size / invitedEvaluatorIds.size) * 100)
        : 0,
      completionRate: participants.length
        ? Math.round((completedParticipants / participants.length) * 100)
        : 0,
      avgOverall,
      competencyAverages,
      topCompetencies: competencyAverages.slice(0, 3),
      bottomCompetencies: competencyAverages.slice(-3).reverse(),
      pendingAssignments,
      upcomingDeadline,
      recentCompleted,
    };
  }

  // Nine-Box agregado — regra "ninguém vê o resultado de outro" (a mesma já
  // aplicada a getTeamAnalytics/calibrateScore): a versão anterior devolvia
  // nome+score reais por participante, isto é, exactamente o "cartão
  // individual de outra pessoa" que a regra proíbe — incluindo a GESTOR
  // sobre os seus próprios subordinados (por isso GESTOR perdeu o acesso a
  // esta rota, ver controller). Devolve agora só a contagem de pessoas por
  // quadrante, sempre os 9 quadrantes (mesmo a 0), para ADMIN/RH terem o
  // retrato de distribuição de talento sem identificar ninguém.
  // Eixo Performance (X) — média das fontes reais disponíveis por
  // participante (ignora as que não têm dado ainda, nunca inventa um valor):
  //   • Avaliação de desempenho → PerformanceReview.score (última review
  //     submetida), normalizado pela escala do próprio ciclo (cycle.scoreScale)
  //   • Objetivos/KPIs → Objective.progress, média ponderada por Objective.weight
  //   • Competências → média de scoresByCompetency desta própria avaliação 360º
  //   • Resultados individuais → EvaluationResult.weightedScore (o resultado
  //     global desta avaliação 360º)
  //
  // Eixo Potencial (Y) — cobre os 9 sub-fatores pedidos, consolidados em 7
  // conceitos distintos (decisão do utilizador: "Capacidade de aprendizagem"
  // e "Agilidade de aprendizagem" unificadas; idem "Liderança" e "Potencial
  // de liderança"):
  //   • PerformanceReview.potentialScore — nota geral de potencial do gestor
  //   • Competências de categoria LEADERSHIP (cobre Liderança/Potencial de
  //     liderança), tanto da review de performance como da própria 360º
  //   • PerformanceReview.{learningAgilityScore, adaptabilityScore,
  //     ambitionScore, responsibilityReadinessScore, mobilityFlexibilityScore,
  //     futureRoleReadinessScore} — os 6 sub-fatores restantes, capturados
  //     pelo gestor no submitReview (1-5 cada), tratados como um único bloco
  //     médio para não afogar potentialScore/liderança quando só alguns estão
  //     preenchidos
  // Sem nenhuma das fontes acima, cai-se de volta no proxy antigo (selfScore)
  // para não deixar o participante fora da matriz.
  //
  // NOTA: a UI de submissão de review (onde o gestor preencheria estes
  // campos) ainda não existe no frontend — gap pré-existente, também para o
  // potentialScore que já cá estava. Fica registado, não construído aqui.
  async getNineBox(query: NineBoxQueryDto) {
    const where: Prisma.EvaluationResultWhereInput = { cycleId: query.cycleId };
    if (query.departmentId) {
      const deptUsers = await this.prisma.user.findMany({
        where: { departmentId: Number(query.departmentId) },
        select: { id: true },
      });
      where.participantId = { in: deptUsers.map(u => String(u.id)) };
    }

    const results = await this.prisma.evaluationResult.findMany({
      where,
      select: {
        participantId: true,
        weightedScore: true,
        selfScore: true,
        scoresByCompetency: true,
      },
    });

    const numericIds = [
      ...new Set(results.map(r => Number(r.participantId)).filter(id => !Number.isNaN(id))),
    ];

    // Última review submetida (com score ou potentialScore) por utilizador —
    // findMany já vem ordenada desc, por isso o primeiro encontro por userId é o mais recente.
    const reviews = await this.prisma.performanceReview.findMany({
      where: {
        userId: { in: numericIds },
        OR: [{ score: { not: null } }, { potentialScore: { not: null } }],
      },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        score: true,
        potentialScore: true,
        learningAgilityScore: true,
        adaptabilityScore: true,
        ambitionScore: true,
        responsibilityReadinessScore: true,
        mobilityFlexibilityScore: true,
        futureRoleReadinessScore: true,
        cycle: { select: { scoreScale: true } },
      },
    });
    const latestReviewByUser = new Map<number, (typeof reviews)[number]>();
    for (const r of reviews)
      if (!latestReviewByUser.has(r.userId)) latestReviewByUser.set(r.userId, r);
    const latestReviewIds = [...latestReviewByUser.values()].map(r => r.id);

    // CompetencyEvaluation não tem relation Prisma para Competency (só
    // competencyId escalar) — resolve-se a categoria com uma 2ª query, nunca
    // com um `where: { competency: {...} }` aninhado (essa relation não existe).
    const reviewCompetencyEvals = latestReviewIds.length
      ? await this.prisma.competencyEvaluation.findMany({
          where: { reviewId: { in: latestReviewIds } },
          select: { reviewId: true, competencyId: true, evaluatedLevel: true },
        })
      : [];
    const evaluatedCompIds = [...new Set(reviewCompetencyEvals.map(e => e.competencyId))];
    const leadershipCompIds = evaluatedCompIds.length
      ? new Set(
          (
            await this.prisma.competency.findMany({
              where: { id: { in: evaluatedCompIds }, category: 'LEADERSHIP' },
              select: { id: true },
            })
          ).map(c => c.id),
        )
      : new Set<number>();
    const reviewIdToUserId = new Map([...latestReviewByUser.values()].map(r => [r.id, r.userId]));
    const leadershipLevelsByUser = new Map<number, number[]>();
    for (const ev of reviewCompetencyEvals) {
      if (!leadershipCompIds.has(ev.competencyId)) continue;
      const userId = reviewIdToUserId.get(ev.reviewId);
      if (userId === undefined) continue;
      if (!leadershipLevelsByUser.has(userId)) leadershipLevelsByUser.set(userId, []);
      leadershipLevelsByUser.get(userId)!.push(ev.evaluatedLevel);
    }

    // Objectivos/KPIs — progresso médio ponderado por objectivo, ignora rascunhos.
    const objectives = numericIds.length
      ? await this.prisma.objective.findMany({
          where: { ownerId: { in: numericIds }, status: { not: 'DRAFT' }, deletedAt: null },
          select: { ownerId: true, progress: true, weight: true },
        })
      : [];
    const objectivesByUser = new Map<number, { total: number; weight: number }>();
    for (const o of objectives) {
      const acc = objectivesByUser.get(o.ownerId) ?? { total: 0, weight: 0 };
      acc.total += o.progress * o.weight;
      acc.weight += o.weight;
      objectivesByUser.set(o.ownerId, acc);
    }

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const pct = (value: number | null | undefined, max: number): number | null =>
      value === null || value === undefined || max <= 0
        ? null
        : Math.min(1, Math.max(0, value / max));

    const levels = ['LOW', 'MID', 'HIGH'] as const;
    const counts = new Map<string, number>();
    for (const perf of levels) for (const pot of levels) counts.set(`${perf}_${pot}`, 0);

    for (const r of results) {
      const userId = Number(r.participantId);
      const review = latestReviewByUser.get(userId);
      const leadershipLevels = leadershipLevelsByUser.get(userId) ?? [];

      const scoresByCompetency: Record<string, CompetencyScoreEntry> = JSON.parse(
        r.scoresByCompetency ?? '{}',
      );
      const compEntries = Object.values(scoresByCompetency).filter(
        (v): v is CompetencyScoreEntry & { score: number } => v.score !== null,
      );
      const compLeadershipScores = compEntries
        .filter(v => v.category === 'LEADERSHIP')
        .map(v => v.score);

      const objAgg = objectivesByUser.get(userId);

      const perfSources = [
        pct(review?.score ?? null, review?.cycle.scoreScale ?? 5),
        objAgg && objAgg.weight > 0 ? pct(objAgg.total / objAgg.weight, 100) : null,
        compEntries.length ? pct(avg(compEntries.map(v => v.score)), 5) : null,
        pct(r.weightedScore, 5),
      ].filter((v): v is number => v !== null);
      const perf = perfSources.length ? avg(perfSources) : 0;

      const leadershipRatio = [
        ...leadershipLevels.map(v => v / 5),
        ...compLeadershipScores.map(v => v / 5),
      ];
      const subFactorScores = [
        review?.learningAgilityScore,
        review?.adaptabilityScore,
        review?.ambitionScore,
        review?.responsibilityReadinessScore,
        review?.mobilityFlexibilityScore,
        review?.futureRoleReadinessScore,
      ].filter((v): v is number => v !== null && v !== undefined);
      const potSources = [
        pct(review?.potentialScore ?? null, 5),
        leadershipRatio.length ? avg(leadershipRatio) : null,
        subFactorScores.length ? avg(subFactorScores.map(v => v / 5)) : null,
      ].filter((v): v is number => v !== null);
      const potential = potSources.length
        ? avg(potSources)
        : (pct(r.selfScore ?? r.weightedScore, 5) ?? 0);

      const perfBox = perf >= 0.67 ? 'HIGH' : perf >= 0.33 ? 'MID' : 'LOW';
      const potBox = potential >= 0.67 ? 'HIGH' : potential >= 0.33 ? 'MID' : 'LOW';
      const key = `${perfBox}_${potBox}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return levels.flatMap(potential =>
      levels.map(performance => ({
        performance,
        potential,
        box: `${performance}_${potential}`,
        count: counts.get(`${performance}_${potential}`) ?? 0,
      })),
    );
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
    const competencyIds = [
      ...new Set(data.map(f => f.competencyId).filter((id): id is number => id != null)),
    ];
    const [fromUsers, competencies] = await Promise.all([
      fromIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: fromIds } },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([]),
      competencyIds.length
        ? this.prisma.competency.findMany({
            where: { id: { in: competencyIds } },
            select: { id: true, name: true },
          })
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

  // Nota: calibrateScore() (matriz de calibração RH) foi removido — calibrar
  // era, por definição, ler e substituir o resultado individual de outra
  // pessoa, o que a regra "ninguém vê o resultado de outro" já não permite.

  // ============================================================
  // RELATÓRIOS
  // ============================================================

  async generateReport(dto: GenerateReportDto, requesterId: string) {
    const cycle = await this.findCycleOrFail(dto.cycleId);
    if (dto.scope === 'INDIVIDUAL' && dto.participantId) {
      // Mesma regra explícita de getParticipantResult: ninguém vê o
      // resultado de outro utilizador, nem ADMIN nem RH nem o GESTOR sobre
      // um subordinado — este endpoint tinha ficado de fora dessa auditoria
      // e devolvia o resultado individual completo de qualquer participantId
      // a quem tivesse role ADMIN/RH/GESTOR (ver @Roles em
      // evaluation360.controller.ts#generateReport).
      if (String(requesterId) !== String(dto.participantId)) {
        throw new ForbiddenException('Sem permissão para ver este resultado.');
      }
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

  // Relatório completo de um ciclo (docs/evaluation360.md §9) — cobre todos
  // os relatórios pedidos no documento que fazem sentido para UM ciclo
  // concreto (resultado geral, por competência/departamento/cargo/unidade/
  // grupo de avaliador, comparações, pontos fortes/gaps agregados, taxas,
  // avaliadores pendentes, competências críticas). "Evolução"/"Comparação
  // entre ciclos" ficam em getCycleEvolution(), que atravessa vários ciclos.
  async getCycleReport(cycleId: string, query: CycleReportQueryDto) {
    const cycle = await this.findCycleOrFail(cycleId);

    let participantScope: string[] | undefined;
    if (query.departmentId || query.unitId || query.positionId) {
      const userWhere: Prisma.UserWhereInput = {};
      if (query.departmentId) userWhere.departmentId = Number(query.departmentId);
      if (query.unitId) userWhere.unitId = Number(query.unitId);
      if (query.positionId) userWhere.positionId = Number(query.positionId);
      const matching = await this.prisma.read.user.findMany({
        where: userWhere,
        select: { id: true },
      });
      participantScope = matching.map(u => String(u.id));
    }

    const results = await this.prisma.read.evaluationResult.findMany({
      where: {
        cycleId,
        ...(participantScope ? { participantId: { in: participantScope } } : {}),
      },
      select: {
        participantId: true,
        overallScore: true,
        weightedScore: true,
        selfScore: true,
        managerScore: true,
        peerScore: true,
        subordinateScore: true,
        externalScore: true,
        scoresByCompetency: true,
        gaps: true,
        strengths: true,
        isEligiblePromotion: true,
      },
    });

    const participantIds = results.map(r => Number(r.participantId));
    const users = participantIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: participantIds } },
          select: {
            id: true,
            position: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            unit: { select: { id: true, name: true } },
          },
        })
      : [];
    const userById = new Map(users.map(u => [u.id, u]));

    const avg = (values: (number | null | undefined)[]): number | null => {
      const v = values.filter((x): x is number => x !== null && x !== undefined);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    };

    // Resultado geral 360°
    const overall = {
      totalParticipants: results.length,
      avgOverall: avg(results.map(r => r.overallScore)) ?? 0,
      avgWeighted: avg(results.map(r => r.weightedScore)) ?? 0,
      eligiblePromotion: results.filter(r => r.isEligiblePromotion).length,
    };

    // Resultados por competência (filtrável por uma competência específica)
    let byCompetency = this.averageCompetencyScoresNamed(results);
    if (query.competencyId)
      byCompetency = byCompetency.filter(c => c.competencyId === query.competencyId);

    // Resultados por departamento/cargo/unidade — agrupa pela dimensão do
    // avaliado (não da competência), média do overallScore por grupo.
    const groupBy = (
      pick: (u: {
        id: number;
        position: { id: number; name: string } | null;
        department: { id: number; name: string } | null;
        unit: { id: number; name: string } | null;
      }) => { id: number; name: string } | null,
    ) => {
      const buckets = new Map<number, { name: string; scores: number[] }>();
      for (const r of results) {
        const u = userById.get(Number(r.participantId));
        const dim = u ? pick(u) : null;
        if (!dim || r.overallScore === null) continue;
        if (!buckets.has(dim.id)) buckets.set(dim.id, { name: dim.name, scores: [] });
        buckets.get(dim.id)?.scores.push(r.overallScore);
      }
      return [...buckets.entries()]
        .map(([id, v]) => ({
          id: String(id),
          name: v.name,
          average: v.scores.reduce((s, x) => s + x, 0) / v.scores.length,
          count: v.scores.length,
        }))
        .sort((a, b) => b.average - a.average);
    };
    const byDepartment = groupBy(u => u.department);
    const byPosition = groupBy(u => u.position);
    const byUnit = groupBy(u => u.unit);

    // Resultados por grupo de avaliadores + comparações pedidas em §9
    const byEvaluatorGroup = {
      self: avg(results.map(r => r.selfScore)),
      manager: avg(results.map(r => r.managerScore)),
      peer: avg(results.map(r => r.peerScore)),
      subordinate: avg(results.map(r => r.subordinateScore)),
      external: avg(results.map(r => r.externalScore)),
    };
    const compare = (a: number | null, b: number | null) => ({
      a,
      b,
      diff: a !== null && b !== null ? a - b : null,
    });
    const selfVsExternal = compare(byEvaluatorGroup.self, byEvaluatorGroup.external);
    const managerVsPeer = compare(byEvaluatorGroup.manager, byEvaluatorGroup.peer);
    const managerVsSubordinate = compare(byEvaluatorGroup.manager, byEvaluatorGroup.subordinate);

    // Principais pontos fortes / principais gaps — agregados a partir de
    // EvaluationResult.strengths/gaps (já calculados por participante em
    // calculateParticipantResult), contados por competência em todo o ciclo.
    const aggregateNamed = (field: 'strengths' | 'gaps') => {
      const buckets = new Map<string, { name: string; scores: number[]; count: number }>();
      for (const r of results) {
        const list: (CompetencyStrengthEntry | CompetencyGapEntry)[] = r[field]
          ? JSON.parse(r[field])
          : [];
        for (const entry of list) {
          if (!buckets.has(entry.competencyId))
            buckets.set(entry.competencyId, { name: entry.name, scores: [], count: 0 });
          const b = buckets.get(entry.competencyId);
          if (!b) continue;
          b.count += 1;
          if (entry.score !== null) b.scores.push(entry.score);
        }
      }
      return [...buckets.entries()]
        .map(([competencyId, v]) => ({
          competencyId,
          name: v.name,
          occurrences: v.count,
          avgScore: v.scores.length ? v.scores.reduce((s, x) => s + x, 0) / v.scores.length : null,
        }))
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 10);
    };
    const topStrengths = aggregateNamed('strengths');
    const topGaps = aggregateNamed('gaps');

    // Taxa de participação / taxa de conclusão — mesmo cálculo de
    // getOverview(), mas restrito a este ciclo.
    const [assignments, participants] = await Promise.all([
      this.prisma.read.evaluatorAssignment.findMany({
        where: { cycleId },
        select: { evaluatorId: true, evaluateeId: true, status: true, role: true },
      }),
      this.prisma.read.cycleParticipant.findMany({ where: { cycleId }, select: { status: true } }),
    ]);
    const invitedEvaluatorIds = new Set(assignments.map(a => a.evaluatorId));
    const respondedEvaluatorIds = new Set(
      assignments.filter(a => a.status === 'COMPLETED').map(a => a.evaluatorId),
    );
    const participationRate = invitedEvaluatorIds.size
      ? Math.round((respondedEvaluatorIds.size / invitedEvaluatorIds.size) * 100)
      : 0;
    const completionRate = participants.length
      ? Math.round(
          (participants.filter(p => p.status === 'COMPLETED').length / participants.length) * 100,
        )
      : 0;

    // Avaliadores pendentes — lista + contagem, filtrável por grupo de
    // avaliador (query.evaluatorRole aplica-se aqui, é o único ponto do
    // relatório onde "Grupo de avaliador" filtra uma lista e não uma média).
    const pendingAssignments = await this.prisma.read.evaluatorAssignment.findMany({
      where: {
        cycleId,
        status: { in: ['PENDING', 'INVITED', 'IN_PROGRESS'] },
        ...(query.evaluatorRole ? { role: query.evaluatorRole } : {}),
      },
      select: { evaluatorId: true, evaluateeId: true, role: true, status: true, invitedAt: true },
      take: 200,
    });
    const pendingUserIds = [
      ...new Set(pendingAssignments.flatMap(a => [Number(a.evaluatorId), Number(a.evaluateeId)])),
    ];
    const pendingUsers = pendingUserIds.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: pendingUserIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const pendingUserById = new Map(pendingUsers.map(u => [u.id, u.fullName]));
    const pendingEvaluators = {
      count: pendingAssignments.length,
      list: pendingAssignments.map(a => ({
        evaluatorId: a.evaluatorId,
        evaluatorName: pendingUserById.get(Number(a.evaluatorId)) ?? 'Colaborador',
        evaluateeId: a.evaluateeId,
        evaluateeName: pendingUserById.get(Number(a.evaluateeId)) ?? 'Colaborador',
        role: a.role,
        status: a.status,
        invitedAt: a.invitedAt,
      })),
    };

    // Competências críticas — média abaixo do nível esperado configurado no
    // ciclo (Eval360CycleCompetency.expectedLevel), ordenadas pelo maior gap.
    const cycleCompetencies = await this.prisma.read.eval360CycleCompetency.findMany({
      where: { cycleId },
      select: { competencyId: true, expectedLevel: true },
    });
    const expectedById = new Map(
      cycleCompetencies.map(c => [String(c.competencyId), c.expectedLevel]),
    );
    const criticalCompetencies = byCompetency
      .map(c => {
        const expectedLevel = expectedById.get(c.competencyId) ?? null;
        return {
          ...c,
          expectedLevel,
          gapToExpected: expectedLevel !== null ? c.average - expectedLevel : null,
        };
      })
      .filter(c => c.gapToExpected !== null && c.gapToExpected < 0)
      .sort((a, b) => (a.gapToExpected ?? 0) - (b.gapToExpected ?? 0));

    return {
      cycle: {
        id: cycle.id,
        name: cycle.name,
        status: cycle.status,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
      },
      overall,
      byCompetency,
      byDepartment,
      byPosition,
      byUnit,
      byEvaluatorGroup,
      selfVsExternal,
      managerVsPeer,
      managerVsSubordinate,
      topStrengths,
      topGaps,
      participationRate,
      completionRate,
      pendingEvaluators,
      criticalCompetencies,
    };
  }

  // "Evolução entre ciclos"/"Comparação entre ciclos" (docs/evaluation360.md
  // §9) — uma série de métricas agregadas por ciclo, ordenada por data de
  // início. `cycleIds` restringe a comparação a ciclos escolhidos; sem ele,
  // devolve a evolução completa (filtrável por tipo/estado/período, os
  // mesmos filtros de listCycles).
  async getCycleEvolution(query: CycleEvolutionQueryDto) {
    const where: Prisma.Eval360CycleWhereInput = { deletedAt: null };
    if (query.cycleIds)
      where.id = {
        in: query.cycleIds
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.startDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const cycles = await this.prisma.read.eval360Cycle.findMany({
      where,
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, type: true, status: true, startDate: true, endDate: true },
    });

    const series = await Promise.all(
      cycles.map(async c => {
        const [results, assignments, participants] = await Promise.all([
          this.prisma.read.evaluationResult.findMany({
            where: { cycleId: c.id },
            select: { overallScore: true, weightedScore: true },
          }),
          this.prisma.read.evaluatorAssignment.findMany({
            where: { cycleId: c.id },
            select: { evaluatorId: true, status: true },
          }),
          this.prisma.read.cycleParticipant.findMany({
            where: { cycleId: c.id },
            select: { status: true },
          }),
        ]);
        const invited = new Set(assignments.map(a => a.evaluatorId));
        const responded = new Set(
          assignments.filter(a => a.status === 'COMPLETED').map(a => a.evaluatorId),
        );
        return {
          cycleId: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          startDate: c.startDate,
          endDate: c.endDate,
          totalParticipants: results.length,
          avgOverall: results.length
            ? results.reduce((s, r) => s + (r.overallScore ?? 0), 0) / results.length
            : 0,
          avgWeighted: results.length
            ? results.reduce((s, r) => s + (r.weightedScore ?? 0), 0) / results.length
            : 0,
          participationRate: invited.size ? Math.round((responded.size / invited.size) * 100) : 0,
          completionRate: participants.length
            ? Math.round(
                (participants.filter(p => p.status === 'COMPLETED').length / participants.length) *
                  100,
              )
            : 0,
        };
      }),
    );

    return { data: series };
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
    // deletedAt !== null — um ciclo eliminado (soft delete) deixa de existir
    // para qualquer operação normal (update, publish, participantes,
    // avaliadores, resultados...); só listDeletedCycles/restoreCycle o veem.
    // Continua a usar findUnique (não findFirst) — mantém intactos os ~30
    // testes existentes que fazem mock de cycleMock.findUnique.
    if (!cycle || cycle.deletedAt)
      throw new NotFoundException('Ciclo de avaliação não encontrado.');
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

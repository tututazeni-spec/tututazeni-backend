import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { LeadershipContentType, Prisma, ProgramStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../auth/enums/role.enum';
import { isPrivileged } from '../common/authz/ownership';
import { CurrentUserData } from '../common/types/current-user';
import {
  CreateLeadershipProgramDto,
  UpdateLeadershipProgramDto,
  ReplaceProgramConfigurationDto,
  ProgramContentInput,
} from './leadership-program.dto';

/**
 * Serviço write-owner do agregado `LeadershipProgram` (padrão de consolidação
 * Fase A–J do repositório: um único dono de escrita, os callers existentes
 * delegam). Concentra:
 *   - criação com código escolhido pelo caller (colisão → 409);
 *   - autorização/ownership real (não só @Roles, não só UI — histórico de IDOR);
 *   - máquina de estados do ciclo de vida do programa;
 *   - substituição transaccional da configuração (público, critérios,
 *     competências, objectivos, conteúdos, metodologias, equipa).
 *
 * As leituras (`findAll`/`findOne`/`getMyPrograms`/`getProgramStats`) continuam
 * em `LeadershipService`.
 */
@Injectable()
export class LeadershipProgramsService {
  private readonly logger = new Logger(LeadershipProgramsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Papéis que ignoram o ownership e podem gerir qualquer programa. */
  private static readonly PRIVILEGED_ROLES = [Role.ADMIN, Role.RH];

  /**
   * Máquina de estados canónica sobre TODO o enum `ProgramStatus`.
   *
   * `ACTIVE` é um valor legado mantido só para linhas antigas — não é
   * intpermutável com `IN_PROGRESS`. Para efeitos de transição é mapeado como
   * equivalente ao estado "a decorrer" (`IN_PROGRESS`): as suas saídas são as
   * mesmas (`COMPLETED`/`CANCELLED`). O estado canónico "a decorrer" para
   * programas novos é `IN_PROGRESS`.
   *
   * `ARCHIVED` é terminal — não tem transições de saída.
   */
  private static readonly TRANSITIONS: Record<ProgramStatus, ProgramStatus[]> = {
    [ProgramStatus.DRAFT]: [ProgramStatus.PLANNED, ProgramStatus.CANCELLED],
    [ProgramStatus.PLANNED]: [ProgramStatus.OPEN_FOR_SELECTION, ProgramStatus.CANCELLED],
    [ProgramStatus.OPEN_FOR_SELECTION]: [ProgramStatus.SELECTION_CLOSED, ProgramStatus.CANCELLED],
    [ProgramStatus.SELECTION_CLOSED]: [ProgramStatus.IN_PROGRESS, ProgramStatus.CANCELLED],
    [ProgramStatus.IN_PROGRESS]: [ProgramStatus.COMPLETED, ProgramStatus.CANCELLED],
    // Legado: trata-se como IN_PROGRESS.
    [ProgramStatus.ACTIVE]: [ProgramStatus.COMPLETED, ProgramStatus.CANCELLED],
    [ProgramStatus.COMPLETED]: [ProgramStatus.ARCHIVED],
    [ProgramStatus.CANCELLED]: [ProgramStatus.ARCHIVED],
    [ProgramStatus.ARCHIVED]: [],
  };

  // ─── Ownership ────────────────────────────────────────────────────────────

  /**
   * ADMIN/RH escrevem sempre. Caso contrário só o autor ou o responsável do
   * programa. Se ambos `createdById` e `responsibleId` forem nulos (linha
   * legada), só ADMIN/RH podem escrever.
   */
  private assertCanManage(
    actor: CurrentUserData,
    program: { createdById: number | null; responsibleId: number | null },
  ): void {
    if (isPrivileged(actor, LeadershipProgramsService.PRIVILEGED_ROLES)) return;
    if (program.createdById !== null && program.createdById === actor.id) return;
    if (program.responsibleId !== null && program.responsibleId === actor.id) return;
    // 403 (not the repo's 404 assertCanAccess): the 6 manager roles are trusted
    // staff, not participants — Task 2 brief Step 1 mandates ForbiddenException.
    throw new ForbiddenException('Sem permissão para gerir este programa de liderança');
  }

  private async loadForManage(actor: CurrentUserData, id: number) {
    const program = await this.prisma.leadershipProgram.findUnique({
      where: { id },
      include: { _count: { select: { participants: true } } },
    });
    if (!program) throw new NotFoundException('Programa de liderança não encontrado');
    this.assertCanManage(actor, program);
    return program;
  }

  /**
   * Ponto de entrada PÚBLICO do ownership do agregado — para serviços satélite
   * (ex.: `LeadershipEligibilityService`, Task 3) que operam sobre um programa
   * mas não devem reimplementar a regra de dono/privilegiado. Devolve o programa
   * carregado (com `_count.participants`). 404 se não existir, 403 se o actor não
   * for autor/responsável nem ADMIN/RH.
   */
  async assertCanManageProgram(actor: CurrentUserData, programId: number) {
    return this.loadForManage(actor, programId);
  }

  private toDate(value?: string | null): Date | undefined {
    return value ? new Date(value) : undefined;
  }

  /**
   * Campos escalares editáveis do agregado, partilhados por create/update.
   *
   * **`status` NÃO está aqui de propósito** — nem `create` nem `update` escrevem
   * o estado directamente. O estado inicial é sempre `DRAFT` (forçado em
   * `create`) e todas as mudanças subsequentes passam por `transition()`, que é
   * o único ponto que valida a máquina de estados. `code` também não está —
   * é imutável pós-criação (só `create` o escreve).
   */
  private editableScalars(
    dto: CreateLeadershipProgramDto | UpdateLeadershipProgramDto,
  ): Prisma.LeadershipProgramUncheckedUpdateInput {
    return {
      name: dto.name,
      description: dto.description,
      objective: dto.objective,
      level: dto.level,
      type: dto.type,
      corporateLevel: dto.corporateLevel,
      mandatory: dto.mandatory,
      responsibleId: dto.responsibleId,
      departmentId: dto.departmentId,
      startDate: this.toDate(dto.startDate),
      endDate: this.toDate(dto.endDate),
      selectionStartDate: this.toDate(dto.selectionStartDate),
      selectionEndDate: this.toDate(dto.selectionEndDate),
      durationWeeks: dto.durationWeeks,
      workloadHours: dto.workloadHours,
      totalSessions: dto.totalSessions,
      sessionFrequency: dto.sessionFrequency,
      modality: dto.modality,
      location: dto.location,
      capacity: dto.capacity,
      minParticipants: dto.minParticipants,
      schedule: dto.schedule,
      calendarNotes: dto.calendarNotes,
      minLeadershipScore: dto.minLeadershipScore,
      minAttendanceRate: dto.minAttendanceRate,
      minFinalScore: dto.minFinalScore,
      requireFinalProject: dto.requireFinalProject,
      requireAllContents: dto.requireAllContents,
      completionCriteria: dto.completionCriteria,
      certificationEnabled: dto.certificationEnabled,
      certificateTitle: dto.certificateTitle,
      certificateValidityDays: dto.certificateValidityDays,
      certificateTemplateId: dto.certificateTemplateId,
      learningPathId: dto.learningPathId,
    };
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async create(actor: CurrentUserData, dto: CreateLeadershipProgramDto) {
    // Todos os campos obrigatórios (`code`, `name`, `level`) são garantidos pelo
    // DTO validado. O estado inicial é SEMPRE `DRAFT` — um `status` fornecido
    // pelo caller é ignorado (o programa "nasce em rascunho"; para o mover é
    // preciso `transition()`).
    const data: Prisma.LeadershipProgramUncheckedCreateInput = {
      code: dto.code,
      name: dto.name,
      level: dto.level,
      description: dto.description,
      objective: dto.objective,
      type: dto.type,
      corporateLevel: dto.corporateLevel,
      status: ProgramStatus.DRAFT,
      mandatory: dto.mandatory,
      createdById: actor.id,
      responsibleId: dto.responsibleId,
      departmentId: dto.departmentId,
      startDate: this.toDate(dto.startDate),
      endDate: this.toDate(dto.endDate),
      selectionStartDate: this.toDate(dto.selectionStartDate),
      selectionEndDate: this.toDate(dto.selectionEndDate),
      durationWeeks: dto.durationWeeks,
      workloadHours: dto.workloadHours,
      totalSessions: dto.totalSessions,
      sessionFrequency: dto.sessionFrequency,
      modality: dto.modality,
      location: dto.location,
      capacity: dto.capacity,
      minParticipants: dto.minParticipants,
      schedule: dto.schedule,
      calendarNotes: dto.calendarNotes,
      minLeadershipScore: dto.minLeadershipScore,
      minAttendanceRate: dto.minAttendanceRate,
      minFinalScore: dto.minFinalScore,
      requireFinalProject: dto.requireFinalProject,
      requireAllContents: dto.requireAllContents,
      completionCriteria: dto.completionCriteria,
      certificationEnabled: dto.certificationEnabled,
      certificateTitle: dto.certificateTitle,
      certificateValidityDays: dto.certificateValidityDays,
      certificateTemplateId: dto.certificateTemplateId,
      learningPathId: dto.learningPathId,
    };

    try {
      return await this.prisma.leadershipProgram.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Já existe um programa com o código "${dto.code}"`);
      }
      throw e;
    }
  }

  async update(actor: CurrentUserData, id: number, dto: UpdateLeadershipProgramDto) {
    await this.loadForManage(actor, id);
    return this.prisma.leadershipProgram.update({
      where: { id },
      // `code` e `status` nunca chegam no DTO de update (omitidos). O estado só
      // muda por `transition()` — a máquina de estados não pode ser contornada
      // por um PUT.
      data: this.editableScalars(dto),
    });
  }

  async remove(actor: CurrentUserData, id: number) {
    const program = await this.loadForManage(actor, id);
    if (program._count.participants > 0) {
      throw new BadRequestException(
        'Programa com participantes não pode ser eliminado. Archive-o primeiro.',
      );
    }
    await this.prisma.leadershipProgram.delete({ where: { id } });
    return { message: 'Programa removido' };
  }

  // ─── Ciclo de vida ───────────────────────────────────────────────────────

  async transition(actor: CurrentUserData, id: number, target: ProgramStatus) {
    const program = await this.loadForManage(actor, id);
    const current = program.status;
    const allowed = LeadershipProgramsService.TRANSITIONS[current] ?? [];
    if (!allowed.includes(target)) {
      throw new BadRequestException(`Transição de estado inválida: ${current} → ${target}`);
    }
    return this.prisma.leadershipProgram.update({
      where: { id },
      data: { status: target },
    });
  }

  // ─── Configuração (replace-all transaccional) ────────────────────────────

  /**
   * Substitui por completo público-alvo, critérios de selecção, competências,
   * objectivos, conteúdos, metodologias e equipa do programa (delete-all +
   * recreate dentro de uma transacção). Todas as escritas são âmbitadas pelo
   * `programId` — uma linha de config nunca referencia linhas de outro programa.
   *
   * Antes de tocar na BD, `validateConfiguration` garante que:
   *   - toda a referência canónica existe (competência, curso, trilha,
   *     micro-learning, assessment, utilizador do advisor, role/cargo/
   *     departamento/unidade do público-alvo) → NotFoundException;
   *   - não há associações duplicadas no mesmo payload (competência repetida,
   *     nome de critério repetido, mesmo advisor+papel) → BadRequestException,
   *     em vez de deixar rebentar um P2002 opaco no `createMany`;
   *   - cada conteúdo traz o id correspondente ao seu tipo → BadRequestException;
   *   - os pesos dos critérios de selecção activos e das metodologias
   *     ponderadas totalizam 100 → BadRequestException.
   */
  async replaceConfiguration(
    actor: CurrentUserData,
    id: number,
    dto: ReplaceProgramConfigurationDto,
  ) {
    const program = await this.loadForManage(actor, id);
    const programId = program.id;

    await this.validateConfiguration(dto);

    return this.prisma.$transaction(async tx => {
      await Promise.all([
        tx.leadershipProgramObjective.deleteMany({ where: { programId } }),
        tx.leadershipProgramTargeting.deleteMany({ where: { programId } }),
        tx.leadershipSelectionCriterion.deleteMany({ where: { programId } }),
        tx.leadershipProgramCompetency.deleteMany({ where: { programId } }),
        tx.leadershipProgramContent.deleteMany({ where: { programId } }),
        tx.leadershipProgramMethodology.deleteMany({ where: { programId } }),
        tx.leadershipProgramAdvisor.deleteMany({ where: { programId } }),
      ]);

      if (dto.objectives?.length) {
        await tx.leadershipProgramObjective.createMany({
          data: dto.objectives.map((o, i) => ({
            programId,
            title: o.title,
            description: o.description,
            type: o.type,
            indicator: o.indicator,
            targetValue: o.targetValue,
            unit: o.unit,
            seq: o.seq ?? i,
          })),
        });
      }

      if (dto.targeting?.length) {
        await tx.leadershipProgramTargeting.createMany({
          data: dto.targeting.map(t => ({
            programId,
            scope: t.scope,
            include: t.include ?? true,
            roleId: t.roleId,
            positionId: t.positionId,
            departmentId: t.departmentId,
            unitId: t.unitId,
            jobFamily: t.jobFamily,
            minValue: t.minValue,
            maxValue: t.maxValue,
            description: t.description,
          })),
        });
      }

      if (dto.selectionCriteria?.length) {
        await tx.leadershipSelectionCriterion.createMany({
          data: dto.selectionCriteria.map((c, i) => ({
            programId,
            name: c.name,
            description: c.description,
            source: c.source,
            weight: c.weight,
            minScore: c.minScore,
            competencyId: c.competencyId,
            required: c.required ?? false,
            active: c.active ?? true,
            seq: c.seq ?? i,
          })),
        });
      }

      if (dto.competencies?.length) {
        await tx.leadershipProgramCompetency.createMany({
          data: dto.competencies.map((c, i) => ({
            programId,
            competencyId: c.competencyId,
            baselineLevel: c.baselineLevel,
            targetLevel: c.targetLevel,
            weight: c.weight,
            behavioralIndicators: c.behavioralIndicators,
            mandatory: c.mandatory ?? true,
            seq: c.seq ?? i,
          })),
        });
      }

      if (dto.contents?.length) {
        await tx.leadershipProgramContent.createMany({
          data: dto.contents.map((c, i) => ({
            programId,
            contentType: c.contentType,
            courseId: c.courseId,
            learningPathId: c.learningPathId,
            microLearningId: c.microLearningId,
            assessmentId: c.assessmentId,
            externalUrl: c.externalUrl,
            title: c.title,
            required: c.required ?? true,
            weight: c.weight,
            seq: c.seq ?? i,
          })),
        });
      }

      if (dto.methodologies?.length) {
        await tx.leadershipProgramMethodology.createMany({
          data: dto.methodologies.map((m, i) => ({
            programId,
            type: m.type,
            name: m.name,
            description: m.description,
            weight: m.weight,
            hours: m.hours,
            sessions: m.sessions,
            seq: m.seq ?? i,
          })),
        });
      }

      if (dto.advisors?.length) {
        await tx.leadershipProgramAdvisor.createMany({
          data: dto.advisors.map(a => ({
            programId,
            userId: a.userId,
            role: a.role,
            focusArea: a.focusArea,
            notes: a.notes,
            active: a.active ?? true,
          })),
        });
      }

      return tx.leadershipProgram.findUnique({
        where: { id: programId },
        include: {
          objectives: true,
          targeting: true,
          selectionCriteria: true,
          competencies: true,
          contents: true,
          methodologies: true,
          advisors: true,
        },
      });
    });
  }

  // ─── Validação da configuração (Task 4) ──────────────────────────────────

  /** Campo de id canónico exigido por cada tipo de conteúdo. */
  private static readonly CONTENT_ID_FIELD: Record<
    LeadershipContentType,
    keyof ProgramContentInput
  > = {
    [LeadershipContentType.COURSE]: 'courseId',
    [LeadershipContentType.LEARNING_PATH]: 'learningPathId',
    [LeadershipContentType.MICRO_LEARNING]: 'microLearningId',
    [LeadershipContentType.ASSESSMENT]: 'assessmentId',
    [LeadershipContentType.EXTERNAL]: 'externalUrl',
  };

  private async validateConfiguration(dto: ReplaceProgramConfigurationDto): Promise<void> {
    this.assertNoDuplicates(dto);
    this.assertContentShape(dto.contents);
    this.assertConfigWeights(dto);
    await this.assertCanonicalRefsExist(dto);
  }

  /**
   * Recusa associações repetidas dentro do próprio payload. O schema tem
   * `@@unique` em `[programId, competencyId]`, `[programId, name]` e
   * `[programId, userId, role]`; sem esta guarda o `createMany` rebentava com um
   * P2002 traduzido para 500 (o repo ainda não tem filtro global P2002→409).
   */
  private assertNoDuplicates(dto: ReplaceProgramConfigurationDto): void {
    const firstDuplicate = <T>(items: T[] | undefined, key: (t: T) => string): string | null => {
      const seen = new Set<string>();
      for (const it of items ?? []) {
        const k = key(it);
        if (seen.has(k)) return k;
        seen.add(k);
      }
      return null;
    };

    const dupCompetency = firstDuplicate(dto.competencies, c => String(c.competencyId));
    if (dupCompetency !== null) {
      throw new BadRequestException(
        `Competência ${dupCompetency} associada mais do que uma vez ao programa`,
      );
    }

    // `@@unique([programId, name])` é sensível a maiúsculas — espelha-se aqui.
    const dupCriterion = firstDuplicate(dto.selectionCriteria, c => c.name);
    if (dupCriterion !== null) {
      throw new BadRequestException(
        `Critério de selecção "${dupCriterion}" definido mais do que uma vez`,
      );
    }

    const dupAdvisor = firstDuplicate(dto.advisors, a => `${a.userId}:${a.role}`);
    if (dupAdvisor !== null) {
      const [userId, role] = dupAdvisor.split(':');
      throw new BadRequestException(
        `Acompanhante ${userId} com o papel ${role} definido mais do que uma vez`,
      );
    }
  }

  /** Cada conteúdo tem de trazer o id (ou URL) correspondente ao seu tipo. */
  private assertContentShape(contents?: ProgramContentInput[]): void {
    for (const c of contents ?? []) {
      const field = LeadershipProgramsService.CONTENT_ID_FIELD[c.contentType];
      if (c[field] == null) {
        throw new BadRequestException(`Conteúdo do tipo ${c.contentType} exige o campo "${field}"`);
      }
    }
  }

  private assertConfigWeights(dto: ReplaceProgramConfigurationDto): void {
    const activeCriteria = (dto.selectionCriteria ?? []).filter(c => c.active !== false);
    if (activeCriteria.length) {
      this.assertWeightsTotal100(
        activeCriteria.map(c => c.weight),
        'Os pesos dos critérios de selecção activos têm de totalizar 100',
      );
    }

    // Peso da metodologia é opcional: 0 metodologias com peso = "peso não
    // activado" e não se valida. Basta uma ter peso para exigir o total de 100.
    const methodologies = dto.methodologies ?? [];
    if (methodologies.some(m => m.weight != null)) {
      this.assertWeightsTotal100(
        methodologies.map(m => m.weight),
        'Os pesos das metodologias têm de totalizar 100 quando definidos',
      );
    }
  }

  private assertWeightsTotal100(weights: Array<number | null | undefined>, message: string): void {
    // Tolerância ±0.01 para arredondamento de `Decimal`.
    const total = weights.reduce<number>((s, w) => s + Number(w ?? 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(`${message} (actual: ${Math.round(total * 100) / 100}).`);
    }
  }

  /**
   * Confirma contra a BD que toda a referência canónica no payload existe. Uma
   * consulta agregada por modelo; ordem determinística para mensagens estáveis.
   */
  private async assertCanonicalRefsExist(dto: ReplaceProgramConfigurationDto): Promise<void> {
    const uniq = (xs: Array<number | null | undefined>): number[] => [
      ...new Set(xs.filter((x): x is number => x != null)),
    ];

    const competencyIds = uniq([
      ...(dto.competencies ?? []).map(c => c.competencyId),
      ...(dto.selectionCriteria ?? []).map(c => c.competencyId),
    ]);
    const courseIds = uniq((dto.contents ?? []).map(c => c.courseId));
    const learningPathIds = uniq([...(dto.contents ?? []).map(c => c.learningPathId)]);
    const microLearningIds = uniq((dto.contents ?? []).map(c => c.microLearningId));
    const assessmentIds = uniq((dto.contents ?? []).map(c => c.assessmentId));
    const advisorUserIds = uniq((dto.advisors ?? []).map(a => a.userId));
    const roleIds = uniq((dto.targeting ?? []).map(t => t.roleId));
    const positionIds = uniq((dto.targeting ?? []).map(t => t.positionId));
    const departmentIds = uniq((dto.targeting ?? []).map(t => t.departmentId));
    const unitIds = uniq((dto.targeting ?? []).map(t => t.unitId));

    await this.assertIdsExist('Competência', competencyIds, ids =>
      this.prisma.competency.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Curso', courseIds, ids =>
      this.prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Trilha de aprendizagem', learningPathIds, ids =>
      this.prisma.learningPath.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Micro-learning', microLearningIds, ids =>
      this.prisma.microLearning.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Assessment', assessmentIds, ids =>
      this.prisma.assessment.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Utilizador (acompanhante)', advisorUserIds, ids =>
      this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Função', roleIds, ids =>
      this.prisma.role.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Cargo', positionIds, ids =>
      this.prisma.position.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Departamento', departmentIds, ids =>
      this.prisma.department.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
    await this.assertIdsExist('Unidade', unitIds, ids =>
      this.prisma.unit.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    );
  }

  private async assertIdsExist(
    label: string,
    ids: number[],
    lookup: (ids: number[]) => Promise<Array<{ id: number }>>,
  ): Promise<void> {
    if (!ids.length) return;
    const found = new Set((await lookup(ids)).map(r => r.id));
    const missing = ids.filter(id => !found.has(id));
    if (missing.length) {
      throw new NotFoundException(`${label}(s) inexistente(s): ${missing.join(', ')}`);
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import { LeadershipProgramsService } from './leadership-programs.service';
import {
  AssignAdvisorsDto,
  LinkDevelopmentPlanDto,
  ParticipantBaselineDto,
  ReplacePlanActionsDto,
} from './leadership-participant.dto';

/**
 * Percurso do participante de um programa de liderança (Task 5, parte 1):
 * baseline/readiness, atribuição de mentor/coach e ligação ao PDI
 * (`DevelopmentPlan`) e ao `Mentoring` canónicos — sempre por referência, nunca
 * criando cópias desses domínios.
 *
 * Autorização:
 *   - todas as ESCRITAS são de gestão: autor/responsável do programa ou
 *     ADMIN/RH, via `LeadershipProgramsService.assertCanManageProgram`;
 *   - o participante só tem LEITURA dos seus próprios dados
 *     (`getMyParticipation`) — nunca dos de outro participante.
 */
@Injectable()
export class LeadershipParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: LeadershipProgramsService,
  ) {}

  private static readonly PARTICIPANT_INCLUDE = {
    user: { select: { id: true, fullName: true, email: true } },
    mentor: { select: { id: true, fullName: true, email: true } },
    coach: { select: { id: true, fullName: true, email: true } },
    mentoring: true,
    plan: {
      include: {
        developmentPlan: { select: { id: true, name: true, status: true } },
        actions: { orderBy: { seq: 'asc' as const } },
      },
    },
    assessments: { orderBy: { stage: 'asc' as const } },
  } satisfies Prisma.LeadershipProgramParticipantInclude;

  private async loadParticipant(programId: number, userId: number) {
    const participant = await this.prisma.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
    });
    if (!participant) {
      throw new NotFoundException('Participante não encontrado neste programa');
    }
    return participant;
  }

  private async assertUsersExist(ids: Array<number | null | undefined>): Promise<void> {
    const wanted = [...new Set(ids.filter((x): x is number => x != null))];
    if (!wanted.length) return;
    const found = await this.prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true },
    });
    const missing = wanted.filter(id => !found.some(f => f.id === id));
    if (missing.length) {
      throw new NotFoundException(`Utilizador(es) inexistente(s): ${missing.join(', ')}`);
    }
  }

  // ─── Leitura ─────────────────────────────────────────────────────────────

  /** Detalhe de um participante — gestão do programa. */
  async getParticipant(actor: CurrentUserData, programId: number, userId: number) {
    await this.programs.assertCanManageProgram(actor, programId);
    const participant = await this.prisma.read.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
      include: LeadershipParticipantsService.PARTICIPANT_INCLUDE,
    });
    if (!participant) throw new NotFoundException('Participante não encontrado neste programa');
    return participant;
  }

  /** O próprio percurso do utilizador autenticado — nunca o de outro. */
  async getMyParticipation(actor: CurrentUserData, programId: number) {
    const participant = await this.prisma.read.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId: actor.id, programId } },
      include: LeadershipParticipantsService.PARTICIPANT_INCLUDE,
    });
    if (!participant) throw new NotFoundException('Não é participante deste programa');
    return participant;
  }

  // ─── Baseline / readiness ────────────────────────────────────────────────

  async setBaseline(
    actor: CurrentUserData,
    programId: number,
    userId: number,
    dto: ParticipantBaselineDto,
  ) {
    await this.programs.assertCanManageProgram(actor, programId);
    await this.loadParticipant(programId, userId);
    return this.prisma.leadershipProgramParticipant.update({
      where: { userId_programId: { userId, programId } },
      data: {
        baselineScore: dto.baselineScore,
        baselineNotes: dto.baselineNotes,
        readinessLevel: dto.readinessLevel,
        baselineCapturedAt: new Date(),
      },
    });
  }

  // ─── Mentor / coach / mentoring canónico ─────────────────────────────────

  async assignAdvisors(
    actor: CurrentUserData,
    programId: number,
    userId: number,
    dto: AssignAdvisorsDto,
  ) {
    await this.programs.assertCanManageProgram(actor, programId);
    await this.loadParticipant(programId, userId);
    await this.assertUsersExist([dto.mentorId, dto.coachId]);

    if (dto.mentoringId != null) {
      const mentoring = await this.prisma.mentoring.findUnique({ where: { id: dto.mentoringId } });
      if (!mentoring) {
        throw new NotFoundException(`Mentoring ${dto.mentoringId} inexistente`);
      }
      // Referência a um registo existente — o mentee tem de ser este participante.
      if (mentoring.menteeId !== userId) {
        throw new BadRequestException('O mentoring indicado não pertence a este participante');
      }
    }

    return this.prisma.leadershipProgramParticipant.update({
      where: { userId_programId: { userId, programId } },
      // `null` limpa a FK; `undefined` não toca no campo.
      data: {
        mentorId: dto.mentorId === undefined ? undefined : dto.mentorId,
        coachId: dto.coachId === undefined ? undefined : dto.coachId,
        mentoringId: dto.mentoringId === undefined ? undefined : dto.mentoringId,
      },
    });
  }

  // ─── Ligação ao PDI canónico ─────────────────────────────────────────────

  async linkDevelopmentPlan(
    actor: CurrentUserData,
    programId: number,
    userId: number,
    dto: LinkDevelopmentPlanDto,
  ) {
    await this.programs.assertCanManageProgram(actor, programId);
    const participant = await this.loadParticipant(programId, userId);

    if (dto.developmentPlanId != null) {
      const plan = await this.prisma.developmentPlan.findUnique({
        where: { id: dto.developmentPlanId },
        select: { id: true, userId: true },
      });
      if (!plan) {
        throw new NotFoundException(`PDI ${dto.developmentPlanId} inexistente`);
      }
      if (plan.userId !== userId) {
        throw new BadRequestException('O PDI indicado não pertence a este participante');
      }
    }

    const payload = {
      developmentPlanId: dto.developmentPlanId === undefined ? undefined : dto.developmentPlanId,
      title: dto.title,
      summary: dto.summary,
      status: dto.status,
    };

    return this.prisma.leadershipParticipantPlan.upsert({
      where: { participantId: participant.id },
      create: { participantId: participant.id, ...payload },
      update: payload,
      include: { actions: { orderBy: { seq: 'asc' } } },
    });
  }

  async replacePlanActions(
    actor: CurrentUserData,
    programId: number,
    userId: number,
    dto: ReplacePlanActionsDto,
  ) {
    await this.programs.assertCanManageProgram(actor, programId);
    const participant = await this.loadParticipant(programId, userId);

    const plan = await this.prisma.leadershipParticipantPlan.findUnique({
      where: { participantId: participant.id },
    });
    if (!plan) {
      throw new NotFoundException('Percurso individual ainda não criado — ligue o PDI primeiro');
    }

    const courseIds = [
      ...new Set(dto.actions.map(a => a.courseId).filter((x): x is number => x != null)),
    ];
    if (courseIds.length) {
      const found = await this.prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true },
      });
      const missing = courseIds.filter(id => !found.some(f => f.id === id));
      if (missing.length) {
        throw new NotFoundException(`Curso(s) inexistente(s): ${missing.join(', ')}`);
      }
    }

    const actionIds = [
      ...new Set(
        dto.actions.map(a => a.developmentPlanActionId).filter((x): x is number => x != null),
      ),
    ];
    if (actionIds.length) {
      const found = await this.prisma.developmentPlanAction.findMany({
        where: { id: { in: actionIds } },
        select: { id: true },
      });
      const missing = actionIds.filter(id => !found.some(f => f.id === id));
      if (missing.length) {
        throw new NotFoundException(`Acção(ões) de PDI inexistente(s): ${missing.join(', ')}`);
      }
    }

    return this.prisma.$transaction(async tx => {
      await tx.leadershipParticipantPlanAction.deleteMany({ where: { planId: plan.id } });
      if (dto.actions.length) {
        await tx.leadershipParticipantPlanAction.createMany({
          data: dto.actions.map((a, i) => ({
            planId: plan.id,
            developmentPlanActionId: a.developmentPlanActionId,
            title: a.title,
            description: a.description,
            type: a.type,
            status: a.status,
            courseId: a.courseId,
            dueDate: a.dueDate ? new Date(a.dueDate) : undefined,
            seq: a.seq ?? i,
          })),
        });
      }
      return tx.leadershipParticipantPlan.findUnique({
        where: { id: plan.id },
        include: { actions: { orderBy: { seq: 'asc' } } },
      });
    });
  }
}

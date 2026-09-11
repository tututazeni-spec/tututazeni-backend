import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadershipProjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/types/current-user';
import { NotificationsService } from '../notifications/notifications.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import {
  AddCostDto,
  AttachDocumentDto,
  EvaluateProjectDto,
  RecordAssessmentDto,
  ScheduleCommunicationDto,
  UpsertProjectDto,
} from './leadership-participant.dto';

/**
 * Execução de um programa de liderança (Task 5, parte 2): avaliações
 * inicial/intermédia/final, projecto prático com KPI e evidências, documentos
 * (referência ao repositório documental canónico), custos e comunicações
 * programáticas.
 *
 * - Todas as escritas são de gestão do programa
 *   (`LeadershipProgramsService.assertCanManageProgram`).
 * - Os documentos são **referências** a `Document` existente — nunca se cria um
 *   documento novo aqui.
 * - `dispatchCommunication` é idempotente: um claim atómico
 *   (`updateMany … status in [SCHEDULED, FAILED] → SENT`) garante um único
 *   envio; chamadas repetidas devolvem a linha sem reenviar.
 * - As notificações vão pela fila via `NotificationsService.enqueueSend`; o
 *   `metadata` é serializado com `JSON.stringify` dentro do serviço de
 *   notificações.
 */
@Injectable()
export class LeadershipExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly programs: LeadershipProgramsService,
    private readonly notifications: NotificationsService,
  ) {}

  private static readonly EVALUATION_STATES: LeadershipProjectStatus[] = [
    LeadershipProjectStatus.UNDER_REVIEW,
    LeadershipProjectStatus.COMPLETED,
    LeadershipProjectStatus.REJECTED,
  ];

  private async loadParticipant(programId: number, userId: number) {
    const participant = await this.prisma.leadershipProgramParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
      select: { id: true },
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

  private toDate(value?: string | null): Date | undefined {
    return value ? new Date(value) : undefined;
  }

  // ─── Avaliações (uma por participante × etapa) ───────────────────────────

  async recordAssessment(
    actor: CurrentUserData,
    programId: number,
    userId: number,
    dto: RecordAssessmentDto,
  ) {
    await this.programs.assertCanManageProgram(actor, programId);
    const participant = await this.loadParticipant(programId, userId);

    if (dto.assessmentId != null) {
      const assessment = await this.prisma.assessment.findUnique({
        where: { id: dto.assessmentId },
        select: { id: true },
      });
      if (!assessment) {
        throw new NotFoundException(`Assessment ${dto.assessmentId} inexistente`);
      }
    }

    const existing = await this.prisma.leadershipParticipantAssessment.findFirst({
      where: { participantId: participant.id, stage: dto.stage },
    });
    const status = dto.status ?? existing?.status ?? 'PENDING';
    const data = {
      status,
      assessorId: actor.id,
      assessmentId: dto.assessmentId,
      score: dto.score,
      maxScore: dto.maxScore,
      readinessLevel: dto.readinessLevel,
      feedback: dto.feedback,
      strengths: dto.strengths,
      improvements: dto.improvements,
      assessedAt: status === 'COMPLETED' ? new Date() : null,
    };

    const row = existing
      ? await this.prisma.leadershipParticipantAssessment.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.leadershipParticipantAssessment.create({
          data: { participantId: participant.id, stage: dto.stage, ...data },
        });

    // A readiness final espelha-se na linha do participante (input do Task 6).
    if (dto.stage === 'FINAL' && status === 'COMPLETED' && dto.readinessLevel) {
      await this.prisma.leadershipProgramParticipant.update({
        where: { id: participant.id },
        data: { readinessLevel: dto.readinessLevel },
      });
    }
    return row;
  }

  // ─── Projecto de liderança ──────────────────────────────────────────────

  async upsertProject(actor: CurrentUserData, programId: number, dto: UpsertProjectDto) {
    await this.programs.assertCanManageProgram(actor, programId);
    await this.assertUsersExist([dto.sponsorId, dto.mentorId]);

    let participantId: number | undefined;
    if (dto.participantUserId != null) {
      participantId = (await this.loadParticipant(programId, dto.participantUserId)).id;
    }

    const data = {
      title: dto.title,
      challenge: dto.challenge,
      description: dto.description,
      status: dto.status,
      kpiName: dto.kpiName,
      kpiTarget: dto.kpiTarget,
      kpiResult: dto.kpiResult,
      sponsorId: dto.sponsorId,
      mentorId: dto.mentorId,
      startDate: this.toDate(dto.startDate),
      endDate: this.toDate(dto.endDate),
      participantId,
    };

    if (dto.projectId != null) {
      const existing = await this.prisma.leadershipProject.findUnique({
        where: { id: dto.projectId },
        select: { id: true, programId: true },
      });
      if (!existing || existing.programId !== programId) {
        throw new NotFoundException('Projecto não encontrado neste programa');
      }
      return this.prisma.leadershipProject.update({ where: { id: dto.projectId }, data });
    }
    return this.prisma.leadershipProject.create({ data: { programId, ...data } });
  }

  async evaluateProject(actor: CurrentUserData, projectId: number, dto: EvaluateProjectDto) {
    const project = await this.prisma.leadershipProject.findUnique({
      where: { id: projectId },
      select: { id: true, programId: true },
    });
    if (!project) throw new NotFoundException('Projecto não encontrado');
    await this.programs.assertCanManageProgram(actor, project.programId);

    if (dto.status && !LeadershipExecutionService.EVALUATION_STATES.includes(dto.status)) {
      throw new BadRequestException(`Estado de avaliação inválido: ${dto.status}`);
    }

    return this.prisma.leadershipProject.update({
      where: { id: projectId },
      data: {
        status: dto.status ?? LeadershipProjectStatus.COMPLETED,
        score: dto.score,
        outcome: dto.outcome,
        evaluationNotes: dto.evaluationNotes,
        evaluatedById: actor.id,
        evaluatedAt: new Date(),
      },
    });
  }

  // ─── Documentos (referência ao repositório canónico) ────────────────────

  async attachDocument(actor: CurrentUserData, programId: number, dto: AttachDocumentDto) {
    await this.programs.assertCanManageProgram(actor, programId);

    const doc = await this.prisma.document.findUnique({
      where: { id: dto.documentId },
      select: { id: true, deletedAt: true },
    });
    if (!doc || doc.deletedAt) {
      throw new NotFoundException(`Documento ${dto.documentId} inexistente`);
    }

    let participantId: number | undefined;
    if (dto.participantUserId != null) {
      participantId = (await this.loadParticipant(programId, dto.participantUserId)).id;
    }
    if (dto.projectId != null) {
      const project = await this.prisma.leadershipProject.findUnique({
        where: { id: dto.projectId },
        select: { programId: true },
      });
      if (!project || project.programId !== programId) {
        throw new NotFoundException('Projecto não encontrado neste programa');
      }
    }

    return this.prisma.leadershipProgramDocument.create({
      data: {
        programId,
        participantId,
        projectId: dto.projectId,
        documentId: dto.documentId,
        kind: dto.kind,
        uploadedById: actor.id,
        notes: dto.notes,
      },
    });
  }

  // ─── Custos ─────────────────────────────────────────────────────────────

  async addCost(actor: CurrentUserData, programId: number, dto: AddCostDto) {
    await this.programs.assertCanManageProgram(actor, programId);

    let participantId: number | undefined;
    if (dto.participantUserId != null) {
      participantId = (await this.loadParticipant(programId, dto.participantUserId)).id;
    }

    return this.prisma.leadershipProgramCost.create({
      data: {
        programId,
        participantId,
        category: dto.category,
        description: dto.description,
        plannedAmount: dto.plannedAmount,
        actualAmount: dto.actualAmount,
        currency: dto.currency ?? 'AOA',
        incurredAt: this.toDate(dto.incurredAt),
      },
    });
  }

  async getCostSummary(actor: CurrentUserData, programId: number) {
    await this.programs.assertCanManageProgram(actor, programId);
    const rows = await this.prisma.read.leadershipProgramCost.findMany({ where: { programId } });

    const byCategory: Record<string, { planned: number; actual: number }> = {};
    let totalPlanned = 0;
    let totalActual = 0;
    for (const r of rows) {
      const planned = Number(r.plannedAmount ?? 0);
      const actual = Number(r.actualAmount ?? 0);
      totalPlanned += planned;
      totalActual += actual;
      byCategory[r.category] ??= { planned: 0, actual: 0 };
      byCategory[r.category].planned += planned;
      byCategory[r.category].actual += actual;
    }

    const round2 = (v: number) => Math.round(v * 100) / 100;
    return {
      programId,
      currency: rows[0]?.currency ?? 'AOA',
      entries: rows.length,
      totalPlanned: round2(totalPlanned),
      totalActual: round2(totalActual),
      variance: round2(totalPlanned - totalActual),
      byCategory,
    };
  }

  // ─── Comunicações programáticas ─────────────────────────────────────────

  async scheduleCommunication(
    actor: CurrentUserData,
    programId: number,
    dto: ScheduleCommunicationDto,
  ) {
    await this.programs.assertCanManageProgram(actor, programId);

    let participantId: number | undefined;
    if (dto.participantUserId != null) {
      participantId = (await this.loadParticipant(programId, dto.participantUserId)).id;
    }

    return this.prisma.leadershipProgramCommunication.create({
      data: {
        programId,
        participantId,
        event: dto.event,
        channel: dto.channel,
        subject: dto.subject,
        body: dto.body,
        daysOffset: dto.daysOffset,
        scheduledFor: this.toDate(dto.scheduledFor),
        status: 'SCHEDULED',
      },
    });
  }

  /**
   * Envia uma comunicação agendada. Idempotente: só um chamador consegue mover
   * `SCHEDULED`/`FAILED` → `SENT` (claim atómico). Chamadas seguintes devolvem a
   * linha inalterada sem reenviar notificações.
   */
  async dispatchCommunication(actor: CurrentUserData, communicationId: number) {
    const comm = await this.prisma.leadershipProgramCommunication.findUnique({
      where: { id: communicationId },
    });
    if (!comm) throw new NotFoundException('Comunicação não encontrada');
    await this.programs.assertCanManageProgram(actor, comm.programId);

    const claim = await this.prisma.leadershipProgramCommunication.updateMany({
      where: { id: communicationId, status: { in: ['SCHEDULED', 'FAILED'] } },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (claim.count === 0) {
      return this.prisma.read.leadershipProgramCommunication.findUnique({
        where: { id: communicationId },
      });
    }

    const recipientIds = comm.participantId
      ? [
          (
            await this.prisma.leadershipProgramParticipant.findUniqueOrThrow({
              where: { id: comm.participantId },
              select: { userId: true },
            })
          ).userId,
        ]
      : (
          await this.prisma.leadershipProgramParticipant.findMany({
            where: { programId: comm.programId },
            select: { userId: true },
          })
        ).map(r => r.userId);

    for (const userId of recipientIds) {
      await this.notifications.enqueueSend({
        userId,
        type: `LEADERSHIP_${comm.event}`.slice(0, 60),
        title: comm.subject ?? 'Programa de liderança',
        message: comm.body ?? comm.subject ?? 'Atualização do programa de liderança',
        metadata: {
          leadershipProgramId: comm.programId,
          communicationId: comm.id,
          event: comm.event,
        },
      });
    }

    return this.prisma.read.leadershipProgramCommunication.findUnique({
      where: { id: communicationId },
    });
  }
}

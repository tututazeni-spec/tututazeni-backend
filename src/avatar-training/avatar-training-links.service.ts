// src/avatar-training/avatar-training-links.service.ts
// Fase 9 — integrações de saída (docs/Avatar_Training.md §9): pedido de
// certificado, presença em actividade formativa, eventos para Automations e
// leitura das ligações a Trainings e Learning Paths. Nada aqui duplica os
// módulos de origem: o certificado é emitido por CourseCompletionService, a
// presença vive em AttendanceRecord (contexto LMS), as regras vivem em
// Automations e Trainings/Learning Paths só são lidos. As propagações são
// melhor esforço — uma falha nunca desfaz a conclusão que as originou.
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AttendanceContext, AttendanceStatus, CheckInMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { CurrentUserData } from '../common/decorators';
import { CourseCompletionService } from '../course-completion/course-completion.service';
import { AutomationService } from '../automation/automation.service';
import { TriggerType } from '../automation/automation.dto';
import { AvatarTrainingProgramsService } from './avatar-training-programs.service';
import { AvatarTrainingNotificationsService } from './avatar-training-notifications.service';

export interface FinishedSessionContext {
  attemptId: number;
  userId: number;
  passed: boolean;
  score: number | null;
  startedAt: Date;
  completedAt: Date;
  pausedSeconds: number;
  session: {
    id: number;
    title: string;
    program: { id: number; title: string; courseId: number | null };
  };
}

const startOfDay = (d: Date) => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
};

@Injectable()
export class AvatarTrainingLinksService {
  private readonly logger = new Logger(AvatarTrainingLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly programs: AvatarTrainingProgramsService,
    private readonly notifications: AvatarTrainingNotificationsService,
    private readonly courseCompletion: CourseCompletionService,
    private readonly automation: AutomationService,
  ) {}

  private async guard(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      this.logger.warn({
        action: 'AVATAR_TRAINING_LINK',
        link: label,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Propagação falhou — a conclusão mantém-se',
      });
    }
  }

  // ── Certificado ────────────────────────────────────────────────────────────

  /**
   * Pedido de emissão quando os critérios da formação estão cumpridos. Se a
   * formação está ligada a um curso cuja inscrição já está concluída, delega a
   * emissão em CourseCompletionService (idempotente, um certificado por
   * inscrição). Caso contrário regista o pedido e avisa o responsável — a
   * conclusão do curso continua a pertencer a Enrollments.
   */
  async requestCertificate(user: CurrentUserData, programId: number) {
    const status = await this.programs.certificationStatus(user, programId);
    if (!status.enabled) throw new ConflictException('Esta formação não emite certificado');
    if (!status.eligible) {
      throw new ConflictException(`Ainda não cumpre as regras: ${status.reasons.join('; ')}`);
    }
    const program = await this.prisma.avatarTrainingProgram.findUnique({
      where: { id: programId },
      select: { id: true, title: true, courseId: true, responsibleId: true, createdById: true },
    });
    if (!program) throw new NotFoundException('Formação não encontrada');

    const enrollment = program.courseId
      ? await this.prisma.enrollment.findUnique({
          where: { courseId_userId: { courseId: program.courseId, userId: user.id } },
          select: { id: true, status: true },
        })
      : null;
    if (enrollment) {
      const existing = await this.prisma.certificate.findFirst({
        where: { enrollmentId: enrollment.id },
        select: { id: true, validationCode: true },
      });
      if (existing) return { status: 'ALREADY_ISSUED' as const, certificate: existing };
      if (enrollment.status === 'COMPLETED') {
        const certificate = await this.courseCompletion.issueCertificateFor(enrollment.id, user);
        await this.audit.log({
          userId: user.id,
          action: 'CERTIFICATE_ISSUED',
          entity: 'AvatarTrainingProgram',
          entityId: programId,
          metadata: { enrollmentId: enrollment.id, certificateId: certificate?.id ?? null },
        });
        return { status: 'ISSUED' as const, certificate };
      }
    }

    const alreadyRequested = await this.prisma.auditLog.findFirst({
      where: {
        userId: user.id,
        action: 'CERTIFICATE_REQUEST',
        entity: 'AvatarTrainingProgram',
        entityId: programId,
      },
      select: { id: true },
    });
    if (alreadyRequested) return { status: 'ALREADY_REQUESTED' as const, certificate: null };

    await this.audit.log({
      userId: user.id,
      action: 'CERTIFICATE_REQUEST',
      entity: 'AvatarTrainingProgram',
      entityId: programId,
      metadata: { courseId: program.courseId, enrollmentId: enrollment?.id ?? null },
    });
    const recipient = program.responsibleId ?? program.createdById;
    if (recipient && recipient !== user.id) {
      await this.notifications.certificateRequested({
        recipientId: recipient,
        learnerId: user.id,
        programId,
        programTitle: program.title,
      });
    }
    return { status: 'REQUESTED' as const, certificate: null };
  }

  // ── Conclusão de uma tentativa ─────────────────────────────────────────────

  async onSessionFinished(ctx: FinishedSessionContext) {
    await this.guard('presenca', () => this.recordAttendance(ctx));
    await this.guard('automacao', () => this.triggerAutomation(ctx));
  }

  /** Presença em actividade formativa (contexto LMS) — um registo por utilizador/dia, minutos acumulados. */
  private async recordAttendance(ctx: FinishedSessionContext) {
    const minutes = Math.max(
      0,
      Math.round((ctx.completedAt.getTime() - ctx.startedAt.getTime()) / 60_000) -
        Math.round(ctx.pausedSeconds / 60),
    );
    const date = startOfDay(ctx.completedAt);
    const where = {
      userId_date_context: { userId: ctx.userId, date, context: AttendanceContext.LMS },
    };
    const existing = await this.prisma.attendanceRecord.findUnique({
      where,
      select: { id: true, workMinutes: true, courseId: true },
    });
    const note = `Avatar Training: ${ctx.session.title} (tentativa ${ctx.attemptId})`;
    if (existing) {
      const total = (existing.workMinutes ?? 0) + minutes;
      await this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          workMinutes: total,
          hoursWorked: Math.round((total / 60) * 100) / 100,
          courseId: existing.courseId ?? ctx.session.program.courseId ?? undefined,
        },
      });
      return;
    }
    await this.prisma.attendanceRecord.create({
      data: {
        userId: ctx.userId,
        date,
        status: AttendanceStatus.PRESENT,
        context: AttendanceContext.LMS,
        method: CheckInMethod.VIRTUAL_LINK,
        clockInAt: ctx.startedAt,
        clockOutAt: ctx.completedAt,
        workMinutes: minutes,
        hoursWorked: Math.round((minutes / 60) * 100) / 100,
        courseId: ctx.session.program.courseId ?? undefined,
        notes: note,
      },
    });
  }

  /** Dispara as regras de Automations (`avatar_training.session_completed` / `_failed`). */
  private async triggerAutomation(ctx: FinishedSessionContext) {
    await this.automation.triggerEvent({
      event: ctx.passed ? TriggerType.AVATAR_SESSION_COMPLETED : TriggerType.AVATAR_SESSION_FAILED,
      userId: ctx.userId,
      payload: {
        attemptId: ctx.attemptId,
        sessionId: ctx.session.id,
        programId: ctx.session.program.id,
        courseId: ctx.session.program.courseId,
        score: ctx.score,
      },
    });
  }

  /** Formador humano a avisar: o responsável da formação ou, na falta dele, o da formação (Trainings) ligada ao curso. */
  async humanResponsible(program: {
    responsibleId: number | null;
    courseId: number | null;
  }): Promise<number | null> {
    if (program.responsibleId) return program.responsibleId;
    if (!program.courseId) return null;
    const training = await this.prisma.training.findFirst({
      where: { courseId: program.courseId, status: { in: ['PUBLISHED', 'COMPLETED'] } },
      select: { responsibleId: true, instructorId: true },
      orderBy: { id: 'desc' },
    });
    return training?.responsibleId ?? training?.instructorId ?? null;
  }

  // ── Ligações de leitura ────────────────────────────────────────────────────

  /** Formações (Trainings) e percursos (Learning Paths) que partilham o curso da formação. */
  async linkedModules(programId: number) {
    const program = await this.prisma.avatarTrainingProgram.findUnique({
      where: { id: programId },
      select: { id: true, courseId: true, responsibleId: true },
    });
    if (!program) throw new NotFoundException('Formação não encontrada');
    if (!program.courseId) return { courseId: null, trainings: [], learningPaths: [] };
    const [trainings, paths] = await Promise.all([
      this.prisma.training.findMany({
        where: { courseId: program.courseId, status: { in: ['PUBLISHED', 'COMPLETED'] } },
        select: {
          id: true,
          title: true,
          status: true,
          trainingPlanId: true,
          instructorId: true,
          responsibleId: true,
        },
        take: 20,
      }),
      this.prisma.learningPathCourse.findMany({
        where: { courseId: program.courseId, learningPath: { status: 'PUBLISHED' } },
        select: {
          required: true,
          learningPath: { select: { id: true, title: true, mandatory: true } },
        },
        take: 20,
      }),
    ]);
    return {
      courseId: program.courseId,
      trainings,
      learningPaths: paths.map(p => ({ ...p.learningPath, required: p.required })),
    };
  }
}

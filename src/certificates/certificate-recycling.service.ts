import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnrollmentRunReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';

const DAY_MS = 86_400_000;
const BATCH = 200;

export interface RecycleOptions {
  reason: EnrollmentRunReason;
  actorId?: number;
}

export interface RecycleResult {
  outcome: 'STARTED' | 'ALREADY_RECYCLED';
  enrollmentId: number;
  cycle: number;
}

/**
 * Reciclagem de formações. A matrícula continua única por (curso, utilizador);
 * cada reciclagem abre uma nova realização (EnrollmentRun) na mesma matrícula, que
 * volta a NOT_STARTED. O certificado da realização anterior fica intacto — a
 * conclusão da nova realização emite outro (ver CertificateIssuanceService).
 */
@Injectable()
export class CertificateRecyclingService {
  private readonly logger = new Logger(CertificateRecyclingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async recycle(enrollmentId: number, opts: RecycleOptions): Promise<RecycleResult> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { title: true, recyclingMode: true } } },
    });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');

    const mode = enrollment.course.recyclingMode;
    if (mode === 'OFF') {
      throw new ConflictException('A reciclagem está desactivada para este curso');
    }
    if (opts.reason === 'EXPIRY_AUTO' && mode !== 'AUTOMATIC') {
      throw new ConflictException('A reciclagem automática não está activa para este curso');
    }
    if (enrollment.status !== 'COMPLETED') {
      throw new ConflictException(
        'Só é possível reciclar uma matrícula concluída; a realização actual ainda está em curso',
      );
    }

    // A validade do certificado da realização que termina marca o novo prazo.
    const previous = await this.prisma.certificate.findFirst({
      where: {
        enrollmentId,
        enrollmentCycle: enrollment.cycle,
        revoked: false,
        deletedAt: null,
      },
      orderBy: { issuedAt: 'desc' },
      select: { id: true, expiresAt: true },
    });
    const now = new Date();
    const nextCycle = enrollment.cycle + 1;
    const deadline = previous?.expiresAt && previous.expiresAt > now ? previous.expiresAt : null;

    const started = await this.prisma.$transaction(async tx => {
      // Claim atómico: só uma chamada (ou instância do cron) vê count === 1.
      const claim = await tx.enrollment.updateMany({
        where: { id: enrollmentId, cycle: enrollment.cycle, status: 'COMPLETED' },
        data: {
          cycle: nextCycle,
          status: 'NOT_STARTED',
          progress: 0,
          startedAt: null,
          completedAt: null,
          cycleStartedAt: now,
          deadline,
        },
      });
      if (claim.count === 0) return false;

      // Matrículas criadas depois da migração podem não ter ainda a realização corrente.
      const closing = await tx.enrollmentRun.upsert({
        where: { enrollmentId_cycle: { enrollmentId, cycle: enrollment.cycle } },
        create: {
          enrollmentId,
          cycle: enrollment.cycle,
          startedAt: enrollment.cycleStartedAt ?? enrollment.startedAt ?? enrollment.enrolledAt,
          completedAt: enrollment.completedAt,
          closedAt: now,
          finalProgress: enrollment.progress,
        },
        update: { closedAt: now, finalProgress: enrollment.progress },
      });
      await tx.enrollmentRunLesson.deleteMany({ where: { runId: closing.id } });
      const lessonWhere = {
        userId: enrollment.userId,
        lesson: { module: { courseId: enrollment.courseId } },
      };
      const done = await tx.lessonProgress.findMany({
        where: lessonWhere,
        select: { lessonId: true, completed: true, completedAt: true, watchedSeconds: true },
      });
      // Preserva o detalhe por aula antes de o limpar (LessonProgress é único por aula/utilizador).
      if (done.length) {
        await tx.enrollmentRunLesson.createMany({
          data: done.map(l => ({ ...l, runId: closing.id })),
          skipDuplicates: true,
        });
      }
      await tx.enrollmentRun.create({
        data: {
          enrollmentId,
          cycle: nextCycle,
          reason: opts.reason,
          triggeredById: opts.actorId,
          fromCertificateId: previous?.id,
          startedAt: now,
        },
      });
      await tx.lessonProgress.deleteMany({ where: lessonWhere });
      return true;
    });

    if (!started) return { outcome: 'ALREADY_RECYCLED', enrollmentId, cycle: enrollment.cycle };

    await this.audit.log({
      action: 'ENROLLMENT_RECYCLED',
      entity: 'Enrollment',
      entityId: enrollmentId,
      userId: opts.actorId ?? enrollment.userId,
      metadata: {
        holderId: enrollment.userId,
        courseId: enrollment.courseId,
        fromCycle: enrollment.cycle,
        toCycle: nextCycle,
        reason: opts.reason,
        previousCertificateId: previous?.id ?? null,
      },
    });
    await createNotificationSafe(this.prisma, this.logger, {
      userId: enrollment.userId,
      type: 'ENROLLMENT_RECYCLED',
      message: `Foi iniciada a reciclagem do curso "${enrollment.course.title}". Conclua-o para renovar o seu certificado.`,
      metadata: { enrollmentId, courseId: enrollment.courseId, cycle: nextCycle },
    });
    return { outcome: 'STARTED', enrollmentId, cycle: nextCycle };
  }

  /**
   * Cron diário (via CertificateExpiryService): recicla as matrículas cujo certificado
   * vigente está a `recyclingLeadDays` de expirar, ou já expirou, em cursos AUTOMATIC.
   * Reprocessar é seguro — o claim de `recycle` só aceita uma vez por realização.
   */
  async runAutomatic(now: Date = new Date()): Promise<{ started: number }> {
    const courses = await this.prisma.course.findMany({
      where: { recyclingMode: 'AUTOMATIC' },
      select: { id: true, recyclingLeadDays: true },
    });
    let started = 0;
    for (const course of courses) {
      const limit = new Date(now.getTime() + course.recyclingLeadDays * DAY_MS);
      const certs = await this.prisma.certificate.findMany({
        where: {
          courseId: course.id,
          enrollmentId: { not: null },
          status: { in: ['ACTIVE', 'EXPIRED'] },
          revoked: false,
          deletedAt: null,
          expiresAt: { not: null, lte: limit },
          enrollment: { status: 'COMPLETED' },
        },
        take: BATCH,
        select: {
          enrollmentId: true,
          enrollmentCycle: true,
          enrollment: { select: { cycle: true } },
        },
      });
      for (const c of certs) {
        // Só o certificado da realização corrente justifica reciclar (os antigos já foram).
        if (!c.enrollmentId || c.enrollment?.cycle !== c.enrollmentCycle) continue;
        try {
          const r = await this.recycle(c.enrollmentId, { reason: 'EXPIRY_AUTO' });
          if (r.outcome === 'STARTED') started++;
        } catch (e) {
          this.logger.warn({
            enrollmentId: c.enrollmentId,
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao reciclar automaticamente uma matrícula',
          });
        }
      }
    }
    return { started };
  }

  /** Realizações da matrícula com o certificado de cada uma; `current` marca o vigente. */
  async listRuns(enrollmentId: number) {
    const [runs, certs] = await Promise.all([
      this.prisma.enrollmentRun.findMany({
        where: { enrollmentId },
        orderBy: { cycle: 'asc' },
        include: {
          lessons: {
            orderBy: { lessonId: 'asc' },
            select: { lessonId: true, completed: true, completedAt: true, watchedSeconds: true },
          },
        },
      }),
      this.prisma.certificate.findMany({
        where: { enrollmentId, deletedAt: null },
        orderBy: { issuedAt: 'asc' },
        select: {
          id: true,
          enrollmentCycle: true,
          status: true,
          revoked: true,
          issuedAt: true,
          expiresAt: true,
          code: true,
        },
      }),
    ]);
    const now = Date.now();
    const valid = certs.filter(
      c => c.status === 'ACTIVE' && !c.revoked && (!c.expiresAt || c.expiresAt.getTime() > now),
    );
    const currentId = valid.length ? valid[valid.length - 1].id : null;
    return runs.map(run => ({
      ...run,
      lessonsCompleted: run.lessons.filter(l => l.completed).length,
      certificates: certs
        .filter(c => c.enrollmentCycle === run.cycle)
        .map(c => ({ ...c, current: c.id === currentId })),
    }));
  }
}

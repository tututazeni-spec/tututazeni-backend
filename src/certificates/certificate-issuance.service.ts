import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  Certificate,
  CertificateActivityKind,
  CertificateIssueMode,
  CertificateType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import { CertificateFactsService } from './certificate-facts.service';
import { generateVerificationCode } from './certificate-code';
import { evaluateEligibility, MissingReason, RuleCriteria } from './certificate-rules';

export interface IssueInput {
  userId: number;
  activityKind: CertificateActivityKind;
  activityId: number;
  actorId?: number;
  trigger: 'AUTO' | 'MANUAL' | 'APPROVAL';
}

export interface IssueResult {
  outcome: 'ISSUED' | 'EXISTS' | 'PENDING_APPROVAL' | 'NOT_ELIGIBLE' | 'NO_RULE';
  certificate?: Certificate;
  missing?: MissingReason[];
}

interface EffectiveRule {
  mode: CertificateIssueMode;
  criteria: RuleCriteria;
  validityDays: number | null;
}

const DEFAULT_CYCLE = '1';

@Injectable()
export class CertificateIssuanceService {
  private readonly logger = new Logger(CertificateIssuanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facts: CertificateFactsService,
    private readonly audit: AuditService,
  ) {}

  async issue(input: IssueInput): Promise<IssueResult> {
    if (input.trigger === 'MANUAL' && !input.actorId) {
      throw new BadRequestException('Emissão manual exige o utilizador responsável');
    }

    const rule = await this.resolveRule(input.activityKind, input.activityId);
    if (!rule) return { outcome: 'NO_RULE' };

    const dedupKey = `${input.userId}:${input.activityKind}:${input.activityId}:${DEFAULT_CYCLE}`;
    const existing = await this.findExisting(input, dedupKey);
    if (existing) return { outcome: 'EXISTS', certificate: existing };

    // Revalida sempre no servidor — nunca confia no evento que despoletou a emissão.
    const collected = await this.facts.collect(input.userId, input.activityKind, input.activityId);
    const approvalMode = rule.mode === 'APPROVAL';
    // No modo APPROVAL as aprovações são o próprio passo seguinte, não pré-requisito.
    const evaluated = evaluateEligibility(rule.criteria, {
      ...collected,
      instructorApproved: approvalMode ? true : collected.instructorApproved,
      managerApproved: approvalMode ? true : collected.managerApproved,
    });
    if (!evaluated.eligible) return { outcome: 'NOT_ELIGIBLE', missing: evaluated.missing };

    const pending = approvalMode && input.trigger !== 'APPROVAL';
    const issuedAt = new Date();
    const expiresAt = rule.validityDays
      ? new Date(issuedAt.getTime() + rule.validityDays * 86_400_000)
      : null;
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { fullName: true },
    });
    const recipientName = user?.fullName ?? '';
    const code = generateVerificationCode();
    const enrollmentId =
      input.activityKind === 'COURSE'
        ? await this.enrollmentId(input.userId, input.activityId)
        : undefined;

    const snapshot = {
      code,
      recipientName,
      title: collected.title,
      hours: collected.hours,
      ...(collected.bestScore !== null ? { score: collected.bestScore } : {}),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      issuerName: 'INNOVA',
    };

    let certificate: Certificate;
    try {
      certificate = await this.prisma.certificate.create({
        data: {
          type: this.legacyType(input.activityKind),
          userId: input.userId,
          ...(input.activityKind === 'COURSE' ? { courseId: input.activityId, enrollmentId } : {}),
          ...(input.activityKind === 'EVENT' ? { eventId: input.activityId } : {}),
          activityKind: input.activityKind,
          activityId: input.activityId,
          cycleKey: DEFAULT_CYCLE,
          dedupKey,
          status: pending ? 'PENDING_APPROVAL' : 'ACTIVE',
          validationCode: code,
          code,
          recipientName,
          title: collected.title,
          score: collected.bestScore,
          hours: collected.hours,
          issuedAt,
          expiresAt,
          issuedById: input.actorId,
          snapshot: JSON.stringify(snapshot),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const winner = await this.prisma.certificate.findUnique({ where: { dedupKey } });
        if (winner) return { outcome: 'EXISTS', certificate: winner };
      }
      throw e;
    }

    await this.audit.log({
      action: 'CERTIFICATE_ISSUED',
      entity: 'Certificate',
      entityId: certificate.id,
      userId: input.actorId ?? input.userId,
      metadata: {
        holderId: input.userId,
        activityKind: input.activityKind,
        activityId: input.activityId,
        trigger: input.trigger,
        status: certificate.status,
      },
      strict: true,
    });

    if (pending) return { outcome: 'PENDING_APPROVAL', certificate };

    await this.notifyIssued(input.userId, collected.title, certificate.id);
    return { outcome: 'ISSUED', certificate };
  }

  async approve(certificateId: number, actorId: number): Promise<Certificate> {
    const cert = await this.prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!cert || cert.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Certificado não está pendente de aprovação');
    }
    const updated = await this.prisma.certificate.update({
      where: { id: certificateId },
      data: { status: 'ACTIVE', issuedById: actorId },
    });
    await this.audit.log({
      action: 'CERTIFICATE_APPROVED',
      entity: 'Certificate',
      entityId: certificateId,
      userId: actorId,
      metadata: { holderId: cert.userId, from: 'PENDING_APPROVAL', to: 'ACTIVE' },
      strict: true,
    });
    if (cert.userId) await this.notifyIssued(cert.userId, cert.title ?? 'formação', certificateId);
    return updated;
  }

  /**
   * Regra configurada, ou — para cursos/eventos ainda sem regra — a regra implícita
   * que reproduz o comportamento anterior (conclusão / presença).
   */
  private async resolveRule(
    kind: CertificateActivityKind,
    activityId: number,
  ): Promise<EffectiveRule | null> {
    const stored = await this.prisma.certificateRule.findUnique({
      where: { activityKind_activityId: { activityKind: kind, activityId } },
    });
    if (stored) {
      if (!stored.active) return null;
      return {
        mode: stored.mode,
        criteria: this.parseCriteria(stored.criteria),
        validityDays: stored.validityDays,
      };
    }
    if (kind === 'COURSE') {
      const course = await this.prisma.course.findUnique({
        where: { id: activityId },
        select: { certificateValidityDays: true },
      });
      return {
        mode: 'AUTOMATIC',
        criteria: { requireFullCompletion: true },
        validityDays: course?.certificateValidityDays ?? null,
      };
    }
    if (kind === 'EVENT') {
      return { mode: 'AUTOMATIC', criteria: { minAttendancePct: 100 }, validityDays: null };
    }
    return null;
  }

  private parseCriteria(raw: string): RuleCriteria {
    try {
      const parsed: RuleCriteria | null = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      this.logger.warn('CertificateRule.criteria inválido — tratado como sem critérios');
      return {};
    }
  }

  /** Inclui certificados anteriores à migração (sem dedupKey) para não os duplicar. */
  private findExisting(input: IssueInput, dedupKey: string): Promise<Certificate | null> {
    const legacy: Prisma.CertificateWhereInput[] = [];
    if (input.activityKind === 'COURSE') {
      legacy.push({ userId: input.userId, courseId: input.activityId });
    }
    if (input.activityKind === 'EVENT') {
      legacy.push({ userId: input.userId, eventId: input.activityId });
    }
    return this.prisma.certificate.findFirst({
      where: { deletedAt: null, OR: [{ dedupKey }, ...legacy] },
    });
  }

  private async enrollmentId(userId: number, courseId: number): Promise<number | undefined> {
    const e = await this.prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: { id: true },
    });
    return e?.id;
  }

  private legacyType(kind: CertificateActivityKind): CertificateType {
    return kind === 'TRAINING' ? CertificateType.TRAINING : CertificateType.COURSE;
  }

  private async notifyIssued(userId: number, title: string, certificateId: number) {
    await createNotificationSafe(this.prisma, this.logger, {
      userId,
      type: 'CERTIFICATE_ISSUED',
      message: `Certificado emitido para "${title}".`,
      metadata: { certificateId },
    });
  }
}

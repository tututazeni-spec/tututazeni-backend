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
import { BUILTIN_TEMPLATES } from './templates/builtin-templates';
import { CertificateTemplatesService } from './templates/certificate-templates.service';
import { generateVerificationCode } from './certificate-code';
import { evaluateEligibility, MissingReason, RuleCriteria } from './certificate-rules';
import { TemplateConfig } from './templates/template-config';

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
  templateId: string | null;
}

const DEFAULT_CYCLE = '1';

@Injectable()
export class CertificateIssuanceService {
  private readonly logger = new Logger(CertificateIssuanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facts: CertificateFactsService,
    private readonly audit: AuditService,
    private readonly templates: CertificateTemplatesService,
  ) {}

  async issue(input: IssueInput): Promise<IssueResult> {
    if (input.trigger === 'MANUAL' && !input.actorId) {
      throw new BadRequestException('Emissão manual exige o utilizador responsável');
    }

    const rule = await this.resolveRule(input.activityKind, input.activityId);
    if (!rule) return { outcome: 'NO_RULE' };

    // Reciclagem: cada realização da matrícula tem o seu certificado (chave `E<n>` a
    // partir da 2.ª); o contador de reemissão (cycleKey) é independente.
    const enrollment =
      input.activityKind === 'COURSE'
        ? await this.enrollmentRef(input.userId, input.activityId)
        : undefined;
    const enrollmentCycle = enrollment?.cycle ?? 1;
    const base = `${input.userId}:${input.activityKind}:${input.activityId}`;
    const dedupKey =
      enrollmentCycle > 1 ? `${base}:E${enrollmentCycle}` : `${base}:${DEFAULT_CYCLE}`;
    const existing = await this.findExisting(input, dedupKey, enrollmentCycle);
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
    const enrollmentId = enrollment?.id;

    const template = await this.resolveTemplate(rule.templateId);
    const snapshot = {
      template,
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
          enrollmentCycle,
          dedupKey,
          status: pending ? 'PENDING_APPROVAL' : 'ACTIVE',
          validationCode: code,
          code,
          templateId: template.id,
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
        templateId: stored.templateId,
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
        templateId: null,
      };
    }
    if (kind === 'EVENT') {
      return {
        mode: 'AUTOMATIC',
        criteria: { minAttendancePct: 100 },
        validityDays: null,
        templateId: null,
      };
    }
    if (kind === 'TRAINING') {
      // Mantém o interruptor existente da formação: sem `issueCertificate` não emite.
      const training = await this.prisma.training.findUnique({
        where: { id: activityId },
        select: { issueCertificate: true },
      });
      if (!training?.issueCertificate) return null;
      return {
        mode: 'AUTOMATIC',
        criteria: { requireFullCompletion: true },
        validityDays: null,
        templateId: null,
      };
    }
    if (kind === 'LEARNING_PATH') {
      return {
        mode: 'AUTOMATIC',
        criteria: { requireFullCompletion: true },
        validityDays: null,
        templateId: null,
      };
    }
    return null;
  }

  /**
   * Template da regra (ou o clássico) com a sua versão actual. Nunca falha a emissão:
   * um modelo desaparecido cai para o clássico e, em último caso, para o de origem.
   */
  private async resolveTemplate(
    templateId: string | null,
  ): Promise<{ id: string; version: number; config: TemplateConfig }> {
    try {
      return await this.templates.resolveForIssuance(templateId ?? undefined);
    } catch {
      this.logger.warn(
        `Modelo de certificado indisponível (${templateId ?? 'omissão'}); a usar o clássico`,
      );
    }
    try {
      return await this.templates.resolveForIssuance(undefined);
    } catch {
      return { id: BUILTIN_TEMPLATES[0].id, version: 1, config: BUILTIN_TEMPLATES[0].config };
    }
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
  private async findExisting(
    input: IssueInput,
    dedupKey: string,
    enrollmentCycle: number,
  ): Promise<Certificate | null> {
    const legacy: Prisma.CertificateWhereInput[] = [];
    // Os certificados anteriores à migração pertencem à 1.ª realização.
    if (input.activityKind === 'COURSE' && enrollmentCycle === 1) {
      legacy.push({ userId: input.userId, courseId: input.activityId });
    }
    if (input.activityKind === 'EVENT') {
      legacy.push({ userId: input.userId, eventId: input.activityId });
    }
    if (input.activityKind === 'TRAINING') {
      // O atalho antigo gravava `CERT-<ts>-<userId>-<sessionId>` sem referência à
      // formação: reconhece-se pelo id da sessão para não emitir um segundo certificado.
      const sessions = await this.prisma.trainingSession.findMany({
        where: { trainingId: input.activityId },
        select: { id: true },
      });
      if (sessions.length > 0) {
        legacy.push({
          userId: input.userId,
          type: CertificateType.TRAINING,
          activityKind: null,
          OR: sessions.map(s => ({
            validationCode: { endsWith: `-${input.userId}-${s.id}` },
          })),
        });
      }
    }
    return this.prisma.certificate.findFirst({
      where: { deletedAt: null, OR: [{ dedupKey }, ...legacy] },
    });
  }

  private enrollmentRef(
    userId: number,
    courseId: number,
  ): Promise<{ id: number; cycle: number } | null> {
    return this.prisma.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: { id: true, cycle: true },
    });
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

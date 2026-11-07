import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { MailService } from '../mail/mail.service';
import { buildVerifyUrl } from './certificate-renderer';
import { effectiveStatus } from './certificates.service';
import { EXPIRING_SOON_DAYS } from './certificates-admin.service';

export { buildLinkedInUrl } from './certificate-share';

const DAY_MS = 86_400_000;

export interface MySummary {
  emailEnabled: boolean;
  pending: { id: number; title: string }[];
  expiringSoon: { id: number; title: string; expiresAt: Date }[];
  mandatoryMissing: {
    enrollmentId: number;
    courseId: number;
    title: string;
    deadline: Date | null;
    status: string;
  }[];
}

/** Área pessoal do colaborador: resumo, partilha e envio por e-mail. */
@Injectable()
export class CertificatesMeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async mySummary(userId: number, now = new Date()): Promise<MySummary> {
    const soon = now.getTime() + EXPIRING_SOON_DAYS * DAY_MS;
    const [certs, enrollments, emailEnabled] = await Promise.all([
      this.prisma.certificate.findMany({
        where: { userId, deletedAt: null, holderHiddenAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          revoked: true,
          expiresAt: true,
          course: { select: { title: true } },
          event: { select: { title: true } },
        },
      }),
      this.prisma.enrollment.findMany({
        where: {
          userId,
          mandatory: true,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
        },
        select: {
          id: true,
          courseId: true,
          status: true,
          deadline: true,
          course: { select: { title: true } },
        },
        orderBy: { deadline: 'asc' },
      }),
      this.mail.isConfigured(),
    ]);

    const pending: MySummary['pending'] = [];
    const expiringSoon: MySummary['expiringSoon'] = [];
    for (const c of certs) {
      const title = c.title ?? c.course?.title ?? c.event?.title ?? 'Certificado';
      const status = effectiveStatus(c, now);
      if (status === 'PENDING_APPROVAL') pending.push({ id: c.id, title });
      if (status === 'ACTIVE' && c.expiresAt && c.expiresAt.getTime() <= soon) {
        expiringSoon.push({ id: c.id, title, expiresAt: c.expiresAt });
      }
    }

    return {
      emailEnabled,
      pending,
      expiringSoon,
      mandatoryMissing: enrollments.map(e => ({
        enrollmentId: e.id,
        courseId: e.courseId,
        title: e.course?.title ?? 'Formação',
        deadline: e.deadline,
        status: e.status,
      })),
    };
  }

  /**
   * "Remover da lista" um certificado revogado da lista do titular. Não elimina nada: marca-o
   * como oculto para o titular (`holderHiddenAt`); o registo continua nos relatórios,
   * na lista de administração e na auditoria.
   */
  async hideRevoked(id: number, user: { id: number }): Promise<{ hidden: true }> {
    const cert = await this.prisma.certificate.findFirst({
      where: { id, userId: user.id, deletedAt: null },
      select: { id: true, status: true, revoked: true, holderHiddenAt: true },
    });
    if (!cert) throw new NotFoundException('Certificado não encontrado');
    if (!cert.revoked && cert.status !== 'REVOKED') {
      throw new ConflictException('Só é possível remover da lista certificados revogados');
    }
    if (cert.holderHiddenAt) return { hidden: true };

    await this.prisma.certificate.update({
      where: { id },
      data: { holderHiddenAt: new Date() },
    });
    await this.audit.log({
      action: 'CERTIFICATE_HIDDEN_BY_HOLDER',
      entity: 'Certificate',
      entityId: id,
      userId: user.id,
      before: { status: 'REVOKED', visibleToHolder: true },
      after: { status: 'REVOKED', visibleToHolder: false },
      strict: true,
    });
    return { hidden: true };
  }

  /** O endereço de destino é sempre o do próprio titular, lido da BD (nunca do pedido). */
  async emailMe(id: number, user: { id: number }): Promise<{ emailed: true }> {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        revoked: true,
        expiresAt: true,
        title: true,
        validationCode: true,
      },
    });
    if (!cert || cert.userId !== user.id) throw new NotFoundException('Certificado não encontrado');
    if (effectiveStatus(cert) !== 'ACTIVE') {
      throw new ConflictException('Só é possível enviar certificados válidos');
    }
    if (!(await this.mail.isConfigured())) {
      throw new ConflictException('O envio de e-mail não está configurado nesta plataforma');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, fullName: true },
    });
    if (!owner?.email) throw new ConflictException('O utilizador não tem e-mail registado');

    const title = cert.title ?? 'formação';
    try {
      await this.mail.sendCertificateLink(
        owner.email,
        owner.fullName,
        title,
        buildVerifyUrl(cert.validationCode),
      );
    } catch {
      // SMTP configurado mas a falhar: erro claro em vez de um 500 genérico, e sem auditar um envio que não houve.
      throw new BadGatewayException(
        'Não foi possível enviar o e-mail agora. Tente novamente mais tarde.',
      );
    }
    await this.audit.log({
      action: 'CERTIFICATE_EMAILED_TO_SELF',
      entity: 'Certificate',
      entityId: id,
      userId: user.id,
      strict: true,
    });
    return { emailed: true };
  }
}

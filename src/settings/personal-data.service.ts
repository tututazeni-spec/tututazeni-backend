// LPDP (Angola) — direitos do titular executados de facto: exportação (acesso/portabilidade) e
// eliminação por anonimização. `PrivacySettingsService` só regista os pedidos (DataSubjectRequest);
// este serviço faz o trabalho e respeita `exportEnabled`/`anonymizationEnabled`/`autoDeleteOnRequest`.
//
// Anonimização em vez de DELETE: recibos, presenças e a cadeia de auditoria têm retenção legal e
// FKs; a pessoa deixa de ser identificável, os registos agregados mantêm-se.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DsrStatus, DsrType } from '@prisma/client';
import { SessionRevocationService } from '../auth/session-revocation.service';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';
import { resolveDefaultTenantId } from '../common/helpers/tenant.helper';
import { swallow } from '../common/logging/swallow';
import { decryptUserPii } from '../common/security/pii-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacySettings, parsePrivacySettings } from './privacy-settings';

const ANONYMIZED_DOMAIN = 'anonimizado.invalid';
const EXPORT_NOTIFICATIONS_LIMIT = 1000;

@Injectable()
export class PersonalDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionRevocationService,
  ) {}

  private async settings(): Promise<PrivacySettings> {
    const id = await resolveDefaultTenantId(this.prisma);
    const t = await this.prisma.tenantConfig.findUniqueOrThrow({
      where: { id },
      select: { privacySettingsJson: true },
    });
    return parsePrivacySettings(t.privacySettingsJson);
  }

  private async audit(actorId: number | undefined, action: string, metadata: unknown) {
    await writeChainedAuditLog(this.prisma, {
      userId: actorId,
      action,
      entity: 'User',
      severity: 'HIGH',
      metadata: JSON.stringify(metadata),
    }).catch(swallow('personal-data.service', 'falha ao gravar auditoria', undefined, 'error'));
  }

  /** Pacote JSON com os dados pessoais do titular (sem hash de senha, segredo 2FA nem tokens). */
  async exportUserData(userId: number, actorId?: number) {
    if (!(await this.settings()).exportEnabled) {
      throw new BadRequestException('A exportação de dados pessoais está desactivada');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const [
      profile,
      enrollments,
      certificates,
      badgeAwards,
      competencies,
      attendance,
      leaveRequests,
      payslips,
      notifications,
      dsrs,
    ] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.enrollment.findMany({ where: { userId } }),
      this.prisma.certificate.findMany({ where: { userId } }),
      this.prisma.badgeAward.findMany({ where: { userId } }),
      this.prisma.userCompetency.findMany({ where: { userId } }),
      this.prisma.attendanceRecord.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      this.prisma.leaveRequest.findMany({ where: { userId } }),
      this.prisma.payslip.findMany({
        where: { userId },
        select: {
          id: true,
          period: true,
          receiptCode: true,
          grossSalary: true,
          netSalary: true,
          status: true,
        },
      }),
      this.prisma.notificationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_NOTIFICATIONS_LIMIT,
      }),
      this.prisma.dataSubjectRequest.findMany({ where: { userId } }),
    ]);

    await this.audit(actorId ?? userId, 'PRIVACY_DATA_EXPORT', { userId });
    return {
      exportedAt: new Date().toISOString(),
      format: 'innova-personal-data/v1',
      user: decryptUserPii(user),
      profile,
      enrollments,
      certificates,
      badgeAwards,
      competencies,
      attendance,
      leaveRequests,
      payslips,
      notifications,
      dataSubjectRequests: dsrs,
    };
  }

  /** Torna o titular não identificável e encerra as suas sessões. Irreversível. */
  async anonymizeUser(userId: number, actorId?: number) {
    if (!(await this.settings()).anonymizationEnabled) {
      throw new BadRequestException('A anonimização está desactivada nas definições de privacidade');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    if (user.email.endsWith(`@${ANONYMIZED_DOMAIN}`)) {
      throw new BadRequestException('Este utilizador já foi anonimizado');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          fullName: `Utilizador anonimizado #${userId}`,
          email: `anonimizado-${userId}@${ANONYMIZED_DOMAIN}`,
          password: null,
          employeeNumber: null,
          username: null,
          avatarUrl: null,
          phone: null,
          birthDate: null,
          gender: null,
          country: null,
          city: null,
          preferredName: null,
          nationality: null,
          identificationNumber: null,
          personalEmail: null,
          alternatePhone: null,
          address: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          nif: null,
          nib: null,
          active: false,
          accountStatus: 'INACTIVE',
          mfaEnabled: false,
          twoFactorEnabled: false,
          twoFactorSecret: null,
        },
      }),
      this.prisma.profile.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.notificationLog.deleteMany({ where: { userId } }),
    ]);
    await this.sessions.revokeAllUserSessions(userId);
    await this.sessions.invalidateUserCache(userId);
    await this.audit(actorId, 'PRIVACY_USER_ANONYMIZED', { userId });
    return { userId, anonymized: true };
  }

  /** Executa um pedido: ACCESS/PORTABILITY → exporta; ERASURE → anonimiza. Marca-o como concluído. */
  async executeRequest(requestId: number, actorId?: number) {
    const request = await this.prisma.dataSubjectRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Pedido não encontrado');
    if (request.status === DsrStatus.COMPLETED || request.status === DsrStatus.REJECTED) {
      throw new BadRequestException('Este pedido já foi encerrado');
    }
    if (!request.userId) {
      throw new BadRequestException('O pedido não está associado a um utilizador da plataforma');
    }

    let result: unknown;
    if (request.type === DsrType.ACCESS || request.type === DsrType.PORTABILITY) {
      result = await this.exportUserData(request.userId, actorId);
    } else if (request.type === DsrType.ERASURE) {
      result = await this.anonymizeUser(request.userId, actorId);
    } else {
      throw new BadRequestException('Este tipo de pedido é tratado manualmente');
    }

    await this.prisma.dataSubjectRequest.update({
      where: { id: requestId },
      data: { status: DsrStatus.COMPLETED, handledById: actorId, resolvedAt: new Date() },
    });
    return result;
  }

  /** `autoDeleteOnRequest`: ao concluir um pedido de eliminação, anonimiza sem passo extra. */
  async afterRequestUpdated(
    request: { type: DsrType; status: DsrStatus; userId: number | null },
    actorId?: number,
  ) {
    if (request.type !== DsrType.ERASURE || request.status !== DsrStatus.COMPLETED) return;
    if (!request.userId || !(await this.settings()).autoDeleteOnRequest) return;
    await this.anonymizeUser(request.userId, actorId).catch(
      swallow('personal-data.service', 'auto-anonimização falhou', undefined, 'error'),
    );
  }

  /** Pedido do próprio titular (autoatendimento), ligado à sua conta. */
  async createOwnRequest(userId: number, type: DsrType, details?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    const tenantId = await resolveDefaultTenantId(this.prisma);
    const request = await this.prisma.dataSubjectRequest.create({
      data: {
        tenantId,
        userId: user.id,
        requesterName: user.fullName,
        requesterEmail: user.email,
        type,
        details,
      },
    });
    await this.audit(user.id, 'PRIVACY_DSR_SELF_CREATE', { id: request.id, type });
    return request;
  }
}

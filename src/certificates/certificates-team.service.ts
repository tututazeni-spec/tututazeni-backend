import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateScopeService, ScopeActor } from './certificate-scope.service';
import { effectiveStatus } from './certificates.service';

const DAY_MS = 86_400_000;
const EXPIRING_SOON_DAYS = 30;
const MAX_MEMBERS = 500;
// Matrícula "fechada": já não é uma formação em falta.
const CLOSED_ENROLLMENT = ['COMPLETED', 'CANCELLED', 'EXPIRED'];

export interface TeamMemberRow {
  userId: number;
  fullName: string;
  active: number;
  expired: number;
  expiringSoon: number;
  pendingApproval: number;
  mandatoryPending: number;
  inProgress: number;
}

export interface TeamSummary {
  members: TeamMemberRow[];
  totals: {
    members: number;
    active: number;
    expired: number;
    expiringSoon: number;
    pendingApproval: number;
    mandatoryPending: number;
    inProgress: number;
    mandatoryCoveragePct: number | null;
  };
}

/** Visão consolidada da equipa e verificação de âmbito para aprovações. */
@Injectable()
export class CertificatesTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: CertificateScopeService,
  ) {}

  async teamSummary(
    actor: ScopeActor,
    departmentId?: number,
    now = new Date(),
  ): Promise<TeamSummary> {
    const scope = await this.scope.resolveScope(actor);

    let memberWhere: { id: { in: number[] } } | { departmentId: number; active: true };
    if (scope.kind === 'TEAM') {
      // Gestor: só a equipa directa; qualquer departmentId do pedido é ignorado.
      memberWhere = { id: { in: scope.userIds } };
    } else {
      if (!departmentId) throw new BadRequestException('Indique o departamento');
      memberWhere = { departmentId, active: true };
    }

    const users = await this.prisma.user.findMany({
      where: memberWhere,
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
      take: MAX_MEMBERS,
    });
    const rows = new Map<number, TeamMemberRow>(
      users.map(u => [
        u.id,
        {
          userId: u.id,
          fullName: u.fullName,
          active: 0,
          expired: 0,
          expiringSoon: 0,
          pendingApproval: 0,
          mandatoryPending: 0,
          inProgress: 0,
        },
      ]),
    );
    const ids = [...rows.keys()];
    let mandatoryTotal = 0;
    let mandatoryCovered = 0;

    if (ids.length > 0) {
      const soon = now.getTime() + EXPIRING_SOON_DAYS * DAY_MS;
      const [certs, enrollments] = await Promise.all([
        this.prisma.certificate.findMany({
          where: { userId: { in: ids }, deletedAt: null },
          select: { userId: true, status: true, revoked: true, expiresAt: true },
        }),
        this.prisma.enrollment.findMany({
          where: { userId: { in: ids }, OR: [{ mandatory: true }, { status: 'IN_PROGRESS' }] },
          select: {
            userId: true,
            status: true,
            mandatory: true,
            certificates: {
              where: { deletedAt: null },
              select: { status: true, revoked: true, expiresAt: true },
            },
          },
        }),
      ]);

      for (const c of certs) {
        const row = c.userId !== null ? rows.get(c.userId) : undefined;
        if (!row) continue;
        const status = effectiveStatus(c, now);
        if (status === 'ACTIVE') {
          row.active++;
          if (c.expiresAt && c.expiresAt.getTime() <= soon) row.expiringSoon++;
        } else if (status === 'EXPIRED') row.expired++;
        else if (status === 'PENDING_APPROVAL') row.pendingApproval++;
      }

      for (const e of enrollments) {
        const row = rows.get(e.userId);
        if (!row) continue;
        if (e.status === 'IN_PROGRESS') row.inProgress++;
        if (!e.mandatory) continue;
        if (!CLOSED_ENROLLMENT.includes(e.status)) row.mandatoryPending++;
        if (e.status !== 'CANCELLED' && e.status !== 'EXPIRED') {
          mandatoryTotal++;
          if (
            e.status === 'COMPLETED' &&
            e.certificates.some(c => effectiveStatus(c, now) === 'ACTIVE')
          ) {
            mandatoryCovered++;
          }
        }
      }
    }

    const members = [...rows.values()];
    const sum = (k: keyof Omit<TeamMemberRow, 'userId' | 'fullName'>) =>
      members.reduce((n, m) => n + m[k], 0);
    return {
      members,
      totals: {
        members: members.length,
        active: sum('active'),
        expired: sum('expired'),
        expiringSoon: sum('expiringSoon'),
        pendingApproval: sum('pendingApproval'),
        mandatoryPending: sum('mandatoryPending'),
        inProgress: sum('inProgress'),
        mandatoryCoveragePct:
          mandatoryTotal === 0 ? null : Math.round((mandatoryCovered / mandatoryTotal) * 100),
      },
    };
  }

  /** ADMIN/RH aprovam qualquer um; um gestor só os da sua equipa (404 fora dela). */
  async assertCanApprove(actor: ScopeActor, certificateId: number): Promise<void> {
    const scope = await this.scope.resolveScope(actor);
    if (scope.kind === 'ALL') return;
    const cert = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      select: { userId: true },
    });
    if (!cert || cert.userId === null || !scope.userIds.includes(cert.userId)) {
      throw new NotFoundException('Certificado não encontrado');
    }
  }
}

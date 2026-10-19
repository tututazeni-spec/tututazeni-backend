import { Injectable } from '@nestjs/common';
import { CertificateOrigin, CertificateStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeVerificationCode } from './certificate-code';
import type { CertificateScope } from './certificate-scope.service';
import { effectiveStatus } from './certificates.service';
import {
  EffectiveStatusFilter,
  HistoryQueryDto,
  ListCertificatesQueryDto,
} from './certificates-admin.dto';

export const EXPIRING_SOON_DAYS = 30;
const DAY_MS = 86_400_000;
const DEFAULT_LIMIT = 20;

export interface AdminCertificateRow {
  id: number;
  holderName: string;
  departmentName: string | null;
  title: string;
  activityKind: string | null;
  origin: CertificateOrigin;
  status: CertificateStatus;
  code: string;
  issuedAt: Date;
  expiresAt: Date | null;
  hours: number | null;
}

export interface AdminOverview {
  total: number;
  active: number;
  pendingApproval: number;
  expired: number;
  expiringSoon: number;
  revoked: number;
  mandatoryCoveragePct: number | null;
}

export interface HistoryRow {
  id: number;
  action: string;
  userName: string | null;
  certificateId: number | null;
  timestamp: Date;
  reason: string | null;
  metadata: unknown;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Filtros por estado EFECTIVO (revogação > expiração > gravado), nunca só `status`. */
function activeWhere(now: Date): Prisma.CertificateWhereInput {
  return {
    deletedAt: null,
    revoked: false,
    status: 'ACTIVE',
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

function expiredWhere(now: Date): Prisma.CertificateWhereInput {
  return {
    deletedAt: null,
    revoked: false,
    status: { in: ['ACTIVE', 'EXPIRED'] },
    expiresAt: { lte: now },
  };
}

const revokedWhere: Prisma.CertificateWhereInput = {
  deletedAt: null,
  OR: [{ revoked: true }, { status: 'REVOKED' }],
};

const pendingWhere: Prisma.CertificateWhereInput = {
  deletedAt: null,
  revoked: false,
  status: 'PENDING_APPROVAL',
};

function statusWhere(status: EffectiveStatusFilter, now: Date): Prisma.CertificateWhereInput {
  switch (status) {
    case 'ACTIVE':
      return activeWhere(now);
    case 'EXPIRED':
      return expiredWhere(now);
    case 'REVOKED':
      return revokedWhere;
    case 'PENDING_APPROVAL':
      return pendingWhere;
  }
}

@Injectable()
export class CertificatesAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(
    now = new Date(),
    scope: CertificateScope = { kind: 'ALL' },
  ): Promise<AdminOverview> {
    const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
    const c = this.prisma.certificate;
    // Âmbito de equipa: todas as contagens (e a cobertura) ficam limitadas aos titulares da equipa.
    const holder = scope.kind === 'TEAM' ? { userId: { in: scope.userIds } } : {};
    const [total, active, pendingApproval, expired, expiringSoon, revoked] = await Promise.all([
      c.count({ where: { deletedAt: null, ...holder } }),
      c.count({ where: { ...activeWhere(now), ...holder } }),
      c.count({ where: { ...pendingWhere, ...holder } }),
      c.count({ where: { ...expiredWhere(now), ...holder } }),
      c.count({
        where: {
          deletedAt: null,
          revoked: false,
          status: 'ACTIVE',
          expiresAt: { gt: now, lte: soon },
          ...holder,
        },
      }),
      c.count({ where: { ...revokedWhere, ...holder } }),
    ]);

    const [mandatory, covered] = await Promise.all([
      this.prisma.enrollment.count({ where: { mandatory: true, ...holder } }),
      this.prisma.enrollment.count({
        where: {
          mandatory: true,
          status: 'COMPLETED',
          certificate: { is: activeWhere(now) },
          ...holder,
        },
      }),
    ]);

    return {
      total,
      active,
      pendingApproval,
      expired,
      expiringSoon,
      revoked,
      mandatoryCoveragePct: mandatory === 0 ? null : Math.round((covered / mandatory) * 100),
    };
  }

  private toRow(
    r: {
      id: number;
      recipientName: string | null;
      title: string | null;
      activityKind: AdminCertificateRow['activityKind'];
      origin: CertificateOrigin;
      status: CertificateStatus;
      revoked: boolean;
      validationCode: string;
      issuedAt: Date;
      expiresAt: Date | null;
      hours: number | null;
      user: { fullName: string; department: { name: string } | null } | null;
      course: { title: string } | null;
      event: { title: string } | null;
    },
    now: Date,
  ): AdminCertificateRow {
    return {
      id: r.id,
      holderName: r.recipientName ?? r.user?.fullName ?? '',
      departmentName: r.user?.department?.name ?? null,
      title: r.title ?? r.course?.title ?? r.event?.title ?? 'Certificado',
      activityKind: r.activityKind,
      origin: r.origin,
      status: effectiveStatus(r, now),
      code: r.validationCode,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
      hours: r.hours,
    };
  }

  /** `null` quando o filtro por código é inválido (resultado vazio garantido, sem consultar a BD). */
  private buildWhere(
    q: ListCertificatesQueryDto,
    now: Date,
    scope: CertificateScope,
  ): Prisma.CertificateWhereInput | null {
    const and: Prisma.CertificateWhereInput[] = [{ deletedAt: null }];
    // O âmbito só restringe: filtros do pedido nunca o alargam.
    if (scope.kind === 'TEAM') and.push({ userId: { in: scope.userIds } });
    if (q.status) and.push(statusWhere(q.status, now));
    if (q.activityKind) and.push({ activityKind: q.activityKind });
    if (q.courseId) and.push({ courseId: q.courseId });
    if (q.departmentId) and.push({ user: { departmentId: q.departmentId } });
    if (q.issuedFrom || q.issuedTo) {
      and.push({
        issuedAt: {
          ...(q.issuedFrom ? { gte: new Date(q.issuedFrom) } : {}),
          ...(q.issuedTo ? { lte: new Date(q.issuedTo) } : {}),
        },
      });
    }
    if (q.expiresFrom || q.expiresTo) {
      and.push({
        expiresAt: {
          ...(q.expiresFrom ? { gte: new Date(q.expiresFrom) } : {}),
          ...(q.expiresTo ? { lte: new Date(q.expiresTo) } : {}),
        },
      });
    }
    if (q.code !== undefined) {
      const code = normalizeVerificationCode(q.code);
      if (!code) return null;
      and.push({ validationCode: code });
    }
    const search = q.search?.trim();
    if (search) {
      const contains = { contains: search, mode: 'insensitive' as const };
      and.push({
        OR: [
          { recipientName: contains },
          { title: contains },
          { user: { fullName: contains } },
          { course: { title: contains } },
          { event: { title: contains } },
        ],
      });
    }
    return { AND: and };
  }

  async list(
    q: ListCertificatesQueryDto,
    now = new Date(),
    scope: CertificateScope = { kind: 'ALL' },
  ): Promise<Paginated<AdminCertificateRow>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? DEFAULT_LIMIT;
    const empty = { data: [], total: 0, page, limit, totalPages: 0 };

    const where = this.buildWhere(q, now, scope);
    if (!where) return empty;
    const order = q.order ?? 'desc';
    const sort = q.sort ?? 'issuedAt';
    const orderBy: Prisma.CertificateOrderByWithRelationInput =
      sort === 'holderName' ? { user: { fullName: order } } : { [sort]: order };

    const [total, rows] = await Promise.all([
      this.prisma.certificate.count({ where }),
      this.prisma.certificate.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { fullName: true, department: { select: { name: true } } } },
          course: { select: { title: true } },
          event: { select: { title: true } },
        },
      }),
    ]);

    return {
      data: rows.map(r => this.toRow(r, now)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Todas as linhas dos filtros (sem paginação), no âmbito do actor, até `max` linhas. */
  async exportRows(
    q: ListCertificatesQueryDto,
    scope: CertificateScope,
    now: Date,
    max: number,
  ): Promise<AdminCertificateRow[]> {
    const where = this.buildWhere(q, now, scope);
    if (!where) return [];
    const order = q.order ?? 'desc';
    const sort = q.sort ?? 'issuedAt';
    const orderBy: Prisma.CertificateOrderByWithRelationInput =
      sort === 'holderName' ? { user: { fullName: order } } : { [sort]: order };
    const rows = await this.prisma.certificate.findMany({
      where,
      orderBy,
      take: max,
      include: {
        user: { select: { fullName: true, department: { select: { name: true } } } },
        course: { select: { title: true } },
        event: { select: { title: true } },
      },
    });
    return rows.map(r => this.toRow(r, now));
  }

  /** Modelos existentes, só para consulta (sem html/css). A edição pertence à fase dos templates. */
  templates() {
    return this.prisma.certificateTemplate.findMany({
      where: { deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        isDefault: true,
        isActive: true,
        validityDays: true,
        signatoryName: true,
        signatoryTitle: true,
      },
    });
  }

  /** Histórico de emissões, aprovações e alterações de regras (campo `entity`, nunca `entityType`). */
  async history(q: HistoryQueryDto): Promise<Paginated<HistoryRow>> {
    const page = q.page ?? 1;
    const limit = q.limit ?? DEFAULT_LIMIT;
    const where: Prisma.AuditLogWhereInput = q.certificateId
      ? { entity: 'Certificate', entityId: q.certificateId }
      : { entity: { in: ['Certificate', 'CertificateRule'] } };
    if (q.action) where.action = q.action;

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { fullName: true } } },
      }),
    ]);

    return {
      data: rows.map(r => ({
        id: r.id,
        action: r.action,
        userName: r.user?.fullName ?? null,
        certificateId: r.entity === 'Certificate' ? r.entityId : null,
        timestamp: r.timestamp,
        reason: r.reason,
        metadata: parseJson(r.metadata),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

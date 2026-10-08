// modulo_monitoring.md §8 — Incidentes.
//
// Vista única sobre os dois registos de incidentes que já existem: operacionais
// (`ScalabilityIncident`, geridos aqui) e de segurança (`SecurityIncident`,
// geridos no módulo Audit — aqui só leitura). Estados normalizados em
// Activo/Resolvido com a mesma regra da Visão Geral. O tempo de resolução é
// sempre derivado das datas; a timeline vem do Audit (quem mudou o quê) mais o
// marco de criação.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RiskLevel, ScalabilityIncident, SecurityIncident } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityIncidentsService } from '../scalability/scalability-incidents.service';
import { CreateIncidentDto, UpdateIncidentDto } from '../scalability/scalability-incidents.dto';
import {
  IncidentKind,
  ListMonitoringIncidentsQueryDto,
  UnifiedSeverity,
} from './monitoring-incidents.dto';

const LIST_CAP = 300;
const MTTR_WINDOW_DAYS = 90;
const OP_ACTIVE = ['OPEN', 'INVESTIGATING', 'MITIGATING'];
const SEC_ACTIVE = ['OPEN', 'IN_ANALYSIS'];

const OP_SEVERITY: Record<ScalabilityIncident['severity'], UnifiedSeverity> = {
  CRITICAL: 'CRITICAL',
  WARNING: 'MEDIUM',
  INFO: 'LOW',
};
const SEC_SEVERITY: Record<RiskLevel, UnifiedSeverity> = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

const SEVERITY_RANK: Record<UnifiedSeverity, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

interface UnifiedIncident {
  key: string;
  kind: IncidentKind;
  id: string;
  code: string;
  title: string;
  severity: UnifiedSeverity;
  severityRaw: string;
  status: string;
  group: 'ACTIVE' | 'RESOLVED';
  component: string;
  impact: string | null;
  affectedUsers: number | null;
  ownerId: number | null;
  ownerName: string | null;
  cause: string | null;
  resolution: string | null;
  occurredAt: string;
  resolvedAt: string | null;
  resolutionMinutes: number | null;
  ageMinutes: number;
  managedIn: 'monitoring' | 'audit';
}

const minutes = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));

@Injectable()
export class MonitoringIncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operational: ScalabilityIncidentsService,
  ) {}

  private async names(ids: (number | null)[]) {
    const nums = [...new Set(ids.filter((i): i is number => !!i))];
    if (!nums.length) return new Map<number, string>();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: nums } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map(u => [u.id, u.fullName]));
  }

  private fromOperational(i: ScalabilityIncident, names: Map<number, string>): UnifiedIncident {
    const end = i.resolvedAt ?? i.closedAt;
    return {
      key: `OPERATIONAL:${i.id}`,
      kind: 'OPERATIONAL',
      id: i.id,
      code: `OPS-${i.id.slice(-6).toUpperCase()}`,
      title: i.title,
      severity: OP_SEVERITY[i.severity],
      severityRaw: i.severity,
      status: i.status,
      group: OP_ACTIVE.includes(i.status) ? 'ACTIVE' : 'RESOLVED',
      component: i.component,
      impact: i.impact,
      affectedUsers: i.affectedUsers,
      ownerId: i.ownerId,
      ownerName: i.ownerId ? (names.get(i.ownerId) ?? null) : null,
      cause: i.rootCause,
      resolution: i.actionTaken,
      occurredAt: i.occurredAt.toISOString(),
      resolvedAt: end?.toISOString() ?? null,
      resolutionMinutes: end ? minutes(i.occurredAt, end) : null,
      ageMinutes: minutes(i.occurredAt, end ?? new Date()),
      managedIn: 'monitoring',
    };
  }

  private fromSecurity(i: SecurityIncident, names: Map<number, string>): UnifiedIncident {
    const end = i.closedAt;
    return {
      key: `SECURITY:${i.id}`,
      kind: 'SECURITY',
      id: String(i.id),
      code: i.code,
      title: i.title,
      severity: SEC_SEVERITY[i.severity],
      severityRaw: i.severity,
      status: i.status,
      group: SEC_ACTIVE.includes(i.status) ? 'ACTIVE' : 'RESOLVED',
      component: i.category,
      impact: i.description,
      affectedUsers: null,
      ownerId: i.assigneeId,
      ownerName: i.assigneeId ? (names.get(i.assigneeId) ?? null) : null,
      cause: null,
      resolution: i.resolution,
      occurredAt: i.detectedAt.toISOString(),
      resolvedAt: end?.toISOString() ?? null,
      resolutionMinutes: end ? minutes(i.detectedAt, end) : null,
      ageMinutes: minutes(i.detectedAt, end ?? new Date()),
      managedIn: 'audit',
    };
  }

  async list(q: ListMonitoringIncidentsQueryDto) {
    const wantOp = !q.kind || q.kind === 'OPERATIONAL';
    const wantSec = !q.kind || q.kind === 'SECURITY';
    const [ops, secs] = await Promise.all([
      wantOp
        ? this.prisma.read.scalabilityIncident.findMany({
            orderBy: { occurredAt: 'desc' },
            take: LIST_CAP,
          })
        : [],
      wantSec
        ? this.prisma.read.securityIncident.findMany({
            orderBy: { detectedAt: 'desc' },
            take: LIST_CAP,
          })
        : [],
    ]);
    const names = await this.names([...ops.map(o => o.ownerId), ...secs.map(s => s.assigneeId)]);

    const all = [
      ...ops.map(o => this.fromOperational(o, names)),
      ...secs.map(s => this.fromSecurity(s, names)),
    ];
    // Activos primeiro, depois mais graves, depois mais recentes.
    all.sort(
      (a, b) =>
        Number(b.group === 'ACTIVE') - Number(a.group === 'ACTIVE') ||
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.occurredAt.localeCompare(a.occurredAt),
    );

    const incidents = all.filter(
      i => (!q.group || i.group === q.group) && (!q.severity || i.severity === q.severity),
    );

    const active = all.filter(i => i.group === 'ACTIVE');
    const since = Date.now() - MTTR_WINDOW_DAYS * 86_400_000;
    const solved = all.filter(
      i => i.resolutionMinutes !== null && new Date(i.occurredAt).getTime() >= since,
    );
    return {
      incidents,
      summary: {
        active: active.length,
        activeCritical: active.filter(i => i.severity === 'CRITICAL').length,
        resolved: all.length - active.length,
        meanTimeToResolveMinutes: solved.length
          ? Math.round(solved.reduce((s, i) => s + (i.resolutionMinutes ?? 0), 0) / solved.length)
          : null,
        mttrWindowDays: MTTR_WINDOW_DAYS,
        byKind: {
          OPERATIONAL: active.filter(i => i.kind === 'OPERATIONAL').length,
          SECURITY: active.filter(i => i.kind === 'SECURITY').length,
        },
      },
      note: 'Os incidentes de segurança são geridos no módulo Audit; aqui são apenas consultados.',
    };
  }

  async detail(kind: IncidentKind, id: string) {
    let incident: UnifiedIncident;
    let audit: {
      action: string;
      createdAt: Date;
      metadata: string | null;
      user: { fullName: string } | null;
    }[];

    if (kind === 'OPERATIONAL') {
      const row = await this.prisma.read.scalabilityIncident.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Incidente não encontrado');
      incident = this.fromOperational(row, await this.names([row.ownerId]));
      audit = await this.prisma.read.auditLog.findMany({
        where: { entity: 'ScalabilityIncident', metadata: { contains: `"entityId":"${row.id}"` } },
        orderBy: { createdAt: 'asc' },
        take: 100,
        select: {
          action: true,
          createdAt: true,
          metadata: true,
          user: { select: { fullName: true } },
        },
      });
      return this.withExtras(incident, audit, {
        postMortem: row.postMortem,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt ?? row.closedAt,
      });
    }

    const numId = Number(id);
    if (!Number.isInteger(numId)) throw new BadRequestException('Identificador inválido');
    const row = await this.prisma.read.securityIncident.findUnique({ where: { id: numId } });
    if (!row) throw new NotFoundException('Incidente não encontrado');
    incident = this.fromSecurity(row, await this.names([row.assigneeId]));
    audit = await this.prisma.read.auditLog.findMany({
      where: { entity: 'SecurityIncident', entityId: numId },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        action: true,
        createdAt: true,
        metadata: true,
        user: { select: { fullName: true } },
      },
    });
    return this.withExtras(incident, audit, {
      postMortem: null,
      createdAt: row.createdAt,
      resolvedAt: row.closedAt,
    });
  }

  private withExtras(
    incident: UnifiedIncident,
    audit: {
      action: string;
      createdAt: Date;
      metadata: string | null;
      user: { fullName: string } | null;
    }[],
    extra: { postMortem: string | null; createdAt: Date; resolvedAt: Date | null },
  ) {
    const timeline = [
      {
        at: incident.occurredAt,
        type: 'DETECTED',
        label: 'Incidente registado',
        actor: null as string | null,
        changes: null as unknown,
      },
      ...audit.map(a => {
        let changes: unknown = null;
        try {
          changes = (JSON.parse(a.metadata ?? '{}') as { changes?: unknown }).changes ?? null;
        } catch {
          /* metadata alheia — ignora */
        }
        return {
          at: a.createdAt.toISOString(),
          type: a.action,
          label: a.action,
          actor: a.user?.fullName ?? null,
          changes,
        };
      }),
    ];
    // Sem evento de estado no Audit (ex.: registo antigo), garante o marco de resolução.
    if (extra.resolvedAt && !audit.some(a => a.action.includes('STATUS'))) {
      timeline.push({
        at: extra.resolvedAt.toISOString(),
        type: 'RESOLVED',
        label: 'Resolvido',
        actor: null,
        changes: null,
      });
    }
    timeline.sort((a, b) => a.at.localeCompare(b.at));
    return { ...incident, postMortem: extra.postMortem, timeline };
  }

  // Escrita: apenas incidentes operacionais (registados no Audit pelo serviço base).
  create(dto: CreateIncidentDto, actorId: number) {
    return this.operational.create(dto, actorId);
  }

  update(id: string, dto: UpdateIncidentDto, actorId: number) {
    return this.operational.update(id, dto, actorId);
  }
}

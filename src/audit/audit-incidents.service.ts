// src/audit/audit-incidents.service.ts
// Aba «Segurança e Incidentes» (docs/modulo_audit.md §8). Um incidente é uma
// pista a investigar por pessoas autorizadas — uma deteção automática não é
// prova de fraude. Todas as operações ficam registadas como eventos de auditoria.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SecurityIncidentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import {
  AssignIncidentDto,
  CreateIncidentDto,
  IncidentEvidenceDto,
  IncidentFilterDto,
  IncidentStatusDto,
  UpdateIncidentDto,
} from './audit-incidents.dto';
import { buildPaginatedResponse, calculatePagination } from '../common/helpers/pagination.helper';

const TRANSITIONS: Record<SecurityIncidentStatus, SecurityIncidentStatus[]> = {
  OPEN: ['IN_ANALYSIS'],
  IN_ANALYSIS: ['MITIGATED', 'CLOSED'],
  MITIGATED: ['IN_ANALYSIS', 'CLOSED'],
  CLOSED: ['IN_ANALYSIS'],
};

export interface AuditActor {
  id: number;
  ip?: string;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

@Injectable()
export class AuditIncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private code(id: number, createdAt: Date): string {
    return `INC-${createdAt.getUTCFullYear()}-${String(id).padStart(5, '0')}`;
  }

  private async usersById(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((i): i is number => typeof i === 'number'))];
    if (!unique.length) return new Map<number, { id: number; fullName: string; email: string }>();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true, email: true },
    });
    return new Map(users.map(u => [u.id, u]));
  }

  private async assertUser(id: number) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!u) throw new BadRequestException(`Utilizador ${id} não existe`);
  }

  private async assertAuditLog(id: number) {
    const l = await this.prisma.auditLog.findUnique({ where: { id }, select: { id: true } });
    if (!l) throw new BadRequestException(`Evento de auditoria ${id} não existe`);
  }

  private async find(id: number) {
    const inc = await this.prisma.securityIncident.findUnique({ where: { id } });
    if (!inc) throw new NotFoundException(`Incidente ${id} não encontrado`);
    return inc;
  }

  private record(
    actor: AuditActor,
    action: string,
    id: number,
    extra: Record<string, unknown> = {},
  ) {
    return this.audit.log({
      userId: actor.id,
      action,
      entity: 'SecurityIncident',
      entityId: id,
      ip: actor.ip,
      severity: 'MEDIUM',
      metadata: extra,
    });
  }

  async list(filters: IncidentFilterDto) {
    const { page = 1, limit = 20, status, severity, category, assigneeId, search } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.SecurityIncidentWhereInput = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (category) where.category = category;
    if (assigneeId) where.assigneeId = assigneeId;
    const term = search?.trim();
    if (term) {
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rows, total, byStatus, openBySeverity] = await Promise.all([
      this.prisma.read.securityIncident.findMany({
        where,
        skip,
        take,
        orderBy: { detectedAt: 'desc' },
        include: { _count: { select: { evidences: true } } },
      }),
      this.prisma.read.securityIncident.count({ where }),
      this.prisma.read.securityIncident.groupBy({ by: ['status'], _count: true }),
      this.prisma.read.securityIncident.groupBy({
        by: ['severity'],
        where: { status: { not: 'CLOSED' } },
        _count: true,
      }),
    ]);

    const users = await this.usersById(rows.map(r => r.assigneeId));
    const data = rows.map(({ _count, ...r }) => ({
      ...r,
      evidenceCount: _count.evidences,
      assignee: r.assigneeId ? (users.get(r.assigneeId) ?? null) : null,
    }));

    return {
      ...buildPaginatedResponse(data, total, page, limit),
      counts: {
        byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
        openBySeverity: Object.fromEntries(openBySeverity.map(s => [s.severity, s._count])),
      },
    };
  }

  async get(id: number) {
    const inc = await this.find(id);
    const evidences = await this.prisma.read.securityIncidentEvidence.findMany({
      where: { incidentId: id },
      orderBy: { createdAt: 'desc' },
    });
    const logIds = evidences.map(e => e.auditLogId).filter((x): x is number => x != null);
    const [logs, history] = await Promise.all([
      logIds.length
        ? this.prisma.read.auditLog.findMany({
            where: { id: { in: logIds } },
            select: {
              id: true,
              action: true,
              entity: true,
              entityId: true,
              severity: true,
              status: true,
              timestamp: true,
              user: { select: { id: true, fullName: true } },
            },
          })
        : Promise.resolve([]),
      this.prisma.read.auditLog.findMany({
        where: { entity: 'SecurityIncident', entityId: id },
        orderBy: { timestamp: 'asc' },
        take: 100,
        select: { id: true, action: true, timestamp: true, metadata: true, userId: true },
      }),
    ]);
    const users = await this.usersById([
      inc.assigneeId,
      inc.createdById,
      ...evidences.map(e => e.addedById),
      ...history.map(h => h.userId),
    ]);
    const logMap = new Map(logs.map(l => [l.id, l]));
    const u = (i: number | null) => (i ? (users.get(i) ?? null) : null);

    return {
      ...inc,
      assignee: u(inc.assigneeId),
      createdBy: u(inc.createdById),
      evidences: evidences.map(e => ({
        ...e,
        addedBy: u(e.addedById),
        auditLog: e.auditLogId ? (logMap.get(e.auditLogId) ?? null) : null,
      })),
      history: history.map(h => ({
        id: h.id,
        action: h.action,
        timestamp: h.timestamp,
        user: u(h.userId),
        metadata: h.metadata ? safeJson(h.metadata) : null,
      })),
    };
  }

  async create(dto: CreateIncidentDto, actor: AuditActor) {
    if (dto.assigneeId) await this.assertUser(dto.assigneeId);
    if (dto.auditLogId) await this.assertAuditLog(dto.auditLogId);

    const created = await this.prisma.securityIncident.create({
      data: {
        code: `TMP-${randomUUID()}`,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        category: dto.category,
        type: dto.type,
        severity: dto.severity,
        source: dto.source ?? 'USER',
        sourceLabel: dto.sourceLabel?.trim() || null,
        assigneeId: dto.assigneeId ?? null,
        createdById: actor.id,
      },
    });
    const inc = await this.prisma.securityIncident.update({
      where: { id: created.id },
      data: { code: this.code(created.id, created.createdAt) },
    });
    if (dto.auditLogId) {
      await this.prisma.securityIncidentEvidence.create({
        data: { incidentId: inc.id, auditLogId: dto.auditLogId, addedById: actor.id },
      });
    }
    await this.record(actor, 'INCIDENT_CREATED', inc.id, {
      code: inc.code,
      severity: inc.severity,
      category: inc.category,
    });
    return inc;
  }

  async update(id: number, dto: UpdateIncidentDto, actor: AuditActor) {
    const before = await this.find(id);
    if (before.status === 'CLOSED') {
      throw new BadRequestException(
        'Um incidente encerrado não pode ser editado; reabra-o primeiro',
      );
    }
    const data: Prisma.SecurityIncidentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.severity !== undefined) data.severity = dto.severity;
    const inc = await this.prisma.securityIncident.update({ where: { id }, data });
    await this.record(actor, 'INCIDENT_UPDATED', id, { fields: Object.keys(data) });
    return inc;
  }

  async assign(id: number, dto: AssignIncidentDto, actor: AuditActor) {
    const before = await this.find(id);
    if (before.status === 'CLOSED') {
      throw new BadRequestException('Reabra o incidente antes de alterar o responsável');
    }
    await this.assertUser(dto.assigneeId);
    const inc = await this.prisma.securityIncident.update({
      where: { id },
      data: { assigneeId: dto.assigneeId },
    });
    await this.record(actor, 'INCIDENT_ASSIGNED', id, {
      from: before.assigneeId,
      to: dto.assigneeId,
    });
    return inc;
  }

  async changeStatus(id: number, dto: IncidentStatusDto, actor: AuditActor) {
    const before = await this.find(id);
    if (!TRANSITIONS[before.status].includes(dto.status)) {
      throw new BadRequestException(`Transição inválida: ${before.status} → ${dto.status}`);
    }
    const resolution = dto.resolution?.trim();
    if ((dto.status === 'MITIGATED' || dto.status === 'CLOSED') && !resolution) {
      throw new BadRequestException('Indique as medidas tomadas / a conclusão (resolução)');
    }
    const data: Prisma.SecurityIncidentUpdateInput = { status: dto.status };
    if (resolution) data.resolution = resolution;
    // Atribuição ao responsável: quem pega no incidente fica responsável.
    if (dto.status === 'IN_ANALYSIS' && !before.assigneeId) {
      data.assigneeId = actor.id;
    }
    data.closedAt = dto.status === 'CLOSED' ? new Date() : null;
    const inc = await this.prisma.securityIncident.update({ where: { id }, data });
    await this.record(actor, 'INCIDENT_STATUS_CHANGED', id, {
      from: before.status,
      to: dto.status,
    });
    return inc;
  }

  async addEvidence(id: number, dto: IncidentEvidenceDto, actor: AuditActor) {
    const inc = await this.find(id);
    if (inc.status === 'CLOSED') {
      throw new BadRequestException('Incidente encerrado: reabra-o para acrescentar evidências');
    }
    if (!dto.auditLogId && !dto.note?.trim()) {
      throw new BadRequestException('Indique um evento de auditoria ou uma nota');
    }
    if (dto.auditLogId) await this.assertAuditLog(dto.auditLogId);
    const ev = await this.prisma.securityIncidentEvidence.create({
      data: {
        incidentId: id,
        auditLogId: dto.auditLogId ?? null,
        note: dto.note?.trim() || null,
        addedById: actor.id,
      },
    });
    await this.record(actor, 'INCIDENT_EVIDENCE_ADDED', id, {
      auditLogId: dto.auditLogId ?? null,
    });
    return ev;
  }
}

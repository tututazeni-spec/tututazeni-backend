// modulo_scalability.md §18 — aba Incidentes de Capacidade.
//
// Registo de problemas de capacidade, com ciclo de vida Aberto → Investigação →
// Mitigação → Resolvido → Encerrado. A duração é derivada das datas (ocorrência
// → resolução), nunca introduzida à mão. Resolver/encerrar exige causa raiz e
// medida aplicada; encerrar um incidente crítico exige também post-mortem.

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ScalabilityIncident, ScalabilityIncidentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateIncidentDto,
  ListIncidentsQueryDto,
  UpdateIncidentDto,
} from './scalability-incidents.dto';

const OPEN_STATES: ScalabilityIncidentStatus[] = ['OPEN', 'INVESTIGATING', 'MITIGATING'];

@Injectable()
export class ScalabilityIncidentsService {
  private readonly logger = new Logger(ScalabilityIncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async log(actorId: number, action: string, id: string, meta: object) {
    await this.audit
      .logEntity(actorId, action, 'ScalabilityIncident', id, meta)
      .catch(err =>
        this.logger.warn(`Auditoria falhou: ${err instanceof Error ? err.message : err}`),
      );
  }

  private view(i: ScalabilityIncident, owners: Map<number, string>) {
    const end = i.resolvedAt ?? i.closedAt ?? new Date();
    return {
      id: i.id,
      title: i.title,
      category: i.category,
      component: i.component,
      severity: i.severity,
      status: i.status,
      occurredAt: i.occurredAt.toISOString(),
      impact: i.impact,
      affectedUsers: i.affectedUsers,
      rootCause: i.rootCause,
      actionTaken: i.actionTaken,
      postMortem: i.postMortem,
      ownerId: i.ownerId,
      ownerName: i.ownerId ? (owners.get(i.ownerId) ?? null) : null,
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      closedAt: i.closedAt?.toISOString() ?? null,
      durationMinutes: Math.max(0, Math.round((end.getTime() - i.occurredAt.getTime()) / 60_000)),
      ongoing: OPEN_STATES.includes(i.status),
    };
  }

  private async ownerNames(rows: ScalabilityIncident[]) {
    const ids = [...new Set(rows.map(r => r.ownerId).filter((v): v is number => !!v))];
    if (!ids.length) return new Map<number, string>();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map(u => [u.id, u.fullName]));
  }

  private async assertOwner(ownerId: number | undefined) {
    if (ownerId === undefined) return;
    const u = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!u) throw new BadRequestException('Responsável inexistente');
  }

  async list(q: ListIncidentsQueryDto) {
    const where: Prisma.ScalabilityIncidentWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.component && { component: q.component }),
      ...(q.severity && { severity: q.severity }),
    };
    const [rows, all] = await Promise.all([
      this.prisma.scalabilityIncident.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      this.prisma.scalabilityIncident.findMany({
        select: {
          status: true,
          severity: true,
          occurredAt: true,
          resolvedAt: true,
          closedAt: true,
        },
      }),
    ]);
    const owners = await this.ownerNames(rows);

    const since30 = Date.now() - 30 * 86_400_000;
    const resolved = all.filter(i => i.resolvedAt ?? i.closedAt);
    const mttr = resolved.length
      ? Math.round(
          resolved.reduce(
            (s, i) =>
              s + ((i.resolvedAt ?? i.closedAt)!.getTime() - i.occurredAt.getTime()) / 60_000,
            0,
          ) / resolved.length,
        )
      : null;

    return {
      incidents: rows.map(r => this.view(r, owners)),
      summary: {
        total: all.length,
        open: all.filter(i => OPEN_STATES.includes(i.status)).length,
        openCritical: all.filter(i => OPEN_STATES.includes(i.status) && i.severity === 'CRITICAL')
          .length,
        last30d: all.filter(i => i.occurredAt.getTime() >= since30).length,
        meanTimeToResolveMinutes: mttr,
      },
    };
  }

  async create(dto: CreateIncidentDto, actorId: number) {
    await this.assertOwner(dto.ownerId);
    const created = await this.prisma.scalabilityIncident.create({
      data: {
        title: dto.title.trim(),
        category: dto.category,
        component: dto.component,
        severity: dto.severity,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        impact: dto.impact?.trim() || null,
        affectedUsers: dto.affectedUsers ?? null,
        ownerId: dto.ownerId ?? null,
        createdById: actorId,
      },
    });
    await this.log(actorId, 'SCALABILITY_INCIDENT_CREATE', created.id, {
      title: created.title,
      severity: created.severity,
      component: created.component,
    });
    return this.view(created, await this.ownerNames([created]));
  }

  async update(id: string, dto: UpdateIncidentDto, actorId: number) {
    const before = await this.prisma.scalabilityIncident.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Incidente não encontrado');
    await this.assertOwner(dto.ownerId);

    if (before.status === 'CLOSED' && dto.status === undefined) {
      throw new BadRequestException('Incidente encerrado — reabra-o para o editar');
    }

    const status = dto.status ?? before.status;
    const merged = {
      severity: dto.severity ?? before.severity,
      rootCause: dto.rootCause ?? before.rootCause,
      actionTaken: dto.actionTaken ?? before.actionTaken,
      postMortem: dto.postMortem ?? before.postMortem,
    };
    const now = new Date();

    if (status === 'RESOLVED' || status === 'CLOSED') {
      if (!merged.rootCause?.trim() || !merged.actionTaken?.trim()) {
        throw new BadRequestException(
          'Para resolver ou encerrar indique a causa raiz e a medida aplicada',
        );
      }
    }
    if (status === 'CLOSED' && merged.severity === 'CRITICAL' && !merged.postMortem?.trim()) {
      throw new BadRequestException('Incidentes críticos exigem post-mortem para serem encerrados');
    }

    const data: Prisma.ScalabilityIncidentUpdateInput = {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.component !== undefined && { component: dto.component }),
      ...(dto.severity !== undefined && { severity: dto.severity }),
      ...(dto.impact !== undefined && { impact: dto.impact.trim() || null }),
      ...(dto.affectedUsers !== undefined && { affectedUsers: dto.affectedUsers }),
      ...(dto.rootCause !== undefined && { rootCause: dto.rootCause.trim() || null }),
      ...(dto.actionTaken !== undefined && { actionTaken: dto.actionTaken.trim() || null }),
      ...(dto.postMortem !== undefined && { postMortem: dto.postMortem.trim() || null }),
      ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
      status,
      // As datas seguem o estado: reabrir limpa-as.
      resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? (before.resolvedAt ?? now) : null,
      closedAt: status === 'CLOSED' ? (before.closedAt ?? now) : null,
    };

    const updated = await this.prisma.scalabilityIncident.update({ where: { id }, data });

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(dto) as (keyof UpdateIncidentDto)[]) {
      const from = (before as Record<string, unknown>)[k];
      const to = (updated as Record<string, unknown>)[k];
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[k] = { from, to };
    }
    if (Object.keys(changes).length) {
      await this.log(
        actorId,
        dto.status && dto.status !== before.status
          ? 'SCALABILITY_INCIDENT_STATUS'
          : 'SCALABILITY_INCIDENT_UPDATE',
        id,
        { changes },
      );
    }
    return this.view(updated, await this.ownerNames([updated]));
  }
}

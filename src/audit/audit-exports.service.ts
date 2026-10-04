// src/audit/audit-exports.service.ts
// Aba «Exportações e Evidências» (docs/modulo_audit.md §11). Os ficheiros ficam na BD com hash
// SHA-256 e só saem por endpoint autenticado (nunca por link público); cada consulta e
// descarga fica no histórico de acesso.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import type { AuditActor } from './audit-incidents.service';
import { AuditPolicyService } from './audit-policy.service';
import {
  ExportFilterDto,
  GenerateEventEvidenceDto,
  UpdateExportDto,
  UploadEvidenceDto,
} from './audit-reports.dto';
import { buildPaginatedResponse, calculatePagination } from '../common/helpers/pagination.helper';

const DAY = 24 * 3600 * 1000;
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export interface SaveFileInput {
  kind: 'REPORT' | 'EVIDENCE';
  fileName: string;
  mimeType: string;
  format: string;
  reportType?: string;
  incidentId?: number;
  auditId?: number;
  buffer: Buffer;
  recordCount?: number;
  periodFrom?: Date;
  periodTo?: Date;
  filters?: Record<string, unknown>;
  confidentiality?: string;
  retentionDays?: number;
  createdById: number;
}

const LIST_SELECT = {
  id: true,
  code: true,
  kind: true,
  fileName: true,
  mimeType: true,
  format: true,
  reportType: true,
  incidentId: true,
  auditId: true,
  periodFrom: true,
  periodTo: true,
  filters: true,
  recordCount: true,
  sizeBytes: true,
  confidentiality: true,
  sha256: true,
  retentionUntil: true,
  status: true,
  result: true,
  createdById: true,
  createdAt: true,
} satisfies Prisma.AuditExportSelect;

@Injectable()
export class AuditExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: AuditPolicyService,
  ) {}

  private sha(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /** Estado efectivo: um ficheiro ACTIVE com prazo ultrapassado conta como EXPIRED. */
  private effectiveStatus(e: { status: string; retentionUntil: Date }) {
    return e.status === 'ACTIVE' && e.retentionUntil < new Date() ? 'EXPIRED' : e.status;
  }

  private async assertCan(action: 'view' | 'export', role?: string | null) {
    if (!(await this.policy.can(action, role))) {
      throw new ForbiddenException(
        action === 'export'
          ? 'O seu perfil não tem permissão para exportar/descarregar ficheiros de auditoria'
          : 'O seu perfil não tem permissão para consultar auditoria',
      );
    }
  }

  async saveFile(input: SaveFileInput) {
    const policy = await this.policy.getPolicy();
    const days = input.retentionDays ?? policy.retentionDays.EXPORTS;
    const row = await this.prisma.auditExport.create({
      data: {
        code: `TMP-${randomUUID()}`,
        kind: input.kind,
        fileName: input.fileName,
        mimeType: input.mimeType,
        format: input.format,
        reportType: input.reportType,
        incidentId: input.incidentId,
        auditId: input.auditId,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        filters: (input.filters ?? undefined) as Prisma.InputJsonValue | undefined,
        recordCount: input.recordCount ?? 0,
        sizeBytes: input.buffer.length,
        confidentiality: input.confidentiality ?? 'CONFIDENTIAL',
        sha256: this.sha(input.buffer),
        retentionUntil: new Date(Date.now() + days * DAY),
        createdById: input.createdById,
        content: new Uint8Array(input.buffer),
      },
      select: { id: true, createdAt: true, sha256: true },
    });
    const prefix = input.kind === 'REPORT' ? 'EXP' : 'EVD';
    const code = `${prefix}-${row.createdAt.getUTCFullYear()}-${String(row.id).padStart(5, '0')}`;
    await this.prisma.auditExport.update({ where: { id: row.id }, data: { code } });
    return { id: row.id, code, sha256: row.sha256 };
  }

  private async withAuthors<
    T extends { createdById: number | null; status: string; retentionUntil: Date },
  >(rows: T[]) {
    const ids = [...new Set(rows.map(r => r.createdById).filter((i): i is number => i != null))];
    const users = ids.length
      ? await this.prisma.read.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const map = new Map(users.map(u => [u.id, u]));
    return rows.map(r => ({
      ...r,
      status: this.effectiveStatus(r),
      author: r.createdById != null ? (map.get(r.createdById) ?? null) : null,
    }));
  }

  async list(filters: ExportFilterDto, role?: string | null) {
    await this.assertCan('view', role);
    const { page = 1, limit = 20 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const and: Prisma.AuditExportWhereInput[] = [];
    if (filters.kind) and.push({ kind: filters.kind });
    if (filters.reportType) and.push({ reportType: filters.reportType });
    if (filters.format) and.push({ format: filters.format });
    if (filters.confidentiality) and.push({ confidentiality: filters.confidentiality });
    if (filters.incidentId) and.push({ incidentId: filters.incidentId });
    if (filters.auditId) and.push({ auditId: filters.auditId });
    if (filters.from || filters.to) {
      and.push({
        createdAt: {
          ...(filters.from && { gte: new Date(filters.from) }),
          ...(filters.to && { lte: new Date(filters.to) }),
        },
      });
    }
    if (filters.status === 'EXPIRED') {
      and.push({
        OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', retentionUntil: { lt: new Date() } }],
      });
    } else if (filters.status === 'ACTIVE') {
      and.push({ status: 'ACTIVE', retentionUntil: { gte: new Date() } });
    } else if (filters.status) {
      and.push({ status: filters.status });
    }
    const where: Prisma.AuditExportWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await Promise.all([
      this.prisma.read.auditExport.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.read.auditExport.count({ where }),
    ]);
    return buildPaginatedResponse(await this.withAuthors(rows), total, page, limit);
  }

  async summary(role?: string | null) {
    await this.assertCan('view', role);
    const now = new Date();
    const [total, reports, evidences, expired, bytes, byConf] = await Promise.all([
      this.prisma.read.auditExport.count(),
      this.prisma.read.auditExport.count({ where: { kind: 'REPORT' } }),
      this.prisma.read.auditExport.count({ where: { kind: 'EVIDENCE' } }),
      this.prisma.read.auditExport.count({
        where: { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', retentionUntil: { lt: now } }] },
      }),
      this.prisma.read.auditExport.aggregate({ _sum: { sizeBytes: true } }),
      this.prisma.read.auditExport.groupBy({ by: ['confidentiality'], _count: true }),
    ]);
    return {
      total,
      reports,
      evidences,
      expired,
      sizeBytes: bytes._sum.sizeBytes ?? 0,
      byConfidentiality: byConf.map(c => ({ level: c.confidentiality, count: c._count })),
    };
  }

  async get(id: number, actor: AuditActor, role?: string | null) {
    await this.assertCan('view', role);
    const row = await this.prisma.read.auditExport.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        accesses: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!row) throw new NotFoundException('Exportação não encontrada');
    await this.prisma.auditExportAccess.create({
      data: { exportId: id, userId: actor.id, action: 'VIEW', ip: actor.ip },
    });
    const users = await this.prisma.read.user.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              [row.createdById, ...row.accesses.map(a => a.userId)].filter(
                (i): i is number => i != null,
              ),
            ),
          ],
        },
      },
      select: { id: true, fullName: true, email: true },
    });
    const uMap = new Map(users.map(u => [u.id, u]));
    const [withAuthor] = await this.withAuthors([row]);
    return {
      ...withAuthor,
      accesses: row.accesses.map(a => ({
        ...a,
        user: a.userId ? (uMap.get(a.userId) ?? null) : null,
      })),
    };
  }

  async download(id: number, actor: AuditActor, role?: string | null) {
    const row = await this.prisma.auditExport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Exportação não encontrada');
    if (!(await this.policy.can('export', role))) {
      await this.prisma.auditExportAccess.create({
        data: { exportId: id, userId: actor.id, action: 'DENIED', ip: actor.ip },
      });
      await this.audit.log({
        userId: actor.id,
        action: 'DOWNLOAD',
        entity: 'AuditExport',
        entityId: id,
        entityName: row.code,
        status: 'DENIED',
        severity: 'HIGH',
        ip: actor.ip,
      });
      throw new ForbiddenException('Sem permissão para descarregar ficheiros de auditoria');
    }
    if (this.effectiveStatus(row) !== 'ACTIVE' || !row.content) {
      throw new GoneException('Ficheiro expirado ou eliminado segundo a política de retenção');
    }
    const buffer = Buffer.from(row.content);
    if (this.sha(buffer) !== row.sha256) {
      await this.audit.log({
        userId: actor.id,
        action: 'INTEGRITY_FAILURE',
        entity: 'AuditExport',
        entityId: id,
        entityName: row.code,
        status: 'FAILED',
        severity: 'CRITICAL',
        ip: actor.ip,
        metadata: { expected: row.sha256 },
      });
      throw new ConflictException('A integridade do ficheiro falhou (hash não coincide)');
    }
    await this.prisma.auditExportAccess.create({
      data: { exportId: id, userId: actor.id, action: 'DOWNLOAD', ip: actor.ip },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'DOWNLOAD',
      entity: 'AuditExport',
      entityId: id,
      entityName: row.code,
      severity: 'MEDIUM',
      ip: actor.ip,
      metadata: { kind: row.kind, sha256: row.sha256 },
    });
    return { buffer, mimeType: row.mimeType, fileName: row.fileName };
  }

  async verify(id: number, role?: string | null) {
    await this.assertCan('view', role);
    const row = await this.prisma.read.auditExport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Exportação não encontrada');
    if (!row.content) {
      return { id, code: row.code, valid: null, reason: 'Conteúdo eliminado (retenção)' };
    }
    const actual = this.sha(Buffer.from(row.content));
    return { id, code: row.code, valid: actual === row.sha256, expected: row.sha256, actual };
  }

  async uploadEvidence(dto: UploadEvidenceDto, actor: AuditActor, role?: string | null) {
    await this.assertCan('export', role);
    if (!dto.incidentId && !dto.auditId) {
      throw new BadRequestException('Indique o incidente (incidentId) ou a auditoria (auditId)');
    }
    const buffer = Buffer.from(dto.contentBase64, 'base64');
    if (!buffer.length) throw new BadRequestException('Ficheiro vazio');
    if (buffer.length > MAX_EVIDENCE_BYTES) {
      throw new BadRequestException('Ficheiro acima do limite de 5 MB');
    }
    if (dto.incidentId) {
      const ok = await this.prisma.securityIncident.count({ where: { id: dto.incidentId } });
      if (!ok) throw new NotFoundException('Incidente não encontrado');
    }
    if (dto.auditId) {
      const ok = await this.prisma.internalAudit.count({ where: { id: dto.auditId } });
      if (!ok) throw new NotFoundException('Auditoria não encontrada');
    }
    const ext = dto.fileName.includes('.') ? dto.fileName.split('.').pop()!.toLowerCase() : 'other';
    const saved = await this.saveFile({
      kind: 'EVIDENCE',
      // Remove separadores de caminho do nome enviado pelo cliente.
      fileName: dto.fileName.replace(/[\\/]/g, '_'),
      mimeType: dto.mimeType ?? 'application/octet-stream',
      format: ['csv', 'xlsx', 'pdf'].includes(ext) ? ext : 'other',
      incidentId: dto.incidentId,
      auditId: dto.auditId,
      buffer,
      confidentiality: dto.confidentiality ?? 'RESTRICTED',
      retentionDays: dto.retentionDays,
      createdById: actor.id,
    });
    await this.audit.log({
      userId: actor.id,
      action: 'CREATE',
      entity: 'AuditExport',
      entityId: saved.id,
      entityName: saved.code,
      severity: 'MEDIUM',
      ip: actor.ip,
      metadata: {
        kind: 'EVIDENCE',
        incidentId: dto.incidentId,
        auditId: dto.auditId,
        sha256: saved.sha256,
        sizeBytes: buffer.length,
      },
    });
    return saved;
  }

  /**
   * §17 «Gerar evidência» — documento JSON com o evento (valores sensíveis já ocultados para o
   * perfil), a posição na cadeia de hashes e quem/quando o gerou. Referencia o evento original.
   */
  async generateEventEvidence(
    eventId: number,
    dto: GenerateEventEvidenceDto,
    actor: AuditActor,
    role?: string | null,
    scope?: Prisma.AuditLogWhereInput | null,
  ) {
    await this.assertCan('export', role);
    if (dto.incidentId) {
      const ok = await this.prisma.securityIncident.count({ where: { id: dto.incidentId } });
      if (!ok) throw new NotFoundException('Incidente não encontrado');
    }
    if (dto.auditId) {
      const ok = await this.prisma.internalAudit.count({ where: { id: dto.auditId } });
      if (!ok) throw new NotFoundException('Auditoria não encontrada');
    }
    const event = await this.audit.getEventDetail(eventId, role, scope);
    const chain = await this.prisma.read.auditLog.findUnique({
      where: { id: eventId },
      select: { hash: true, previousHash: true },
    });
    const document = {
      type: 'AUDIT_EVENT_EVIDENCE',
      generatedAt: new Date().toISOString(),
      generatedById: actor.id,
      reference: { auditLogId: eventId, code: event.code },
      chain: { hash: chain?.hash ?? null, previousHash: chain?.previousHash ?? null },
      event,
    };
    const buffer = Buffer.from(JSON.stringify(document, null, 2), 'utf8');
    const saved = await this.saveFile({
      kind: 'EVIDENCE',
      fileName: `evidencia-${event.code}.json`,
      mimeType: 'application/json',
      format: 'other',
      incidentId: dto.incidentId,
      auditId: dto.auditId,
      buffer,
      recordCount: 1,
      confidentiality: dto.confidentiality ?? 'RESTRICTED',
      createdById: actor.id,
    });
    await this.audit.log({
      userId: actor.id,
      action: 'CREATE',
      entity: 'AuditExport',
      entityId: saved.id,
      entityName: saved.code,
      severity: 'MEDIUM',
      ip: actor.ip,
      metadata: {
        kind: 'EVIDENCE',
        auditLogId: eventId,
        incidentId: dto.incidentId,
        auditId: dto.auditId,
        sha256: saved.sha256,
      },
    });
    return saved;
  }

  async update(id: number, dto: UpdateExportDto, actor: AuditActor, role?: string | null) {
    await this.assertCan('export', role);
    const row = await this.prisma.auditExport.findUnique({
      where: { id },
      select: { id: true, code: true, confidentiality: true, retentionUntil: true, status: true },
    });
    if (!row) throw new NotFoundException('Exportação não encontrada');
    if (row.status === 'PURGED') throw new BadRequestException('Ficheiro já eliminado');
    const data: Prisma.AuditExportUpdateInput = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (dto.confidentiality && dto.confidentiality !== row.confidentiality) {
      data.confidentiality = dto.confidentiality;
      changes.confidentiality = { from: row.confidentiality, to: dto.confidentiality };
    }
    if (dto.retentionUntil) {
      const next = new Date(dto.retentionUntil);
      // Só prolonga: encurtar a retenção de uma prova seria apagá-la por outra via.
      if (next <= row.retentionUntil) {
        throw new BadRequestException('A retenção só pode ser prolongada');
      }
      data.retentionUntil = next;
      changes.retentionUntil = { from: row.retentionUntil, to: next };
    }
    if (!Object.keys(changes).length) return { id, code: row.code, changed: [] as string[] };
    await this.prisma.auditExport.update({ where: { id }, data });
    await this.audit.log({
      userId: actor.id,
      action: 'UPDATE',
      entity: 'AuditExport',
      entityId: id,
      entityName: row.code,
      changes,
      severity: 'MEDIUM',
      ip: actor.ip,
    });
    return { id, code: row.code, changed: Object.keys(changes) };
  }

  /** Elimina o conteúdo (não o registo) dos ficheiros cujo prazo de retenção terminou. */
  async purgeExpired(actor: AuditActor) {
    const res = await this.prisma.auditExport.updateMany({
      where: { status: { in: ['ACTIVE', 'EXPIRED'] }, retentionUntil: { lt: new Date() } },
      data: { status: 'PURGED', content: null },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'DELETE',
      entity: 'AuditExport',
      entityName: 'Purga de ficheiros expirados',
      severity: 'HIGH',
      ip: actor.ip,
      metadata: { purged: res.count },
    });
    return { purged: res.count };
  }
}

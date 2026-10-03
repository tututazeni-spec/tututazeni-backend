// src/process-standard/process-audit-trail.service.ts
// Aba "Histórico e Auditoria" (docs/Modulo_Processes.md §13): linha temporal
// filtrável, detalhe de cada evento (decisão, documentos, evento seguinte),
// exportação autorizada e tentativas de integração/automação. Só leitura —
// não existe (nem deve existir) qualquer operação de eliminação do histórico.
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { ProcessStandardService } from './process-standard.service';
import {
  auditActionLabel,
  auditRefs,
  AUDIT_ACTION_LABELS,
  parseAuditMeta,
  toCsv,
} from './process-audit-trail';
import {
  ProcessAuditAttemptsDto,
  ProcessAuditExportDto,
  ProcessAuditFilterDto,
} from './process-standard.dto';

const EXPORT_LIMIT = 10_000;
const actorSelect = {
  select: { id: true, fullName: true, role: { select: { name: true } } },
} as const;

type AuditRow = Prisma.ProcessAuditLogGetPayload<{ include: { user: typeof actorSelect } }>;

@Injectable()
export class ProcessAuditTrailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processes: ProcessStandardService,
  ) {}

  private where(f: ProcessAuditFilterDto): Prisma.ProcessAuditLogWhereInput {
    const and: Prisma.ProcessAuditLogWhereInput[] = [];
    if (f.userId) and.push({ userId: f.userId });
    if (f.action) and.push({ action: f.action });
    if (f.source) and.push({ source: f.source });
    if (f.result) and.push({ result: f.result });
    if (f.processId) and.push({ processId: f.processId });
    if (f.instanceId) and.push({ instanceId: f.instanceId });
    if (f.from || f.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (f.from) createdAt.gte = new Date(f.from);
      if (f.to) {
        const end = new Date(f.to);
        if (f.to.length <= 10) end.setUTCHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      and.push({ createdAt });
    }
    return and.length ? { AND: and } : {};
  }

  /** Resolve a pesquisa livre para ids de instâncias/modelos (a tabela de auditoria não tem relações). */
  private async withSearch(f: ProcessAuditFilterDto): Promise<Prisma.ProcessAuditLogWhereInput> {
    const base = this.where(f);
    const q = f.search?.trim();
    if (!q) return base;
    const match = {
      OR: [
        { code: { contains: q, mode: 'insensitive' as const } },
        { title: { contains: q, mode: 'insensitive' as const } },
      ],
    };
    const [instances, templates] = await Promise.all([
      this.prisma.read.processInstance.findMany({ where: match, select: { id: true }, take: 200 }),
      this.prisma.read.processStandard.findMany({ where: match, select: { id: true }, take: 200 }),
    ]);
    return {
      AND: [
        base,
        {
          OR: [
            { instanceId: { in: instances.map(i => i.id) } },
            { processId: { in: templates.map(t => t.id) } },
            { reason: { contains: q, mode: 'insensitive' } },
            { errorMessage: { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    };
  }

  private async enrich(rows: AuditRow[]) {
    const instanceIds = [...new Set(rows.map(r => r.instanceId).filter((v): v is number => !!v))];
    const instances = instanceIds.length
      ? await this.prisma.read.processInstance.findMany({
          where: { id: { in: instanceIds } },
          select: { id: true, code: true, title: true, processId: true },
        })
      : [];
    const inst = new Map(instances.map(i => [i.id, i]));
    // A instância indica o modelo quando o registo só traz o instanceId.
    const processIds = [
      ...new Set([
        ...rows.map(r => r.processId).filter((v): v is number => !!v),
        ...instances.map(i => i.processId),
      ]),
    ];
    const templates = processIds.length
      ? await this.prisma.read.processStandard.findMany({
          where: { id: { in: processIds } },
          select: { id: true, code: true, title: true },
        })
      : [];
    const tpl = new Map(templates.map(t => [t.id, t]));
    return rows.map(r => {
      const i = r.instanceId ? inst.get(r.instanceId) : undefined;
      const t = tpl.get(r.processId ?? i?.processId ?? -1);
      return {
        id: r.id,
        action: r.action,
        label: auditActionLabel(r.action),
        createdAt: r.createdAt,
        actor: { id: r.user.id, fullName: r.user.fullName, role: r.user.role?.name ?? null },
        source: r.source,
        result: r.result ?? 'SUCCESS',
        previousStatus: r.previousStatus,
        newStatus: r.newStatus,
        reason: r.reason,
        errorMessage: r.errorMessage,
        correlationId: r.correlationId,
        template: t ? { id: t.id, code: t.code, title: t.title } : null,
        instance: i ? { id: i.id, code: i.code ?? `PROC-${i.id}`, title: i.title } : null,
        stepId: auditRefs(parseAuditMeta(r.meta)).stepId,
        hash: r.hash,
      };
    });
  }

  async events(f: ProcessAuditFilterDto) {
    const page = f.page ?? 1;
    const limit = f.limit ?? 25;
    const where = await this.withSearch(f);
    const [rows, total] = await Promise.all([
      this.prisma.read.processAuditLog.findMany({
        where,
        include: { user: actorSelect },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.read.processAuditLog.count({ where }),
    ]);
    return {
      data: await this.enrich(rows),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Valores disponíveis para os filtros (tipos de evento e utilizadores com actividade). */
  async filterOptions() {
    const [actions, users] = await Promise.all([
      this.prisma.read.processAuditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        take: 200,
      }),
      this.prisma.read.processAuditLog.findMany({
        distinct: ['userId'],
        select: { user: { select: { id: true, fullName: true } } },
        take: 200,
      }),
    ]);
    const all = [...new Set([...actions.map(a => a.action), ...Object.keys(AUDIT_ACTION_LABELS)])];
    return {
      actions: all
        .map(value => ({ value, label: auditActionLabel(value) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt')),
      users: users.map(u => u.user).sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt')),
    };
  }

  async event(id: number) {
    const row = await this.prisma.read.processAuditLog.findUnique({
      where: { id },
      include: { user: actorSelect },
    });
    if (!row) throw new NotFoundException('Evento de auditoria não encontrado');
    const [item] = await this.enrich([row]);
    const meta = parseAuditMeta(row.meta);
    const refs = auditRefs(meta);

    const [approval, document, next, previous] = await Promise.all([
      refs.approvalId
        ? this.prisma.read.processApproval.findUnique({
            where: { id: refs.approvalId },
            select: {
              id: true,
              status: true,
              decision: true,
              justification: true,
              decidedAt: true,
            },
          })
        : null,
      refs.documentId
        ? this.prisma.read.processDocument.findUnique({
            where: { id: refs.documentId },
            select: {
              id: true,
              name: true,
              version: true,
              validationStatus: true,
              versions: {
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, version: true, createdAt: true },
              },
            },
          })
        : null,
      row.instanceId
        ? this.prisma.read.processAuditLog.findFirst({
            where: { instanceId: row.instanceId, id: { gt: row.id } },
            orderBy: { id: 'asc' },
            select: { id: true, action: true, createdAt: true, source: true },
          })
        : null,
      row.instanceId
        ? this.prisma.read.processAuditLog.findFirst({
            where: { instanceId: row.instanceId, id: { lt: row.id } },
            orderBy: { id: 'desc' },
            select: { id: true, action: true, createdAt: true },
          })
        : null,
    ]);

    return {
      ...item,
      meta,
      approval,
      document,
      previousEvent: previous && { ...previous, label: auditActionLabel(previous.action) },
      nextEvent: next && { ...next, label: auditActionLabel(next.action) },
    };
  }

  /** Percurso completo de um processo (linha temporal ascendente) — reconstrução. */
  async instanceTimeline(instanceId: number) {
    const rows = await this.prisma.read.processAuditLog.findMany({
      where: { instanceId },
      include: { user: actorSelect },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    return { data: await this.enrich(rows), total: rows.length };
  }

  /** Exportação CSV. Exige justificação e fica ela própria registada na auditoria. */
  async export(f: ProcessAuditExportDto, user: CurrentUserData) {
    const { reason, ...filters } = f;
    const where = await this.withSearch(filters);
    const rows = await this.prisma.read.processAuditLog.findMany({
      where,
      include: { user: actorSelect },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_LIMIT,
    });
    const data = await this.enrich(rows);
    await this.processes.writeAuditLog({
      userId: user.id,
      action: 'AUDIT_EXPORTED',
      reason,
      meta: { rows: data.length, filters },
    });
    const buffer = toCsv(
      [
        'ID',
        'Data e hora',
        'Evento',
        'Utilizador',
        'Função',
        'Origem',
        'Resultado',
        'Processo',
        'Modelo',
        'Estado anterior',
        'Novo estado',
        'Justificação',
        'Erro',
        'Correlação',
      ],
      data.map(e => [
        e.id,
        e.createdAt,
        e.label,
        e.actor.fullName,
        e.actor.role,
        e.source,
        e.result,
        e.instance?.code,
        e.template?.code,
        e.previousStatus,
        e.newStatus,
        e.reason,
        e.errorMessage,
        e.correlationId,
      ]),
    );
    return {
      buffer,
      contentType: 'text/csv; charset=utf-8',
      filename: `auditoria-processos-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  }

  /** Tentativas de integração (eventos externos) e de automação (execuções de regras). */
  async attempts(f: ProcessAuditAttemptsDto) {
    const page = f.page ?? 1;
    const limit = f.limit ?? 20;
    const take = page * limit;
    const kind = f.kind ?? 'ALL';

    const empty = { rows: [] as AttemptRow[], total: 0 };
    const integ = kind === 'AUTOMATION' ? empty : await this.integrationAttempts(f.status, take);
    const auto = kind === 'INTEGRATION' ? empty : await this.automationAttempts(f.status, take);

    const merged = [...integ.rows, ...auto.rows].sort((a, b) => b.at.getTime() - a.at.getTime());
    return {
      data: merged.slice((page - 1) * limit, page * limit),
      total: integ.total + auto.total,
      page,
      limit,
    };
  }

  private async integrationAttempts(status: 'SUCCESS' | 'FAILED' | undefined, take: number) {
    const where: Prisma.ProcessIntegrationLogWhereInput = status
      ? {
          status: {
            in: status === 'SUCCESS' ? ['SUCCESS', 'DUPLICATE'] : ['FAILED', 'REJECTED'],
          },
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.read.processIntegrationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.read.processIntegrationLog.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((r): AttemptRow => ({
        kind: 'INTEGRATION',
        id: `I${r.id}`,
        at: r.createdAt,
        name: `${r.module} · ${r.event}`,
        status: r.status,
        attempts: r.attempts,
        error: r.errorMessage,
        instanceId: r.instanceId,
        correlationId: r.correlationId,
      })),
    };
  }

  private async automationAttempts(status: 'SUCCESS' | 'FAILED' | undefined, take: number) {
    const where: Prisma.AutomationExecutionWhereInput = {
      rule: { module: 'PROCESSES' },
      ...(status ? { status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.read.automationExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take,
        include: { rule: { select: { id: true, name: true } } },
      }),
      this.prisma.read.automationExecution.count({ where }),
    ]);
    return {
      total,
      rows: rows.map((r): AttemptRow => ({
        kind: 'AUTOMATION',
        id: `A${r.id}`,
        at: r.startedAt,
        name: r.rule.name,
        status: r.status,
        attempts: r.attempt,
        error: r.errorMessage,
        instanceId: null,
        correlationId: null,
      })),
    };
  }
}

interface AttemptRow {
  kind: 'INTEGRATION' | 'AUTOMATION';
  id: string;
  at: Date;
  name: string;
  status: string;
  attempts: number;
  error: string | null;
  instanceId: number | null;
  correlationId: string | null;
}

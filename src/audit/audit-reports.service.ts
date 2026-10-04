// src/audit/audit-reports.service.ts
// Aba «Relatórios» (docs/modulo_audit.md §10): relatórios por período, módulo, utilizador,
// unidade, tipo de evento e gravidade, com pré-visualização e exportação CSV/XLSX/PDF.
// Cada exportação fica guardada em AuditExport (§11) e registada como evento de auditoria
// com autor, data, filtros e resultado.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';
import { AuditExportsService } from './audit-exports.service';
import type { AuditActor } from './audit-incidents.service';
import { AuditPolicyService } from './audit-policy.service';
import {
  AUDIT_REPORT_TYPES,
  AuditReportDto,
  AuditReportExportDto,
  AuditReportType,
} from './audit-reports.dto';
import type { AuditFilterDto } from './audit.dto';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';

export type ReportRow = Record<string, string | number>;

export interface AuditReportResult {
  type: AuditReportType;
  title: string;
  columns: string[];
  rows: ReportRow[];
  total: number;
  truncated: boolean;
  generatedAt: Date;
  filters: Record<string, unknown>;
}

const MAX_ROWS = 5000;

export const REPORT_CATALOG: Record<AuditReportType, string> = {
  'executive-summary': 'Resumo executivo de auditoria',
  'activity-by-module': 'Registos de atividade por módulo',
  'data-changes': 'Histórico de alterações de dados',
  'access-failures': 'Acessos e tentativas de autenticação falhadas',
  'permission-changes': 'Alterações de funções e permissões',
  'payroll-critical': 'Operações críticas em Payroll e Payslips',
  'attendance-leave': 'Alterações de assiduidade, férias e licenças',
  approvals: 'Aprovações e rejeições de processos',
  'sensitive-exports': 'Exportações e consultas de dados sensíveis',
  incidents: 'Incidentes de segurança e respetivo estado',
  audits: 'Auditorias concluídas e não conformidades',
  'corrective-actions': 'Ações corretivas pendentes ou fora do prazo',
  'integrations-automations': 'Atividade de integrações e automações',
  'admin-activity': 'Atividade administrativa por utilizador',
};

/** Palavras-chave de entidade por módulo (AuditLog.entity é texto livre). */
export const MODULE_KEYWORDS: Record<string, { label: string; keywords: string[] }> = {
  users: { label: 'Utilizadores', keywords: ['User', 'Role', 'Permission', 'Session'] },
  organization: {
    label: 'Organização e Departamentos',
    keywords: ['Department', 'Organization', 'Position', 'Team', 'OrgUnit'],
  },
  lms: {
    label: 'Formação (LMS)',
    keywords: ['Course', 'Lesson', 'Enrollment', 'Certificat', 'Learning', 'Training', 'Badge'],
  },
  performance: {
    label: 'Desempenho',
    keywords: ['Evaluation', 'Performance', 'Competenc', 'Objective', 'Calibration'],
  },
  talent: {
    label: 'Talento e Carreira',
    keywords: ['Pdi', 'Development', 'Career', 'Succession', 'Talent', 'Onboarding'],
  },
  payroll: { label: 'Payroll e Recibos', keywords: ['Payroll', 'Payslip', 'Salary'] },
  'attendance-leave': {
    label: 'Assiduidade, Férias e Licenças',
    keywords: ['Attendance', 'Leave', 'Absence', 'Vacation', 'Declaration'],
  },
  documents: { label: 'Documentos', keywords: ['Document', 'Contract'] },
  integrations: {
    label: 'Integrações e Automações',
    keywords: ['Integration', 'Automation', 'Webhook', 'ApiKey', 'Rule'],
  },
  security: { label: 'Segurança e Auditoria', keywords: ['Auth', 'Audit', 'Incident', 'Security'] },
};

export function moduleOfEntity(entity: string): string {
  const e = entity.toLowerCase();
  for (const m of Object.values(MODULE_KEYWORDS)) {
    if (m.keywords.some(k => e.includes(k.toLowerCase()))) return m.label;
  }
  return 'Outros';
}

const ADMIN_PROFILES = ['ADMIN', 'RH', 'DIRECTOR', 'GESTOR', 'AUDITOR'];
const fmtDateTime = (d?: Date | null) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : '—');
const fmtDate = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');
const csvList = (v?: string) =>
  (v ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

@Injectable()
export class AuditReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly policy: AuditPolicyService,
    private readonly exportsSvc: AuditExportsService,
  ) {}

  catalog() {
    return AUDIT_REPORT_TYPES.map(type => ({ type, title: REPORT_CATALOG[type] }));
  }

  // ─── filtros ──────────────────────────────────────────────────────────────

  private eventWhere(dto: AuditReportDto, extra: Prisma.AuditLogWhereInput[] = []) {
    const base = this.audit.buildWhere({
      userId: dto.userId,
      action: dto.eventType,
      severity: dto.severity,
      status: dto.result,
      from: dto.from,
      to: dto.to,
      departmentId: dto.departmentId,
    } as AuditFilterDto);
    const and: Prisma.AuditLogWhereInput[] = Array.isArray(base.AND)
      ? [...base.AND]
      : base.AND
        ? [base.AND]
        : [];

    const modules = csvList(dto.modules).filter(m => MODULE_KEYWORDS[m]);
    if (modules.length) {
      and.push({
        OR: modules.flatMap(m =>
          MODULE_KEYWORDS[m].keywords.map(k => ({
            entity: { contains: k, mode: 'insensitive' as const },
          })),
        ),
      });
    }
    const roles = csvList(dto.roles);
    if (roles.length) and.push({ user: { is: { role: { name: { in: roles } } } } });
    and.push(...extra);
    return { ...base, AND: and } as Prisma.AuditLogWhereInput;
  }

  private periodWhere(dto: AuditReportDto): { gte?: Date; lte?: Date } | undefined {
    if (!dto.from && !dto.to) return undefined;
    return {
      ...(dto.from && { gte: new Date(dto.from) }),
      ...(dto.to && { lte: new Date(dto.to) }),
    };
  }

  private async usersById(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((i): i is number => typeof i === 'number'))];
    if (!unique.length) return new Map<number, { fullName: string; email: string }>();
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true, email: true },
    });
    return new Map(users.map(u => [u.id, u]));
  }

  // ─── relatórios baseados em eventos ───────────────────────────────────────

  private static readonly EVENT_COLUMNS = [
    'Data/Hora',
    'Utilizador',
    'Perfil',
    'Departamento',
    'Ação',
    'Entidade',
    'ID',
    'Gravidade',
    'Resultado',
    'IP',
    'Justificação',
  ];

  private async eventReport(
    where: Prisma.AuditLogWhereInput,
    viewerRole: string | null | undefined,
    withChanges = false,
  ) {
    const [logs, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        take: MAX_ROWS,
        orderBy: { timestamp: 'desc' },
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
              role: { select: { name: true } },
              department: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.read.auditLog.count({ where }),
    ]);
    const columns = withChanges
      ? [...AuditReportsService.EVENT_COLUMNS, 'Campos alterados']
      : AuditReportsService.EVENT_COLUMNS;
    const rows = logs.map(l => {
      const row: ReportRow = {
        'Data/Hora': fmtDateTime(l.timestamp),
        Utilizador: l.user?.fullName ?? 'Sistema',
        Perfil: l.user?.role?.name ?? '—',
        Departamento: l.user?.department?.name ?? '—',
        Ação: l.action,
        Entidade: l.entityName ? `${l.entity} — ${l.entityName}` : l.entity,
        ID: l.entityId ?? '—',
        Gravidade: l.severity,
        Resultado: l.status,
        IP: l.ip ?? '—',
        Justificação: l.reason ?? '—',
      };
      if (withChanges) {
        row['Campos alterados'] =
          this.audit
            .fieldChanges(l, viewerRole)
            .map(f => `${f.field}: ${JSON.stringify(f.from)} → ${JSON.stringify(f.to)}`)
            .join('; ')
            .slice(0, 400) || '—';
      }
      return row;
    });
    return { columns, rows, total };
  }

  // ─── construção ───────────────────────────────────────────────────────────

  async build(dto: AuditReportDto, viewerRole?: string | null): Promise<AuditReportResult> {
    const type = dto.type;
    let columns: string[] = [];
    let rows: ReportRow[] = [];
    let total = 0;

    const ev = async (extra: Prisma.AuditLogWhereInput[], withChanges = false) => {
      const r = await this.eventReport(this.eventWhere(dto, extra), viewerRole, withChanges);
      ({ columns, rows, total } = r);
    };
    const contains = (field: 'entity' | 'action', words: string[]): Prisma.AuditLogWhereInput => ({
      OR: words.map(w => ({ [field]: { contains: w, mode: 'insensitive' as const } })),
    });

    switch (type) {
      case 'data-changes':
        await ev([this.audit.changeWhere({} as never)], true);
        break;
      case 'access-failures':
        await ev([
          {
            OR: [
              { action: 'FAILED', entity: 'Auth' },
              { action: 'LOGIN', status: { not: 'SUCCESS' } },
              { status: 'DENIED' },
            ],
          },
        ]);
        break;
      case 'permission-changes':
        await ev([
          {
            OR: [
              this.audit.accessWhere('PERMISSION'),
              contains('entity', ['Permission', 'RolePermission']),
              { entity: { equals: 'Role', mode: 'insensitive' }, action: { not: 'READ' } },
            ],
          },
        ]);
        break;
      case 'payroll-critical':
        await ev([contains('entity', ['Payroll', 'Payslip']), { NOT: { action: 'READ' } }]);
        break;
      case 'attendance-leave':
        await ev([
          contains('entity', ['Attendance', 'Leave', 'Absence', 'Vacation']),
          { NOT: { action: { in: ['READ', 'LOGIN', 'LOGOUT'] } } },
        ]);
        break;
      case 'approvals':
        await ev([contains('action', ['APPROVE', 'REJECT'])]);
        break;
      case 'sensitive-exports':
        await ev([
          {
            OR: [
              contains('action', ['EXPORT', 'DOWNLOAD']),
              { action: 'READ', severity: { in: ['HIGH', 'CRITICAL'] } },
            ],
          },
        ]);
        break;
      case 'integrations-automations':
        await ev([contains('entity', ['Integration', 'Automation', 'Webhook', 'ApiKey', 'Rule'])]);
        break;
      case 'activity-by-module':
        ({ columns, rows, total } = await this.byModule(dto));
        break;
      case 'admin-activity':
        ({ columns, rows, total } = await this.adminActivity(dto));
        break;
      case 'executive-summary':
        ({ columns, rows, total } = await this.executiveSummary(dto));
        break;
      case 'incidents':
        ({ columns, rows, total } = await this.incidents(dto));
        break;
      case 'audits':
        ({ columns, rows, total } = await this.audits(dto));
        break;
      case 'corrective-actions':
        ({ columns, rows, total } = await this.correctiveActions(dto));
        break;
    }

    return {
      type,
      title: REPORT_CATALOG[type],
      columns,
      rows,
      total,
      truncated: total > rows.length,
      generatedAt: new Date(),
      filters: Object.fromEntries(
        Object.entries(dto).filter(([, v]) => v !== undefined && v !== ''),
      ),
    };
  }

  private async byModule(dto: AuditReportDto) {
    const where = this.eventWhere(dto);
    const [byStatus, critical] = await Promise.all([
      this.prisma.read.auditLog.groupBy({ by: ['entity', 'status'], where, _count: true }),
      this.prisma.read.auditLog.groupBy({
        by: ['entity'],
        where: { AND: [where, { severity: { in: ['HIGH', 'CRITICAL'] } }] },
        _count: true,
      }),
    ]);
    const agg = new Map<string, { events: number; failed: number; critical: number }>();
    const slot = (entity: string) => {
      const m = moduleOfEntity(entity);
      if (!agg.has(m)) agg.set(m, { events: 0, failed: 0, critical: 0 });
      return agg.get(m)!;
    };
    for (const r of byStatus) {
      const s = slot(r.entity);
      s.events += r._count;
      if (r.status !== 'SUCCESS') s.failed += r._count;
    }
    for (const r of critical) slot(r.entity).critical += r._count;
    const rows: ReportRow[] = [...agg.entries()]
      .sort((a, b) => b[1].events - a[1].events)
      .map(([m, v]) => ({
        Módulo: m,
        Eventos: v.events,
        'Falhados/negados': v.failed,
        'Gravidade alta/crítica': v.critical,
      }));
    return {
      columns: ['Módulo', 'Eventos', 'Falhados/negados', 'Gravidade alta/crítica'],
      rows,
      total: rows.length,
    };
  }

  private async adminActivity(dto: AuditReportDto) {
    const roles = csvList(dto.roles).length ? csvList(dto.roles) : ADMIN_PROFILES;
    const where = this.eventWhere({ ...dto, roles: roles.join(',') }, [{ userId: { not: null } }]);
    const [all, deletes, exportsN, last] = await Promise.all([
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where,
        _count: true,
        orderBy: { _count: { userId: 'desc' } },
        take: MAX_ROWS,
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { AND: [where, { action: { contains: 'DELETE', mode: 'insensitive' } }] },
        _count: true,
      }),
      this.prisma.read.auditLog.groupBy({
        by: ['userId'],
        where: { AND: [where, { action: { contains: 'EXPORT', mode: 'insensitive' } }] },
        _count: true,
      }),
      this.prisma.read.auditLog.groupBy({ by: ['userId'], where, _max: { timestamp: true } }),
    ]);
    const failed = await this.prisma.read.auditLog.groupBy({
      by: ['userId'],
      where: { AND: [where, { status: { not: 'SUCCESS' } }] },
      _count: true,
    });
    const users = await this.prisma.read.user.findMany({
      where: { id: { in: all.map(a => a.userId!).filter(Boolean) } },
      select: { id: true, fullName: true, email: true, role: { select: { name: true } } },
    });
    const uMap = new Map(users.map(u => [u.id, u]));
    const num = (list: Array<{ userId: number | null; _count: number }>) =>
      new Map(list.map(x => [x.userId, x._count]));
    const dMap = num(deletes);
    const eMap = num(exportsN);
    const fMap = num(failed);
    const lMap = new Map(last.map(x => [x.userId, x._max.timestamp]));
    const rows: ReportRow[] = all.map(a => {
      const u = uMap.get(a.userId!);
      return {
        Utilizador: u?.fullName ?? `#${a.userId}`,
        Email: u?.email ?? '—',
        Perfil: u?.role?.name ?? '—',
        Eventos: a._count,
        'Falhados/negados': fMap.get(a.userId) ?? 0,
        Eliminações: dMap.get(a.userId) ?? 0,
        Exportações: eMap.get(a.userId) ?? 0,
        'Último evento': fmtDateTime(lMap.get(a.userId)),
      };
    });
    return {
      columns: [
        'Utilizador',
        'Email',
        'Perfil',
        'Eventos',
        'Falhados/negados',
        'Eliminações',
        'Exportações',
        'Último evento',
      ],
      rows,
      total: rows.length,
    };
  }

  private async executiveSummary(dto: AuditReportDto) {
    const where = this.eventWhere(dto);
    const period = this.periodWhere(dto);
    const now = new Date();
    const [
      events,
      failed,
      denied,
      critical,
      users,
      incTotal,
      incOpen,
      incCritical,
      auditsActive,
      auditsDone,
      overdue,
      exportsN,
    ] = await Promise.all([
      this.prisma.read.auditLog.count({ where }),
      this.prisma.read.auditLog.count({ where: { AND: [where, { status: 'FAILED' }] } }),
      this.prisma.read.auditLog.count({ where: { AND: [where, { status: 'DENIED' }] } }),
      this.prisma.read.auditLog.count({
        where: { AND: [where, { severity: { in: ['HIGH', 'CRITICAL'] } }] },
      }),
      this.prisma.read.auditLog.groupBy({ by: ['userId'], where }),
      this.prisma.read.securityIncident.count({ where: { detectedAt: period } }),
      this.prisma.read.securityIncident.count({
        where: { detectedAt: period, status: { in: ['OPEN', 'IN_ANALYSIS'] } },
      }),
      this.prisma.read.securityIncident.count({
        where: { detectedAt: period, severity: 'CRITICAL' },
      }),
      this.prisma.read.internalAudit.count({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      }),
      this.prisma.read.internalAudit.count({ where: { status: 'COMPLETED', approvedAt: period } }),
      this.prisma.read.internalAuditAction.count({
        where: { status: { not: 'DONE' }, dueDate: { lt: now } },
      }),
      this.prisma.read.auditExport.count({ where: { kind: 'REPORT', createdAt: period } }),
    ]);
    const rows: ReportRow[] = [
      { Indicador: 'Eventos de auditoria no período', Valor: events },
      { Indicador: 'Operações falhadas', Valor: failed },
      { Indicador: 'Operações negadas', Valor: denied },
      { Indicador: 'Eventos de gravidade alta/crítica', Valor: critical },
      { Indicador: 'Utilizadores/processos distintos', Valor: users.length },
      { Indicador: 'Incidentes de segurança detetados', Valor: incTotal },
      { Indicador: 'Incidentes em aberto ou em análise', Valor: incOpen },
      { Indicador: 'Incidentes críticos', Valor: incCritical },
      { Indicador: 'Auditorias internas em curso', Valor: auditsActive },
      { Indicador: 'Auditorias concluídas no período', Valor: auditsDone },
      { Indicador: 'Ações corretivas fora do prazo', Valor: overdue },
      { Indicador: 'Relatórios exportados no período', Valor: exportsN },
    ];
    return { columns: ['Indicador', 'Valor'], rows, total: rows.length };
  }

  private async incidents(dto: AuditReportDto) {
    const where: Prisma.SecurityIncidentWhereInput = {
      detectedAt: this.periodWhere(dto),
      ...(dto.severity && { severity: dto.severity }),
      ...(dto.state && { status: dto.state as never }),
    };
    const [list, total] = await Promise.all([
      this.prisma.read.securityIncident.findMany({
        where,
        take: MAX_ROWS,
        orderBy: { detectedAt: 'desc' },
        include: { _count: { select: { evidences: true } } },
      }),
      this.prisma.read.securityIncident.count({ where }),
    ]);
    const users = await this.usersById(list.map(i => i.assigneeId));
    const rows: ReportRow[] = list.map(i => ({
      Código: i.code,
      Título: i.title,
      Categoria: i.category,
      Gravidade: i.severity,
      Estado: i.status,
      Detetado: fmtDateTime(i.detectedAt),
      Responsável: (i.assigneeId && users.get(i.assigneeId)?.fullName) || '—',
      Evidências: i._count.evidences,
      Encerrado: fmtDate(i.closedAt),
      Resolução: i.resolution?.slice(0, 200) ?? '—',
    }));
    return {
      columns: [
        'Código',
        'Título',
        'Categoria',
        'Gravidade',
        'Estado',
        'Detetado',
        'Responsável',
        'Evidências',
        'Encerrado',
        'Resolução',
      ],
      rows,
      total,
    };
  }

  private async audits(dto: AuditReportDto) {
    const state = dto.state ?? 'COMPLETED';
    const period = this.periodWhere(dto);
    const where: Prisma.InternalAuditWhereInput = {
      ...(state !== 'ALL' && { status: state as never }),
      ...(period && { OR: [{ approvedAt: period }, { startDate: period }, { createdAt: period }] }),
    };
    const [list, total] = await Promise.all([
      this.prisma.read.internalAudit.findMany({
        where,
        take: MAX_ROWS,
        orderBy: { createdAt: 'desc' },
        include: {
          findings: { select: { nonConformity: true, risk: true } },
          actions: { select: { status: true } },
        },
      }),
      this.prisma.read.internalAudit.count({ where }),
    ]);
    const rows: ReportRow[] = list.map(a => ({
      Código: a.code,
      Título: a.title,
      Tipo: a.type,
      Estado: a.status,
      Resultado: a.result ?? '—',
      Início: fmtDate(a.startDate),
      Prazo: fmtDate(a.dueDate),
      Aprovada: fmtDate(a.approvedAt),
      Constatações: a.findings.length,
      'Não conformidades': a.findings.filter(f => f.nonConformity).length,
      'Ações pendentes': a.actions.filter(x => x.status !== 'DONE').length,
    }));
    return {
      columns: [
        'Código',
        'Título',
        'Tipo',
        'Estado',
        'Resultado',
        'Início',
        'Prazo',
        'Aprovada',
        'Constatações',
        'Não conformidades',
        'Ações pendentes',
      ],
      rows,
      total,
    };
  }

  private async correctiveActions(dto: AuditReportDto) {
    const where: Prisma.InternalAuditActionWhereInput = {
      status: { not: 'DONE' },
      ...(this.periodWhere(dto) && { dueDate: this.periodWhere(dto) }),
    };
    const [list, total] = await Promise.all([
      this.prisma.read.internalAuditAction.findMany({
        where,
        take: MAX_ROWS,
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        include: { audit: { select: { code: true, title: true } } },
      }),
      this.prisma.read.internalAuditAction.count({ where }),
    ]);
    const users = await this.usersById(list.map(a => a.responsibleId));
    const now = Date.now();
    const rows: ReportRow[] = list.map(a => {
      const late = a.dueDate ? Math.floor((now - a.dueDate.getTime()) / 86400000) : 0;
      return {
        Auditoria: a.audit.code,
        Ação: a.description.slice(0, 200),
        Responsável: (a.responsibleId && users.get(a.responsibleId)?.fullName) || '—',
        Prazo: fmtDate(a.dueDate),
        Estado: a.status,
        'Fora do prazo': late > 0 ? 'Sim' : 'Não',
        'Dias de atraso': Math.max(late, 0),
      };
    });
    return {
      columns: [
        'Auditoria',
        'Ação',
        'Responsável',
        'Prazo',
        'Estado',
        'Fora do prazo',
        'Dias de atraso',
      ],
      rows,
      total,
    };
  }

  // ─── exportação ───────────────────────────────────────────────────────────

  private async render(
    report: AuditReportResult,
    format: 'csv' | 'xlsx' | 'pdf',
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v));

    if (format === 'xlsx') {
      return {
        buffer: await buildXlsxBuffer(report.rows, report.columns, report.title.slice(0, 31)),
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }
    if (format === 'csv') {
      const esc = (v: unknown) => {
        let s = cell(v);
        // Neutraliza injeção de fórmulas em Excel/LibreOffice.
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [
        report.columns.map(esc).join(','),
        ...report.rows.map(r => report.columns.map(c => esc(r[c])).join(',')),
      ];
      return {
        buffer: Buffer.from('﻿' + lines.join('\r\n'), 'utf8'),
        mimeType: 'text/csv; charset=utf-8',
      };
    }
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];
      doc.on('data', (d: Buffer) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      const colW = width / Math.max(report.columns.length, 1);
      doc.fontSize(16).font('Helvetica-Bold').text(report.title);
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#666')
        .text(
          `Gerado em ${fmtDateTime(report.generatedAt)} · ${report.rows.length} de ${report.total} registos` +
            (report.truncated ? ' (truncado)' : ''),
        )
        .fillColor('#000');
      doc.moveDown(0.6);
      const drawRow = (values: string[], bold: boolean) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
        const h = Math.max(...values.map(v => doc.heightOfString(v, { width: colW - 4 })), 10);
        if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
        const top = doc.y;
        values.forEach((v, i) => doc.text(v, left + i * colW, top, { width: colW - 4 }));
        doc.y = top + h + 3;
      };
      drawRow(report.columns, true);
      for (const r of report.rows)
        drawRow(
          report.columns.map(c => cell(r[c])),
          false,
        );
      doc.end();
    });
    return { buffer, mimeType: 'application/pdf' };
  }

  async export(dto: AuditReportExportDto, actor: AuditActor, viewerRole?: string | null) {
    const { format, confidentiality, ...rest } = dto;
    const filters = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    try {
      const report = await this.build(rest as AuditReportDto, viewerRole);
      const { buffer, mimeType } = await this.render(report, format);
      const fileName = `auditoria-${report.type}-${new Date().toISOString().slice(0, 10)}.${format}`;
      const saved = await this.exportsSvc.saveFile({
        kind: 'REPORT',
        fileName,
        mimeType,
        format,
        reportType: report.type,
        buffer,
        recordCount: report.rows.length,
        periodFrom: dto.from ? new Date(dto.from) : undefined,
        periodTo: dto.to ? new Date(dto.to) : undefined,
        filters,
        confidentiality,
        createdById: actor.id,
      });
      await this.audit.log({
        userId: actor.id,
        action: 'EXPORT',
        entity: 'AuditReport',
        entityId: saved.id,
        entityName: report.title,
        severity: 'HIGH',
        ip: actor.ip,
        metadata: {
          exportCode: saved.code,
          reportType: report.type,
          format,
          filters,
          records: report.rows.length,
          sha256: saved.sha256,
          result: 'SUCCESS',
        },
      });
      return { buffer, mimeType, fileName, exportId: saved.id, exportCode: saved.code };
    } catch (err) {
      await this.audit.log({
        userId: actor.id,
        action: 'EXPORT',
        entity: 'AuditReport',
        entityName: REPORT_CATALOG[dto.type],
        status: 'FAILED',
        severity: 'HIGH',
        ip: actor.ip,
        metadata: {
          reportType: dto.type,
          format,
          filters,
          result: 'FAILED',
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }
}

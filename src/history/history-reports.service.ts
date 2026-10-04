// src/history/history-reports.service.ts
// docs/history.md §9 — relatórios do History (JSON + exportação CSV/XLSX/PDF).
// Todos os relatórios são construídos a partir dos mesmos colectores do hub,
// por isso os números batem sempre com o que as abas mostram.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';
import { HistoryEventType, HistoryReportDto, HistoryReportType, MovementType } from './history.dto';
import { HistoryHubService, MOVEMENT_LABEL } from './history-hub.service';
import { deriveModule } from './history.service';

export type ReportRow = Record<string, string | number>;

export interface ReportResult {
  type: HistoryReportType;
  title: string;
  columns: string[];
  rows: ReportRow[];
  generatedAt: Date;
}

const ALL = { page: 1, limit: 100000 };

const REPORT_TITLE: Record<HistoryReportType, string> = {
  'employee-history': 'Histórico de colaboradores',
  movements: 'Movimentos de colaboradores',
  admissions: 'Admissões',
  exits: 'Saídas',
  transfers: 'Transferências',
  promotions: 'Promoções',
  'position-changes': 'Alterações de cargos',
  'department-changes': 'Alterações de departamentos',
  'org-changes': 'Alterações organizacionais',
  'activities-by-module': 'Actividades por módulo',
  'activities-by-user': 'Actividades por utilizador',
  'changes-by-period': 'Alterações por período',
};

export const EVENT_TYPE_LABEL: Record<string, string> = {
  [HistoryEventType.CREATED]: 'Criado',
  [HistoryEventType.UPDATED]: 'Actualizado',
  [HistoryEventType.DELETED]: 'Eliminado',
  [HistoryEventType.APPROVED]: 'Aprovado',
  [HistoryEventType.REJECTED]: 'Rejeitado',
  [HistoryEventType.COMPLETED]: 'Concluído',
  [HistoryEventType.CANCELLED]: 'Cancelado',
  [HistoryEventType.TRANSFERRED]: 'Transferido',
  [HistoryEventType.PROMOTED]: 'Promovido',
  [HistoryEventType.CHANGED]: 'Alterado',
  [HistoryEventType.ASSIGNED]: 'Atribuído',
  [HistoryEventType.DEACTIVATED]: 'Desactivado',
  [HistoryEventType.REACTIVATED]: 'Reactivado',
  [HistoryEventType.SUBMITTED]: 'Submetido',
  [HistoryEventType.ARCHIVED]: 'Arquivado',
};

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');
const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

@Injectable()
export class HistoryReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: HistoryHubService,
  ) {}

  async build(dto: HistoryReportDto): Promise<ReportResult> {
    const { type } = dto;
    const base = { ...dto, ...ALL };
    let columns: string[] = [];
    let rows: ReportRow[] = [];

    const movementTypes: Partial<Record<HistoryReportType, MovementType[]>> = {
      admissions: [MovementType.ADMISSION],
      exits: [MovementType.EXIT],
      transfers: [MovementType.TRANSFER],
      promotions: [MovementType.PROMOTION],
      'position-changes': [MovementType.POSITION_CHANGE],
      'department-changes': [MovementType.DEPARTMENT_CHANGE],
    };

    if (type === 'employee-history') {
      const { data } = await this.hub.resolveEntries(base);
      columns = ['Data', 'Colaborador', 'Utilizador', 'Módulo', 'Evento', 'Descrição', 'Estado'];
      rows = data.map(e => ({
        Data: fmt(e.timestamp),
        Colaborador: cell(e.affected?.fullName),
        Utilizador: cell(e.actor?.fullName),
        Módulo: e.module,
        Evento: `${EVENT_TYPE_LABEL[e.eventType] ?? e.eventType} — ${e.title}`,
        Descrição: cell(e.description),
        Estado: e.status,
      }));
    } else if (type === 'movements' || movementTypes[type]) {
      const { data } = await this.hub.getMovements(base);
      const wanted = movementTypes[type];
      columns = [
        'Data',
        'Colaborador',
        'Tipo',
        'Cargo anterior',
        'Cargo novo',
        'Departamento anterior',
        'Departamento novo',
        'Responsável anterior',
        'Responsável novo',
        'Motivo',
        'Registado por',
        'Observação',
      ];
      rows = data
        .filter(m => !wanted || wanted.includes(m.type))
        .map(m => ({
          Data: fmt(m.timestamp),
          Colaborador: cell(m.employee?.fullName),
          Tipo: MOVEMENT_LABEL[m.type],
          'Cargo anterior': cell(m.prevPosition),
          'Cargo novo': cell(m.newPosition),
          'Departamento anterior': cell(m.prevDepartment),
          'Departamento novo': cell(m.newDepartment),
          'Responsável anterior': cell(m.prevManager),
          'Responsável novo': cell(m.newManager),
          Motivo: cell(m.reason),
          'Registado por': cell(m.registeredBy?.fullName),
          Observação: cell(m.notes),
        }));
    } else if (type === 'org-changes') {
      const { data } = await this.hub.getOrgChanges(base);
      columns = [
        'Data',
        'Unidade',
        'Departamento',
        'Alteração',
        'Campo',
        'Valor anterior',
        'Novo valor',
        'Responsável',
        'Motivo',
      ];
      rows = data.map(o => ({
        Data: fmt(o.timestamp),
        Unidade: cell(o.unit),
        Departamento: cell(o.department),
        Alteração: o.change,
        Campo: cell(o.field),
        'Valor anterior': cell(o.before),
        'Novo valor': cell(o.after),
        Responsável: cell(o.responsible?.fullName),
        Motivo: cell(o.reason),
      }));
    } else {
      const ctx = await this.hub.buildCtx(dto);
      const ts: Prisma.DateTimeFilter | undefined =
        ctx.from || ctx.to ? { gte: ctx.from, lte: ctx.to } : undefined;
      const where: Prisma.AuditLogWhereInput = ts ? { timestamp: ts } : {};

      if (type === 'activities-by-module') {
        const groups = await this.prisma.read.auditLog.groupBy({
          by: ['action', 'entity'],
          where,
          _count: { id: true },
        });
        const totals = new Map<string, number>();
        for (const g of groups) {
          const m = deriveModule(g.action, g.entity);
          totals.set(m, (totals.get(m) ?? 0) + g._count.id);
        }
        columns = ['Módulo', 'Total'];
        rows = [...totals.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([Módulo, Total]) => ({ Módulo, Total }));
      } else if (type === 'activities-by-user') {
        const groups = await this.prisma.read.auditLog.groupBy({
          by: ['userId'],
          where: { ...where, userId: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 500,
        });
        const users = await this.prisma.read.user.findMany({
          where: { id: { in: groups.map(g => g.userId as number) } },
          select: { id: true, fullName: true, department: { select: { name: true } } },
        });
        const byId = new Map(users.map(u => [u.id, u]));
        columns = ['Utilizador', 'Departamento', 'Total'];
        rows = groups.map(g => {
          const u = byId.get(g.userId as number);
          return {
            Utilizador: u?.fullName ?? `#${g.userId}`,
            Departamento: cell(u?.department?.name),
            Total: g._count.id,
          };
        });
      } else {
        // changes-by-period (mensal, a partir do AuditLog)
        const from = ctx.from ?? new Date(0);
        const to = ctx.to ?? new Date();
        const raw = await this.prisma.$queryRaw<Array<{ period: string; total: number }>>(
          Prisma.sql`SELECT to_char(date_trunc('month', "timestamp"), 'YYYY-MM') AS period,
                            count(*)::int AS total
                     FROM "AuditLog"
                     WHERE "timestamp" >= ${from} AND "timestamp" <= ${to}
                     GROUP BY 1 ORDER BY 1`,
        );
        columns = ['Período', 'Total'];
        rows = raw.map(r => ({ Período: r.period, Total: Number(r.total) }));
      }
    }

    return { type, title: REPORT_TITLE[type], columns, rows, generatedAt: new Date() };
  }

  async export(
    dto: HistoryReportDto,
    format: 'csv' | 'xlsx' | 'pdf',
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const report = await this.build(dto);
    const filename = `historico-${report.type}-${new Date().toISOString().slice(0, 10)}.${format}`;

    if (format === 'xlsx') {
      const buffer = await buildXlsxBuffer(report.rows, report.columns, report.title.slice(0, 31));
      return {
        buffer,
        filename,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    if (format === 'csv') {
      const esc = (v: unknown) => {
        const s = cell(v);
        return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [
        report.columns.map(esc).join(','),
        ...report.rows.map(r => report.columns.map(c => esc(r[c])).join(',')),
      ];
      return {
        buffer: Buffer.from('﻿' + lines.join('\r\n'), 'utf8'),
        filename,
        contentType: 'text/csv; charset=utf-8',
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
        .text(`Gerado em ${fmt(report.generatedAt)} · ${report.rows.length} registos`)
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
    return { buffer, filename, contentType: 'application/pdf' };
  }
}

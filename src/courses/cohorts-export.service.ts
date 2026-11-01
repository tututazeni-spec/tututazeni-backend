import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { CurrentUserData } from '../common/decorators';
import { AuditService } from '../common/services/audit.service';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';
import { CoursesService } from './courses.service';
import { CohortSessionsService } from './cohort-sessions.service';

export type CohortExportFormat = 'xlsx' | 'pdf';
export type CohortExportStatus = 'OPEN' | 'ACTIVE' | 'CLOSED';

const HEADERS = [
  'Curso',
  'Turma',
  'Formador',
  'Local',
  'Início',
  'Fim',
  'Horário',
  'Inscritos',
  'Capacidade',
  'Vagas',
  'Estado',
] as const;

const STATUS_PT: Record<CohortExportStatus, string> = {
  OPEN: 'Inscrições abertas',
  ACTIVE: 'A decorrer',
  CLOSED: 'Encerrada',
};

const TITLE_PT: Record<CohortExportStatus, string> = {
  OPEN: 'Relatório de turmas abertas',
  ACTIVE: 'Relatório de turmas activas',
  CLOSED: 'Relatório de turmas encerradas',
};

const SLUG: Record<CohortExportStatus, string> = {
  OPEN: 'turmas-abertas',
  ACTIVE: 'turmas-activas',
  CLOSED: 'turmas-encerradas',
};

const CONTENT_TYPE: Record<CohortExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

const day = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString().slice(0, 10) : '';

/** Relatórios de turmas (abertas, activas, encerradas) em Excel e PDF. */
@Injectable()
export class CohortsExportService {
  constructor(
    private readonly courses: CoursesService,
    private readonly audit: AuditService,
    private readonly sessions: CohortSessionsService,
  ) {}

  async export(
    status: CohortExportStatus,
    format: CohortExportFormat,
    user: CurrentUserData,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    // Mesmo âmbito da lista: instrutor só vê as suas turmas.
    const cohorts = await this.courses.listOpenCohorts(user, status);
    const now = new Date();
    const cells = cohorts.map(c => [
      c.course.title,
      c.name,
      c.instructor?.fullName ?? 'Sem formador',
      [c.location, c.room].filter(Boolean).join(' • '),
      day(c.startDate),
      day(c.endDate),
      c.schedule ?? '',
      String(c.enrolled),
      String(c.capacity),
      String(c.availableSlots),
      STATUS_PT[status],
    ]);

    const buffer =
      format === 'xlsx'
        ? await buildXlsxBuffer(
            cells.map(r => Object.fromEntries(HEADERS.map((h, i) => [h, r[i]]))),
            [...HEADERS],
            'Turmas',
          )
        : await this.renderPdf(TITLE_PT[status], cells, now);

    await this.audit.log({
      action: 'COHORT_EXPORTED',
      entity: 'CourseCohort',
      userId: user.id,
      metadata: { status, format, rows: cohorts.length },
      strict: true,
    });

    return {
      buffer,
      contentType: CONTENT_TYPE[format],
      filename: `${SLUG[status]}-${now.toISOString().slice(0, 10)}.${format}`,
    };
  }

  /** Folha de presenças de uma turma (dias de aula × participantes) em Excel ou PDF. */
  async exportAttendance(
    cohortId: number,
    format: CohortExportFormat,
    user: CurrentUserData,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    // Mesmo âmbito da folha: ADMIN/RH ou o instrutor da turma.
    const sheet = await this.courses.getCohortAttendanceSheet(cohortId, user);
    const now = new Date();
    const dayLabel = (iso: string) => {
      const [, m, d] = iso.split('-');
      return `${d}/${m}`;
    };
    const mark = (s: string | undefined) =>
      s === 'PRESENT' ? 'Presente' : s === 'ABSENT' ? 'Falta' : '';

    const buffer =
      format === 'xlsx'
        ? await buildXlsxBuffer(
            sheet.participants.map((p): Record<string, string | number> => ({
              Participante: p.fullName,
              ...Object.fromEntries(sheet.days.map(d => [dayLabel(d), mark(p.marks[d])])),
              Presenças: p.present,
              Faltas: p.absent,
              'Total de dias': p.total,
            })),
            ['Participante', ...sheet.days.map(dayLabel), 'Presenças', 'Faltas', 'Total de dias'],
            'Presenças',
          )
        : await this.renderAttendancePdf(sheet, now);

    await this.audit.log({
      action: 'COHORT_ATTENDANCE_EXPORTED',
      entity: 'CourseCohort',
      userId: user.id,
      metadata: {
        cohortId,
        format,
        participants: sheet.participants.length,
        days: sheet.days.length,
      },
      strict: true,
    });

    const slug = sheet.cohort.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return {
      buffer,
      contentType: CONTENT_TYPE[format],
      filename: `presencas-${slug || cohortId}-${now.toISOString().slice(0, 10)}.${format}`,
    };
  }

  private renderAttendancePdf(
    sheet: Awaited<ReturnType<CoursesService['getCohortAttendanceSheet']>>,
    now: Date,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const left = doc.page.margins.left;
    const rowH = 16;
    const nameW = 150;
    const dayW = 28;
    const totalW = 80;
    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    // Quantos dias cabem por bloco; os restantes passam para outro bloco por baixo.
    const perBlock = Math.max(1, Math.floor((usable - nameW - totalW) / dayW));
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    const text = (t: string, x: number, y: number, w: number, bold = false, center = false) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.5)
        .fillColor('#0F1F3D')
        .text(printable(t), x, y, {
          width: w - 4,
          height: rowH - 4,
          ellipsis: true,
          lineBreak: false,
          align: center ? 'center' : 'left',
        });
    };

    const title = () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#0F1F3D')
        .text(`Folha de presenças — ${sheet.cohort.name}`, left, 40);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(
          `${sheet.cohort.courseTitle} • Gerado em ${now.toLocaleString('pt-PT')} • P = presente, F = falta, – = sem registo`,
          left,
          58,
        );
      return 76;
    };

    let y = title();
    const daysAll = sheet.days;
    for (let start = 0; start < Math.max(daysAll.length, 1); start += perBlock) {
      const days = daysAll.slice(start, start + perBlock);
      const need = rowH * (sheet.participants.length + 1) + 10;
      if (y + Math.min(need, rowH * 4) > bottom()) {
        doc.addPage();
        y = title();
      }
      const header = (yy: number) => {
        let x = left;
        text('Participante', x, yy, nameW, true);
        x += nameW;
        for (const d of days) {
          const [, m, dd] = d.split('-');
          text(`${dd}/${m}`, x, yy, dayW, true, true);
          x += dayW;
        }
        text('Presenças', x, yy, totalW, true, true);
        doc
          .moveTo(left, yy + rowH - 3)
          .lineTo(x + totalW, yy + rowH - 3)
          .lineWidth(0.3)
          .stroke('#BBBBBB');
      };
      header(y);
      y += rowH;
      for (const p of sheet.participants) {
        if (y + rowH > bottom()) {
          doc.addPage();
          y = title();
          header(y);
          y += rowH;
        }
        let x = left;
        text(p.fullName, x, y, nameW);
        x += nameW;
        for (const d of days) {
          const s = p.marks[d];
          text(s === 'PRESENT' ? 'P' : s === 'ABSENT' ? 'F' : '–', x, y, dayW, false, true);
          x += dayW;
        }
        text(`${p.present}/${p.total}`, x, y, totalW, false, true);
        doc
          .moveTo(left, y + rowH - 3)
          .lineTo(x + totalW, y + rowH - 3)
          .lineWidth(0.3)
          .stroke('#BBBBBB');
        y += rowH;
      }
      y += 14;
    }

    doc.end();
    return done;
  }

  private renderPdf(title: string, rows: string[][], now: Date): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const widths = [140, 110, 90, 90, 50, 50, 70, 40, 40, 30, 62];
    const left = doc.page.margins.left;
    const rowH = 16;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    const drawRow = (cells: readonly string[], y: number, bold: boolean) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.5)
        .fillColor('#0F1F3D');
      let x = left;
      cells.forEach((c, i) => {
        doc.text(printable(c), x, y, {
          width: widths[i] - 4,
          height: rowH - 4,
          ellipsis: true,
          lineBreak: false,
        });
        x += widths[i];
      });
      doc
        .moveTo(left, y + rowH - 3)
        .lineTo(x, y + rowH - 3)
        .lineWidth(0.3)
        .stroke('#BBBBBB');
    };

    const header = () => {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#0F1F3D').text(title, left, 40);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(`Gerado em ${now.toLocaleString('pt-PT')}`, left, 58);
      drawRow(HEADERS, 76, true);
      return 76 + rowH;
    };

    let y = header();
    for (const r of rows) {
      if (y + rowH > bottom()) {
        doc.addPage();
        y = header();
      }
      drawRow(r, y, false);
      y += rowH;
    }
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(`Total: ${rows.length} turma(s)`, left, Math.min(y + 8, bottom() + 8));

    doc.end();
    return done;
  }

  /** Relatório de assiduidade (geral + individual) em Excel, CSV ou PDF. */
  async exportAttendanceReport(
    cohortId: number,
    format: CohortExportFormat | 'csv',
    user: CurrentUserData,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const report = await this.sessions.getReport(cohortId, user);
    const now = new Date();
    const pct = (r: number | null) => (r === null ? 'Ainda sem dados' : `${r}%`);
    const situation = (m: boolean | null) =>
      m === null ? 'Ainda sem dados' : m ? 'Cumpre o mínimo' : 'Abaixo do mínimo';
    const headers = [
      'Participante',
      'Identificador',
      'Curso',
      'Turma',
      'Sessões elegíveis',
      'Presenças',
      'Atrasos',
      'Faltas',
      'Justificadas',
      'Sem registo',
      '% presença',
      'Situação',
    ];
    const rows = report.participants.map((p): Record<string, string | number> => ({
      Participante: p.fullName,
      Identificador: p.identifier,
      Curso: report.cohort.courseTitle,
      Turma: report.cohort.name,
      'Sessões elegíveis': p.eligibleSessions,
      Presenças: p.present,
      Atrasos: p.late,
      Faltas: p.absent,
      Justificadas: p.justified,
      'Sem registo': p.unmarked,
      '% presença': pct(p.rate),
      Situação: situation(p.meetsMinimum),
    }));
    const criteria =
      `Mínimo de ${report.criteria.minAttendancePercent}%; Presente e Atrasado contam como presença; ` +
      report.criteria.note;
    const period = report.period.from
      ? `${report.period.from} a ${report.period.to}`
      : 'sem sessões concluídas';

    let buffer: Buffer;
    if (format === 'xlsx') {
      buffer = await buildXlsxBuffer(rows, headers, 'Assiduidade');
    } else if (format === 'csv') {
      const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
      const meta = [
        `Turma;${esc(report.cohort.name)}`,
        `Curso;${esc(report.cohort.courseTitle)}`,
        `Período;${esc(period)}`,
        `Emitido em;${esc(now.toISOString().slice(0, 10))}`,
        `Critérios;${esc(criteria)}`,
        '',
      ];
      const body = rows.map(r => headers.map(h => esc(r[h])).join(';'));
      buffer = Buffer.from(
        `\uFEFF${[...meta, headers.map(esc).join(';'), ...body].join('\r\n')}`,
        'utf8',
      );
    } else {
      buffer = await this.renderReportPdf(report, headers, rows, period, criteria, now);
    }

    await this.audit.log({
      action: 'COHORT_ATTENDANCE_REPORT_EXPORTED',
      entity: 'CourseCohort',
      entityId: cohortId,
      userId: user.id,
      metadata: { format, participants: rows.length },
      strict: true,
    });

    const slug = report.cohort.name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return {
      buffer,
      contentType: format === 'csv' ? 'text/csv; charset=utf-8' : CONTENT_TYPE[format],
      filename: `assiduidade-${slug || cohortId}-${now.toISOString().slice(0, 10)}.${format}`,
    };
  }

  private renderReportPdf(
    report: Awaited<ReturnType<CohortSessionsService['getReport']>>,
    headers: string[],
    rows: Array<Record<string, string | number>>,
    period: string,
    criteria: string,
    now: Date,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
    const left = doc.page.margins.left;
    const usable = doc.page.width - left - doc.page.margins.right;
    const cols = [
      'Participante',
      'Sessões elegíveis',
      'Presenças',
      'Atrasos',
      'Faltas',
      'Justificadas',
      '% presença',
      'Situação',
    ];
    const widths = [210, 70, 60, 50, 50, 70, 80, 0];
    widths[7] = usable - widths.slice(0, 7).reduce((a, b) => a + b, 0);
    const rowH = 16;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
    const cell = (t: string, x: number, y: number, w: number, bold = false) =>
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .fillColor('#0F1F3D')
        .text(printable(t), x, y, {
          width: w - 4,
          height: rowH - 4,
          ellipsis: true,
          lineBreak: false,
        });

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#0F1F3D')
      .text(printable(`Relatório de assiduidade — ${report.cohort.name}`), left, 40);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(
        printable(
          `${report.cohort.courseTitle} • Período: ${period} • Emitido em ${now.toLocaleString('pt-PT')}`,
        ),
        left,
        58,
      )
      .text(printable(`Critérios: ${criteria}`), left, 70, { width: usable });
    const g = report.general;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#0F1F3D')
      .text(
        printable(
          `Inscritos: ${g.enrolled}   Sessões realizadas: ${g.sessionsCompleted}   Presenças: ${g.present}   Atrasos: ${g.late}   Faltas: ${g.absent}   Justificadas: ${g.justified}   Taxa média: ${g.averageRate === null ? 'Ainda sem dados' : g.averageRate + '%'}   Abaixo do mínimo: ${g.belowMinimum}`,
        ),
        left,
        96,
        { width: usable },
      );

    const header = (y: number) => {
      let x = left;
      cols.forEach((c, i) => {
        cell(c, x, y, widths[i], true);
        x += widths[i];
      });
      doc
        .moveTo(left, y + rowH - 3)
        .lineTo(left + usable, y + rowH - 3)
        .lineWidth(0.3)
        .stroke('#BBBBBB');
    };
    let y = 126;
    header(y);
    y += rowH;
    for (const r of rows) {
      if (y + rowH > bottom()) {
        doc.addPage();
        y = 40;
        header(y);
        y += rowH;
      }
      let x = left;
      cols.forEach((c, i) => {
        cell(String(r[c]), x, y, widths[i]);
        x += widths[i];
      });
      doc
        .moveTo(left, y + rowH - 3)
        .lineTo(left + usable, y + rowH - 3)
        .lineWidth(0.3)
        .stroke('#BBBBBB');
      y += rowH;
    }
    void headers;
    doc.end();
    return done;
  }
}

// Fontes standard do pdfkit só cobrem Latin-1: remove emoji/símbolos fora desse intervalo.
const NOT_LATIN1 = new RegExp('[^ -~ -ÿ–—‘’“”•]', 'g');

function printable(text: string): string {
  return text.replace(NOT_LATIN1, '');
}

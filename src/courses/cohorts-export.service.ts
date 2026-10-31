import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { CurrentUserData } from '../common/decorators';
import { AuditService } from '../common/services/audit.service';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';
import { CoursesService } from './courses.service';

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
}

// Fontes standard do pdfkit só cobrem Latin-1: remove emoji/símbolos fora desse intervalo.
const NOT_LATIN1 = new RegExp('[^ -~ -ÿ–—‘’“”•]', 'g');

function printable(text: string): string {
  return text.replace(NOT_LATIN1, '');
}

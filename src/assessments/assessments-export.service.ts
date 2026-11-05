// src/assessments/assessments-export.service.ts
// Exportação dos resultados de uma avaliação formal (um ficheiro por
// avaliação) em CSV, Excel ou PDF — mesma lista que GET /assessments/:id/results.

import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { CurrentUserData } from '../common/decorators';
import { AuditService } from '../common/services/audit.service';
import { buildCsv } from '../common/utils/csv-safe.util';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';
import { AssessmentsService } from './assessments.service';

export type AssessmentExportFormat = 'csv' | 'xlsx' | 'pdf';

const HEADERS = [
  'Participante',
  'Departamento',
  'Nota',
  'Nota máxima',
  'Resultado',
  'Aprovado',
  'Estado',
  'Submetido em',
] as const;

const CONTENT_TYPE: Record<AssessmentExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

// Fontes standard do pdfkit só cobrem Latin-1: remove emoji/símbolos fora desse intervalo.
const NOT_LATIN1 = new RegExp('[^ -~ -ÿ–—‘’“”•]', 'g');
const printable = (text: string) => text.replace(NOT_LATIN1, '');

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

@Injectable()
export class AssessmentsExportService {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly audit: AuditService,
  ) {}

  async exportResults(
    assessmentId: number,
    format: AssessmentExportFormat,
    user: CurrentUserData,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const { assessment, roster } = await this.assessments.getResultsRoster(assessmentId);
    const now = new Date();

    const rows: string[][] = roster.map(r => [
      r.fullName,
      r.department ?? '',
      r.displayGrade == null ? '' : String(r.displayGrade),
      String(assessment.maxGrade),
      r.qualitativeLabel ?? '',
      r.passed == null ? '' : r.passed ? 'Sim' : 'Não',
      r.status,
      r.submittedAt ? new Date(r.submittedAt).toISOString().slice(0, 16).replace('T', ' ') : '',
    ]);

    let buffer: Buffer;
    if (format === 'csv') {
      buffer = Buffer.from(buildCsv(HEADERS, rows), 'utf8');
    } else if (format === 'xlsx') {
      buffer = await buildXlsxBuffer(
        rows.map(r => Object.fromEntries(HEADERS.map((h, i) => [h, r[i]]))),
        [...HEADERS],
        'Resultados',
      );
    } else {
      buffer = await this.renderPdf(assessment.title, rows, now);
    }

    await this.audit.log({
      action: 'ASSESSMENT_RESULTS_EXPORTED',
      entity: 'Assessment',
      userId: user.id,
      metadata: { assessmentId, format, rows: rows.length },
      strict: true,
    });

    return {
      buffer,
      contentType: CONTENT_TYPE[format],
      filename: `avaliacao-${slug(assessment.title) || assessmentId}-${now.toISOString().slice(0, 10)}.${format}`,
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

    const widths = [170, 120, 45, 60, 80, 55, 80, 110];
    const left = doc.page.margins.left;
    const rowH = 16;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;

    const drawRow = (cells: readonly string[], y: number, bold: boolean) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
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
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#0F1F3D')
        .text(printable(`Resultados — ${title}`), left, 40, { lineBreak: false });
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
      .text(`Total: ${rows.length} participante(s)`, left, Math.min(y + 8, bottom() + 8));

    doc.end();
    return done;
  }
}

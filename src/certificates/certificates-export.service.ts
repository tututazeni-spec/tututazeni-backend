import { BadRequestException, Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { AuditService } from '../common/services/audit.service';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';
import { AdminCertificateRow, CertificatesAdminService } from './certificates-admin.service';
import { ExportCertificatesQueryDto, ExportFormat } from './certificates-admin.dto';
import { buildSafeCsv } from './certificates-csv';
import { CertificateScopeService, ScopeActor } from './certificate-scope.service';

export const MAX_EXPORT_ROWS = 5000;

const HEADERS = [
  'Titular',
  'Departamento',
  'Formação',
  'Tipo',
  'Origem',
  'Estado',
  'Emissão',
  'Validade',
  'Código',
] as const;

const STATUS_PT: Record<string, string> = {
  ACTIVE: 'Válido',
  EXPIRED: 'Expirado',
  REVOKED: 'Revogado',
  PENDING: 'Pendente',
  PENDING_APPROVAL: 'Aguarda aprovação',
};
const KIND_PT: Record<string, string> = {
  COURSE: 'Curso',
  TRAINING: 'Formação',
  LEARNING_PATH: 'Trilha',
  EVENT: 'Evento',
};
const ORIGIN_PT: Record<string, string> = { INTERNAL: 'Interno', EXTERNAL: 'Externo' };

const CONTENT_TYPE: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

function toCells(r: AdminCertificateRow): string[] {
  return [
    r.holderName,
    r.departmentName ?? '',
    r.title,
    r.activityKind ? (KIND_PT[r.activityKind] ?? r.activityKind) : '',
    ORIGIN_PT[r.origin] ?? r.origin,
    STATUS_PT[r.status] ?? r.status,
    day(r.issuedAt),
    day(r.expiresAt),
    r.code,
  ];
}

/** Exportação filtrada, no âmbito do actor e sempre auditada. */
@Injectable()
export class CertificatesExportService {
  constructor(
    private readonly admin: CertificatesAdminService,
    private readonly scope: CertificateScopeService,
    private readonly audit: AuditService,
  ) {}

  async exportCertificates(
    q: ExportCertificatesQueryDto,
    actor: ScopeActor,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string; rows: number }> {
    const format: ExportFormat = q.format ?? 'csv';
    const scope = await this.scope.resolveScope(actor);
    const now = new Date();
    const rows = await this.admin.exportRows(q, scope, now, MAX_EXPORT_ROWS + 1);
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `Demasiados resultados (mais de ${MAX_EXPORT_ROWS}). Aplique filtros para reduzir a exportação.`,
      );
    }

    const cells = rows.map(toCells);
    let buffer: Buffer;
    if (format === 'csv') {
      buffer = Buffer.from(buildSafeCsv([...HEADERS], cells), 'utf8');
    } else if (format === 'xlsx') {
      const data = cells.map(c => Object.fromEntries(HEADERS.map((h, i) => [h, c[i]])));
      buffer = await buildXlsxBuffer(data, [...HEADERS], 'Certificados');
    } else {
      buffer = await this.renderPdf(cells, now);
    }

    await this.audit.log({
      action: 'CERTIFICATE_EXPORTED',
      entity: 'Certificate',
      userId: actor.id,
      metadata: {
        format,
        rows: rows.length,
        // Só os critérios estruturados: o texto da pesquisa e os códigos nunca vão para a auditoria.
        filters: {
          status: q.status,
          activityKind: q.activityKind,
          departmentId: q.departmentId,
          courseId: q.courseId,
          issuedFrom: q.issuedFrom,
          issuedTo: q.issuedTo,
          expiresFrom: q.expiresFrom,
          expiresTo: q.expiresTo,
          hasSearch: !!q.search?.trim(),
          hasCode: q.code !== undefined && q.code !== '',
        },
      },
      strict: true,
    });

    return {
      buffer,
      contentType: CONTENT_TYPE[format],
      filename: `certificados-${now.toISOString().slice(0, 10)}.${format}`,
      rows: rows.length,
    };
  }

  private renderPdf(rows: string[][], now: Date): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const widths = [120, 85, 170, 55, 45, 70, 55, 55, 107];
    const left = doc.page.margins.left;
    const rowH = 16;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 20;
    const cellOpts = (w: number) => ({
      width: w - 4,
      height: rowH - 4,
      ellipsis: true,
      lineBreak: false,
    });

    const drawRow = (cells: readonly string[], y: number, bold: boolean) => {
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .fillColor('#0F1F3D');
      let x = left;
      cells.forEach((c, i) => {
        doc.text(printable(c), x, y, cellOpts(widths[i]));
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
        .text('Relatório de certificados', left, 40);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(`Gerado em ${now.toLocaleString('pt-PT')}`, left, 58);
      const y = 76;
      drawRow(HEADERS, y, true);
      return y + rowH;
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
      .text(`Total: ${rows.length} certificado(s)`, left, Math.min(y + 8, bottom() + 8));

    doc.end();
    return done;
  }
}

// Fontes standard do pdfkit só cobrem Latin-1: remove emoji/símbolos fora desse intervalo.
const NOT_LATIN1 = new RegExp(
  '[^\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D]',
  'g',
);

function printable(text: string): string {
  return text.replace(NOT_LATIN1, '');
}

// src/executive-reports/executive-reports.export.service.ts
// Exportação de relatórios executivos em PDF, Excel e CSV (docs §7). Exporta
// sempre o conteúdo já guardado no relatório — o ficheiro reflecte exactamente
// o que foi gerado, com data, autor, filtros e versões.
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ReportSection } from './executive-reports.builder.service';

export type ExportFormat = 'PDF' | 'XLSX' | 'CSV';

export interface ReportContent {
  meta: {
    title: string;
    generatedAt: string;
    generatedBy: string;
    templateCode: string;
    templateName: string;
    templateVersion: number;
    formulaVersion: string;
    periodLabel: string;
    filters: Record<string, unknown>;
    sourceModules: string[];
  };
  sections: ReportSection[];
  omitted: { key: string; reason: string }[];
}

export interface ExportedFile {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function filterLines(filters: Record<string, unknown>): string[] {
  return Object.entries(filters)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
}

@Injectable()
export class ExecutiveReportsExportService {
  async export(content: ReportContent, format: ExportFormat): Promise<ExportedFile> {
    switch (format) {
      case 'XLSX':
        return {
          buffer: await this.toXlsx(content),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          extension: 'xlsx',
        };
      case 'CSV':
        return {
          buffer: Buffer.from(this.toCsv(content), 'utf8'),
          contentType: 'text/csv; charset=utf-8',
          extension: 'csv',
        };
      default:
        return {
          buffer: await this.toPdf(content),
          contentType: 'application/pdf',
          extension: 'pdf',
        };
    }
  }

  // ─── CSV ──────────────────────────────────────────────────────────────────

  private csvField(v: unknown): string {
    const s = cell(v);
    // Mitiga injecção de fórmulas ao abrir o CSV no Excel.
    const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
    return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  }

  private toCsv(c: ReportContent): string {
    const lines: string[] = [];
    const push = (...f: unknown[]) => lines.push(f.map(x => this.csvField(x)).join(','));
    push(c.meta.title);
    push('Gerado em', c.meta.generatedAt);
    push('Autor', c.meta.generatedBy);
    push('Modelo', `${c.meta.templateName} v${c.meta.templateVersion}`);
    push('Versão das fórmulas', c.meta.formulaVersion);
    push('Período', c.meta.periodLabel);
    for (const l of filterLines(c.meta.filters)) push('Filtro', l);
    for (const s of c.sections) {
      lines.push('');
      push(s.title);
      push(...s.columns.map(x => x.label));
      if (s.rows.length === 0) push(s.note ?? 'Sem dados');
      for (const r of s.rows) push(...s.columns.map(x => r[x.key]));
    }
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  }

  // ─── Excel ────────────────────────────────────────────────────────────────

  private async toXlsx(c: ReportContent): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = c.meta.generatedBy;
    wb.created = new Date(c.meta.generatedAt);

    const info = wb.addWorksheet('Resumo');
    info.columns = [
      { header: 'Campo', key: 'k', width: 26 },
      { header: 'Valor', key: 'v', width: 80 },
    ];
    info.getRow(1).font = { bold: true };
    info.addRows([
      { k: 'Título', v: c.meta.title },
      { k: 'Gerado em', v: c.meta.generatedAt },
      { k: 'Autor', v: c.meta.generatedBy },
      { k: 'Modelo', v: `${c.meta.templateName} v${c.meta.templateVersion}` },
      { k: 'Versão das fórmulas', v: c.meta.formulaVersion },
      { k: 'Período', v: c.meta.periodLabel },
      { k: 'Módulos de origem', v: c.meta.sourceModules.join(', ') },
      ...filterLines(c.meta.filters).map(l => ({ k: 'Filtro', v: l })),
      ...c.omitted.map(o => ({ k: 'Secção omitida', v: `${o.key}: ${o.reason}` })),
    ]);

    const used = new Set<string>(['Resumo']);
    for (const s of c.sections) {
      // Excel limita o nome da folha a 31 caracteres e proíbe alguns símbolos.
      let name = s.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
      for (let i = 2; used.has(name); i++) name = `${name.slice(0, 28)} ${i}`;
      used.add(name);
      const ws = wb.addWorksheet(name);
      ws.columns = s.columns.map(x => ({ header: x.label, key: x.key, width: 24 }));
      ws.getRow(1).font = { bold: true };
      for (const r of s.rows) ws.addRow(s.columns.map(x => r[x.key] ?? ''));
      if (s.rows.length === 0) ws.addRow([s.note ?? 'Sem dados']);
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  // ─── PDF ──────────────────────────────────────────────────────────────────

  private toPdf(c: ReportContent): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (d: Buffer) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;
      const ensure = (h: number) => {
        if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
      };

      doc.fontSize(18).font('Helvetica-Bold').text(c.meta.title);
      doc.moveDown(0.3).fontSize(9).font('Helvetica').fillColor('#555555');
      doc.text(`Gerado em ${c.meta.generatedAt} por ${c.meta.generatedBy}`);
      doc.text(
        `Modelo: ${c.meta.templateName} v${c.meta.templateVersion} · Fórmulas v${c.meta.formulaVersion}`,
      );
      doc.text(`Período: ${c.meta.periodLabel}`);
      const fl = filterLines(c.meta.filters);
      if (fl.length > 0) doc.text(`Filtros: ${fl.join(' · ')}`);
      doc.text(`Origem dos dados: ${c.meta.sourceModules.join(', ') || '—'}`);
      doc.fillColor('#000000');

      for (const s of c.sections) {
        ensure(60);
        doc.moveDown(1).fontSize(13).font('Helvetica-Bold').text(s.title);
        doc.moveDown(0.3);
        const colW = width / Math.max(s.columns.length, 1);

        const row = (vals: string[], bold: boolean) => {
          doc.fontSize(8).font(bold ? 'Helvetica-Bold' : 'Helvetica');
          const h = Math.max(...vals.map(v => doc.heightOfString(v, { width: colW - 4 })), 10);
          ensure(h + 4);
          const y = doc.y;
          vals.forEach((v, i) => doc.text(v, left + i * colW, y, { width: colW - 4 }));
          doc.y = y + h + 3;
        };

        row(
          s.columns.map(x => x.label),
          true,
        );
        doc
          .moveTo(left, doc.y - 1)
          .lineTo(left + width, doc.y - 1)
          .strokeColor('#bbbbbb')
          .stroke();
        if (s.rows.length === 0) {
          doc
            .fontSize(9)
            .font('Helvetica-Oblique')
            .text(s.note ?? 'Sem dados', left);
        }
        for (const r of s.rows)
          row(
            s.columns.map(x => cell(r[x.key])),
            false,
          );
        if (s.note && s.rows.length > 0) {
          doc.moveDown(0.2).fontSize(8).font('Helvetica-Oblique').text(s.note, left);
        }
      }

      if (c.omitted.length > 0) {
        ensure(40);
        doc.moveDown(1).fontSize(9).font('Helvetica-Oblique').fillColor('#555555');
        doc.text(
          `Secções omitidas: ${c.omitted.map(o => `${o.key} (${o.reason})`).join('; ')}`,
          left,
        );
      }
      doc.end();
    });
  }
}

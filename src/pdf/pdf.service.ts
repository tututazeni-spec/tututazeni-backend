// src/pdf/pdf.service.ts
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';

@Injectable()
export class PdfService {

  // ─── UTILITÁRIOS INTERNOS ────────────────────────────────────

  private createDoc(title: string): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    return doc;
  }

  private addHeader(doc: PDFKit.PDFDocument, companyName = 'INNOVA') {
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .text(companyName, 50, 45)
      .fontSize(10)
      .font('Helvetica')
      .text('Plataforma de Gestão de Talentos', 50, 70)
      .moveTo(50, 90)
      .lineTo(545, 90)
      .stroke()
      .moveDown();
  }

  private addFooter(doc: PDFKit.PDFDocument, pageNum: number) {
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(
        `Gerado em ${new Date().toLocaleDateString('pt-PT')} — Página ${pageNum}`,
        50,
        780,
        { align: 'center' }
      );
  }

async generateDeclarationPdf(data: {
  content: string;
  config: any;
  declaration: any;
  withWatermark?: boolean;
}): Promise<Buffer> {
  const doc = this.createDoc('Declaração');
  this.addHeader(doc, data.config?.companyName);

  doc
    .moveDown()
    .fontSize(11)
    .font('Helvetica')
    .text(data.content || 'Conteúdo da declaração.', { align: 'justify', lineGap: 6 });

  if (data.withWatermark) {
    doc
      .save()
      .rotate(45, { origin: [300, 400] })
      .fontSize(60)
      .fillOpacity(0.1)
      .fillColor('red')
      .text('CÓPIA', 150, 350)
      .restore();
  }

  this.addFooter(doc, 1);
  return this.bufferFromDoc(doc);
}

  private bufferFromDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  // ─── DECLARAÇÃO DE TRABALHO ──────────────────────────────────

  async generateDeclaration(data: {
    employeeName: string;
    employeeId: string;
    position: string;
    department: string;
    startDate: string;
    purpose: string;
    companyName?: string;
    signerName?: string;
    signerPosition?: string;
  }): Promise<Buffer> {
    const doc = this.createDoc('Declaração de Trabalho');
    this.addHeader(doc, data.companyName);

    doc
      .moveDown(2)
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('DECLARAÇÃO', { align: 'center' })
      .moveDown(2)
      .fontSize(11)
      .font('Helvetica')
      .text(
        `Declaramos para os devidos fins que ${data.employeeName}, ` +
        `titular do número de colaborador ${data.employeeId}, ` +
        `exerce funções de ${data.position} no departamento de ${data.department}, ` +
        `desde ${data.startDate}.`,
        { align: 'justify', lineGap: 6 }
      )
      .moveDown()
      .text(
        `A presente declaração é emitida a pedido do interessado para ${data.purpose}.`,
        { align: 'justify', lineGap: 6 }
      )
      .moveDown(3)
      .text(`Data: ${new Date().toLocaleDateString('pt-PT')}`, { align: 'right' })
      .moveDown(4)
      .text('_______________________________', { align: 'center' })
      .text(data.signerName ?? 'Recursos Humanos', { align: 'center' })
      .text(data.signerPosition ?? 'Diretor de RH', { align: 'center' });

    this.addFooter(doc, 1);
    return this.bufferFromDoc(doc);
  }

  // ─── CERTIFICADO DE FORMAÇÃO ─────────────────────────────────

  async generateCertificate(data: {
    employeeName: string;
    courseName: string;
    completedAt: string;
    durationHours: number;
    instructorName?: string;
    companyName?: string;
  }): Promise<Buffer> {
    const doc = this.createDoc('Certificado');
    this.addHeader(doc, data.companyName);

    doc
      .moveDown(2)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text('CERTIFICADO DE CONCLUSÃO', { align: 'center' })
      .moveDown()
      .fontSize(12)
      .font('Helvetica')
      .text('Certificamos que', { align: 'center' })
      .moveDown()
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(data.employeeName, { align: 'center' })
      .moveDown()
      .fontSize(12)
      .font('Helvetica')
      .text(`concluiu com sucesso a formação`, { align: 'center' })
      .moveDown()
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(`"${data.courseName}"`, { align: 'center' })
      .moveDown()
      .fontSize(11)
      .font('Helvetica')
      .text(`Duração: ${data.durationHours} horas`, { align: 'center' })
      .text(`Data de conclusão: ${data.completedAt}`, { align: 'center' })
      .moveDown(3);

    if (data.instructorName) {
      doc
        .text('_______________________________', { align: 'center' })
        .text(data.instructorName, { align: 'center' })
        .text('Formador', { align: 'center' });
    }

    this.addFooter(doc, 1);
    return this.bufferFromDoc(doc);
  }

  // ─── PAYSLIP ─────────────────────────────────────────────────

  async generatePayslip(data: {
    employeeName: string;
    employeeId: string;
    period: string;
    baseSalary: number;
    allowances: { label: string; amount: number }[];
    deductions: { label: string; amount: number }[];
    netSalary: number;
    companyName?: string;
  }): Promise<Buffer> {
    const doc = this.createDoc('Recibo de Vencimento');
    this.addHeader(doc, data.companyName);

    const totalAllowances = data.allowances.reduce((s, a) => s + a.amount, 0);
    const totalDeductions = data.deductions.reduce((s, d) => s + d.amount, 0);

    doc
      .moveDown()
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('RECIBO DE VENCIMENTO', { align: 'center' })
      .moveDown()
      .fontSize(11)
      .font('Helvetica')
      .text(`Colaborador: ${data.employeeName}`)
      .text(`Nº Colaborador: ${data.employeeId}`)
      .text(`Período: ${data.period}`)
      .moveDown()
      .font('Helvetica-Bold')
      .text('VENCIMENTOS')
      .font('Helvetica')
      .text(`Salário Base: ${data.baseSalary.toFixed(2)} €`);

    data.allowances.forEach((a) => {
      doc.text(`${a.label}: ${a.amount.toFixed(2)} €`);
    });

    doc
      .moveDown()
      .font('Helvetica-Bold')
      .text('DESCONTOS')
      .font('Helvetica');

    data.deductions.forEach((d) => {
      doc.text(`${d.label}: ${d.amount.toFixed(2)} €`);
    });

    doc
      .moveDown()
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke()
      .moveDown()
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(`LÍQUIDO A RECEBER: ${data.netSalary.toFixed(2)} €`, { align: 'right' });

    this.addFooter(doc, 1);
    return this.bufferFromDoc(doc);
  }

  // ─── RELATÓRIO EXECUTIVO ─────────────────────────────────────

  async generateExecutiveReport(data: {
    title: string;
    period: string;
    metrics: { label: string; value: string | number }[];
    sections: { title: string; content: string }[];
    companyName?: string;
  }): Promise<Buffer> {
    const doc = this.createDoc(data.title);
    this.addHeader(doc, data.companyName);

    doc
      .moveDown()
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(data.title, { align: 'center' })
      .fontSize(11)
      .font('Helvetica')
      .text(`Período: ${data.period}`, { align: 'center' })
      .moveDown(2);

    // Métricas resumo
    doc.font('Helvetica-Bold').text('RESUMO EXECUTIVO').moveDown(0.5);
    data.metrics.forEach((m) => {
      doc.font('Helvetica').text(`${m.label}: ${m.value}`);
    });

    // Secções
    data.sections.forEach((section) => {
      doc
        .moveDown()
        .font('Helvetica-Bold')
        .text(section.title)
        .moveDown(0.5)
        .font('Helvetica')
        .text(section.content, { align: 'justify', lineGap: 4 });
    });

    this.addFooter(doc, 1);
    return this.bufferFromDoc(doc);
  }
}
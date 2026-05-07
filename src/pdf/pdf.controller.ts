// src/pdf/pdf.controller.ts
import {
  Controller, Get, Param, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { PdfService } from './pdf.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('PDF')
@Controller('pdf')
export class PdfController {

  constructor(private readonly pdfService: PdfService) {}

  @Get('declaration/:id')
  @ApiOperation({ summary: 'Exportar declaração em PDF' })
  async downloadDeclaration(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // TODO: buscar dados reais da declaração pelo id
    const buffer = await this.pdfService.generateDeclaration({
      employeeName: 'Nome do Colaborador',
      employeeId: id,
      position: 'Cargo',
      department: 'Departamento',
      startDate: '01/01/2024',
      purpose: 'fins que o interessado indicar',
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="declaracao-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('certificate/:id')
  @ApiOperation({ summary: 'Exportar certificado em PDF' })
  async downloadCertificate(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateCertificate({
      employeeName: 'Nome do Colaborador',
      courseName: 'Nome do Curso',
      completedAt: new Date().toLocaleDateString('pt-PT'),
      durationHours: 8,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificado-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('payslip/:id')
  @ApiOperation({ summary: 'Exportar recibo de vencimento em PDF' })
  async downloadPayslip(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generatePayslip({
      employeeName: 'Nome do Colaborador',
      employeeId: id,
      period: 'Janeiro 2025',
      baseSalary: 1500,
      allowances: [{ label: 'Subsídio de Alimentação', amount: 150 }],
      deductions: [{ label: 'IRS', amount: 200 }, { label: 'Segurança Social', amount: 165 }],
      netSalary: 1285,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recibo-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('report/:id')
  @ApiOperation({ summary: 'Exportar relatório executivo em PDF' })
  async downloadReport(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.pdfService.generateExecutiveReport({
      title: 'Relatório Executivo',
      period: 'Janeiro 2025',
      metrics: [
        { label: 'Total Colaboradores', value: 0 },
        { label: 'Formações Concluídas', value: 0 },
      ],
      sections: [
        { title: 'Resumo', content: 'Conteúdo do relatório.' },
      ],
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
// src/pdf/pdf.controller.ts
import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PdfService } from './pdf.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('PDF')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pdf')
export class PdfController {
  constructor(private readonly pdfService: PdfService) {}

  // A10-20: dados ainda placeholder (TODO abaixo) — sem fuga real hoje, mas
  // quando isto for ligado a dados reais TEM de se verificar que o chamador
  // é o dono da declaração (ou ADMIN/RH), tal como já se faz em
  // declarations.controller.ts findOneSubmission. Não wire sem esse check.
  @Get('declaration/:id')
  @ApiOperation({ summary: 'Exportar declaração em PDF' })
  async downloadDeclaration(@Param('id') id: string, @Res() res: Response) {
    // TODO: buscar dados reais da declaração pelo id — adicionar ownership
    // (assertCanAccess) antes de ligar a dados reais (A10-20).
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

  // A10-20: mesma ressalva — ownership obrigatório antes de ligar a dados reais.
  @Get('certificate/:id')
  @ApiOperation({ summary: 'Exportar certificado em PDF' })
  async downloadCertificate(@Param('id') id: string, @Res() res: Response) {
    // TODO: buscar dados reais do certificado — adicionar ownership antes de
    // ligar a dados reais (A10-20).
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

  // A10-20: recibo de vencimento é dado financeiro sensível — restringido a
  // ADMIN/RH até existir ownership real (assertCanAccess) contra o payslip.
  @Get('payslip/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Exportar recibo de vencimento em PDF' })
  async downloadPayslip(@Param('id') id: string, @Res() res: Response) {
    // TODO: buscar dados reais do recibo — adicionar ownership (dono OU
    // ADMIN/RH) antes de reabrir a colaboradores (A10-20).
    const buffer = await this.pdfService.generatePayslip({
      employeeName: 'Nome do Colaborador',
      employeeId: id,
      period: 'Janeiro 2025',
      baseSalary: 1500,
      allowances: [{ label: 'Subsídio de Alimentação', amount: 150 }],
      deductions: [
        { label: 'IRS', amount: 200 },
        { label: 'Segurança Social', amount: 165 },
      ],
      netSalary: 1285,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recibo-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // A10-20: relatório executivo é dado de gestão — restringido a ADMIN/RH.
  @Get('report/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Exportar relatório executivo em PDF' })
  async downloadReport(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.pdfService.generateExecutiveReport({
      title: 'Relatório Executivo',
      period: 'Janeiro 2025',
      metrics: [
        { label: 'Total Colaboradores', value: 0 },
        { label: 'Formações Concluídas', value: 0 },
      ],
      sections: [{ title: 'Resumo', content: 'Conteúdo do relatório.' }],
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}

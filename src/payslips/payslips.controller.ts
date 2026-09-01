// src/payslips/payslips.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  Res,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { PayslipsService, type AnnualExport, type AnnualExportField } from './payslips.service';
import { PdfService } from '../pdf/pdf.service';
import {
  CreatePayslipDto,
  UpdatePayslipDto,
  PayslipFilterDto,
  BulkCreatePayslipDto,
  SimulatePayslipDto,
  CreateDisputeDto,
} from './payslips.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Payslips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payslips')
export class PayslipsController {
  constructor(
    private readonly svc: PayslipsService,
    private readonly pdf: PdfService,
  ) {}

  // ── Colaborador ────────────────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Os meus recibos (colaborador autenticado)' })
  myPayslips(@CurrentUser() user: CurrentUserData, @Query() filters: PayslipFilterDto) {
    return this.svc.getMyPayslips(user.id, filters);
  }

  @Get('my/annual-summary')
  @ApiOperation({ summary: 'Resumo anual dos meus recibos' })
  @ApiQuery({ name: 'year', example: '2026' })
  myAnnualSummary(@CurrentUser() user: CurrentUserData, @Query('year') year: string) {
    return this.svc.annualSummary(user.id, year ?? new Date().getFullYear().toString());
  }

  @Get('my/annual-summary/export')
  @ApiOperation({ summary: 'Exportar o meu resumo anual (CSV ou PDF)' })
  @ApiQuery({ name: 'year', required: false, example: '2026' })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'pdf'] })
  async myAnnualSummaryExport(
    @CurrentUser() user: CurrentUserData,
    @Query('year') year: string | undefined,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const yr = year ?? new Date().getFullYear().toString();
    const data = await this.svc.buildAnnualExport(user.id, yr);

    if (format === 'pdf') {
      const buffer = await this.pdf.generateExecutiveReport(annualReportInput(data));
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="resumo-anual-${yr}.pdf"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
      return;
    }

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="resumo-anual-${yr}.csv"`,
    });
    res.end(annualCsv(data));
  }

  @Get('my/compare')
  @ApiOperation({ summary: 'Comparar dois meses (colaborador)' })
  @ApiQuery({ name: 'periodA', example: '2026-03' })
  @ApiQuery({ name: 'periodB', example: '2026-04' })
  myCompare(
    @CurrentUser() user: CurrentUserData,
    @Query('periodA') periodA: string,
    @Query('periodB') periodB: string,
  ) {
    return this.svc.compare(user.id, periodA, periodB);
  }

  @Get('my/:id')
  @ApiOperation({ summary: 'Detalhe do meu recibo' })
  async myPayslip(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    const payslip = await this.svc.findOne(id, user);
    await this.svc.logAccess(id, user.id, 'VIEW', req.ip);
    return payslip;
  }

  @Get('my/:id/pdf')
  @ApiOperation({ summary: 'Descarregar o meu recibo em PDF' })
  async myPayslipPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // findOne aplica ownership ao nível do dado (dono OU ADMIN/RH; senão 404).
    const payslip = await this.svc.findOne(id, user);
    if (!payslip) throw new NotFoundException('Recibo não encontrado');

    const buffer = await this.pdf.generatePayslip(payslipToPdfInput(payslip));
    await this.svc.logAccess(id, user.id, 'DOWNLOAD', req.ip);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recibo-${payslip.receiptCode ?? id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Patch('my/:id/acknowledge')
  @ApiOperation({ summary: 'Confirmar recepção do recibo' })
  @HttpCode(HttpStatus.OK)
  acknowledge(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.acknowledge(id, user);
  }

  @Post('my/:id/dispute')
  @ApiOperation({ summary: 'Abrir disputa sobre um recibo' })
  createDispute(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.svc.createDispute(id, user, dto);
  }

  // ── Simulação (aberta a todos) ─────────────────────────────────────────────

  @Post('simulate')
  @ApiOperation({ summary: 'Simular cálculo salarial (IRT, INSS, líquido)' })
  @HttpCode(HttpStatus.OK)
  simulate(@Body() dto: SimulatePayslipDto) {
    return this.svc.simulate(dto);
  }

  // ── Admin / RH ─────────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Listar todos os recibos' })
  findAll(@Query() filters: PayslipFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard RH — métricas de compliance e financeiras' })
  @ApiQuery({ name: 'period', example: '2026-04', required: false })
  hrDashboard(@Query('period') period?: string) {
    return this.svc.hrDashboard(period);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Detalhe de qualquer recibo (Admin/RH)' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    const payslip = await this.svc.findOne(id, user);
    await this.svc.logAccess(id, user.id, 'ADMIN_VIEW', req.ip);
    return payslip;
  }

  @Get(':id/access-logs')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Logs de acesso a um recibo' })
  accessLogs(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAccessLogs(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar recibo individual' })
  create(@Body() dto: CreatePayslipDto) {
    return this.svc.create(dto);
  }

  @Post('bulk-create')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Gerar recibos em massa para um período' })
  bulkCreate(@Body() dto: BulkCreatePayslipDto) {
    return this.svc.bulkCreate(dto);
  }

  @Patch(':id/issue')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Emitir recibo (publica e notifica colaborador)' })
  @HttpCode(HttpStatus.OK)
  issue(@Param('id', ParseIntPipe) id: number) {
    return this.svc.issue(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar recibo (volta a DRAFT)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePayslipDto) {
    return this.svc.update(id, dto);
  }
}

// ─── Serialização dos exports (apresentação; dados vêm do serviço) ───────────

type MyPayslip = NonNullable<Awaited<ReturnType<PayslipsService['findOne']>>>;

/** Mapeia um recibo real para o formato que o PdfService.generatePayslip espera. */
function payslipToPdfInput(p: MyPayslip) {
  const allowances = [
    { label: 'Subsídio de Alimentação', amount: p.mealAllowance },
    { label: 'Subsídio de Férias', amount: p.vacationAllowance },
    { label: 'Subsídio de Natal', amount: p.christmasAllowance },
    { label: 'Horas Extra', amount: p.overtime },
    { label: 'Prémios', amount: p.bonuses },
    { label: 'Outros Abonos', amount: p.otherAllowances },
  ].filter(a => a.amount > 0);

  const deductions = [
    { label: 'IRT', amount: p.incomeTax },
    { label: 'INSS (3%)', amount: p.socialSecurity },
    { label: 'Seguro de Saúde', amount: p.healthInsurance },
    { label: 'Empréstimo', amount: p.loanDeduction },
    { label: 'Adiantamento', amount: p.advanceDeduction },
    { label: 'Outros Descontos', amount: p.otherDeductions },
  ].filter(d => d.amount > 0);

  return {
    employeeName: p.user?.fullName ?? '—',
    employeeId: p.user?.employeeNumber ?? String(p.userId),
    period: p.period,
    baseSalary: p.baseSalary,
    allowances,
    deductions,
    netSalary: p.netSalary,
    currencySymbol: 'Kz',
  };
}

/** Colunas do CSV do resumo anual: rótulo legível → chave em AnnualExport. */
const ANNUAL_CSV_COLUMNS: ReadonlyArray<readonly [string, AnnualExportField]> = [
  ['Salário Base', 'baseSalary'],
  ['Subsídio Alimentação', 'mealAllowance'],
  ['Subsídio Férias', 'vacationAllowance'],
  ['Subsídio Natal', 'christmasAllowance'],
  ['Prémios', 'bonuses'],
  ['Horas Extra', 'overtime'],
  ['Outros Abonos', 'otherAllowances'],
  ['Salário Bruto', 'grossSalary'],
  ['IRT', 'incomeTax'],
  ['INSS', 'socialSecurity'],
  ['Total Descontos', 'totalDeductions'],
  ['Salário Líquido', 'netSalary'],
];

function annualCsv(data: AnnualExport): string {
  const header = ['Período', ...ANNUAL_CSV_COLUMNS.map(([label]) => label)];
  const monthly = data.rows.map(r => [
    r.period,
    ...ANNUAL_CSV_COLUMNS.map(([, key]) => r[key].toFixed(2)),
  ]);
  const totalRow = ['TOTAL', ...ANNUAL_CSV_COLUMNS.map(([, key]) => data.totals[key].toFixed(2))];
  const lines = [header, ...monthly, totalRow];
  // Prefixo BOM (U+FEFF) para o Excel interpretar o ficheiro como UTF-8 (acentos).
  return '\uFEFF' + lines.map(cols => cols.join(',')).join('\r\n') + '\r\n';
}

function annualReportInput(data: AnnualExport) {
  const kz = (n: number) =>
    `${n.toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kz`;
  const t = data.totals;
  return {
    title: `Resumo Anual de Recibos ${data.year}`,
    period: `${data.year} — ${data.months} ${data.months === 1 ? 'mês' : 'meses'}`,
    metrics: [
      { label: 'Total Bruto', value: kz(t.grossSalary) },
      { label: 'Total Líquido', value: kz(t.netSalary) },
      { label: 'Total IRT', value: kz(t.incomeTax) },
      { label: 'Total INSS (colaborador)', value: kz(t.socialSecurity) },
      { label: 'Total Subsídio Alimentação', value: kz(t.mealAllowance) },
      { label: 'Total Subsídio Férias', value: kz(t.vacationAllowance) },
      { label: 'Total Subsídio Natal', value: kz(t.christmasAllowance) },
      { label: 'Total Prémios', value: kz(t.bonuses) },
      { label: 'Total Descontos', value: kz(t.totalDeductions) },
    ],
    sections: [
      {
        title: 'Evolução mensal',
        content: data.rows.length
          ? data.rows
              .map(
                r =>
                  `${r.period}   Bruto: ${kz(r.grossSalary)}   IRT: ${kz(r.incomeTax)}   Líquido: ${kz(r.netSalary)}`,
              )
              .join('\n')
          : 'Sem recibos emitidos neste ano.',
      },
    ],
    companyName: 'INNOVA',
  };
}

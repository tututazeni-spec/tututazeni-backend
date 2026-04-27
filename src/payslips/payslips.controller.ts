// ─── src/payslips/payslips.controller.ts ─────────────────────────────────────
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PayslipsService }     from './payslips.service';
import { PayrollEngineService } from './payroll-engine.service';
import {
  PayslipFilterDto, PayrollRunFilterDto,
  CreatePayslipDto, UpdatePayslipDto,
  CreatePayrollRunDto, ProcessPayrollDto, SimulatePayrollDto,
  CreateEmployeeCompensationDto,
  CreateCountryConfigDto, CreateSalaryComponentDto,
} from './payslips.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Payslips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payslips')
export class PayslipsController {
  constructor(
    private readonly svc: PayslipsService,
    private readonly engine: PayrollEngineService,
  ) {}
 
  // ── Analytics / Dashboard ─────────────────────────────────────────
 
  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'FINANCEIRO')
  @ApiOperation({ summary: 'Dashboard RH — KPIs do período (totais, impostos, custo patronal)' })
  @ApiQuery({ name: 'period', required: false, example: '2026-04' })
  @ApiQuery({ name: 'department', required: false })
  getDashboard(@Query('period') period?: string, @Query('department') department?: string) {
    return this.svc.getDashboard(period, department);
  }
 
  @Get('trend')
  @Roles('ADMIN', 'RH', 'FINANCEIRO')
  @ApiOperation({ summary: 'Tendência mensal de salários e impostos (N meses)' })
  @ApiQuery({ name: 'months', required: false, type: Number })
  getTrend(@Query('months') months?: string) {
    return this.svc.getMonthlyTrend(months ? +months : 12);
  }
 
  // ── Simulation ────────────────────────────────────────────────────
 
  @Post('simulate')
  @ApiOperation({ summary: 'Simular recibo sem persistir — preview IRT, INSS, líquido' })
  simulate(@Body() dto: SimulatePayrollDto) {
    return this.svc.simulate(dto);
  }
 
  // ── My Payslips (colaborador) ──────────────────────────────────────
 
  @Get('my')
  @ApiOperation({ summary: 'Meus recibos + resumo anual' })
  myPayslips(@CurrentUser() user: any) {
    return this.svc.getMyPayslips(user.id);
  }
 
  @Get('my/annual/:year')
  @ApiOperation({ summary: 'Declaração anual de rendimentos do colaborador' })
  myAnnual(@CurrentUser() user: any, @Param('year', ParseIntPipe) year: number) {
    return this.svc.getAnnualStatement(user.id, year);
  }
 
  // ── Payroll Runs ──────────────────────────────────────────────────
 
  @Get('runs')
  @Roles('ADMIN', 'RH', 'FINANCEIRO')
  @ApiOperation({ summary: 'Listar folhas de processamento' })
  getRuns(@Query() filters: PayrollRunFilterDto) {
    return this.svc.getRuns(filters);
  }
 
  @Post('runs')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar folha de processamento para um período' })
  createRun(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: any) {
    return this.svc.createRun(dto, user.id);
  }
 
  @Post('runs/process')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Processar / calcular folha (gera recibos com motor IRT/INSS)' })
  processRun(@Body() dto: ProcessPayrollDto, @CurrentUser() user: any) {
    return this.svc.processRun(dto, user.id);
  }
 
  @Patch('runs/:id/approve')
  @Roles('ADMIN', 'FINANCEIRO')
  @ApiOperation({ summary: 'Aprovar folha calculada' })
  approveRun(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.approveRun(id, user.id);
  }
 
  @Patch('runs/:id/publish')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Publicar folha — emite recibos e notifica colaboradores' })
  publishRun(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.publishRun(id, user.id);
  }
 
  // ── Payslips CRUD ─────────────────────────────────────────────────
 
  @Get()
  @Roles('ADMIN', 'RH', 'FINANCEIRO')
  @ApiOperation({ summary: 'Listar recibos com filtros' })
  findAll(@Query() filters: PayslipFilterDto) {
    return this.svc.findAll(filters);
  }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe completo do recibo (com itens, log de acesso)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.id);
  }
 
  @Get('user/:userId/annual/:year')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Declaração anual de um colaborador (Admin/RH)' })
  getAnnualStatement(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('year', ParseIntPipe) year: number,
  ) {
    return this.svc.getAnnualStatement(userId, year);
  }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar recibo individual (manual)' })
  create(@Body() dto: CreatePayslipDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.id);
  }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar recibo (só em DRAFT/PENDING)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePayslipDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.update(id, dto, user.id);
  }
 
  @Patch(':id/issue')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Emitir recibo individualmente' })
  issue(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.issue(id, user.id);
  }
 
  @Patch(':id/acknowledge')
  @ApiOperation({ summary: 'Colaborador confirma recepção do recibo' })
  acknowledge(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.acknowledge(id, user.id);
  }
 
  // ── Country Config ────────────────────────────────────────────────
 
  @Get('config/countries')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Configurações fiscais por país' })
  getCountryConfigs() {
    return this.svc.getCountryConfigs();
  }
 
  @Post('config/countries')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar configuração fiscal de um país (tabela IRT, INSS, etc.)' })
  createCountryConfig(@Body() dto: CreateCountryConfigDto, @CurrentUser() user: any) {
    return this.svc.createCountryConfig(dto, user.id);
  }
 
  // ── Salary Components ─────────────────────────────────────────────
 
  @Get('config/components')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Componentes salariais configurados' })
  @ApiQuery({ name: 'countryCode', required: false })
  getComponents(@Query('countryCode') countryCode?: string) {
    return this.svc.getSalaryComponents(countryCode);
  }
 
  @Post('config/components')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar componente salarial (rendimento ou desconto)' })
  createComponent(@Body() dto: CreateSalaryComponentDto) {
    return this.svc.createSalaryComponent(dto);
  }
 
  // ── Employee Compensation ─────────────────────────────────────────
 
  @Get('compensation/:userId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Compensação activa de um colaborador' })
  getCompensation(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getEmployeeCompensation(userId);
  }
 
  @Post('compensation')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Definir compensação de um colaborador (salário base + componentes)' })
  createCompensation(@Body() dto: CreateEmployeeCompensationDto, @CurrentUser() user: any) {
    return this.svc.createEmployeeCompensation(dto, user.id);
  }
}
 
 
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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';

import { PayslipsService } from './payslips.service';
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
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Payslips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly svc: PayslipsService) {}

  // ── Colaborador ────────────────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Os meus recibos (colaborador autenticado)' })
  myPayslips(@CurrentUser() user: any, @Query() filters: PayslipFilterDto) {
    return this.svc.getMyPayslips(user.id, filters);
  }

  @Get('my/annual-summary')
  @ApiOperation({ summary: 'Resumo anual dos meus recibos' })
  @ApiQuery({ name: 'year', example: '2026' })
  myAnnualSummary(@CurrentUser() user: any, @Query('year') year: string) {
    return this.svc.annualSummary(user.id, year ?? new Date().getFullYear().toString());
  }

  @Get('my/compare')
  @ApiOperation({ summary: 'Comparar dois meses (colaborador)' })
  @ApiQuery({ name: 'periodA', example: '2026-03' })
  @ApiQuery({ name: 'periodB', example: '2026-04' })
  myCompare(
    @CurrentUser() user: any,
    @Query('periodA') periodA: string,
    @Query('periodB') periodB: string,
  ) {
    return this.svc.compare(user.id, periodA, periodB);
  }

  @Get('my/:id')
  @ApiOperation({ summary: 'Detalhe do meu recibo' })
  async myPayslip(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const payslip = await this.svc.findOne(id, user.id, user.role);
    await this.svc.logAccess(id, user.id, 'VIEW', req.ip);
    return payslip;
  }

  @Patch('my/:id/acknowledge')
  @ApiOperation({ summary: 'Confirmar recepção do recibo' })
  @HttpCode(HttpStatus.OK)
  acknowledge(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.acknowledge(id, user.id);
  }

  @Post('my/:id/dispute')
  @ApiOperation({ summary: 'Abrir disputa sobre um recibo' })
  createDispute(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.svc.createDispute(id, user.id, dto);
  }

  // ── Simulação (aberta a todos) ─────────────────────────────────────────────

  @Post('simulate')
  @ApiOperation({ summary: 'Simular cálculo salarial (IRT, INSS, líquido)' })
  @HttpCode(HttpStatus.OK)
  simulate(@Body() dto: SimulatePayslipDto): any {
    return this.svc.simulate(dto);
  }

  // ── Admin / RH ─────────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar todos os recibos' })
  findAll(@Query() filters: PayslipFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard RH — métricas de compliance e financeiras' })
  @ApiQuery({ name: 'period', example: '2026-04', required: false })
  hrDashboard(@Query('period') period?: string) {
    return this.svc.hrDashboard(period);
  }

  @Get(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Detalhe de qualquer recibo (Admin/RH)' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    const payslip = await this.svc.findOne(id);
    await this.svc.logAccess(id, user.id, 'ADMIN_VIEW', req.ip);
    return payslip;
  }

  @Get(':id/access-logs')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Logs de acesso a um recibo' })
  accessLogs(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAccessLogs(id);
  }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar recibo individual' })
  create(@Body() dto: CreatePayslipDto) {
    return this.svc.create(dto);
  }

  @Post('bulk-create')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gerar recibos em massa para um período' })
  bulkCreate(@Body() dto: BulkCreatePayslipDto) {
    return this.svc.bulkCreate(dto);
  }

  @Patch(':id/issue')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Emitir recibo (publica e notifica colaborador)' })
  @HttpCode(HttpStatus.OK)
  issue(@Param('id', ParseIntPipe) id: number) {
    return this.svc.issue(id);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar recibo (volta a DRAFT)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePayslipDto) {
    return this.svc.update(id, dto);
  }
}

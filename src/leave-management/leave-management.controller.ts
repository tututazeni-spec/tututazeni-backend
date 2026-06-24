// ─── src/leave-management/leave-management.controller.ts ─────────────────────
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeaveManagementService } from './leave-management.service';
import {
  LeaveFilterDto,
  CalendarFilterDto,
  CreateLeaveTypeDto,
  UpdateLeaveTypeDto,
  CreateLeaveManagementRequestDto,
  ApproveLeaveDto,
  BulkApproveDto,
  UpdateBalanceDto,
  AccrueBalanceDto,
  CreateLeavePolicyDto,
} from './leave-management.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Leave Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveManagementController {
  constructor(private readonly svc: LeaveManagementService) {}

  // ── Leave Types ────────────────────────────────────────────────────

  @Get('types')
  @ApiOperation({ summary: 'Listar tipos de licença configurados' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  getTypes(@Query('activeOnly') activeOnly?: string) {
    return this.svc.getLeaveTypes(activeOnly !== 'false');
  }

  @Post('types')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar tipo de licença (configurável)' })
  createType(@Body() dto: CreateLeaveTypeDto) {
    return this.svc.createLeaveType(dto);
  }

  @Patch('types/:code')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar tipo de licença' })
  updateType(@Param('code') code: string, @Body() dto: UpdateLeaveTypeDto) {
    return this.svc.updateLeaveType(code, dto);
  }

  // ── Policies ──────────────────────────────────────────────────────

  @Get('policies')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Listar políticas de licença' })
  getPolicies() {
    return this.svc.getPolicies();
  }

  @Post('policies')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar política de licença (regras, blackout, SLA)' })
  createPolicy(@Body() dto: CreateLeavePolicyDto) {
    return this.svc.createPolicy(dto);
  }

  // ── Dashboard & Analytics ─────────────────────────────────────────

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard RH — KPIs, distribuição por tipo e tendência mensal' })
  @ApiQuery({ name: 'department', required: false })
  getDashboard(@Query('department') department?: string) {
    return this.svc.getDashboard(department);
  }

  @Get('analytics/absenteeism')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatório de absenteísmo por período' })
  @ApiQuery({ name: 'from' })
  @ApiQuery({ name: 'to' })
  @ApiQuery({ name: 'department', required: false })
  getAbsenteeism(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('department') department?: string,
  ) {
    return this.svc.getAbsenteeismReport(from, to, department);
  }

  // ── Calendar ──────────────────────────────────────────────────────

  @Get('calendar')
  @ApiOperation({ summary: 'Calendário de ausências com heatmap' })
  getCalendar(@Query() filters: CalendarFilterDto) {
    return this.svc.getCalendar(filters);
  }

  @Get('conflict-check')
  @ApiOperation({ summary: 'Verificar conflitos antes de submeter pedido' })
  @ApiQuery({ name: 'userId', type: Number })
  @ApiQuery({ name: 'startDate' })
  @ApiQuery({ name: 'endDate' })
  checkConflicts(
    @Query('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.svc.getConflictCheck(+userId, startDate, endDate);
  }

  // ── Pending Approvals ─────────────────────────────────────────────

  @Get('pending-approvals')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Pedidos pendentes de aprovação do utilizador actual' })
  getPendingApprovals(@CurrentUser() user: any) {
    return this.svc.getPendingApprovals(user.id);
  }

  // ── My Requests & Balance ─────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Meus pedidos de licença' })
  myRequests(@CurrentUser() user: any, @Query() filters: LeaveFilterDto) {
    return this.svc.findAll({ ...filters, userId: user.id });
  }

  @Get('my/balance')
  @ApiOperation({ summary: 'Meu saldo de dias por tipo de licença' })
  myBalance(@CurrentUser() user: any) {
    return this.svc.getBalance(user.id);
  }

  @Get('my/balance/history')
  @ApiOperation({ summary: 'Histórico de movimentos do meu saldo' })
  myBalanceHistory(@CurrentUser() user: any, @Query('leaveTypeCode') code?: string) {
    return this.svc.getBalanceHistory(user.id, code);
  }

  // ── Admin — All Requests ──────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar todos os pedidos com filtros' })
  findAll(@Query() filters: LeaveFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um pedido' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Submeter pedido de licença (suporta rascunho, meios dias, horas)' })
  create(@Body() dto: CreateLeaveManagementRequestDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Aprovar, rejeitar, escalar ou delegar pedido' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: ApproveLeaveDto,
  ) {
    return this.svc.processApproval(id, user.id, dto);
  }

  @Post('bulk-approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Aprovação em lote' })
  bulkApprove(@Body() dto: BulkApproveDto, @CurrentUser() user: any) {
    return this.svc.bulkApprove(dto, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar pedido (devolve saldo se aprovado)' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.cancel(id, user.id);
  }

  // ── Balance Management ────────────────────────────────────────────

  @Get('balance/:userId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Saldo de licenças de um colaborador' })
  getBalance(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getBalance(userId);
  }

  @Patch('balance/:userId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar saldo de um tipo de licença' })
  updateBalance(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateBalanceDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateBalance(userId, dto, user.id);
  }

  @Post('balance/accrue')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary: 'Acumular saldo para vários colaboradores (processamento mensal/anual)',
  })
  accrueBalance(@Body() dto: AccrueBalanceDto, @CurrentUser() user: any) {
    return this.svc.accrueBalance(dto, user.id);
  }

  @Post('balance/initialize/:userId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Inicializar saldos para novo colaborador' })
  initBalance(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.initializeUserBalances(userId);
  }

  @Post('balance/carry-over')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Processar carry-over de fim de ano' })
  @ApiQuery({ name: 'year', type: Number })
  processCarryOver(@Query('year') year: string) {
    return this.svc.processCarryOver(+year || new Date().getFullYear());
  }
}

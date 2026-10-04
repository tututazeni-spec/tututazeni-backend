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
  ParseEnumPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeaveManagementService } from './leave-management.service';
import { LeaveOverviewService } from './leave-overview.service';
import { LeaveLicensesService } from './leave-licenses.service';
import { LeaveAbsenceCalendarService } from './leave-absence-calendar.service';
import { LeaveApprovalsService } from './leave-approvals.service';
import { LeavePlanningService } from './leave-planning.service';
import { LeaveReportsService } from './leave-reports.service';
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
  OverviewFilterDto,
  VacationFilterDto,
  DurationPreviewDto,
  LicenseFilterDto,
  ApprovalRouteDto,
  AbsenceCalendarFilterDto,
  ApprovalListFilterDto,
  ReassignApprovalDto,
  PlanningFilterDto,
  LeaveReportFilterDto,
  LeaveReportKind,
} from './leave-management.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { assertCanAccess } from '../common/authz/ownership';

@ApiTags('Leave Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveManagementController {
  constructor(
    private readonly svc: LeaveManagementService,
    private readonly overview: LeaveOverviewService,
    private readonly licenses: LeaveLicensesService,
    private readonly absenceCalendar: LeaveAbsenceCalendarService,
    private readonly approvals: LeaveApprovalsService,
    private readonly planning: LeavePlanningService,
    private readonly reports: LeaveReportsService,
  ) {}

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

  @Get('overview')
  @ApiOperation({
    summary: 'Visão Geral — cards e gráficos de férias/ausências, âmbito conforme o perfil',
  })
  getOverview(@Query() filters: OverviewFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.overview.getOverview(filters, user);
  }

  @Get('vacations')
  @ApiOperation({ summary: 'Aba Férias — saldos e plano anual por colaborador' })
  getVacations(@Query() filters: VacationFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.overview.getVacations(filters, user);
  }

  @Get('duration-preview')
  @ApiOperation({ summary: 'Duração, feriados, saldo e sobreposição antes de submeter' })
  previewDuration(@Query() dto: DurationPreviewDto, @CurrentUser() user: CurrentUserData) {
    return this.overview.previewDuration(dto, user);
  }

  @Get('licenses')
  @ApiOperation({
    summary:
      'Aba Licenças — tabela com privacidade por perfil (motivo/comprovativos sensíveis ocultos)',
  })
  getLicenses(@Query() filters: LicenseFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.licenses.list(filters, user);
  }

  @Get('approval-route')
  @ApiOperation({ summary: 'Encaminhamento de aprovação previsto antes de submeter' })
  getApprovalRoute(@Query() dto: ApprovalRouteDto, @CurrentUser() user: CurrentUserData) {
    return this.licenses.approvalRoute(dto, user);
  }

  @Get('absence-calendar')
  @ApiOperation({
    summary: 'Calendário de ausências (dia/semana/mês/ano) com cobertura e sobreposições',
  })
  getAbsenceCalendar(
    @Query() filters: AbsenceCalendarFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.absenceCalendar.getCalendar(filters, user);
  }

  @Get('absence-calendar/export')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.DIRECTOR, Role.LIDER)
  @ApiOperation({ summary: 'Exportar o calendário de ausências (CSV)' })
  exportAbsenceCalendar(
    @Query() filters: AbsenceCalendarFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.absenceCalendar.exportCsv(filters, user);
  }

  // ── §7 Aprovações ─────────────────────────────────────────────────

  @Get('approvals')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Etapas de aprovação (fila e histórico) com prazo, espera e reatribuições',
  })
  listApprovals(@Query() filters: ApprovalListFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.approvals.list(filters, user);
  }

  @Get('approvals/candidates')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Utilizadores que podem receber uma reatribuição/delegação' })
  approvalCandidates(
    @Query('search') search: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.approvals.candidates(search, user);
  }

  @Post('approvals/:approvalId/reassign')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Reatribuir uma etapa de aprovação (fica no histórico)' })
  reassignApproval(
    @Param('approvalId', ParseIntPipe) approvalId: number,
    @Body() dto: ReassignApprovalDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.approvals.reassign(approvalId, dto, user);
  }

  // ── §8 Planeamento de Equipas ─────────────────────────────────────

  @Get('planning')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.DIRECTOR, Role.LIDER)
  @ApiOperation({
    summary: 'Planeamento de equipas — disponibilidade, cobertura mínima, conflitos e alertas',
  })
  getPlanning(@Query() filters: PlanningFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.planning.getPlanning(filters, user);
  }

  // ── §9 Relatórios ─────────────────────────────────────────────────

  @Get('reports')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Catálogo de relatórios do módulo Leave' })
  listReports() {
    return this.reports.catalog();
  }

  @Get('reports/:kind/export')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Exportar um relatório (CSV)' })
  exportReport(
    @Param('kind', new ParseEnumPipe(LeaveReportKind)) kind: LeaveReportKind,
    @Query() filters: LeaveReportFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.reports.exportCsv(kind, filters, user);
  }

  @Get('reports/:kind')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Executar um relatório' })
  runReport(
    @Param('kind', new ParseEnumPipe(LeaveReportKind)) kind: LeaveReportKind,
    @Query() filters: LeaveReportFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.reports.run(kind, filters, user);
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
    @CurrentUser() user: CurrentUserData,
  ) {
    // A10-23: sem isto, qualquer autenticado podia sondar se um colega tinha
    // férias marcadas num período arbitrário.
    assertCanAccess({}, +userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);
    return this.svc.getConflictCheck(+userId, startDate, endDate);
  }

  // ── Pending Approvals ─────────────────────────────────────────────

  @Get('pending-approvals')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Pedidos pendentes de aprovação do utilizador actual' })
  getPendingApprovals(@CurrentUser() user: CurrentUserData) {
    return this.svc.getPendingApprovals(user.id, user);
  }

  // ── My Requests & Balance ─────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Meus pedidos de licença' })
  myRequests(@CurrentUser() user: CurrentUserData, @Query() filters: LeaveFilterDto) {
    return this.svc.findAll({ ...filters, userId: user.id }, user);
  }

  @Get('my/balance')
  @ApiOperation({ summary: 'Meu saldo de dias por tipo de licença' })
  myBalance(@CurrentUser() user: CurrentUserData) {
    return this.svc.getBalance(user.id);
  }

  @Get('my/balance/history')
  @ApiOperation({ summary: 'Histórico de movimentos do meu saldo' })
  myBalanceHistory(@CurrentUser() user: CurrentUserData, @Query('leaveTypeCode') code?: string) {
    return this.svc.getBalanceHistory(user.id, code);
  }

  // ── Admin — All Requests ──────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar todos os pedidos com filtros' })
  findAll(@Query() filters: LeaveFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.findAll(filters, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um pedido' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: 'Submeter pedido de licença (suporta rascunho, meios dias, horas)' })
  create(@Body() dto: CreateLeaveManagementRequestDto, @CurrentUser() user: CurrentUserData) {
    // Só o próprio ou ADMIN/RH/GESTOR podem submeter em nome de `dto.userId`.
    assertCanAccess({}, dto.userId, user, [Role.ADMIN, Role.RH, Role.GESTOR]);
    return this.svc.create(dto, user.id);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Aprovar, rejeitar, escalar ou delegar pedido' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ApproveLeaveDto,
  ) {
    return this.svc.processApproval(id, user.id, dto);
  }

  @Post('bulk-approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Aprovação em lote' })
  bulkApprove(@Body() dto: BulkApproveDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.bulkApprove(dto, user.id);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar pedido (devolve saldo se aprovado)' })
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
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
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.updateBalance(userId, dto, user.id);
  }

  @Post('balance/accrue')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary: 'Acumular saldo para vários colaboradores (processamento mensal/anual)',
  })
  accrueBalance(@Body() dto: AccrueBalanceDto, @CurrentUser() user: CurrentUserData) {
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

// ─── src/attendance/attendance.controller.ts ─────────────────────────────────
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import {
  AttendanceFilterDto, LeaveFilterDto,
  CreateAttendanceDto, UpdateAttendanceDto,
  ClockInDto, ClockOutDto,
  CreateLeaveRequestDto, ReviewLeaveDto,
  CreateWorkScheduleDto, AssignScheduleDto,
  CreateOvertimeDto, ReviewOvertimeDto,
  CreateJustificationDto, ReviewJustificationDto,
  GenerateQrDto, ValidateQrDto,
} from './attendance.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  // ══════════════════════════════════════════════════════════════════
  // DASHBOARD & ANALYTICS
  // ══════════════════════════════════════════════════════════════════

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard operacional — presenças do dia' })
  @ApiQuery({ name: 'department', required: false })
  getDashboard(@Query('department') department?: string) {
    return this.svc.getDashboard(department);
  }

  @Get('report/monthly')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Relatório mensal de presenças' })
  @ApiQuery({ name: 'year', type: Number })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'department', required: false })
  getMonthlyReport(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('department') department?: string,
  ) {
    return this.svc.getMonthlyReport(+year, +month, department);
  }

  @Get('report/absenteeism')
  @Roles('ADMIN', 'RH')
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

  @Get('kpi-trend')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Tendência de KPIs (últimos N dias)' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getKpiTrend(
    @Query('userId') userId?: string,
    @Query('days') days?: string,
  ) {
    return this.svc.getKpiTrend(userId ? +userId : undefined, days ? +days : 30);
  }

  // ══════════════════════════════════════════════════════════════════
  // CLOCK-IN / CLOCK-OUT
  // ══════════════════════════════════════════════════════════════════

  @Post('clock-in')
  @ApiOperation({ summary: 'Check-in (entrada) — suporta QR, GPS, selfie, token' })
  clockIn(@CurrentUser() user: any, @Body() dto: ClockInDto) {
    return this.svc.clockIn(user.id, dto);
  }

  @Post('clock-out')
  @ApiOperation({ summary: 'Check-out (saída) com cálculo automático de horas' })
  clockOut(@CurrentUser() user: any, @Body() dto: ClockOutDto) {
    return this.svc.clockOut(user.id, dto);
  }

  // ══════════════════════════════════════════════════════════════════
  // MY ATTENDANCE
  // ══════════════════════════════════════════════════════════════════

  @Get('my')
  @ApiOperation({ summary: 'Minhas presenças com resumo' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  myAttendance(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findByUser(user.id, from, to);
  }

  @Get('my/leave-balance')
  @ApiOperation({ summary: 'Saldo de licenças e férias' })
  myLeaveBalance(@CurrentUser() user: any) {
    return this.svc.getLeaveBalance(user.id);
  }

  @Get('my/overtime')
  @ApiOperation({ summary: 'Banco de horas (saldo de horas extras)' })
  myOvertimeBalance(@CurrentUser() user: any) {
    return this.svc.getOvertimeBalance(user.id);
  }

  // ══════════════════════════════════════════════════════════════════
  // ADMIN — RECORDS
  // ══════════════════════════════════════════════════════════════════

  @Get()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar presenças com filtros avançados' })
  findAll(@Query() filters: AttendanceFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get(':id')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Detalhe de registo de presença' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get('user/:userId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Presenças de um colaborador específico' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  byUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.findByUser(userId, from, to);
  }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Registar presença manualmente (RH/Admin)' })
  create(@Body() dto: CreateAttendanceDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar registo (cria log de ajuste automático)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover registo' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ══════════════════════════════════════════════════════════════════
  // LEAVES / AUSÊNCIAS
  // ══════════════════════════════════════════════════════════════════

  @Get('leaves')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar pedidos de licença' })
  getLeaves(@Query() filters: LeaveFilterDto) {
    return this.svc.getLeaves(filters);
  }

  @Get('leaves/pending')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Licenças pendentes de aprovação' })
  getPendingLeaves() {
    return this.svc.getLeaves({ status: 'PENDING' as any });
  }

  @Post('leaves')
  @ApiOperation({ summary: 'Solicitar licença ou férias' })
  createLeave(@CurrentUser() user: any, @Body() dto: CreateLeaveRequestDto) {
    return this.svc.createLeaveRequest(user.id, dto);
  }

  @Patch('leaves/:id/review')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Aprovar ou rejeitar pedido de licença' })
  reviewLeave(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewLeaveDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.reviewLeave(id, dto, user.id);
  }

  @Get('leaves/balance/:userId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Saldo de licenças de um colaborador' })
  getLeaveBalance(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getLeaveBalance(userId);
  }

  // ══════════════════════════════════════════════════════════════════
  // WORK SCHEDULES & SHIFTS
  // ══════════════════════════════════════════════════════════════════

  @Get('schedules')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar jornadas/escalas configuradas' })
  getSchedules() {
    return this.svc.getWorkSchedules();
  }

  @Post('schedules')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar jornada de trabalho / escala' })
  createSchedule(@Body() dto: CreateWorkScheduleDto) {
    return this.svc.createWorkSchedule(dto);
  }

  @Post('schedules/assign')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atribuir jornada a um colaborador' })
  assignSchedule(@Body() dto: AssignScheduleDto) {
    return this.svc.assignSchedule(dto);
  }

  // ══════════════════════════════════════════════════════════════════
  // OVERTIME / BANCO DE HORAS
  // ══════════════════════════════════════════════════════════════════

  @Post('overtime')
  @ApiOperation({ summary: 'Registar hora extra' })
  createOvertime(@CurrentUser() user: any, @Body() dto: CreateOvertimeDto) {
    return this.svc.createOvertime(user.id, dto);
  }

  @Patch('overtime/:id/review')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Aprovar/rejeitar hora extra' })
  reviewOvertime(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewOvertimeDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.reviewOvertime(id, dto, user.id);
  }

  // ══════════════════════════════════════════════════════════════════
  // JUSTIFICATIONS
  // ══════════════════════════════════════════════════════════════════

  @Get('justifications/pending')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Justificativas pendentes de aprovação' })
  getPendingJustifications(@CurrentUser() user: any) {
    return this.svc.getPendingJustifications(user.id);
  }

  @Post('justifications')
  @ApiOperation({ summary: 'Enviar justificativa de ausência' })
  createJustification(@CurrentUser() user: any, @Body() dto: CreateJustificationDto) {
    return this.svc.createJustification(user.id, dto);
  }

  @Patch('justifications/:id/review')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Aprovar ou rejeitar justificativa' })
  reviewJustification(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewJustificationDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.reviewJustification(id, dto, user.id);
  }

  // ══════════════════════════════════════════════════════════════════
  // QR CODE
  // ══════════════════════════════════════════════════════════════════

  @Post('qr/generate')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Gerar QR code de check-in (dinâmico com TTL)' })
  generateQr(@CurrentUser() user: any, @Body() dto: GenerateQrDto) {
    return this.svc.generateQrCode(user.id, dto);
  }

  @Post('qr/validate')
  @ApiOperation({ summary: 'Validar QR code e efectuar check-in' })
  validateQr(@CurrentUser() user: any, @Body() dto: ValidateQrDto) {
    return this.svc.clockIn(user.id, {
      method: 'QR_DYNAMIC' as any,
      qrToken: dto.token,
      location: dto.location,
      deviceInfo: dto.deviceInfo,
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // EVENTS / LMS CHECK-IN
  // ══════════════════════════════════════════════════════════════════

  @Post('events/:eventId/check-in')
  @ApiOperation({ summary: 'Check-in em evento presencial/virtual' })
  checkInEvent(
    @CurrentUser() user: any,
    @Param('eventId', ParseIntPipe) eventId: number,
    @Body() dto: ClockInDto,
  ) {
    return this.svc.checkInToEvent(user.id, eventId, dto);
  }

  @Post('sessions/:sessionId/check-in')
  @ApiOperation({ summary: 'Check-in em sessão de webinar/LMS' })
  checkInSession(
    @CurrentUser() user: any,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: ClockInDto,
  ) {
    return this.svc.checkInToSession(user.id, sessionId, dto);
  }

  @Get('events/:eventId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Lista de presenças de um evento' })
  getEventAttendance(@Param('eventId', ParseIntPipe) eventId: number) {
    return this.svc.getEventAttendance(eventId);
  }
}
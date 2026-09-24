// src/events/events.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import {
  CreateEventDto,
  UpdateEventDto,
  EventFilterDto,
  UpdateParticipantStatusDto,
  CheckInDto,
  CheckOutDto,
  ManualCheckInDto,
  ManualCheckOutDto,
  EventCheckinFilterDto,
  SubmitFeedbackDto,
  EventCalendarFilterDto,
  EventParticipantFilterDto,
  AddParticipantsDto,
  ParticipantActionDto,
  CreateEventSessionDto,
  UpdateEventSessionDto,
  EventSessionFilterDto,
  UpsertEventLogisticsDto,
  CreateEventSpeakerDto,
  UpdateEventSpeakerDto,
  EventSpeakerFilterDto,
  CreateEventCommunicationDto,
  EventCommunicationFilterDto,
  EventEvaluationFilterDto,
  EventReportFilterDto,
} from './events.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly svc: EventsService) {}

  // ── Catálogo ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar eventos (com filtros de tipo, modalidade, estado, busca)' })
  findAll(@Query() filters: EventFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Próximos eventos publicados (para homepage/widget)' })
  upcoming() {
    return this.svc.getUpcoming();
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Dashboard de eventos (Visão Geral) — KPIs, breakdowns e próximos eventos',
  })
  stats() {
    return this.svc.getStats();
  }

  @Get('my')
  @ApiOperation({ summary: 'Os meus eventos (inscrições futuras e passadas)' })
  myEvents(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyEvents(user.id);
  }

  @Get('organizer/dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard do organizador (métricas, NPS, ocupação)' })
  organizerDashboard(@CurrentUser() user: CurrentUserData) {
    return this.svc.getOrganizerDashboard(user.id);
  }

  @Get('calendar')
  @ApiOperation({
    summary: 'Calendário central de eventos (intervalo de datas + filtros)',
  })
  calendar(@Query() filters: EventCalendarFilterDto) {
    return this.svc.getCalendar(filters);
  }

  @Get('sessions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Todas as sessões/actividades de todos os eventos (aba Programação)' })
  listAllSessions(@Query() filters: EventSessionFilterDto) {
    return this.svc.listAllSessions(filters);
  }

  @Get('communications')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Histórico de comunicações de todos os eventos (aba Comunicação)' })
  listAllCommunications(@Query() filters: EventCommunicationFilterDto) {
    return this.svc.listAllCommunications(filters);
  }

  @Get('checkins')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Check-ins/presenças de todos os eventos (aba Check-in & Presença)' })
  listCheckins(@Query() filters: EventCheckinFilterDto) {
    return this.svc.listCheckins(filters);
  }

  @Get('checkins/export')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="checkins.csv"')
  @ApiOperation({ summary: 'Exportar check-ins/presenças de todos os eventos como CSV' })
  exportCheckins(@Query() filters: EventCheckinFilterDto) {
    return this.svc.exportCheckinsCsv(filters);
  }

  @Get('evaluations')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Avaliações de todos os eventos (aba Avaliação)' })
  listEvaluations(@Query() filters: EventEvaluationFilterDto) {
    return this.svc.listEvaluations(filters);
  }

  @Get('evaluations/export')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="avaliacoes.csv"')
  @ApiOperation({ summary: 'Exportar avaliações de todos os eventos como CSV' })
  exportEvaluations(@Query() filters: EventEvaluationFilterDto) {
    return this.svc.exportEvaluationsCsv(filters);
  }

  @Get('reports/overview')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary:
      'Relatórios (aba Relatórios): execução, participantes, check-ins, custos, satisfação, NPS',
  })
  reports(@Query() filters: EventReportFilterDto) {
    return this.svc.getReports(filters);
  }

  @Get('reports/export')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="relatorio-eventos.csv"')
  @ApiOperation({ summary: 'Exportar relatório de eventos filtrado como CSV' })
  exportReports(@Query() filters: EventReportFilterDto) {
    return this.svc.exportReportsCsv(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do evento (participantes, feedback, NPS)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  // ── Gestão ────────────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar evento (fica como DRAFT)' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateEventDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar evento' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEventDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Publicar evento (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Patch(':id/cancel')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Cancelar evento (notifica participantes)' })
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cancel(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar evento (apenas DRAFT)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Inscrição ─────────────────────────────────────────────────────────────

  @Post(':id/join')
  @ApiOperation({ summary: 'Inscrever-se (entra em lista de espera se lotado)' })
  join(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.join(id, user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Cancelar inscrição (promove próximo da lista de espera)' })
  @HttpCode(HttpStatus.OK)
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.leave(id, user.id);
  }

  @Patch(':id/participants/:userId/status')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Atualizar status de participante (CONFIRMED, PRESENT, NO_SHOW…)' })
  participantStatus(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateParticipantStatusDto,
  ) {
    return this.svc.updateParticipantStatus(eventId, userId, dto);
  }

  // ── Gestão de participantes (aba Participantes, docs/events.md #4) ─────────

  @Get(':id/participants')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Listar/filtrar inscrições de um evento (departamento, unidade, estado, nome)',
  })
  listParticipants(
    @Param('id', ParseIntPipe) eventId: number,
    @Query() filters: EventParticipantFilterDto,
  ) {
    return this.svc.listParticipants(eventId, filters);
  }

  @Get(':id/participants/export')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="participantes.csv"')
  @ApiOperation({ summary: 'Exportar lista de participantes do evento como CSV' })
  exportParticipants(
    @Param('id', ParseIntPipe) eventId: number,
    @Query() filters: EventParticipantFilterDto,
  ) {
    return this.svc.exportParticipantsCsv(eventId, filters);
  }

  @Post(':id/participants')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Adicionar/importar participantes (RH/organizador, sem fluxo de aprovação)',
  })
  addParticipants(@Param('id', ParseIntPipe) eventId: number, @Body() dto: AddParticipantsDto) {
    return this.svc.addParticipants(eventId, dto.userIds);
  }

  @Patch(':id/participants/:userId/approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Aprovar inscrição pendente ou promover da lista de espera' })
  @HttpCode(HttpStatus.OK)
  approveParticipant(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ParticipantActionDto,
  ) {
    return this.svc.approveParticipant(eventId, userId, dto);
  }

  @Patch(':id/participants/:userId/reject')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Rejeitar inscrição pendente' })
  @HttpCode(HttpStatus.OK)
  rejectParticipant(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ParticipantActionDto,
  ) {
    return this.svc.rejectParticipant(eventId, userId, dto);
  }

  @Patch(':id/participants/:userId/cancel')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Cancelar inscrição em nome do participante (promove lista de espera)' })
  @HttpCode(HttpStatus.OK)
  cancelParticipant(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ParticipantActionDto,
  ) {
    return this.svc.cancelParticipant(eventId, userId, dto);
  }

  // ── Check-in ──────────────────────────────────────────────────────────────

  @Post('checkin')
  @ApiOperation({ summary: 'Fazer check-in num evento (presencial ou virtual)' })
  @HttpCode(HttpStatus.OK)
  checkIn(@CurrentUser() user: CurrentUserData, @Body() dto: CheckInDto) {
    return this.svc.checkIn(user.id, dto);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Fazer check-out de um evento' })
  @HttpCode(HttpStatus.OK)
  checkOut(@CurrentUser() user: CurrentUserData, @Body() dto: CheckOutDto) {
    return this.svc.checkOut(user.id, dto);
  }

  @Patch(':id/participants/:userId/checkin')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Registar check-in manual de um participante (aba Check-in & Presença)',
  })
  @HttpCode(HttpStatus.OK)
  manualCheckIn(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ManualCheckInDto,
  ) {
    return this.svc.manualCheckIn(eventId, userId, dto);
  }

  @Patch(':id/participants/:userId/checkout')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar check-out manual de um participante' })
  @HttpCode(HttpStatus.OK)
  manualCheckOut(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ManualCheckOutDto,
  ) {
    return this.svc.manualCheckOut(eventId, userId, dto);
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Submeter feedback e NPS do evento (emite certificado se elegível)' })
  feedback(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.svc.submitFeedback(id, user.id, dto);
  }

  // ── Programação (aba, docs/events.md #5) ────────────────────────────────

  @Post(':id/sessions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar sessão/actividade do evento' })
  createSession(@Param('id', ParseIntPipe) eventId: number, @Body() dto: CreateEventSessionDto) {
    return this.svc.createSession(eventId, dto);
  }

  @Put(':id/sessions/:sessionId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar sessão/actividade do evento' })
  updateSession(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: UpdateEventSessionDto,
  ) {
    return this.svc.updateSession(eventId, sessionId, dto);
  }

  @Delete(':id/sessions/:sessionId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Eliminar sessão/actividade do evento' })
  deleteSession(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.svc.deleteSession(eventId, sessionId);
  }

  // ── Presença por sessão (docs/events.md #9, eventos com Programação) ──────

  @Get(':id/sessions/:sessionId/attendance')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar presença por sessão (participantes confirmados/presentes)' })
  getSessionAttendance(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.svc.getSessionAttendance(eventId, sessionId);
  }

  @Patch(':id/sessions/:sessionId/attendance/:userId/checkin')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar check-in de um participante numa sessão' })
  @HttpCode(HttpStatus.OK)
  sessionCheckIn(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ManualCheckInDto,
  ) {
    return this.svc.sessionCheckIn(eventId, sessionId, userId, dto);
  }

  @Patch(':id/sessions/:sessionId/attendance/:userId/checkout')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar check-out de um participante numa sessão' })
  @HttpCode(HttpStatus.OK)
  sessionCheckOut(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ManualCheckOutDto,
  ) {
    return this.svc.sessionCheckOut(eventId, sessionId, userId, dto);
  }

  // ── Locais & Logística (aba, docs/events.md #6) ─────────────────────────

  @Get(':id/logistics')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Consultar recursos/logística do evento (null se ainda não definido)' })
  getLogistics(@Param('id', ParseIntPipe) eventId: number) {
    return this.svc.getLogistics(eventId);
  }

  @Put(':id/logistics')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar/actualizar recursos e logística do evento (upsert)' })
  upsertLogistics(
    @Param('id', ParseIntPipe) eventId: number,
    @Body() dto: UpsertEventLogisticsDto,
  ) {
    return this.svc.upsertLogistics(eventId, dto);
  }

  // ── Oradores & Convidados (aba, docs/events.md #7) ──────────────────────

  @Get(':id/speakers')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar oradores/convidados do evento' })
  listSpeakers(
    @Param('id', ParseIntPipe) eventId: number,
    @Query() filters: EventSpeakerFilterDto,
  ) {
    return this.svc.listSpeakers(eventId, filters);
  }

  @Post(':id/speakers')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar orador/convidado/moderador ao evento' })
  createSpeaker(@Param('id', ParseIntPipe) eventId: number, @Body() dto: CreateEventSpeakerDto) {
    return this.svc.createSpeaker(eventId, dto);
  }

  @Put(':id/speakers/:speakerId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar orador/convidado do evento' })
  updateSpeaker(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('speakerId', ParseIntPipe) speakerId: number,
    @Body() dto: UpdateEventSpeakerDto,
  ) {
    return this.svc.updateSpeaker(eventId, speakerId, dto);
  }

  @Delete(':id/speakers/:speakerId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Remover orador/convidado do evento' })
  deleteSpeaker(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('speakerId', ParseIntPipe) speakerId: number,
  ) {
    return this.svc.deleteSpeaker(eventId, speakerId);
  }

  // ── Comunicação (aba, docs/events.md #8) ────────────────────────────────

  @Post(':id/communications')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary:
      'Enviar comunicação a participantes do evento (INNOVA/e-mail/SMS/WhatsApp, conforme integrações)',
  })
  createCommunication(
    @Param('id', ParseIntPipe) eventId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateEventCommunicationDto,
  ) {
    return this.svc.createCommunication(eventId, user.id, dto);
  }
}

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
  SubmitFeedbackDto,
  EventCalendarFilterDto,
  EventParticipantFilterDto,
  AddParticipantsDto,
  ParticipantActionDto,
  CreateEventSessionDto,
  UpdateEventSessionDto,
  EventSessionFilterDto,
  UpsertEventLogisticsDto,
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
  @ApiOperation({ summary: 'Listar/filtrar inscrições de um evento (departamento, unidade, estado, nome)' })
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
  @ApiOperation({ summary: 'Adicionar/importar participantes (RH/organizador, sem fluxo de aprovação)' })
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
  upsertLogistics(@Param('id', ParseIntPipe) eventId: number, @Body() dto: UpsertEventLogisticsDto) {
    return this.svc.upsertLogistics(eventId, dto);
  }
}

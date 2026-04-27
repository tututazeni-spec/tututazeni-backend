// src/events/events.controller.ts
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService }   from './events.service';
import {
  CreateEventDto, UpdateEventDto, EventFilterDto,
  UpdateParticipantStatusDto, CheckInDto, SubmitFeedbackDto,
} from './events.dto';
import { JwtAuthGuard }    from '../common/guards/jwt-auth.guard';
import { RolesGuard }      from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly svc: EventsService) {}

  // ── Catálogo ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar eventos (com filtros de tipo, modalidade, estado, busca)' })
  findAll(@Query() filters: EventFilterDto) { return this.svc.findAll(filters); }

  @Get('upcoming')
  @ApiOperation({ summary: 'Próximos eventos publicados (para homepage/widget)' })
  upcoming() { return this.svc.getUpcoming(); }

  @Get('stats')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Estatísticas globais de eventos' })
  stats() { return this.svc.getStats(); }

  @Get('my')
  @ApiOperation({ summary: 'Os meus eventos (inscrições futuras e passadas)' })
  myEvents(@CurrentUser() user: any) { return this.svc.getMyEvents(user.id); }

  @Get('organizer/dashboard')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard do organizador (métricas, NPS, ocupação)' })
  organizerDashboard(@CurrentUser() user: any) { return this.svc.getOrganizerDashboard(user.id); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do evento (participantes, feedback, NPS)' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  // ── Gestão ────────────────────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Criar evento (fica como DRAFT)' })
  create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Actualizar evento' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEventDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/publish')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Publicar evento (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) { return this.svc.publish(id); }

  @Patch(':id/cancel')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Cancelar evento (notifica participantes)' })
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseIntPipe) id: number) { return this.svc.cancel(id); }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Eliminar evento (apenas DRAFT)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }

  // ── Inscrição ─────────────────────────────────────────────────────────────

  @Post(':id/join')
  @ApiOperation({ summary: 'Inscrever-se (entra em lista de espera se lotado)' })
  join(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.join(id, user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Cancelar inscrição (promove próximo da lista de espera)' })
  @HttpCode(HttpStatus.OK)
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.leave(id, user.id);
  }

  @Patch(':id/participants/:userId/status')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Atualizar status de participante (CONFIRMED, PRESENT, NO_SHOW…)' })
  participantStatus(
    @Param('id', ParseIntPipe)     eventId: number,
    @Param('userId', ParseIntPipe) userId:  number,
    @Body() dto: UpdateParticipantStatusDto,
  ) {
    return this.svc.updateParticipantStatus(eventId, userId, dto);
  }

  // ── Check-in ──────────────────────────────────────────────────────────────

  @Post('checkin')
  @ApiOperation({ summary: 'Fazer check-in num evento (presencial ou virtual)' })
  @HttpCode(HttpStatus.OK)
  checkIn(@CurrentUser() user: any, @Body() dto: CheckInDto) {
    return this.svc.checkIn(user.id, dto);
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Submeter feedback e NPS do evento (emite certificado se elegível)' })
  feedback(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.svc.submitFeedback(id, user.id, dto);
  }
}
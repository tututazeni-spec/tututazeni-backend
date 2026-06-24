// src/trainings/trainings.controller.ts
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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TrainingService } from './trainings.service';
import {
  CreateTrainingDto,
  UpdateTrainingDto,
  TrainingFilterDto,
  CreateTrainingSessionDto,
  UpdateTrainingSessionDto,
  RegisterParticipantDto,
  TrainingsUpdateParticipantStatusDto,
  BulkAttendanceDto,
  RateTrainingDto,
} from './trainings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Trainings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trainings')
export class TrainingController {
  constructor(private readonly svc: TrainingService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('admin/dashboard')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard admin (KPIs, top treinamentos)' })
  dashboard() {
    return this.svc.getAdminDashboard();
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Catálogo de treinamentos com filtros' })
  findAll(@Query() filters: TrainingFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('my')
  @ApiOperation({ summary: 'Os meus treinamentos (inscrições e histórico)' })
  myTrainings(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyTrainings(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do treinamento (sessões, rating médio)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/attendance-report')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Relatório de presença e conclusão' })
  attendanceReport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAttendanceReport(id);
  }

  // ── Gestão (Admin/RH) ────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar treinamento' })
  create(@Body() dto: CreateTrainingDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar treinamento' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrainingDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Publicar treinamento (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Arquivar treinamento' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archive(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar treinamento' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Sessões ───────────────────────────────────────────────────────────────

  @Post('sessions')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar sessão de treinamento' })
  createSession(@Body() dto: CreateTrainingSessionDto) {
    return this.svc.createSession(dto);
  }

  @Put('sessions/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar sessão' })
  updateSession(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrainingSessionDto) {
    return this.svc.updateSession(id, dto);
  }

  @Delete('sessions/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar sessão (sem participantes)' })
  removeSession(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeSession(id);
  }

  @Get('sessions/:sessionId/participants')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Lista de participantes de uma sessão' })
  sessionParticipants(@Param('sessionId', ParseIntPipe) id: number) {
    return this.svc.getSessionParticipants(id);
  }

  // ── Inscrições ────────────────────────────────────────────────────────────

  @Post('sessions/register')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Inscrever colaborador numa sessão (com controlo de vagas)' })
  register(@Body() dto: RegisterParticipantDto) {
    return this.svc.registerParticipant(dto);
  }

  @Post('sessions/:sessionId/self-register')
  @ApiOperation({ summary: 'Auto-inscrição numa sessão' })
  selfRegister(
    @CurrentUser() user: CurrentUserData,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.svc.registerParticipant({ sessionId, userId: user.id, allowWaitlist: true });
  }

  @Delete('participants/:id/cancel')
  @ApiOperation({ summary: 'Cancelar inscrição própria' })
  @ApiQuery({ name: 'reason', required: false })
  cancelParticipant(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Query('reason') reason?: string,
  ) {
    return this.svc.cancelParticipant(id, user.id, reason);
  }

  @Patch('participants/:id/status')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar status de participante (presente, concluído, etc.)' })
  @HttpCode(HttpStatus.OK)
  updateParticipantStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TrainingsUpdateParticipantStatusDto,
  ) {
    return this.svc.updateParticipantStatus(id, dto);
  }

  @Post('sessions/attendance/bulk')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar presença em massa (lista de presentes)' })
  @HttpCode(HttpStatus.OK)
  bulkAttendance(@CurrentUser() user: CurrentUserData, @Body() dto: BulkAttendanceDto) {
    return this.svc.bulkAttendance(dto, user.id);
  }

  // ── Rating ────────────────────────────────────────────────────────────────

  @Post('rate')
  @ApiOperation({ summary: 'Avaliar treinamento (1-5 estrelas)' })
  @HttpCode(HttpStatus.OK)
  rate(@CurrentUser() user: CurrentUserData, @Body() dto: RateTrainingDto) {
    return this.svc.rateTraining(user.id, dto);
  }
}

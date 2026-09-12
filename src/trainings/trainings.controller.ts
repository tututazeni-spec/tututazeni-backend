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
  RejectParticipantDto,
  NotifyTrainingDto,
  CreateTrainingDocumentDto,
  LinkTrainingAssessmentDto,
  TrainingAssessmentRole,
} from './trainings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

// Papéis que podem CRIAR formações. Quem não for ADMIN/RH só gere as que
// criou — aplicado ao nível do serviço (assertCanManage), não aqui.
const CAN_CREATE_TRAININGS = [
  Role.ADMIN,
  Role.RH,
  Role.GESTOR,
  Role.INSTRUCTOR,
  Role.DIRECTOR,
  Role.LIDER,
];

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

  // ── Gestão ("Gestão") ─────────────────────────────────────────────────────

  @Get('manage')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({
    summary: 'Formações geríveis pelo utilizador (ADMIN/RH vêem todas; os restantes só as suas)',
  })
  manage(@Query() filters: TrainingFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.findForManagement(filters, user);
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
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(id, user);
  }

  @Get(':id/attendance-report')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Relatório de presença e conclusão' })
  attendanceReport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAttendanceReport(id);
  }

  @Get(':id/results')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({
    summary:
      'Resultados: inscritos, participantes, concluíram, taxa, presença, nota, satisfação, custo/participante',
  })
  results(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getResults(id);
  }

  // ── Gestão da formação (Admin/RH/Gestor/Instrutor/Director/Líder) ─────────

  @Post()
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Criar treinamento' })
  create(@Body() dto: CreateTrainingDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Put(':id')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Actualizar treinamento (só quem criou, ou ADMIN/RH)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTrainingDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Patch(':id/publish')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Publicar treinamento (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.publish(id, user);
  }

  @Patch(':id/archive')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Arquivar treinamento' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.archive(id, user);
  }

  @Delete(':id')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Eliminar treinamento' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.remove(id, user);
  }

  // ── Comunicação / notificações ────────────────────────────────────────────

  @Post(':id/notify')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Enviar comunicação a todos os participantes activos' })
  @HttpCode(HttpStatus.OK)
  notify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NotifyTrainingDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.notifyParticipants(id, dto, user);
  }

  // ── Documentos administrativos ────────────────────────────────────────────

  @Post(':id/documents')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Adicionar documento administrativo' })
  addDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTrainingDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addDocument(id, dto, user);
  }

  @Delete('documents/:documentId')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Eliminar documento administrativo' })
  removeDocument(
    @Param('documentId', ParseIntPipe) documentId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeDocument(documentId, user);
  }

  // ── Avaliação — associar avaliações existentes ────────────────────────────

  @Post(':id/assessments')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({
    summary: 'Associar um Assessment existente (inicial/final/satisfação/formador)',
  })
  linkAssessment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkTrainingAssessmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.linkAssessment(id, dto, user);
  }

  @Delete(':id/assessments/:role')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Desassociar avaliação de um papel' })
  unlinkAssessment(
    @Param('id', ParseIntPipe) id: number,
    @Param('role') role: TrainingAssessmentRole,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.unlinkAssessment(id, role, user);
  }

  // ── Sessões ───────────────────────────────────────────────────────────────

  @Post('sessions')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Criar sessão de treinamento' })
  createSession(@Body() dto: CreateTrainingSessionDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createSession(dto, user);
  }

  @Put('sessions/:id')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Actualizar sessão' })
  updateSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTrainingSessionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.updateSession(id, dto, user);
  }

  @Delete('sessions/:id')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Eliminar sessão (sem participantes)' })
  removeSession(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.removeSession(id, user);
  }

  @Get('sessions/:sessionId/participants')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Lista de participantes de uma sessão' })
  sessionParticipants(@Param('sessionId', ParseIntPipe) id: number) {
    return this.svc.getSessionParticipants(id);
  }

  // ── Inscrições ────────────────────────────────────────────────────────────

  @Post('sessions/register')
  @Roles(...CAN_CREATE_TRAININGS)
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
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Actualizar status de participante (presente, concluído, etc.)' })
  @HttpCode(HttpStatus.OK)
  updateParticipantStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TrainingsUpdateParticipantStatusDto,
  ) {
    return this.svc.updateParticipantStatus(id, dto);
  }

  @Patch('participants/:id/approve')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Aprovar inscrição pendente (formação com requiresApproval)' })
  @HttpCode(HttpStatus.OK)
  approveParticipant(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.approveParticipant(id, user);
  }

  @Patch('participants/:id/reject')
  @Roles(...CAN_CREATE_TRAININGS)
  @ApiOperation({ summary: 'Rejeitar inscrição pendente' })
  @HttpCode(HttpStatus.OK)
  rejectParticipant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectParticipantDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.rejectParticipant(id, dto, user);
  }

  @Post('sessions/attendance/bulk')
  @Roles(...CAN_CREATE_TRAININGS)
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

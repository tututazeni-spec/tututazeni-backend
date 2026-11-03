import { AnyAuthenticated, AllowExternal } from '../common/decorators/authz.decorators';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LiveClassesService } from './live-classes.service';
import {
  CreateLiveClassDto,
  UpdateLiveClassDto,
  LiveChatMessageDto,
  PostClassResponseDto,
  LiveClassFilterDto,
  PostponeLiveClassDto,
  CancelLiveClassDto,
  CreateLiveClassSessionDto,
  UpdateLiveClassSessionDto,
  RegisterAttendanceDto,
  BulkAttendanceDto,
  UpdateAttendanceDto,
  ParticipantsFilterDto,
  AddMaterialDto,
  MaterialsFilterDto,
  EvaluationsFilterDto,
  LiveClassReportFilterDto,
} from './live-classes.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { omitForExternal } from '../common/authz/external-scope';
import {
  ExternalLiveClassScope,
  ExternalLiveClassScopeGuard,
} from '../common/authz/external-live-class-scope.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { parseDateQuery } from '../common/helpers/parse-date-query';

/** Campos de uma sessão que o instrutor externo não define: quem a dá, gravação e biblioteca. */
const EXTERNAL_SESSION_BLOCKED = [
  'instructorId',
  'recordingUrl',
  'recordingPublishedAt',
  'materialDocumentIds',
] as const;

@ApiTags('Live Classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ExternalLiveClassScopeGuard)
@Controller('live-classes')
export class LiveClassesController {
  constructor(private readonly svc: LiveClassesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar aulas ao vivo' })
  @AnyAuthenticated()
  @AllowExternal()
  async findAll(@Query() filters: LiveClassFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.findAll(filters, await this.svc.ownerScope(user));
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Próximas aulas agendadas' })
  @AnyAuthenticated()
  @AllowExternal()
  async upcoming(@CurrentUser() user: CurrentUserData) {
    return this.svc.getUpcoming(await this.svc.ownerScope(user));
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Visão geral — cards e contadores' })
  @AnyAuthenticated()
  @AllowExternal()
  async dashboard(@CurrentUser() user: CurrentUserData) {
    return this.svc.getDashboard(await this.svc.ownerScope(user));
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Aulas e sessões num intervalo de datas' })
  @AnyAuthenticated()
  @AllowExternal()
  calendar(
    @Query('from') from: string,
    @Query('to') to: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Validação síncrona (400 imediato); só depois se resolve o âmbito do utilizador.
    parseDateQuery(from, 'from');
    parseDateQuery(to, 'to');
    return this.svc.ownerScope(user).then(own => this.svc.getCalendar(from, to, own));
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Todas as sessões de todas as aulas (secção 5)' })
  @AnyAuthenticated()
  @AllowExternal()
  async listAllSessions(
    @Query() filters: LiveClassFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.listAllSessions(filters, await this.svc.ownerScope(user));
  }

  @Get('participants')
  @ApiOperation({ summary: 'Participantes de todas as aulas (secção 6)' })
  @AnyAuthenticated()
  @AllowExternal()
  async listParticipants(
    @Query() filters: ParticipantsFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.listParticipants(filters, await this.svc.ownerScope(user));
  }

  @Get('instructors')
  @ApiOperation({ summary: 'Formadores com aulas ao vivo atribuídas (secção 7)' })
  @AnyAuthenticated()
  @AllowExternal()
  async listInstructors(@CurrentUser() user: CurrentUserData) {
    return this.svc.listInstructors(await this.svc.ownerScope(user));
  }

  @Get('virtual-rooms')
  @ApiOperation({ summary: 'Salas virtuais (Zoom/link de reunião) das aulas (secção 8)' })
  @AnyAuthenticated()
  @AllowExternal()
  async listVirtualRooms(
    @Query() filters: LiveClassFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.listVirtualRooms(filters, await this.svc.ownerScope(user));
  }

  @Get('recordings')
  @ApiOperation({ summary: 'Gravações de todas as aulas e sessões (secção 9)' })
  @AnyAuthenticated()
  @AllowExternal()
  async listRecordings(@Query() filters: LiveClassFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.listRecordings(filters, await this.svc.ownerScope(user));
  }

  @Get('materials')
  @ApiOperation({
    summary: 'Materiais de todas as aulas e sessões, ligados à Biblioteca (secção 11)',
  })
  @AnyAuthenticated()
  @AllowExternal()
  async listMaterials(@Query() filters: MaterialsFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.listMaterials(filters, await this.svc.ownerScope(user));
  }

  @Get('evaluations')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @ApiOperation({ summary: 'Avaliações pós-aula de todas as aulas (secção 12)' })
  async listEvaluations(
    @Query() filters: EvaluationsFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getEvaluations(filters, await this.svc.ownerScope(user));
  }

  @Get('evaluations/summary')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @ApiOperation({ summary: 'Resumo das avaliações — médias por rubrica e NPS (secção 12)' })
  async evaluationsSummary(
    @Query() filters: EvaluationsFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getEvaluationsSummary(filters, await this.svc.ownerScope(user));
  }

  @Get('reports/overview')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @ApiOperation({
    summary:
      'Relatórios: aulas realizadas/canceladas, horas, participantes, presenças, desempenho por formador (secção 13)',
  })
  async reports(@Query() filters: LiveClassReportFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.getReports(filters, await this.svc.ownerScope(user));
  }

  @Get('reports/export')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="relatorio-aulas-ao-vivo.csv"')
  @ApiOperation({ summary: 'Exportar relatório filtrado como CSV' })
  async exportReports(
    @Query() filters: LiveClassReportFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.exportReportsCsv(filters, await this.svc.ownerScope(user));
  }

  @Get('settings')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary:
      'Configurações agregadas — tipos, estados, modalidades, regras, permissões (secção 14)',
  })
  settings() {
    return this.svc.getSettings();
  }

  @Get(':id/room')
  @ApiOperation({ summary: 'Nome (não adivinhável) da sala Jitsi da aula' })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalLiveClassScope({ key: 'id' })
  room(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getRoomAccess(id, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da aula' })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalLiveClassScope({ key: 'id' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Mensagens do chat ao vivo' })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalLiveClassScope({ key: 'id' })
  messages(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.getMessages(id, page, limit);
  }

  @Get(':id/attendance-report')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Relatório de presença' })
  attendanceReport(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getAttendanceReport(id, user);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Listar sessões da aula (aulas recorrentes)' })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalLiveClassScope({ key: 'id' })
  listSessions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listSessions(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ApiOperation({ summary: 'Criar aula ao vivo' })
  create(@Body() dto: CreateLiveClassDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Entrar na aula' })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalLiveClassScope({ key: 'id' })
  join(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.joinClass(id, user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Sair da aula' })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalLiveClassScope({ key: 'id' })
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.leaveClass(id, user.id);
  }

  @Post(':id/message')
  @ApiOperation({ summary: 'Enviar mensagem no chat' })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalLiveClassScope({ key: 'id' })
  sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: LiveChatMessageDto,
  ) {
    return this.svc.sendMessage(id, user.id, dto);
  }

  @Post(':id/post-evaluation')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar avaliação pós-aula' })
  createPostEval(@Param('id', ParseIntPipe) id: number) {
    return this.svc.createPostEvaluation(id);
  }

  @Post('post-evaluation/respond')
  @ApiOperation({ summary: 'Submeter resposta à avaliação pós-aula' })
  @AnyAuthenticated()
  postResponse(@CurrentUser() user: CurrentUserData, @Body() dto: PostClassResponseDto) {
    return this.svc.submitPostResponse(user.id, dto);
  }

  @Post(':id/start')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Iniciar aula (estado → Em curso)' })
  start(@Param('id', ParseIntPipe) id: number) {
    return this.svc.start(id);
  }

  @Post(':id/postpone')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Adiar aula para nova data' })
  postpone(@Param('id', ParseIntPipe) id: number, @Body() dto: PostponeLiveClassDto) {
    return this.svc.postpone(id, dto);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Cancelar aula' })
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelLiveClassDto) {
    return this.svc.cancel(id, dto);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Duplicar aula' })
  duplicate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.duplicate(id);
  }

  @Post(':id/sessions')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Adicionar sessão à aula' })
  createSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateLiveClassSessionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.createSession(id, omitForExternal(user, dto, EXTERNAL_SESSION_BLOCKED));
  }

  @Post(':id/materials')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Associar material da Biblioteca à aula (secção 11)' })
  addMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddMaterialDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addClassMaterial(id, dto.documentId, user);
  }

  @Post(':id/sessions/:sessionId/materials')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id', sessionKey: 'sessionId' })
  @ApiOperation({ summary: 'Associar material da Biblioteca à sessão (secção 11)' })
  addSessionMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: AddMaterialDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addSessionMaterial(id, sessionId, dto.documentId, user);
  }

  @Post(':id/attendance')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Adicionar participante / registar presença manualmente (secção 6)' })
  registerAttendance(@Param('id', ParseIntPipe) id: number, @Body() dto: RegisterAttendanceDto) {
    return this.svc.registerAttendance(id, dto);
  }

  @Post(':id/attendance/bulk')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Adicionar presenças em massa (utilizadores, departamentos ou todos)' })
  bulkRegisterAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BulkAttendanceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.bulkRegisterAttendance(id, dto, user);
  }

  @Post(':id/recording/publish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Publicar gravação da aula (secção 9)' })
  publishRecording(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishRecording(id, true);
  }

  @Post(':id/recording/unpublish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Despublicar gravação da aula' })
  unpublishRecording(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishRecording(id, false);
  }

  @Post(':id/sessions/:sessionId/recording/publish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Publicar gravação da sessão' })
  publishSessionRecording(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.svc.publishSessionRecording(id, sessionId, true);
  }

  @Post(':id/sessions/:sessionId/recording/unpublish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Despublicar gravação da sessão' })
  unpublishSessionRecording(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.svc.publishSessionRecording(id, sessionId, false);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Atualizar aula' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLiveClassDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Put(':id/sessions/:sessionId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id', sessionKey: 'sessionId' })
  @ApiOperation({ summary: 'Atualizar sessão' })
  updateSession(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: UpdateLiveClassSessionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.updateSession(
      id,
      sessionId,
      omitForExternal(user, dto, EXTERNAL_SESSION_BLOCKED),
    );
  }

  @Put(':id/attendance/:attendanceId')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id', attendanceKey: 'attendanceId' })
  @ApiOperation({ summary: 'Registar presença / justificar ausência (secções 6/10)' })
  updateAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Param('attendanceId', ParseIntPipe) attendanceId: number,
    @Body() dto: UpdateAttendanceDto,
  ) {
    return this.svc.updateAttendance(id, attendanceId, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover aula' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  @Delete(':id/sessions/:sessionId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover sessão' })
  removeSession(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.svc.deleteSession(id, sessionId);
  }

  @Delete(':id/attendance/:attendanceId')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id', attendanceKey: 'attendanceId' })
  @ApiOperation({ summary: 'Remover participante (secção 6)' })
  removeAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Param('attendanceId', ParseIntPipe) attendanceId: number,
  ) {
    return this.svc.removeAttendance(id, attendanceId);
  }

  @Delete(':id/materials/:documentId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id' })
  @ApiOperation({ summary: 'Remover material da aula (secção 11)' })
  removeMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.svc.removeClassMaterial(id, documentId);
  }

  @Delete(':id/sessions/:sessionId/materials/:documentId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalLiveClassScope({ key: 'id', sessionKey: 'sessionId' })
  @ApiOperation({ summary: 'Remover material da sessão (secção 11)' })
  removeSessionMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.svc.removeSessionMaterial(id, sessionId, documentId);
  }

  @Delete(':id/recording')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar gravação da aula' })
  deleteRecording(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteRecording(id);
  }

  @Delete(':id/sessions/:sessionId/recording')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar gravação da sessão' })
  deleteSessionRecording(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
  ) {
    return this.svc.deleteSessionRecording(id, sessionId);
  }
}

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
  UpdateAttendanceDto,
  ParticipantsFilterDto,
  AddMaterialDto,
  MaterialsFilterDto,
  EvaluationsFilterDto,
  LiveClassReportFilterDto,
} from './live-classes.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Live Classes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('live-classes')
export class LiveClassesController {
  constructor(private readonly svc: LiveClassesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar aulas ao vivo' })
  findAll(@Query() filters: LiveClassFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Próximas aulas agendadas' })
  upcoming() {
    return this.svc.getUpcoming();
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Visão geral — cards e contadores' })
  dashboard() {
    return this.svc.getDashboard();
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Aulas e sessões num intervalo de datas' })
  calendar(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getCalendar(from, to);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Todas as sessões de todas as aulas (secção 5)' })
  listAllSessions(@Query() filters: LiveClassFilterDto) {
    return this.svc.listAllSessions(filters);
  }

  @Get('participants')
  @ApiOperation({ summary: 'Participantes de todas as aulas (secção 6)' })
  listParticipants(@Query() filters: ParticipantsFilterDto) {
    return this.svc.listParticipants(filters);
  }

  @Get('instructors')
  @ApiOperation({ summary: 'Formadores com aulas ao vivo atribuídas (secção 7)' })
  listInstructors() {
    return this.svc.listInstructors();
  }

  @Get('virtual-rooms')
  @ApiOperation({ summary: 'Salas virtuais (Zoom/link de reunião) das aulas (secção 8)' })
  listVirtualRooms(@Query() filters: LiveClassFilterDto) {
    return this.svc.listVirtualRooms(filters);
  }

  @Get('recordings')
  @ApiOperation({ summary: 'Gravações de todas as aulas e sessões (secção 9)' })
  listRecordings(@Query() filters: LiveClassFilterDto) {
    return this.svc.listRecordings(filters);
  }

  @Get('materials')
  @ApiOperation({ summary: 'Materiais de todas as aulas e sessões, ligados à Biblioteca (secção 11)' })
  listMaterials(@Query() filters: MaterialsFilterDto) {
    return this.svc.listMaterials(filters);
  }

  @Get('evaluations')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @ApiOperation({ summary: 'Avaliações pós-aula de todas as aulas (secção 12)' })
  listEvaluations(@Query() filters: EvaluationsFilterDto) {
    return this.svc.getEvaluations(filters);
  }

  @Get('evaluations/summary')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @ApiOperation({ summary: 'Resumo das avaliações — médias por rubrica e NPS (secção 12)' })
  evaluationsSummary(@Query() filters: EvaluationsFilterDto) {
    return this.svc.getEvaluationsSummary(filters);
  }

  @Get('reports/overview')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @ApiOperation({
    summary:
      'Relatórios: aulas realizadas/canceladas, horas, participantes, presenças, desempenho por formador (secção 13)',
  })
  reports(@Query() filters: LiveClassReportFilterDto) {
    return this.svc.getReports(filters);
  }

  @Get('reports/export')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="relatorio-aulas-ao-vivo.csv"')
  @ApiOperation({ summary: 'Exportar relatório filtrado como CSV' })
  exportReports(@Query() filters: LiveClassReportFilterDto) {
    return this.svc.exportReportsCsv(filters);
  }

  @Get('settings')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Configurações agregadas — tipos, estados, modalidades, regras, permissões (secção 14)' })
  settings() {
    return this.svc.getSettings();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da aula' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Mensagens do chat ao vivo' })
  messages(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.svc.getMessages(id, page, limit);
  }

  @Get(':id/attendance-report')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @ApiOperation({ summary: 'Relatório de presença' })
  attendanceReport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAttendanceReport(id);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Listar sessões da aula (aulas recorrentes)' })
  listSessions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listSessions(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar aula ao vivo' })
  create(@Body() dto: CreateLiveClassDto) {
    return this.svc.create(dto);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Entrar na aula' })
  join(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.joinClass(id, user.id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Sair da aula' })
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.leaveClass(id, user.id);
  }

  @Post(':id/message')
  @ApiOperation({ summary: 'Enviar mensagem no chat' })
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
  postResponse(@CurrentUser() user: CurrentUserData, @Body() dto: PostClassResponseDto) {
    return this.svc.submitPostResponse(user.id, dto);
  }

  @Post(':id/start')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Iniciar aula (estado → Em curso)' })
  start(@Param('id', ParseIntPipe) id: number) {
    return this.svc.start(id);
  }

  @Post(':id/postpone')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adiar aula para nova data' })
  postpone(@Param('id', ParseIntPipe) id: number, @Body() dto: PostponeLiveClassDto) {
    return this.svc.postpone(id, dto);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.RH)
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
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar sessão à aula' })
  createSession(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateLiveClassSessionDto) {
    return this.svc.createSession(id, dto);
  }

  @Post(':id/materials')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Associar material da Biblioteca à aula (secção 11)' })
  addMaterial(@Param('id', ParseIntPipe) id: number, @Body() dto: AddMaterialDto) {
    return this.svc.addClassMaterial(id, dto.documentId);
  }

  @Post(':id/sessions/:sessionId/materials')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Associar material da Biblioteca à sessão (secção 11)' })
  addSessionMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: AddMaterialDto,
  ) {
    return this.svc.addSessionMaterial(id, sessionId, dto.documentId);
  }

  @Post(':id/attendance')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @ApiOperation({ summary: 'Adicionar participante / registar presença manualmente (secção 6)' })
  registerAttendance(@Param('id', ParseIntPipe) id: number, @Body() dto: RegisterAttendanceDto) {
    return this.svc.registerAttendance(id, dto);
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
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Atualizar aula' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLiveClassDto) {
    return this.svc.update(id, dto);
  }

  @Put(':id/sessions/:sessionId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Atualizar sessão' })
  updateSession(
    @Param('id', ParseIntPipe) id: number,
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() dto: UpdateLiveClassSessionDto,
  ) {
    return this.svc.updateSession(id, sessionId, dto);
  }

  @Put(':id/attendance/:attendanceId')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
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
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @ApiOperation({ summary: 'Remover participante (secção 6)' })
  removeAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Param('attendanceId', ParseIntPipe) attendanceId: number,
  ) {
    return this.svc.removeAttendance(id, attendanceId);
  }

  @Delete(':id/materials/:documentId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover material da aula (secção 11)' })
  removeMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.svc.removeClassMaterial(id, documentId);
  }

  @Delete(':id/sessions/:sessionId/materials/:documentId')
  @Roles(Role.ADMIN, Role.RH)
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

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
import { LeadershipService } from './leadership.service';
import { LeadershipProgramsService } from './leadership-programs.service';
import { LeadershipEligibilityService } from './leadership-eligibility.service';
import { LeadershipParticipantsService } from './leadership-participants.service';
import { LeadershipExecutionService } from './leadership-execution.service';
import {
  CreateLeadershipProgramDto,
  UpdateLeadershipProgramDto,
  TransitionProgramDto,
  ReplaceProgramConfigurationDto,
  RecalculateEligibilityDto,
  ParticipantSelectionStatusDto,
} from './leadership-program.dto';
import {
  ParticipantBaselineDto,
  AssignAdvisorsDto,
  LinkDevelopmentPlanDto,
  ReplacePlanActionsDto,
  RecordAssessmentDto,
  UpsertProjectDto,
  EvaluateProjectDto,
  AttachDocumentDto,
  AddCostDto,
  ScheduleCommunicationDto,
} from './leadership-participant.dto';
import {
  LeadershipFilterDto,
  EnrollLeadershipDto,
  UpdateParticipantProgressDto,
  LeadershipCreateOneOnOneDto,
  CompleteOneOnOneDto,
  Submit360FeedbackDto,
  SubmitPulseDto,
  CreateMentoringDto,
  LogMentoringSessionDto,
  UpsertTeamHealthDto,
  SendKudosDto,
} from './leadership.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

// Papéis que podem criar programas de liderança e gerir aqueles de que são
// autores/responsáveis (ADMIN/RH gerem todos — a distinção é feita no serviço).
const PROGRAM_MANAGERS = [
  Role.ADMIN,
  Role.RH,
  Role.GESTOR,
  Role.INSTRUCTOR,
  Role.DIRECTOR,
  Role.LIDER,
] as const;

@ApiTags('Leadership')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leadership')
export class LeadershipController {
  constructor(
    private readonly svc: LeadershipService,
    private readonly programsSvc: LeadershipProgramsService,
    private readonly eligibilitySvc: LeadershipEligibilityService,
    private readonly participantsSvc: LeadershipParticipantsService,
    private readonly executionSvc: LeadershipExecutionService,
  ) {}

  // ── Dashboard do Líder ────────────────────────────────────────────────────

  @Get('my/dashboard')
  @ApiOperation({ summary: 'Dashboard pessoal do líder (score, programas, mentoring, 1:1s)' })
  myDashboard(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyLeaderDashboard(user.id);
  }

  @Get('team/dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Team Dashboard — saúde, semáforo, alertas da equipa' })
  teamDashboard(@CurrentUser() user: CurrentUserData) {
    return this.svc.getTeamDashboard(user.id);
  }

  // ── Programas ─────────────────────────────────────────────────────────────

  @Get('programs')
  @ApiOperation({ summary: 'Catálogo de programas de liderança' })
  findAll(@Query() filters: LeadershipFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('programs/my')
  @ApiOperation({ summary: 'Os meus programas de liderança' })
  myPrograms(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyPrograms(user.id);
  }

  @Get('programs/:id')
  @ApiOperation({ summary: 'Detalhe do programa' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get('programs/:id/stats')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Estatísticas do programa (conclusão, progresso médio)' })
  stats(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getProgramStats(id);
  }

  @Post('programs')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Criar programa de liderança' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateLeadershipProgramDto) {
    return this.programsSvc.create(user, dto);
  }

  @Put('programs/:id')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Actualizar programa (autor/responsável ou ADMIN/RH)' })
  update(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadershipProgramDto,
  ) {
    return this.programsSvc.update(user, id, dto);
  }

  @Patch('programs/:id/transition')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Transição de estado do programa (máquina de estados)' })
  @HttpCode(HttpStatus.OK)
  transition(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionProgramDto,
  ) {
    return this.programsSvc.transition(user, id, dto.status);
  }

  @Put('programs/:id/configuration')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({
    summary: 'Substituir a configuração do programa (público, critérios, competências, ...)',
  })
  replaceConfiguration(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceProgramConfigurationDto,
  ) {
    return this.programsSvc.replaceConfiguration(user, id, dto);
  }

  @Delete('programs/:id')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({
    summary: 'Eliminar programa (autor/responsável ou ADMIN/RH; só sem participantes)',
  })
  remove(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.programsSvc.remove(user, id);
  }

  @Post('programs/enroll')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Inscrever colaborador num programa' })
  enroll(@Body() dto: EnrollLeadershipDto) {
    return this.svc.enroll(dto);
  }

  @Post('programs/:programId/self-enroll')
  @ApiOperation({ summary: 'Auto-inscrição num programa' })
  selfEnroll(
    @CurrentUser() user: CurrentUserData,
    @Param('programId', ParseIntPipe) programId: number,
  ) {
    return this.svc.enroll({ userId: user.id, programId });
  }

  @Patch('programs/:programId/participants/:userId/progress')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar progresso do participante' })
  @HttpCode(HttpStatus.OK)
  updateProgress(
    @Param('programId', ParseIntPipe) programId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateParticipantProgressDto,
  ) {
    return this.svc.updateProgress(userId, programId, dto);
  }

  @Patch('programs/:programId/withdraw')
  @ApiOperation({ summary: 'Abandonar programa' })
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: CurrentUserData,
    @Param('programId', ParseIntPipe) programId: number,
  ) {
    return this.svc.withdraw(user.id, programId);
  }

  // ── Elegibilidade e selecção de candidatos (Task 3) ──────────────────────
  // Manager-only: @Roles filtra os papéis; o ownership por-programa (autor/
  // responsável ou ADMIN/RH) é validado NO SERVIÇO via assertCanManageProgram.

  @Get('programs/:id/candidates')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({
    summary: 'Candidatos do programa com a elegibilidade persistida (compute-on-read)',
  })
  listCandidates(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.eligibilitySvc.listCandidates(user, id);
  }

  @Post('programs/:id/candidates/:userId/recalculate')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Recalcular e persistir o snapshot de elegibilidade de um candidato' })
  @HttpCode(HttpStatus.OK)
  recalculateEligibility(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: RecalculateEligibilityDto,
  ) {
    return this.eligibilitySvc.recalculate(user, id, userId, dto);
  }

  @Post('programs/:id/candidates/:userId/select')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Selecionar candidato (CANDIDATE→SELECTED; cria a linha se preciso)' })
  @HttpCode(HttpStatus.OK)
  selectCandidate(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.eligibilitySvc.selectCandidate(user, id, userId);
  }

  @Patch('programs/:id/participants/:userId/selection-status')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Avançar o participante na máquina de estados da selecção' })
  @HttpCode(HttpStatus.OK)
  advanceSelectionStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ParticipantSelectionStatusDto,
  ) {
    return this.eligibilitySvc.advanceSelection(user, id, userId, dto.status);
  }

  // ── Percurso do participante (Task 5) ────────────────────────────────────
  // Escritas = gestão do programa (@Roles + ownership no serviço). A leitura
  // `my-participation` é aberta a qualquer autenticado — o serviço garante que
  // só devolve o registo do próprio.

  @Get('programs/:id/my-participation')
  @ApiOperation({ summary: 'O meu percurso neste programa (baseline, PDI, avaliações)' })
  myParticipation(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.participantsSvc.getMyParticipation(user, id);
  }

  @Get('programs/:id/participants/:userId')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Detalhe do percurso de um participante' })
  getParticipant(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.participantsSvc.getParticipant(user, id, userId);
  }

  @Put('programs/:id/participants/:userId/baseline')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Registar baseline / readiness do participante' })
  setBaseline(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ParticipantBaselineDto,
  ) {
    return this.participantsSvc.setBaseline(user, id, userId, dto);
  }

  @Put('programs/:id/participants/:userId/advisors')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Atribuir mentor / coach / mentoring canónico ao participante' })
  assignAdvisors(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AssignAdvisorsDto,
  ) {
    return this.participantsSvc.assignAdvisors(user, id, userId, dto);
  }

  @Put('programs/:id/participants/:userId/development-plan')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Ligar o percurso individual a um PDI (DevelopmentPlan) existente' })
  linkDevelopmentPlan(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: LinkDevelopmentPlanDto,
  ) {
    return this.participantsSvc.linkDevelopmentPlan(user, id, userId, dto);
  }

  @Put('programs/:id/participants/:userId/plan-actions')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Substituir as acções do percurso individual (replace-all)' })
  replacePlanActions(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ReplacePlanActionsDto,
  ) {
    return this.participantsSvc.replacePlanActions(user, id, userId, dto);
  }

  // ── Execução do programa (Task 5) ───────────────────────────────────────

  @Put('programs/:id/participants/:userId/assessments')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({
    summary: 'Registar/actualizar a avaliação de uma etapa (INITIAL/MIDPOINT/FINAL)',
  })
  recordAssessment(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: RecordAssessmentDto,
  ) {
    return this.executionSvc.recordAssessment(user, id, userId, dto);
  }

  @Post('programs/:id/projects')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Criar ou actualizar o projecto de liderança' })
  upsertProject(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertProjectDto,
  ) {
    return this.executionSvc.upsertProject(user, id, dto);
  }

  @Patch('projects/:projectId/evaluation')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Avaliar o projecto de liderança' })
  @HttpCode(HttpStatus.OK)
  evaluateProject(
    @CurrentUser() user: CurrentUserData,
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: EvaluateProjectDto,
  ) {
    return this.executionSvc.evaluateProject(user, projectId, dto);
  }

  @Post('programs/:id/documents')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Anexar um documento existente do repositório ao programa' })
  attachDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AttachDocumentDto,
  ) {
    return this.executionSvc.attachDocument(user, id, dto);
  }

  @Post('programs/:id/costs')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Registar uma componente de custo do programa' })
  addCost(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddCostDto,
  ) {
    return this.executionSvc.addCost(user, id, dto);
  }

  @Get('programs/:id/costs/summary')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({
    summary: 'Totais de custo do programa (planeado, real, variação, por categoria)',
  })
  costSummary(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.executionSvc.getCostSummary(user, id);
  }

  @Post('programs/:id/communications')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Agendar uma comunicação programática do programa' })
  scheduleCommunication(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScheduleCommunicationDto,
  ) {
    return this.executionSvc.scheduleCommunication(user, id, dto);
  }

  @Post('communications/:communicationId/dispatch')
  @Roles(...PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Enviar uma comunicação agendada (idempotente)' })
  @HttpCode(HttpStatus.OK)
  dispatchCommunication(
    @CurrentUser() user: CurrentUserData,
    @Param('communicationId', ParseIntPipe) communicationId: number,
  ) {
    return this.executionSvc.dispatchCommunication(user, communicationId);
  }

  // ── Team Health ───────────────────────────────────────────────────────────

  @Get('team/health')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Métricas de saúde da equipa do gestor autenticado' })
  teamHealth(@CurrentUser() user: CurrentUserData) {
    return this.svc.getTeamHealth(user.id);
  }

  @Patch('team/health')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar métricas de saúde da equipa' })
  @HttpCode(HttpStatus.OK)
  upsertTeamHealth(@CurrentUser() user: CurrentUserData, @Body() dto: UpsertTeamHealthDto) {
    return this.svc.upsertTeamHealth(user.id, dto);
  }

  // ── One-on-One ────────────────────────────────────────────────────────────

  @Get('1on1')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar 1:1s agendados / realizados' })
  @ApiQuery({ name: 'subordinateId', required: false })
  getOneOnOnes(
    @CurrentUser() user: CurrentUserData,
    @Query('subordinateId') subordinateId?: string,
  ) {
    return this.svc.getOneOnOnes(user.id, subordinateId ? parseInt(subordinateId) : undefined);
  }

  @Post('1on1')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Agendar 1:1 com liderado' })
  createOneOnOne(@CurrentUser() user: CurrentUserData, @Body() dto: LeadershipCreateOneOnOneDto) {
    return this.svc.createOneOnOne(user.id, dto);
  }

  @Patch('1on1/complete')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Concluir 1:1 e registar ata' })
  @HttpCode(HttpStatus.OK)
  completeOneOnOne(@CurrentUser() user: CurrentUserData, @Body() dto: CompleteOneOnOneDto) {
    return this.svc.completeOneOnOne(user.id, dto);
  }

  // ── Feedback 360° ─────────────────────────────────────────────────────────

  @Post('feedback-360')
  @ApiOperation({ summary: 'Submeter feedback 360° de liderança (anonimizável)' })
  submit360(@CurrentUser() user: CurrentUserData, @Body() dto: Submit360FeedbackDto) {
    return this.svc.submit360Feedback(user.id, dto);
  }

  @Get('feedback-360/my/summary')
  @ApiOperation({ summary: 'O meu sumário de feedback 360°' })
  my360Summary(@CurrentUser() user: CurrentUserData) {
    return this.svc.get360Summary(user.id);
  }

  @Get('feedback-360/:leaderId/summary')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Sumário 360° de um líder (média por competência, insights)' })
  get360Summary(
    @CurrentUser() user: CurrentUserData,
    @Param('leaderId', ParseIntPipe) leaderId: number,
  ) {
    // Ownership (A3): só o próprio líder ou ADMIN/RH — GESTOR só vê o seu próprio
    // sumário (o @Roles acima mantém-se para não excluir GESTOR de `my/summary`,
    // mas o serviço aplica assertCanAccess e devolve 404 se GESTOR pedir outro líder).
    return this.svc.get360Summary(leaderId, user);
  }

  // ── Pulse ─────────────────────────────────────────────────────────────────

  @Post('pulse')
  @ApiOperation({ summary: 'Submeter pulse survey mensal sobre o líder' })
  submitPulse(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitPulseDto) {
    return this.svc.submitPulse(user.id, dto);
  }

  // ── Mentoring ─────────────────────────────────────────────────────────────

  @Post('mentoring')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar relação de mentoring (ou reverse mentoring)' })
  createMentoring(@Body() dto: CreateMentoringDto) {
    return this.svc.createMentoring(dto);
  }

  @Post('mentoring/session')
  @ApiOperation({ summary: 'Registar sessão de mentoring' })
  logSession(@CurrentUser() user: CurrentUserData, @Body() dto: LogMentoringSessionDto) {
    return this.svc.logMentoringSession(user.id, dto);
  }

  @Get('mentoring/my')
  @ApiOperation({ summary: 'As minhas relações de mentoring (como mentor e mentorado)' })
  myMentoring(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyMentoring(user.id);
  }

  // ── Kudos / Reconhecimento ────────────────────────────────────────────────

  @Post('kudos')
  @ApiOperation({ summary: 'Dar kudos / reconhecimento a um colega' })
  sendKudos(@CurrentUser() user: CurrentUserData, @Body() dto: SendKudosDto) {
    return this.svc.sendKudos(user.id, dto);
  }

  @Get('kudos')
  @ApiOperation({ summary: 'Mural de reconhecimento (todos ou de utilizador específico)' })
  @ApiQuery({ name: 'userId', required: false })
  getKudosWall(@Query('userId') userId?: string) {
    return this.svc.getKudosWall(userId ? parseInt(userId) : undefined);
  }

  // ── Leadership Score & Ranking ────────────────────────────────────────────

  @Get('score/my')
  @ApiOperation({ summary: 'O meu Leadership Score' })
  myScore(@CurrentUser() user: CurrentUserData) {
    return this.svc.getLeadershipScore(user.id);
  }

  @Get('score/:userId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Leadership Score de um colaborador' })
  userScore(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getLeadershipScore(userId);
  }

  @Get('ranking')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Ranking de líderes (Leadership Scorecard)' })
  ranking() {
    return this.svc.getLeadershipRanking();
  }

  @Patch('score/:userId/recalc')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Recalcular Leadership Score de um colaborador' })
  @HttpCode(HttpStatus.OK)
  recalcScore(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.recalcLeadershipScore(userId);
  }
}

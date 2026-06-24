// src/engagement/engagement.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EngagementService } from './engagement.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import {
  CreateSurveyDto,
  UpdateSurveyDto,
  SurveyFilterDto,
  SubmitSurveyDto,
  SubmitENPSDto,
  SubmitMoodDto,
  CreateFeedbackDto,
  FeedbackFilterDto,
  FeedbackReplyDto,
  CreateRecognitionDto,
  RecognitionFilterDto,
  CreateOneOnOneDto,
  EngagementUpdateOneOnOneDto,
  CreateActionPlanDto,
  UpdateActionPlanDto,
  EngagementFilterDto,
} from './engagement.dto';

const ALL_ROLES = ['ADMIN', 'RH', 'LIDER', 'COLABORADOR'] as const;
const MGMT_ROLES = ['ADMIN', 'RH', 'LIDER'] as const;
const ADMIN_ROLES = ['ADMIN', 'RH'] as const;

@ApiTags('Engagement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('engagement')
export class EngagementController {
  constructor(private readonly svc: EngagementService) {}

  // ─── Surveys ─────────────────────────────────────────────────

  @Get('surveys')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar surveys com filtros (type, status, paginação)' })
  getSurveys(@Query() filters: SurveyFilterDto) {
    return this.svc.getSurveys(filters);
  }

  @Get('surveys/templates')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Templates de surveys reutilizáveis' })
  getTemplates() {
    return this.svc.getTemplates();
  }

  @Get('surveys/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe de survey com perguntas' })
  getSurvey(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getSurvey(id);
  }

  @Get('surveys/:id/results')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Resultados do survey (respeitando threshold de anonimato)' })
  getResults(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getSurveyResults(id, user.id);
  }

  @Post('surveys')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar survey (clima, pulse, eNPS, onboarding…)' })
  createSurvey(@Body() dto: CreateSurveyDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createSurvey(dto, user.id);
  }

  @Patch('surveys/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Actualizar survey (título, datas, status)' })
  updateSurvey(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSurveyDto) {
    return this.svc.updateSurvey(id, dto);
  }

  @Post('surveys/:id/activate')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Activar survey e notificar colaboradores' })
  activateSurvey(@Param('id', ParseIntPipe) id: number) {
    return this.svc.activateSurvey(id);
  }

  @Post('surveys/:id/close')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Fechar survey' })
  closeSurvey(@Param('id', ParseIntPipe) id: number) {
    return this.svc.closeSurvey(id);
  }

  @Post('surveys/respond')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Submeter respostas a um survey' })
  respond(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitSurveyDto) {
    return this.svc.submitSurvey(user.id, dto);
  }

  // ─── eNPS ────────────────────────────────────────────────────

  @Post('enps/submit')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Submeter eNPS (0-10 + motivo)' })
  submitENPS(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitENPSDto) {
    return this.svc.submitENPS(user.id, dto);
  }

  @Get('enps')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Score eNPS actual (promotores, passivos, detractores)' })
  getENPS(@Query('departmentId') departmentId?: string) {
    return this.svc.getENPSScore(departmentId ? +departmentId : undefined);
  }

  // ─── Mood Tracking ───────────────────────────────────────────

  @Post('mood/checkin')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Check-in de humor diário (1–5 + nota)' })
  submitMood(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitMoodDto) {
    return this.svc.submitMood(user.id, dto);
  }

  @Get('mood/my-trend')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Tendência do meu humor (últimos N dias)' })
  myMoodTrend(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    return this.svc.getMoodTrend(user.id, days ? +days : 14);
  }

  @Get('mood/team/:managerId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Overview de humor da equipa (gestor)' })
  teamMood(@Param('managerId', ParseIntPipe) managerId: number) {
    return this.svc.getTeamMoodOverview(managerId);
  }

  // ─── Feedback ────────────────────────────────────────────────

  @Post('feedback')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Criar feedback (aberto, anónimo, peer, para gestor)' })
  createFeedback(@CurrentUser() user: CurrentUserData, @Body() dto: CreateFeedbackDto) {
    return this.svc.createFeedback(user.id, dto);
  }

  @Get('feedback')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar feedback (filtrado por destinatário, remetente, tipo)' })
  getFeedback(@Query() filters: FeedbackFilterDto) {
    return this.svc.getFeedback(filters);
  }

  @Post('feedback/:id/reply')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Responder a feedback' })
  replyFeedback(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: FeedbackReplyDto,
  ) {
    return this.svc.replyToFeedback(id, user.id, dto);
  }

  // ─── Recognition & Kudos ─────────────────────────────────────

  @Post('recognition')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Dar reconhecimento/kudos a um colega (+XP automático)' })
  giveRecognition(@CurrentUser() user: CurrentUserData, @Body() dto: CreateRecognitionDto) {
    return this.svc.giveRecognition(user.id, dto);
  }

  @Get('recognition/feed')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Feed público de reconhecimentos' })
  recognitionFeed(@Query() filters: RecognitionFilterDto) {
    return this.svc.getRecognitionFeed(filters);
  }

  @Get('recognition/leaderboard')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Leaderboard (points | recognitions | kudos)' })
  leaderboard(
    @Query('type') type: 'points' | 'recognitions' | 'kudos' = 'points',
    @Query('departmentId') departmentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getLeaderboard(
      type,
      departmentId ? +departmentId : undefined,
      limit ? +limit : 10,
    );
  }

  // ─── 1:1 Meetings ────────────────────────────────────────────

  @Post('one-on-one')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Agendar 1:1 (com pauta e opção de recorrência)' })
  createOneOnOne(@CurrentUser() user: CurrentUserData, @Body() dto: CreateOneOnOneDto) {
    return this.svc.createOneOnOne(user.id, dto);
  }

  @Get('one-on-one/my')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Os meus 1:1 (como host ou participante)' })
  myOneOnOnes(@CurrentUser() user: CurrentUserData) {
    return this.svc.getOneOnOnes(user.id);
  }

  @Patch('one-on-one/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Actualizar 1:1 (notas, conclusão, reagendamento)' })
  updateOneOnOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: EngagementUpdateOneOnOneDto,
  ) {
    return this.svc.updateOneOnOne(id, user.id, dto);
  }

  // ─── Action Plans ─────────────────────────────────────────────

  @Post('action-plans')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Criar plano de acção baseado em resultados de survey' })
  createActionPlan(@CurrentUser() user: CurrentUserData, @Body() dto: CreateActionPlanDto) {
    return this.svc.createActionPlan(user.id, dto);
  }

  @Get('action-plans')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Listar planos de acção' })
  getActionPlans(
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getActionPlans({
      departmentId: departmentId ? +departmentId : undefined,
      status,
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
  }

  @Patch('action-plans/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Actualizar plano de acção (progresso, status, notas)' })
  updateActionPlan(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateActionPlanDto) {
    return this.svc.updateActionPlan(id, dto);
  }

  // ─── Analytics ────────────────────────────────────────────────

  @Get('dashboard')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Dashboard principal de engagement (KPIs + histórico + eNPS)' })
  dashboard(@Query() filters: EngagementFilterDto) {
    return this.svc.getDashboard(filters);
  }

  @Get('index')
  @Roles(...MGMT_ROLES)
  @ApiOperation({
    summary: 'Índice de engajamento histórico + nível (EXCELLENT/GOOD/FAIR/AT_RISK)',
  })
  index(@Query('departmentId') departmentId?: string) {
    return this.svc.getEngagementIndex(departmentId ? +departmentId : undefined);
  }

  @Get('heatmap')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary: 'Heatmap de engajamento por departamento (score | participation | mood)',
  })
  heatmap(@Query('metric') metric: 'score' | 'participation' | 'mood' = 'score') {
    return this.svc.getEngagementHeatmap(metric);
  }

  @Get('manager-insights/:managerId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Insights e alertas do gestor sobre a sua equipa' })
  managerInsights(@Param('managerId', ParseIntPipe) managerId: number) {
    return this.svc.getManagerInsights(managerId);
  }

  @Get('human-success-score/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Human Success Score (engagement + performance + learning)' })
  humanSuccessScore(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getHumanSuccessScore(userId);
  }

  @Get('my-summary')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Resumo do colaborador (surveys pendentes, reconhecimentos, XP, HSS)' })
  mySummary(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyEngagementSummary(user.id);
  }
}

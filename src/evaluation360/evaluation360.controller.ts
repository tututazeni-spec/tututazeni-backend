// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — CONTROLLER
// src/modules/evaluation360/evaluation360.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Evaluation360Service } from './evaluation360.service';
import {
  Evaluation360CreateCompetencyDto,
  Evaluation360UpdateCompetencyDto,
  CreateEvaluationCycleDto,
  UpdateEvaluationCycleDto,
  PublishCycleDto,
  Evaluation360CreateQuestionDto,
  AddParticipantsDto,
  ConsentDto,
  SuggestEvaluatorsDto,
  BulkAssignEvaluatorsDto,
  ApproveEvaluatorsDto,
  SubmitResponseDto,
  CreateContinuousFeedbackDto,
  CreatePulseSurveyDto,
  SubmitPulseSurveyDto,
  AnalyticsQueryDto,
  NineBoxQueryDto,
  GenerateReportDto,
  Evaluation360CalibrateScoreDto,
  SendRemindersDto,
  Evaluation360PaginationDto,
} from './evaluation360.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { assertCanAccess } from '../common/authz/ownership';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserData } from '../common/types/current-user';

@ApiTags('Avaliação 360°')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('evaluation360')
export class Evaluation360Controller {
  constructor(private readonly service: Evaluation360Service) {}

  // ============================================================
  // COMPETÊNCIAS
  // ============================================================

  @Post('competencies')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar competência no banco de competências' })
  async createCompetency(
    @Body() dto: Evaluation360CreateCompetencyDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createCompetency(dto, String(user.id));
  }

  @Patch('competencies/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar competência' })
  async updateCompetency(
    @Param('id') id: string,
    @Body() dto: Evaluation360UpdateCompetencyDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateCompetency(id, dto, String(user.id));
  }

  @Get('competencies')
  @ApiOperation({ summary: 'Listar banco de competências' })
  @ApiQuery({ name: 'tenantId', required: false })
  async listCompetencies(
    @Query('tenantId') tenantId?: string,
    @Query() query?: Evaluation360PaginationDto,
  ) {
    return this.service.listCompetencies(tenantId, query);
  }

  // ============================================================
  // CICLOS
  // ============================================================

  @Post('cycles')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar ciclo de avaliação 360°' })
  async createCycle(@Body() dto: CreateEvaluationCycleDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createCycle(dto, String(user.id));
  }

  @Patch('cycles/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar ciclo (apenas em DRAFT)' })
  async updateCycle(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationCycleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateCycle(id, dto, String(user.id));
  }

  @Post('cycles/:id/publish')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publicar ciclo (DRAFT → PUBLISHED)' })
  async publishCycle(
    @Param('id') id: string,
    @Body() dto: PublishCycleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.publishCycle(id, dto, String(user.id));
  }

  @Get('cycles')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar ciclos de avaliação' })
  @ApiQuery({ name: 'tenantId', required: true })
  async listCycles(
    @Query('tenantId') tenantId: string,
    @Query() query: Evaluation360PaginationDto,
  ) {
    return this.service.listCycles(tenantId, query);
  }

  @Get('cycles/:id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Detalhe completo do ciclo (competências, questões, stats)' })
  async getCycleDetail(@Param('id') id: string) {
    return this.service.getCycleDetail(id);
  }

  @Post('cycles/:id/calculate')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Calcular resultados do ciclo' })
  async calculateResults(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.calculateCycleResults(id, String(user.id));
  }

  // ============================================================
  // QUESTÕES
  // ============================================================

  @Post('questions')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar questão (global ou vinculada a ciclo/competência)' })
  async createQuestion(
    @Body() dto: Evaluation360CreateQuestionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createQuestion(dto, String(user.id));
  }

  @Get('questions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar questões' })
  @ApiQuery({ name: 'cycleId', required: false })
  @ApiQuery({ name: 'competencyId', required: false })
  async listQuestions(
    @Query('cycleId') cycleId?: string,
    @Query('competencyId') competencyId?: string,
  ) {
    return this.service.listQuestions(cycleId, competencyId);
  }

  // ============================================================
  // PARTICIPANTES
  // ============================================================

  @Post('cycles/:id/participants')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar participantes (avaliados) ao ciclo' })
  async addParticipants(
    @Param('id') id: string,
    @Body() dto: AddParticipantsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addParticipants(id, dto, String(user.id));
  }

  @Post('cycles/:cycleId/participants/:userId/consent')
  @ApiOperation({ summary: 'Registar consentimento LGPD do participante' })
  async giveConsent(
    @Param('cycleId') cycleId: string,
    @Param('userId') userId: string,
    @Body() dto: ConsentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // A10-18: sem isto, qualquer autenticado podia forjar o consentimento
    // LGPD de outro colaborador. Consentimento é pessoal — só o próprio
    // participante (ou ADMIN/RH em correcção administrativa) pode registá-lo.
    assertCanAccess({}, userId, user, [Role.ADMIN, Role.RH]);
    return this.service.giveConsent(cycleId, userId, dto);
  }

  @Get('cycles/:cycleId/participants/:userId/progress')
  @ApiOperation({ summary: 'Progresso do participante no ciclo' })
  async getProgress(@Param('cycleId') cycleId: string, @Param('userId') userId: string) {
    return this.service.getParticipantProgress(cycleId, userId);
  }

  // ============================================================
  // AVALIADORES
  // ============================================================

  @Post('cycles/:id/evaluators/suggest')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Sugestão automática de avaliadores baseada em hierarquia' })
  async suggestEvaluators(@Param('id') id: string, @Body() dto: SuggestEvaluatorsDto) {
    return this.service.suggestEvaluators(id, dto);
  }

  @Post('cycles/:id/evaluators')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Atribuir avaliadores (bulk)' })
  async assignEvaluators(
    @Param('id') id: string,
    @Body() dto: BulkAssignEvaluatorsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.assignEvaluators(id, dto, user);
  }

  @Post('cycles/:id/evaluators/approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprovar avaliadores e enviar convites' })
  async approveEvaluators(
    @Param('id') id: string,
    @Body() dto: ApproveEvaluatorsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.approveEvaluators(id, dto, user);
  }

  @Post('cycles/:id/invites/send')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enviar convites para todos os avaliadores pendentes' })
  async sendInvites(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.sendCycleInvites(id, String(user.id));
  }

  @Post('cycles/:id/reminders')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enviar lembretes para avaliadores pendentes' })
  async sendReminders(
    @Param('id') id: string,
    @Body() dto: SendRemindersDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.sendReminders(id, dto, String(user.id));
  }

  // ============================================================
  // FORMULÁRIO E RESPOSTAS
  // ============================================================

  @Get('cycles/:cycleId/form')
  @ApiOperation({ summary: 'Obter formulário de avaliação para preenchimento' })
  @ApiQuery({ name: 'evaluateeId', required: true })
  async getForm(
    @Param('cycleId') cycleId: string,
    @Query('evaluateeId') evaluateeId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.getEvaluationForm(cycleId, String(user.id), evaluateeId);
  }

  @Post('cycles/:cycleId/responses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submeter ou guardar rascunho de avaliação' })
  @ApiQuery({ name: 'evaluateeId', required: true })
  async submitResponse(
    @Param('cycleId') cycleId: string,
    @Query('evaluateeId') evaluateeId: string,
    @Body() dto: SubmitResponseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.submitResponse(cycleId, String(user.id), evaluateeId, dto, String(user.id));
  }

  // ============================================================
  // RESULTADOS E ANALYTICS
  // ============================================================

  @Get('cycles/:cycleId/results/:participantId')
  @ApiOperation({ summary: 'Resultado individual (radar, gaps, forças)' })
  async getResult(
    @Param('cycleId') cycleId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.getParticipantResult(
      cycleId,
      participantId,
      String(user.id),
      user.role?.name,
    );
  }

  @Get('cycles/:cycleId/analytics/team')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Analytics da equipa (heatmap de competências)' })
  async getTeamAnalytics(@Param('cycleId') cycleId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.getTeamAnalytics(cycleId, String(user.id));
  }

  @Get('analytics/organizational')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Analytics organizacional (benchmark, gaps globais)' })
  async getOrgAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.service.getOrganizationalAnalytics(query);
  }

  @Get('analytics/nine-box')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Matriz Nine Box (Performance vs Potencial)' })
  async getNineBox(@Query() query: NineBoxQueryDto) {
    return this.service.getNineBox(query);
  }

  // ============================================================
  // RELATÓRIOS
  // ============================================================

  @Post('reports/generate')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gerar relatório (individual, equipa ou organizacional)' })
  async generateReport(@Body() dto: GenerateReportDto, @CurrentUser() user: CurrentUserData) {
    return this.service.generateReport(dto, String(user.id));
  }

  // ============================================================
  // CALIBRAÇÃO
  // ============================================================

  @Post('cycles/:cycleId/calibrate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Calibrar score de participante (matriz de calibração RH)' })
  async calibrateScore(
    @Param('cycleId') cycleId: string,
    @Body() dto: Evaluation360CalibrateScoreDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.calibrateScore(cycleId, dto, String(user.id));
  }

  // ============================================================
  // FEEDBACK CONTÍNUO
  // ============================================================

  @Post('feedback/continuous')
  @ApiOperation({ summary: 'Enviar feedback contínuo (elogio, desenvolvimento, check-in)' })
  async createFeedback(
    @Body() dto: CreateContinuousFeedbackDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createContinuousFeedback(dto, String(user.id));
  }

  @Get('feedback/continuous/:userId')
  @ApiOperation({ summary: 'Listar feedbacks recebidos por utilizador' })
  async listFeedback(@Param('userId') userId: string, @Query() query: Evaluation360PaginationDto) {
    return this.service.listFeedbackForUser(userId, query);
  }

  // ============================================================
  // PULSE SURVEYS
  // ============================================================

  @Post('pulse-surveys')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar pulse survey' })
  async createPulseSurvey(@Body() dto: CreatePulseSurveyDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createPulseSurvey(dto, String(user.id));
  }

  @Post('pulse-surveys/:id/responses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Responder pulse survey' })
  async submitPulseResponse(
    @Param('id') surveyId: string,
    @Body() dto: SubmitPulseSurveyDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.submitPulseSurveyResponse(surveyId, String(user.id), dto);
  }
}

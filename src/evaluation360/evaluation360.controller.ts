// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — CONTROLLER
// src/modules/evaluation360/evaluation360.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
  AddParticipantsByDepartmentDto,
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
  CycleReportQueryDto,
  CycleEvolutionQueryDto,
  CycleFeedbackQueryDto,
  SendRemindersDto,
  Evaluation360PaginationDto,
  ListEvaluationCyclesDto,
  ListCycleParticipantsDto,
  ListCycleEvaluatorsDto,
  CreateEvaluationQuestionnaireDto,
  UpdateEvaluationQuestionnaireDto,
  ListQuestionnairesDto,
  QuestionnaireQuestionDto,
} from './evaluation360.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { assertCanAccess } from '../common/authz/ownership';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserData } from '../common/types/current-user';

// Quem pode criar/publicar questionários 360º e distribuí-los automaticamente
// — mesmo grupo de EVAL_CREATOR_ROLES em src/assessments/assessments.controller.ts
// e frontend/lib/roles.ts. O banco de competências (createCompetency)
// continua ADMIN/RH só — não é "criar questionário".
const EVAL_CREATOR_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR, Role.DIRECTOR, Role.LIDER] as const;

// Quem pode eliminar/restaurar um ciclo — mais restrito que EVAL_CREATOR_ROLES:
// eliminar é uma acção destrutiva (mesmo sendo soft delete e reversível via o
// separador "Apagados" da auditoria), por isso fica só para ADMIN/DIRECTOR,
// espelhado em frontend/lib/roles.ts (EVAL_CYCLE_DELETE_ROLES).
const EVAL_CYCLE_DELETE_ROLES = [Role.ADMIN, Role.DIRECTOR] as const;

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
  @ApiQuery({
    name: 'tag',
    required: false,
    description: 'Filtra pelo array `tags` (ex.: FEEDBACK — banco curado do feedback contínuo)',
  })
  async listCompetencies(
    @Query('tenantId') tenantId?: string,
    @Query() query?: Evaluation360PaginationDto,
    @Query('tag') tag?: string,
  ) {
    return this.service.listCompetencies(tenantId, query, tag);
  }

  // ============================================================
  // CICLOS
  // ============================================================

  @Post('cycles')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Criar ciclo de avaliação 360°' })
  async createCycle(@Body() dto: CreateEvaluationCycleDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createCycle(dto, String(user.id));
  }

  @Patch('cycles/:id')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Actualizar ciclo (apenas em DRAFT)' })
  async updateCycle(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationCycleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateCycle(id, dto, String(user.id));
  }

  @Post('cycles/:id/publish')
  @Roles(...EVAL_CREATOR_ROLES)
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
  // Leitura aberta a todos os autenticados (não só EVAL_CREATOR_ROLES): o
  // frontend precisa de listar ciclos para QUALQUER utilizador descobrir o
  // ciclo activo e preencher a sua auto-avaliação — só a criação/distribuição
  // é restrita.
  @ApiOperation({
    summary:
      'Listar ciclos de avaliação (aba "Avaliações 360°" — nome, código, tipo, período, ' +
      'nº de avaliados/avaliadores, taxa de participação, criado por)',
  })
  @ApiQuery({ name: 'tenantId', required: true })
  async listCycles(@Query('tenantId') tenantId: string, @Query() query: ListEvaluationCyclesDto) {
    return this.service.listCycles(tenantId, query);
  }

  @Get('overview')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.DIRECTOR)
  @ApiOperation({
    summary:
      'Painel geral das avaliações 360° (docs/evaluation360.md §1) — contagens por estado, ' +
      'participação/conclusão, médias por competência, prazos próximos e últimas avaliações',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  async getOverview(@Query('tenantId') tenantId?: string) {
    return this.service.getOverview(tenantId);
  }

  // Rota literal 'cycles/deleted' TEM de vir antes de 'cycles/:id' — caso
  // contrário 'deleted' seria capturado pelo :id e esta rota ficaria
  // inalcançável (mesma classe de bug de project_innova_route_shadowing).
  @Get('cycles/deleted')
  @Roles(...EVAL_CYCLE_DELETE_ROLES)
  @ApiOperation({
    summary: 'Listar ciclos eliminados (soft delete) — separador Apagados da auditoria',
  })
  @ApiQuery({ name: 'tenantId', required: false })
  async listDeletedCycles(@Query('tenantId') tenantId?: string) {
    return this.service.listDeletedCycles(tenantId);
  }

  @Get('cycles/:id')
  @ApiOperation({ summary: 'Detalhe completo do ciclo (competências, questões, stats)' })
  async getCycleDetail(@Param('id') id: string) {
    return this.service.getCycleDetail(id);
  }

  @Delete('cycles/:id')
  @Roles(...EVAL_CYCLE_DELETE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar ciclo (soft delete, auditável e restaurável)' })
  async deleteCycle(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.deleteCycle(id, String(user.id));
  }

  @Post('cycles/:id/restore')
  @Roles(...EVAL_CYCLE_DELETE_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar ciclo eliminado' })
  async restoreCycle(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.restoreCycle(id, String(user.id));
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
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Criar questão (global ou vinculada a ciclo/competência)' })
  async createQuestion(
    @Body() dto: Evaluation360CreateQuestionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createQuestion(dto, String(user.id));
  }

  @Get('questions')
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
  // QUESTIONÁRIOS (docs/evaluation360.md §6)
  // ============================================================

  @Post('questionnaires')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({
    summary: 'Criar questionário reutilizável (nome, escala, competências, perguntas)',
  })
  async createQuestionnaire(
    @Body() dto: CreateEvaluationQuestionnaireDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createQuestionnaire(dto, String(user.id));
  }

  @Get('questionnaires')
  @ApiOperation({ summary: 'Listar questionários (aba "Questionários")' })
  async listQuestionnaires(@Query() query: ListQuestionnairesDto) {
    return this.service.listQuestionnaires(query);
  }

  @Get('questionnaires/:id')
  @ApiOperation({ summary: 'Detalhe do questionário (competências + perguntas)' })
  async getQuestionnaireDetail(@Param('id') id: string) {
    return this.service.getQuestionnaireDetail(id);
  }

  @Patch('questionnaires/:id')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Actualizar questionário (apenas em rascunho)' })
  async updateQuestionnaire(
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationQuestionnaireDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateQuestionnaire(id, dto, String(user.id));
  }

  @Post('questionnaires/:id/publish')
  @Roles(...EVAL_CREATOR_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publicar questionário (DRAFT → PUBLISHED)' })
  async publishQuestionnaire(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.publishQuestionnaire(id, String(user.id));
  }

  @Post('questionnaires/:id/archive')
  @Roles(...EVAL_CREATOR_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arquivar questionário' })
  async archiveQuestionnaire(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.archiveQuestionnaire(id, String(user.id));
  }

  @Delete('questionnaires/:id')
  @Roles(...EVAL_CREATOR_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Eliminar questionário (só se nunca usado por um ciclo)' })
  async deleteQuestionnaire(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.deleteQuestionnaire(id, String(user.id));
  }

  @Post('questionnaires/:id/questions')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Adicionar pergunta ao questionário' })
  async addQuestionnaireQuestion(
    @Param('id') id: string,
    @Body() dto: QuestionnaireQuestionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addQuestionnaireQuestion(id, dto, String(user.id));
  }

  @Delete('questionnaires/:id/questions/:questionId')
  @Roles(...EVAL_CREATOR_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover pergunta do questionário' })
  async removeQuestionnaireQuestion(
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeQuestionnaireQuestion(id, questionId, String(user.id));
  }

  // ============================================================
  // PARTICIPANTES
  // ============================================================

  @Post('cycles/:id/participants')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Adicionar participantes (avaliados) ao ciclo' })
  async addParticipants(
    @Param('id') id: string,
    @Body() dto: AddParticipantsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addParticipants(id, dto, String(user.id));
  }

  @Post('cycles/:id/participants/by-department')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({
    summary: 'Adicionar todos os utilizadores activos de departamentos como participantes',
  })
  async addParticipantsByDepartment(
    @Param('id') id: string,
    @Body() dto: AddParticipantsByDepartmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addParticipantsByDepartment(id, dto, String(user.id));
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

  @Get('cycles/:cycleId/my-assignments')
  @ApiOperation({
    summary: 'As minhas atribuições de avaliador neste ciclo (quem tenho de avaliar)',
  })
  async getMyAssignments(@Param('cycleId') cycleId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.listMyAssignments(cycleId, String(user.id));
  }

  @Get('cycles/:cycleId/participants/:userId/progress')
  @ApiOperation({ summary: 'Progresso do participante no ciclo' })
  async getProgress(@Param('cycleId') cycleId: string, @Param('userId') userId: string) {
    return this.service.getParticipantProgress(cycleId, userId);
  }

  @Get('cycles/:cycleId/participants')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Listar avaliados do ciclo (docs/evaluation360.md §4)' })
  async listParticipants(
    @Param('cycleId') cycleId: string,
    @Query() query: ListCycleParticipantsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.listCycleParticipants(cycleId, query, user);
  }

  @Get('cycles/:cycleId/participants/:userId/detail')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({
    summary:
      'Detalhe de um avaliado: perfil, competências, avaliadores, progresso, resultados e comentários',
  })
  async getParticipantDetail(
    @Param('cycleId') cycleId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.getParticipantDetailForAdmin(cycleId, userId, user);
  }

  // ============================================================
  // AVALIADORES
  // ============================================================

  @Get('cycles/:cycleId/evaluators')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Listar avaliadores do ciclo (docs/evaluation360.md §5)' })
  async listEvaluators(
    @Param('cycleId') cycleId: string,
    @Query() query: ListCycleEvaluatorsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.listCycleEvaluators(cycleId, query, user);
  }

  @Post('cycles/:id/evaluators/suggest')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Sugestão automática de avaliadores baseada em hierarquia' })
  async suggestEvaluators(@Param('id') id: string, @Body() dto: SuggestEvaluatorsDto) {
    return this.service.suggestEvaluators(id, dto);
  }

  @Post('cycles/:id/evaluators')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Atribuir avaliadores (bulk)' })
  async assignEvaluators(
    @Param('id') id: string,
    @Body() dto: BulkAssignEvaluatorsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.assignEvaluators(id, dto, user);
  }

  @Post('cycles/:id/evaluators/approve')
  @Roles(...EVAL_CREATOR_ROLES)
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
  @Roles(...EVAL_CREATOR_ROLES)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enviar convites para todos os avaliadores pendentes' })
  async sendInvites(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.sendCycleInvites(id, String(user.id));
  }

  @Post('cycles/:id/reminders')
  @Roles(...EVAL_CREATOR_ROLES)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enviar lembretes para avaliadores pendentes' })
  async sendReminders(
    @Param('id') id: string,
    @Body() dto: SendRemindersDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.sendReminders(id, dto, String(user.id));
  }

  @Post('cycles/:id/distribute')
  @Roles(...EVAL_CREATOR_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Distribuir automaticamente: sugere+atribui avaliadores (self/gestor/pares do ' +
      'departamento/subordinados) a todos os participantes, publica o ciclo e envia convites',
  })
  async distributeCycle(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.distributeCycle(id, String(user.id));
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

  @Get('cycles/:cycleId/results')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary:
      'Separador "Resultados" (docs/evaluation360.md §7) — uma linha por avaliado × ' +
      'competência do ciclo (auto/gestor/pares/subordinados/outras, média, nível ' +
      'esperado, gap, nº de respostas). Só ADMIN/RH — ninguém vê o resultado de ' +
      'outro utilizador fora daqui (ver getParticipantResult).',
  })
  async getCycleResults(@Param('cycleId') cycleId: string) {
    return this.service.getCycleResultsMatrix(cycleId);
  }

  @Get('cycles/:cycleId/results/:participantId')
  @ApiOperation({ summary: 'Resultado individual (radar, gaps, forças)' })
  async getResult(
    @Param('cycleId') cycleId: string,
    @Param('participantId') participantId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.getParticipantResult(cycleId, participantId, String(user.id));
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

  // GESTOR removido: a matriz mostrava nome+score reais por pessoa a quem a
  // pedisse, incluindo o gestor sobre os seus subordinados — a mesma
  // violação de "ninguém vê o resultado de outro" já corrigida em
  // getTeamAnalytics/calibrateScore. Ver getNineBox() para a versão
  // agregada (contagens por box, sem identificar ninguém) que substituiu a
  // anterior; ADMIN/RH continuam a poder vê-la para planeamento de sucessão
  // ao nível organizacional, nunca ao nível de um indivíduo.
  @Get('analytics/nine-box')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary: 'Matriz Nine Box agregada (contagens por quadrante, sem identificar ninguém)',
  })
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

  // Separador "Relatórios" (docs/evaluation360.md §9) — mesmo grupo de
  // papéis que já vê o Painel Geral agregado (adminOverview no frontend,
  // EVAL_OVERVIEW_ROLES): resultado geral, por competência/departamento/
  // cargo/unidade/grupo de avaliador, comparações, pontos fortes/gaps,
  // taxas, avaliadores pendentes e competências críticas — tudo à escala de
  // UM ciclo.
  @Get('cycles/:cycleId/reports')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.DIRECTOR)
  @ApiOperation({ summary: 'Relatório completo de um ciclo (docs/evaluation360.md §9)' })
  async getCycleReport(@Param('cycleId') cycleId: string, @Query() query: CycleReportQueryDto) {
    return this.service.getCycleReport(cycleId, query);
  }

  // "Evolução entre ciclos"/"Comparação entre ciclos" (§9) — mesma rota,
  // `cycleIds` restringe a comparação a ciclos escolhidos.
  @Get('reports/evolution')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.DIRECTOR)
  @ApiOperation({ summary: 'Evolução/comparação de métricas agregadas entre ciclos' })
  async getCycleEvolution(@Query() query: CycleEvolutionQueryDto) {
    return this.service.getCycleEvolution(query);
  }

  // Nota: POST cycles/:cycleId/calibrate (matriz de calibração RH) foi
  // removido — ver evaluation360.service.ts, secção de comentário no lugar
  // de calibrateScore().

  // ============================================================
  // FEEDBACK (docs/evaluation360.md §8)
  // ============================================================

  // Comentários qualitativos das respostas já submetidas num ciclo —
  // distinto do feedback contínuo abaixo (esse é sempre "recebido por mim",
  // fora de qualquer ciclo). Mesmo grupo de papéis que já gere
  // participantes/avaliadores (EVAL_CREATOR_ROLES); GESTOR/LIDER só veem a
  // sua equipa directa (ownership resolvida no service).
  @Get('cycles/:cycleId/feedback')
  @Roles(...EVAL_CREATOR_ROLES)
  @ApiOperation({ summary: 'Feedback qualitativo de um ciclo (docs/evaluation360.md §8)' })
  async getCycleFeedback(
    @Param('cycleId') cycleId: string,
    @Query() query: CycleFeedbackQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.getCycleFeedback(cycleId, query, user);
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

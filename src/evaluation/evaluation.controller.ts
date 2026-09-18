// src/evaluation/evaluation.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EvaluationService } from './evaluation.service';
import { PdfService } from '../pdf/pdf.service';
import { buildCsvString } from '../common/utils/csv-export.util';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { assertCanAccess, isPrivileged } from '../common/authz/ownership';
import { Role, AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
import {
  CreateCycleDto,
  UpdateCycleDto,
  CycleFilterDto,
  CreateFormDto,
  SubmitEvaluationDto,
  AssignEvaluatorDto,
  BulkAssignDto,
  CalibrateScoreDto,
  EvaluationAnalyticsFilterDto,
  CreateEvaluationDto,
  CreateScaleDto,
  UpdateScaleDto,
  CreateCriteriaDto,
  UpdateCriteriaDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  EvaluationRequestFilterDto,
  UpdateEvaluationRequestDto,
  ScheduleOneOnOneDto,
  RegisterOneOnOneDto,
  EvaluationReportFilterDto,
} from './evaluation.dto';

const ALL_ROLES = AUTHENTICATED_ROLES;
const MGMT_ROLES = [Role.ADMIN, Role.RH, Role.LIDER, Role.GESTOR] as const;
const ADMIN_ROLES = [Role.ADMIN, Role.RH] as const;

@ApiTags('Evaluation 360°')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('evaluations')
export class EvaluationController {
  constructor(
    private readonly svc: EvaluationService,
    private readonly pdf: PdfService,
  ) {}

  // ─── Cycles ──────────────────────────────────────────────────

  @Post('cycles')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar ciclo de avaliação com pesos por tipo de avaliador' })
  createCycle(@Body() dto: CreateCycleDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createCycle(dto, user.id);
  }

  @Get('cycles')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Listar ciclos de avaliação (leitura aberta a todos — só gestão é MGMT/ADMIN)',
  })
  getCycles(@Query() filters: CycleFilterDto) {
    return this.svc.getCycles(filters);
  }

  @Get('cycles/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe do ciclo com taxa de participação' })
  getCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getCycle(id);
  }

  @Patch('cycles/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Actualizar ciclo (datas, status)' })
  updateCycle(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCycleDto) {
    return this.svc.updateCycle(id, dto);
  }

  @Post('cycles/:id/publish')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Publicar ciclo (DRAFT → PUBLISHED)' })
  publishCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishCycle(id);
  }

  @Post('cycles/:id/activate')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Activar ciclo — auto-assign pedidos + notificar participantes' })
  activateCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.activateCycle(id);
  }

  @Patch('cycles/:id/pause')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Pausar ciclo' })
  pauseCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.pauseCycle(id);
  }

  @Patch('cycles/:id/close')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Encerrar ciclo' })
  closeCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.closeCycle(id);
  }

  @Patch('cycles/:id/reopen')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Reabrir ciclo pausado/encerrado' })
  reopenCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.reopenCycle(id);
  }

  @Post('cycles/:id/remind')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Enviar lembrete a todos os participantes pendentes do ciclo' })
  remindCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remindCycleParticipants(id);
  }

  // ─── Forms ───────────────────────────────────────────────────

  @Post('forms')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar formulário de avaliação com perguntas por competência' })
  createForm(@Body() dto: CreateFormDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createForm(dto, user.id);
  }

  @Get('forms')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Listar formulários (incluindo templates)' })
  getForms() {
    return this.svc.getForms();
  }

  @Get('forms/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Detalhe do formulário com perguntas' })
  getForm(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getForm(id);
  }

  // ─── Scales ──────────────────────────────────────────────────

  @Post('scales')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar escala de avaliação com níveis' })
  createScale(@Body() dto: CreateScaleDto) {
    return this.svc.createScale(dto);
  }

  @Get('scales')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Listar escalas de avaliação' })
  getScales() {
    return this.svc.getScales();
  }

  @Get('scales/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Detalhe da escala com níveis' })
  getScale(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getScale(id);
  }

  @Patch('scales/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Actualizar escala' })
  updateScale(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateScaleDto) {
    return this.svc.updateScale(id, dto);
  }

  // ─── Criteria ────────────────────────────────────────────────

  @Post('criteria')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar critério de avaliação' })
  createCriteria(@Body() dto: CreateCriteriaDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createCriteria(dto, user.id);
  }

  @Get('criteria')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Listar critérios de avaliação' })
  getCriteria(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.svc.getCriteria({ category, includeInactive: includeInactive === 'true' });
  }

  @Patch('criteria/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Actualizar critério de avaliação' })
  updateCriteria(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCriteriaDto) {
    return this.svc.updateCriteria(id, dto);
  }

  @Delete('criteria/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Remover critério de avaliação (soft delete)' })
  deleteCriteria(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteCriteria(id);
  }

  // ─── Templates (Modelos) ──────────────────────────────────────

  @Post('templates')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar modelo de avaliação com critérios ponderados' })
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createTemplate(dto, user.id);
  }

  @Get('templates')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Listar modelos de avaliação' })
  getTemplates() {
    return this.svc.getTemplates();
  }

  @Get('templates/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Detalhe do modelo com critérios' })
  getTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTemplate(id);
  }

  @Patch('templates/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Actualizar modelo de avaliação' })
  updateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto) {
    return this.svc.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Remover modelo de avaliação (soft delete)' })
  deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteTemplate(id);
  }

  // ─── Assignments ─────────────────────────────────────────────

  @Post('assign')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Atribuir avaliador a um colaborador' })
  assign(@Body() dto: AssignEvaluatorDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.assignEvaluator(dto, user);
  }

  @Post('bulk-assign')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Atribuição em massa de avaliadores num ciclo' })
  bulkAssign(@Body() dto: BulkAssignDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.bulkAssign(dto, user);
  }

  // ─── Evaluation Requests — aba "Avaliações" (docs/modulo_evaluation.md pt.2) ──

  @Get('requests')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Listar avaliações (1 linha por colaborador avaliado)' })
  listRequests(@Query() filters: EvaluationRequestFilterDto) {
    return this.svc.getEvaluationRequestsList(filters);
  }

  @Get('requests/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Detalhe de uma avaliação (com pedidos irmãos + resultado)' })
  getRequestDetail(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getEvaluationRequestDetail(id);
  }

  @Patch('requests/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Editar avaliação (nome, tipo, objectivos, prazo)' })
  updateRequest(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEvaluationRequestDto) {
    return this.svc.updateEvaluationRequest(id, dto);
  }

  @Post('requests/:id/remind')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Enviar lembrete ao avaliador desta avaliação' })
  remindRequest(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remindEvaluationRequest(id);
  }

  @Patch('requests/:id/finish')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Finalizar avaliação' })
  finishRequest(@Param('id', ParseIntPipe) id: number) {
    return this.svc.finishEvaluationRequest(id);
  }

  @Patch('requests/:id/reopen')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Reabrir avaliação finalizada' })
  reopenRequest(@Param('id', ParseIntPipe) id: number) {
    return this.svc.reopenEvaluationRequest(id);
  }

  @Post('requests/:id/advance-stage')
  @Roles(...MGMT_ROLES)
  @ApiOperation({
    summary:
      'Avançar a etapa do fluxo (Autoavaliação→Gestor→RH→Calibração→1:1→Aprovação→Resultado)',
  })
  advanceStage(@Param('id', ParseIntPipe) id: number) {
    return this.svc.advanceStage(id);
  }

  // ─── Submit ──────────────────────────────────────────────────

  @Post('submit')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Submeter avaliação (ou guardar rascunho)' })
  submit(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitEvaluationDto) {
    return this.svc.submitEvaluation(user.id, dto);
  }

  // ─── Legacy endpoint (backward compat) ───────────────────────

  @Post()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: '[Legacy] Submeter avaliação simples (compatibilidade)' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateEvaluationDto) {
    return this.svc.create(user.id, dto);
  }

  // ─── Overview — aba "Visão Geral" (docs/modulo_evaluation.md pt.1) ──

  @Get('overview')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary:
      'Dashboard "Visão Geral" — KPIs organizacionais (gestão) ou progresso pessoal (colaborador)',
  })
  overview(@CurrentUser() user: CurrentUserData) {
    const privileged = isPrivileged(user, [...MGMT_ROLES]);
    return this.svc.getOverviewDashboard(user.id, privileged);
  }

  // ─── Pending / My evaluations ────────────────────────────────

  @Get('pending')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Avaliações que me estão pendentes' })
  pending(@CurrentUser() user: CurrentUserData) {
    return this.svc.getPendingEvaluations(user.id);
  }

  @Get('my-progress')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'O meu progresso de avaliações (taxa de conclusão)' })
  myProgress(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyProgress(user.id);
  }

  @Get('my-evaluations')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'As minhas avaliações recebidas' })
  myEvals(@CurrentUser() user: CurrentUserData, @Query('period') period?: string) {
    return this.svc.findByUser(user.id, period);
  }

  @Get('user/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Avaliações recebidas por um colaborador' })
  byUser(@Param('userId', ParseIntPipe) id: number, @Query('period') period?: string) {
    return this.svc.findByUser(id, period);
  }

  @Get('summary/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Sumário de avaliação por período' })
  summary(@Param('userId', ParseIntPipe) id: number, @Query('period') period: string) {
    return this.svc.getSummary(id, period);
  }

  // ─── Results ─────────────────────────────────────────────────

  @Get('results/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Resultados 360° completos (score, concordância, competências, qualitativo)',
  })
  results(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('cycleId') cycleId: string | undefined,
    @Query('period') period: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    // A10-3: sem esta verificação, qualquer COLABORADOR lia o 360 completo
    // (score, nomes de avaliadores, texto qualitativo) de qualquer colega.
    assertCanAccess({}, userId, user, [Role.ADMIN, Role.RH, Role.LIDER, Role.GESTOR]);
    return this.svc.getResults(userId, cycleId ? +cycleId : undefined, period);
  }

  @Get('evolution/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Evolução do colaborador ao longo dos ciclos' })
  evolution(@Param('userId', ParseIntPipe) userId: number, @CurrentUser() user: CurrentUserData) {
    assertCanAccess({}, userId, user, [Role.ADMIN, Role.RH, Role.LIDER, Role.GESTOR]);
    return this.svc.getUserEvolution(userId);
  }

  // ─── Calibration (docs/modulo_evaluation.md ponto 9) ──────────

  @Get('calibration/:cycleId')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Painel de calibração — dispersão, percentil, avaliadores com viés' })
  calibrationPanel(
    @Param('cycleId', ParseIntPipe) cycleId: number,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.svc.getCycleForCalibration(cycleId, departmentId ? +departmentId : undefined);
  }

  @Post('calibration/:cycleId/open')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Abrir calibração do ciclo (status → CALIBRATING)' })
  openCalibration(@Param('cycleId', ParseIntPipe) cycleId: number) {
    return this.svc.openCalibration(cycleId);
  }

  @Post('calibration/:cycleId/confirm')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary: 'Confirmar calibração — fecha a janela e avança o fluxo das avaliações calibradas',
  })
  confirmCalibration(@Param('cycleId', ParseIntPipe) cycleId: number) {
    return this.svc.confirmCalibration(cycleId);
  }

  @Get('calibration/:cycleId/history')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Histórico de alterações de calibração do ciclo' })
  calibrationHistory(
    @Param('cycleId', ParseIntPipe) cycleId: number,
    @Query('evaluatedId') evaluatedId?: string,
  ) {
    return this.svc.getCalibrationHistory(cycleId, evaluatedId ? +evaluatedId : undefined);
  }

  @Post('calibration/:cycleId/calibrate')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Calibrar score de um colaborador num ciclo' })
  calibrate(
    @Param('cycleId', ParseIntPipe) cycleId: number,
    @Body() dto: CalibrateScoreDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.calibrateScore(cycleId, dto, user.id);
  }

  // ─── Analytics ───────────────────────────────────────────────

  @Get('analytics/dashboard')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary: 'Dashboard de analytics — distribuição, top performers, por departamento',
  })
  analyticsDashboard(@Query() filters: EvaluationAnalyticsFilterDto) {
    return this.svc.getAnalyticsDashboard(filters);
  }

  @Get('analytics/team/:managerId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Dashboard da equipa do gestor (ranking + pendentes + percentil)' })
  teamDashboard(
    @Param('managerId', ParseIntPipe) managerId: number,
    @Query('cycleId') cycleId?: string,
  ) {
    return this.svc.getTeamDashboard(managerId, cycleId ? +cycleId : undefined);
  }

  // ─── Auto PDI ────────────────────────────────────────────────

  @Post('results/:userId/trigger-pdi')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Gerar sugestão de PDI baseada nos gaps identificados' })
  triggerPDI(@Param('userId', ParseIntPipe) userId: number, @Query('cycleId') cycleId?: string) {
    return this.svc.triggerPDIFromResults(userId, cycleId ? +cycleId : undefined);
  }

  // ─── Conversa 1:1 (docs/modulo_evaluation.md ponto 10) ────────

  @Get('requests/:id/one-on-one')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Ver a conversa 1:1 ligada a esta avaliação (se existir)' })
  getOneOnOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getOneOnOne(id);
  }

  @Post('requests/:id/one-on-one')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Agendar a conversa 1:1 pós-avaliação' })
  scheduleOneOnOne(@Param('id', ParseIntPipe) id: number, @Body() dto: ScheduleOneOnOneDto) {
    return this.svc.scheduleOneOnOne(id, dto);
  }

  @Patch('requests/:id/one-on-one')
  @Roles(...MGMT_ROLES)
  @ApiOperation({
    summary: 'Registar a conversa 1:1 (pontos discutidos, compromissos, próxima reunião...)',
  })
  registerOneOnOne(@Param('id', ParseIntPipe) id: number, @Body() dto: RegisterOneOnOneDto) {
    return this.svc.registerOneOnOne(id, dto);
  }

  // ─── Relatórios (docs/modulo_evaluation.md ponto 11) ──────────

  @Get('reports/overview')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary:
      'Relatórios de avaliação para RH — por departamento/unidade/cargo/gestor, gaps de competências, objetivos, evolução',
  })
  reportsOverview(@Query() filters: EvaluationReportFilterDto) {
    return this.svc.getReportsOverview(filters);
  }

  @Get('reports/export.csv')
  @Roles(...ADMIN_ROLES)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="avaliacoes.csv"')
  @ApiOperation({ summary: 'Exportar relatório de avaliação como CSV' })
  async exportReportCsv(@Query() filters: EvaluationReportFilterDto) {
    const data = await this.svc.getReportsOverview(filters);
    const rows = [
      ...data.byDepartment.map(d => ({
        grupo: 'Departamento',
        nome: d.name,
        media: d.avgScore,
        total: d.count,
      })),
      ...data.byPosition.map(p => ({
        grupo: 'Cargo',
        nome: p.name,
        media: p.avgScore,
        total: p.count,
      })),
      ...data.byManager.map(m => ({
        grupo: 'Gestor',
        nome: m.name,
        media: m.avgScore,
        total: m.count,
      })),
    ];
    return buildCsvString(rows, ['grupo', 'nome', 'media', 'total']);
  }

  @Get('reports/export.xlsx')
  @Roles(...ADMIN_ROLES)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="avaliacoes.xlsx"')
  @ApiOperation({ summary: 'Exportar relatório de avaliação como XLSX' })
  async exportReportXlsx(@Query() filters: EvaluationReportFilterDto) {
    const data = await this.svc.getReportsOverview(filters);
    const rows = [
      ...data.byDepartment.map(d => ({
        grupo: 'Departamento',
        nome: d.name,
        media: d.avgScore,
        total: d.count,
      })),
      ...data.byPosition.map(p => ({
        grupo: 'Cargo',
        nome: p.name,
        media: p.avgScore,
        total: p.count,
      })),
      ...data.byManager.map(m => ({
        grupo: 'Gestor',
        nome: m.name,
        media: m.avgScore,
        total: m.count,
      })),
    ];
    const buffer = await buildXlsxBuffer(rows, ['grupo', 'nome', 'media', 'total'], 'Avaliações');
    return new StreamableFile(buffer);
  }

  @Get('reports/export.pdf')
  @Roles(...ADMIN_ROLES)
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="avaliacoes.pdf"')
  @ApiOperation({ summary: 'Exportar relatório de avaliação como PDF' })
  async exportReportPdf(@Query() filters: EvaluationReportFilterDto) {
    const data = await this.svc.getReportsOverview(filters);
    const buffer = await this.pdf.generateExecutiveReport({
      title: 'Relatório de Avaliações',
      period: filters.period ?? 'Todos os períodos',
      metrics: [
        { label: 'Total de Avaliações', value: data.totalEvaluations },
        { label: 'Score Médio', value: data.avgScore },
        { label: 'Taxa de Conclusão', value: `${data.completionRate}%` },
      ],
      sections: [
        {
          title: 'Por Departamento',
          content:
            data.byDepartment
              .map(d => `${d.name}: ${d.avgScore} (${d.count} avaliações)`)
              .join('\n') || 'Sem dados.',
        },
        {
          title: 'Gaps de Competências',
          content:
            data.competencyGaps
              .map(c => `${c.name}: média ${c.avgScore}, gap ${c.gap}`)
              .join('\n') || 'Sem gaps identificados.',
        },
      ],
    });
    return new StreamableFile(buffer);
  }

  // ─── Configurações (docs/modulo_evaluation.md ponto 12) ───────

  @Get('settings')
  @Roles(...MGMT_ROLES)
  @ApiOperation({
    summary: 'Configurações agregadas — escalas, critérios, modelos, fluxo, tipos, estados',
  })
  settings() {
    return this.svc.getSettings();
  }
}

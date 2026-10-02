// src/executive-reports/executive-reports.controller.ts
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
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ExecutiveReportsService } from './executive-reports.service';
import {
  CreateExecutiveReportDto,
  UpdateExecutiveReportDto,
  ExecutiveReportsReportFilterDto,
  ApproveReportDto,
  ReportType,
} from './executive-reports.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { ExecutiveFiltersDto } from './dto/executive-filters.dto';
import { ExecutiveReportsGenerationService } from './executive-reports.generation.service';
import { ExecutiveReportsSchedulerService } from './executive-reports.scheduler.service';
import { ExecutiveReportsAlertsService } from './executive-reports.alerts.service';
import { ExecutiveReportsAuditService } from './executive-reports.audit.service';
import { ExecutiveReportsDataService } from './executive-reports.data.service';
import { AuditQueryDto, UpdateKpiDefinitionDto } from './dto/executive-audit.dto';
import {
  ArchiveFilterDto,
  CreateScheduleDto,
  CustomReportConfigDto,
  ExportQueryDto,
  GenerateCustomReportDto,
  GenerateExecutiveReportDto,
  SaveReportTemplateDto,
  UpdateReportTemplateDto,
  UpdateScheduleDto,
} from './dto/executive-generation.dto';
import {
  AlertActionDto,
  AlertAssignDto,
  AlertFilterDto,
  UpdateAlertRuleDto,
} from './dto/executive-alerts.dto';

const EXEC_FULL = [Role.ADMIN, Role.RH, Role.DIRECTOR] as const;
const EXEC_MGMT = [...EXEC_FULL, Role.GESTOR, Role.LIDER] as const;

@ApiTags('Executive Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('executive-reports')
export class ExecutiveReportsController {
  constructor(
    private readonly svc: ExecutiveReportsService,
    private readonly generation: ExecutiveReportsGenerationService,
    private readonly schedules: ExecutiveReportsSchedulerService,
    private readonly alerts: ExecutiveReportsAlertsService,
    private readonly audit: ExecutiveReportsAuditService,
    private readonly data: ExecutiveReportsDataService,
  ) {}

  private async auditSchedule<T>(
    user: CurrentUserData,
    action: 'SCHEDULE_CREATE' | 'SCHEDULE_UPDATE' | 'SCHEDULE_DELETE',
    scheduleId: number,
    dto: object,
    result: T,
  ): Promise<T> {
    await this.audit.record({ userId: user.id, action, filters: { scheduleId, ...dto } });
    return result;
  }

  // ── Dashboard executivo (docs/Executive_Reports.md §1-3) ──────────────────
  // Declarados antes de `:id` para não serem apanhados pelo ParseIntPipe.

  @Get('tabs')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Separadores visíveis para o papel do utilizador' })
  tabs(@CurrentUser() user: CurrentUserData) {
    return this.svc.getTabs(user);
  }

  @Get('overview')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Visão Executiva — KPIs, indicadores complementares e alertas' })
  overview(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.svc.getOverview(user, filters);
  }

  @Get('kpis')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'KPIs executivos com meta, variação, tendência e fonte' })
  kpis(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.svc.getKpis(user, filters);
  }

  @Get('charts/departments')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Comparação entre departamentos + composição (§6.2/6.3)' })
  chartsDepartments(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.svc.getDepartmentCharts(user, filters);
  }

  @Get('charts/goals')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Realizado vs. meta e execução de planos (§6.4)' })
  chartsGoals(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.svc.getGoalCharts(user, filters);
  }

  @Get('charts/risks')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Mapa de calor e listas de excepções (§6.5)' })
  chartsRisks(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.svc.getRiskCharts(user, filters);
  }

  @Get('sources')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Matriz de integração por módulo (§4.1)' })
  sources(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.svc.getSources(user, filters);
  }

  @Get('filter-options')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Opções dos filtros adicionais (cargo, vínculo, curso, estado)' })
  filterOptions() {
    return this.svc.getFilterOptions();
  }

  @Get('kpis/definitions')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Definições dos KPIs (fórmula, fonte, meta, limiares)' })
  kpiDefinitions() {
    return this.svc.getKpiDefinitions();
  }

  // ── Modelos, geração e relatórios personalizados (§7/§8) ──────────────────

  @Patch('kpis/definitions/:code')
  @Roles(Role.ADMIN, Role.DIRECTOR)
  @ApiOperation({ summary: 'Alterar meta, limiares e responsável de um KPI (fórmula imutável)' })
  updateKpiDefinition(
    @Param('code') code: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateKpiDefinitionDto,
  ) {
    return this.svc.updateKpiDefinition(code, dto, user);
  }

  // ── Vistas por domínio (§10) ──────────────────────────────────────────────

  @Get('workforce')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Colaboradores: quadro, movimentos e onboarding' })
  workforce(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.data.domain(user, 'workforce', filters);
  }

  @Get('training')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Formação: inscrições, conclusão e horas' })
  training(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.data.domain(user, 'training', filters);
  }

  @Get('performance')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Desempenho e talento: avaliações, competências e PDI' })
  performance(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.data.domain(user, 'performance', filters);
  }

  @Get('attendance')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Assiduidade e ausências' })
  attendance(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.data.domain(user, 'attendance', filters);
  }

  @Get('organization')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Comparação entre unidades/departamentos' })
  organization(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.data.domain(user, 'organization', filters);
  }

  @Get('costs')
  @Roles(Role.ADMIN, Role.DIRECTOR)
  @ApiOperation({ summary: 'Custos autorizados (acesso restrito)' })
  costs(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.data.domain(user, 'costs', filters);
  }

  @Get('audit')
  @Roles(Role.ADMIN, Role.DIRECTOR)
  @ApiOperation({ summary: 'Auditoria: gerações, consultas, exportações e falhas' })
  auditLog(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }

  @Get('report-templates')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Modelos predefinidos (por perfil) e modelos personalizados guardados' })
  reportTemplates(@CurrentUser() user: CurrentUserData) {
    return this.generation.listTemplates(user);
  }

  @Post('generate')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Gerar um relatório a partir de um modelo, com filtros' })
  generate(@CurrentUser() user: CurrentUserData, @Body() dto: GenerateExecutiveReportDto) {
    return this.generation.generate(user, dto);
  }

  @Get('builder/catalog')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Módulos/indicadores seleccionáveis no construtor personalizado' })
  builderCatalog(@CurrentUser() user: CurrentUserData) {
    return this.generation.getBuilderCatalog(user);
  }

  @Post('custom/preview')
  @Roles(...EXEC_FULL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pré-visualizar um relatório personalizado (não guarda)' })
  customPreview(@CurrentUser() user: CurrentUserData, @Body() dto: CustomReportConfigDto) {
    return this.generation.previewCustom(user, dto);
  }

  @Post('custom/generate')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Gerar e guardar um relatório personalizado' })
  customGenerate(@CurrentUser() user: CurrentUserData, @Body() dto: GenerateCustomReportDto) {
    return this.generation.generateCustom(user, dto);
  }

  @Post('custom/templates')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Guardar a configuração como modelo reutilizável' })
  saveTemplate(@CurrentUser() user: CurrentUserData, @Body() dto: SaveReportTemplateDto) {
    return this.generation.saveTemplate(user, dto);
  }

  @Patch('custom/templates/:id')
  @Roles(...EXEC_FULL)
  @ApiOperation({
    summary: 'Actualizar modelo personalizado (nova versão se a configuração mudar)',
  })
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateReportTemplateDto,
  ) {
    return this.generation.updateTemplate(id, user, dto);
  }

  @Delete('custom/templates/:id')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Eliminar modelo personalizado' })
  deleteTemplate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.generation.deleteTemplate(id, user);
  }

  // ── Histórico & Arquivo ───────────────────────────────────────────────────

  @Get('archive')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Arquivo: relatórios gerados com modelo, versão e filtros' })
  archiveList(@Query() filters: ArchiveFilterDto) {
    return this.generation.archive(filters);
  }

  // ── Relatórios agendados (§8) ─────────────────────────────────────────────

  @Get('schedules')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Listar agendamentos' })
  listSchedules() {
    return this.schedules.list();
  }

  @Post('schedules')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Criar agendamento' })
  createSchedule(@CurrentUser() user: CurrentUserData, @Body() dto: CreateScheduleDto) {
    return this.schedules
      .create(user, dto)
      .then(r => this.auditSchedule(user, 'SCHEDULE_CREATE', r.id, dto, r));
  }

  @Get('schedules/:id')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Detalhe do agendamento com o registo das execuções' })
  getSchedule(@Param('id', ParseIntPipe) id: number) {
    return this.schedules.getOne(id);
  }

  @Patch('schedules/:id')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Alterar agendamento (periodicidade, destinatários, formato, estado)' })
  updateSchedule(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.schedules
      .update(id, user, dto)
      .then(r => this.auditSchedule(user, 'SCHEDULE_UPDATE', id, dto, r));
  }

  @Delete('schedules/:id')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Eliminar agendamento' })
  deleteSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.schedules
      .remove(id, user)
      .then(r => this.auditSchedule(user, 'SCHEDULE_DELETE', id, {}, r));
  }

  @Post('schedules/:id/run')
  @Roles(...EXEC_FULL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Executar agora (não altera a próxima execução)' })
  runSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.schedules.runNow(id, user);
  }

  // ── Alertas executivos (§9) ───────────────────────────────────────────────

  @Get('alerts')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Alertas com gravidade, responsável, prazo e estado' })
  listAlerts(@CurrentUser() user: CurrentUserData, @Query() filters: AlertFilterDto) {
    return this.alerts.list(user, filters);
  }

  @Get('alerts/rules')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Regras de alerta e respectivos limiares configuráveis' })
  alertRules() {
    return this.alerts.listRules();
  }

  @Patch('alerts/rules/:code')
  @Roles(Role.ADMIN, Role.DIRECTOR)
  @ApiOperation({ summary: 'Alterar/aprovar limiar, gravidade, responsável ou estado da regra' })
  updateAlertRule(
    @Param('code') code: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateAlertRuleDto,
  ) {
    return this.alerts.updateRule(code, dto, user);
  }

  @Post('alerts/scan')
  @Roles(...EXEC_FULL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Avaliar já as regras (a deteção também corre de 6 em 6 horas)' })
  scanAlerts() {
    return this.alerts.scan();
  }

  @Get('alerts/:id')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Detalhe do alerta com o histórico' })
  getAlert(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.alerts.getOne(id, user);
  }

  @Post('alerts/:id/acknowledge')
  @Roles(...EXEC_MGMT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconhecer alerta' })
  ackAlert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AlertActionDto,
  ) {
    return this.alerts.acknowledge(id, user, dto);
  }

  @Post('alerts/:id/assign')
  @Roles(...EXEC_FULL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atribuir responsável e/ou prazo' })
  assignAlert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AlertAssignDto,
  ) {
    return this.alerts.assign(id, user, dto);
  }

  @Post('alerts/:id/resolve')
  @Roles(...EXEC_MGMT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar como resolvido' })
  resolveAlert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AlertActionDto,
  ) {
    return this.alerts.resolve(id, user, dto);
  }

  @Post('alerts/:id/dismiss')
  @Roles(...EXEC_FULL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dispensar alerta (motivo obrigatório)' })
  dismissAlert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AlertActionDto,
  ) {
    return this.alerts.dismiss(id, user, dto);
  }

  @Post('alerts/:id/reopen')
  @Roles(...EXEC_FULL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reabrir alerta encerrado' })
  reopenAlert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AlertActionDto,
  ) {
    return this.alerts.reopen(id, user, dto);
  }

  // ── Listagem ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar relatórios executivos com filtros' })
  findAll(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveReportsReportFilterDto) {
    return this.svc.findAll(filters, user.role?.name);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas de relatórios (por status, por tipo)' })
  stats() {
    return this.svc.getReportStats();
  }

  @Get('templates')
  @ApiOperation({ summary: 'Templates disponíveis (Flash, Monthly, Quarterly, Annual)' })
  templates() {
    return this.svc.getTemplates();
  }

  @Get('snapshots/:orgId')
  @ApiOperation({ summary: 'Snapshots executivos por organização' })
  snapshots(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.svc.getExecutiveSnapshot(orgId);
  }

  @Get(':id/content')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Conteúdo gerado (filtrado pelas permissões; regista a consulta)' })
  content(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.generation.getContent(id, user);
  }

  @Get(':id/export')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Exportar em PDF, Excel ou CSV (permissões revalidadas)' })
  async exportReport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Query() query: ExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.generation.exportReport(id, user, query.format ?? 'PDF');
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Get(':id/access-log')
  @Roles(...EXEC_FULL)
  @ApiOperation({ summary: 'Registo de consultas do relatório' })
  accessLog(@Param('id', ParseIntPipe) id: number) {
    return this.generation.accessLog(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do relatório (regista acesso)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(id, user.id, user.role?.name);
  }

  // ── Gestão ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Criar relatório executivo manualmente' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateExecutiveReportDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar relatório (apenas DRAFT/IN_REVIEW)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExecutiveReportDto) {
    return this.svc.update(id, dto);
  }

  @Post('auto-generate')
  @ApiOperation({ summary: 'Gerar relatório automaticamente com métricas actuais + narrativa' })
  @ApiQuery({ name: 'type', required: false, enum: ReportType })
  @ApiQuery({ name: 'departmentId', required: false })
  autoGenerate(
    @CurrentUser() user: CurrentUserData,
    @Query('type') type?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.svc.generateAutoReport(
      user.id,
      (type as ReportType) ?? ReportType.MONTHLY,
      departmentId ? parseInt(departmentId) : undefined,
    );
  }

  // ── Workflow ──────────────────────────────────────────────────────────────

  @Patch(':id/submit')
  @ApiOperation({ summary: 'Submeter para revisão (DRAFT → IN_REVIEW)' })
  @HttpCode(HttpStatus.OK)
  submit(@Param('id', ParseIntPipe) id: number) {
    return this.svc.submitForReview(id);
  }

  @Post('approve')
  @ApiOperation({ summary: 'Aprovar ou rejeitar relatório (IN_REVIEW → APPROVED/DRAFT)' })
  @HttpCode(HttpStatus.OK)
  approve(@CurrentUser() user: CurrentUserData, @Body() dto: ApproveReportDto) {
    return this.svc.approveReport(dto, user.id);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publicar relatório aprovado' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishReport(id);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Arquivar relatório' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archiveReport(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar relatório (apenas não publicados)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}

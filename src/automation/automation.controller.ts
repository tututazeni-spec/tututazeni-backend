// src/automation/automation.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import {
  CreateRuleDto,
  UpdateRuleDto,
  TriggerEventDto,
  ExecutionFilterDto,
  RuleFilterDto,
  OverviewFilterDto,
  FlowTestDto,
  PublishRuleDto,
  EventFilterDto,
  CreateScheduleDto,
  UpdateScheduleDto,
  ScheduleFilterDto,
  HistoryFilterDto,
  CancelExecutionDto,
  TaskFilterDto,
  DecideTaskDto,
  TaskCommentDto,
  ReassignTaskDto,
  ReportFilterDto,
} from './automation.dto';
import { AutomationHistoryService } from './automation-history.service';
import { AutomationTasksService } from './automation-tasks.service';
import { AutomationReportsService, ReportSection } from './automation-reports.service';
import { AutomationScheduleService } from './automation-schedule.service';
import { Role, AUTHENTICATED_ROLES } from '../auth/enums/role.enum';

const ADMIN = ['ADMIN', 'RH'] as const;

@ApiTags('Automation — Workflow Engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('automation')
export class AutomationController {
  constructor(
    private readonly svc: AutomationService,
    private readonly schedules: AutomationScheduleService,
    private readonly history: AutomationHistoryService,
    private readonly tasks: AutomationTasksService,
    private readonly reports: AutomationReportsService,
  ) {}

  // ─── Rules ────────────────────────────────────────────────────

  @Get('rules')
  @ApiOperation({ summary: 'Listar regras com stats de execução' })
  rules(@Query() filters: RuleFilterDto) {
    return this.svc.getRules(filters);
  }

  @Get('rules/export')
  @ApiOperation({ summary: 'Exportar a listagem filtrada de regras (CSV)' })
  async exportRules(@Query() filters: RuleFilterDto) {
    const content = await this.svc.exportRulesCsv(filters);
    return { filename: `automacoes-${new Date().toISOString().slice(0, 10)}.csv`, content };
  }

  @Get('rules/:id')
  @ApiOperation({ summary: 'Detalhe da regra (fluxo, condições e etiquetas já interpretados)' })
  rule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRuleDetail(id);
  }

  @Get('modules')
  @ApiOperation({ summary: 'Módulos de origem existentes (filtro)' })
  modules() {
    return this.svc.getModules();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Visão Geral — cards e gráficos filtráveis por período/módulo/estado' })
  overview(@Query() filters: OverviewFilterDto) {
    return this.svc.getOverview(filters);
  }

  @Post('rules/:id/run')
  @ApiOperation({ summary: 'Executar manualmente uma regra (a UI exige confirmação)' })
  runOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.runRule(id, { manual: true }, user.id, { triggeredBy: String(user.id) });
  }

  @Post('rules')
  @ApiOperation({ summary: 'Criar regra de automação (trigger → condition → action)' })
  create(@Body() dto: CreateRuleDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createRule(dto, user.id);
  }

  // ─── Construtor de Fluxos (§4) ────────────────────────────────

  @Post('rules/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar a definição (campos, fluxo, limites) sem gravar' })
  validate(@Body() dto: Partial<CreateRuleDto>) {
    return this.svc.validateRuleDefinition(dto);
  }

  @Put('rules/:id/full')
  @ApiOperation({ summary: 'Substituir a configuração completa da regra (editor de fluxos)' })
  updateFull(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRuleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.updateRuleFull(id, dto, user.id);
  }

  @Post('rules/:id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Executar teste com dados de exemplo (simulação, sem efeitos)' })
  test(@Param('id', ParseIntPipe) id: number, @Body() dto: FlowTestDto) {
    return this.svc.testRule(id, dto.payload ?? {});
  }

  @Post('rules/:id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publicar: regista versão e autor e activa a regra' })
  publish(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PublishRuleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.publishRule(id, user.id, dto.note);
  }

  @Get('rules/:id/versions')
  @ApiOperation({ summary: 'Versões publicadas da regra' })
  versions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listVersions(id);
  }

  @Put('rules/:id')
  @ApiOperation({ summary: 'Actualizar regra' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRuleDto) {
    return this.svc.updateRule(id, dto);
  }

  @Patch('rules/:id/toggle')
  @ApiOperation({ summary: 'Activar/desactivar regra' })
  toggle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.toggleRule(id, user.id);
  }

  @Post('rules/:id/clone')
  @ApiOperation({ summary: 'Clonar regra (cria cópia inactiva)' })
  clone(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cloneRule(id);
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover regra' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.deleteRule(id, user.id);
  }

  // ─── Execution ────────────────────────────────────────────────

  @Post('run')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Executar manualmente todas as regras activas' })
  runAll() {
    return this.svc.runAllActiveRules();
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Disparar evento e executar automações correspondentes' })
  trigger(@Body() dto: TriggerEventDto) {
    return this.svc.triggerEvent(dto);
  }

  // ─── Executions ───────────────────────────────────────────────

  @Get('executions')
  @ApiOperation({ summary: 'Histórico de execuções (filtrar por status, regra, período)' })
  executions(@Query() filters: ExecutionFilterDto) {
    return this.svc.getExecutions(filters);
  }

  @Post('executions/:id/rerun')
  @ApiOperation({ summary: 'Re-executar uma execução falhada' })
  rerun(@Param('id') id: string) {
    return this.svc.rerunExecution(id);
  }

  // ─── Histórico de Execuções (§7) ──────────────────────────────

  @Get('history')
  @ApiOperation({ summary: 'Histórico de execuções — filtros por estado, regra, módulo, período' })
  historyList(@Query() filters: HistoryFilterDto) {
    return this.history.list(filters);
  }

  @Get('history/export')
  @ApiOperation({ summary: 'Exportar o histórico filtrado (CSV)' })
  async historyExport(@Query() filters: HistoryFilterDto) {
    const content = await this.history.exportCsv(filters);
    return { filename: `execucoes-${new Date().toISOString().slice(0, 10)}.csv`, content };
  }

  @Get('history/:id')
  @ApiOperation({ summary: 'Detalhe: etapas, duração, acções, erros (sem dados sensíveis)' })
  historyDetail(@Param('id') id: string) {
    return this.history.detail(id);
  }

  @Post('history/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar uma execução não terminada' })
  historyCancel(
    @Param('id') id: string,
    @Body() dto: CancelExecutionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.history.cancel(id, user.id, dto.reason);
  }

  // ─── Aprovações e tarefas (§8) — o serviço restringe a quem é aprovador ──

  @Get('tasks')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Aprovações e tarefas (ADMIN/RH vêem todas; os restantes as suas)' })
  taskList(@Query() filters: TaskFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.tasks.list(filters, user);
  }

  @Get('tasks/summary')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Cartões: pendentes, em atraso, cumprimento de prazos' })
  taskSummary(@CurrentUser() user: CurrentUserData) {
    return this.tasks.summary(user);
  }

  @Get('tasks/export')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Exportar as tarefas filtradas (CSV)' })
  async taskExport(@Query() filters: TaskFilterDto, @CurrentUser() user: CurrentUserData) {
    const content = await this.tasks.exportCsv(filters, user);
    return { filename: `aprovacoes-${new Date().toISOString().slice(0, 10)}.csv`, content };
  }

  @Get('tasks/:id')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Detalhe da tarefa com histórico de alterações' })
  taskDetail(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.tasks.detail(id, user);
  }

  @Post('tasks/:id/decide')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprovar, recusar (com justificação) ou concluir' })
  taskDecide(
    @Param('id') id: string,
    @Body() dto: DecideTaskDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tasks.decide(id, dto, user);
  }

  @Post('tasks/:id/comments')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Acrescentar um comentário ao histórico' })
  taskComment(
    @Param('id') id: string,
    @Body() dto: TaskCommentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tasks.addComment(id, dto.comment, user);
  }

  @Patch('tasks/:id/reassign')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Substituir o aprovador' })
  taskReassign(
    @Param('id') id: string,
    @Body() dto: ReassignTaskDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tasks.reassign(id, dto, user);
  }

  @Post('tasks/:id/cancel')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar a tarefa (cancela também a execução em espera)' })
  taskCancel(
    @Param('id') id: string,
    @Body() dto: CancelExecutionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tasks.cancel(id, dto.reason, user);
  }

  // ─── Relatórios e indicadores (§9) ────────────────────────────

  @Get('reports')
  @ApiOperation({ summary: 'Relatórios e indicadores filtráveis (tempo poupado = estimativa)' })
  report(@Query() filters: ReportFilterDto) {
    return this.reports.build(filters);
  }

  @Get('reports/export')
  @ApiOperation({ summary: 'Exportar uma secção do relatório (CSV)' })
  async reportExport(@Query() filters: ReportFilterDto, @Query('section') section: string) {
    const content = await this.reports.exportCsv(section as ReportSection, filters);
    return {
      filename: `relatorio-automacoes-${section}-${new Date().toISOString().slice(0, 10)}.csv`,
      content,
    };
  }

  // ─── Eventos entre módulos (§5) ───────────────────────────────

  @Get('events/catalog')
  @ApiOperation({ summary: 'Catálogo de eventos por módulo (implementados vs. propostos)' })
  eventCatalog() {
    return this.svc.getEventCatalog();
  }

  @Get('events')
  @ApiOperation({ summary: 'Eventos recebidos (envelope, correlação e regras accionadas)' })
  events(@Query() filters: EventFilterDto) {
    return this.svc.getEvents(filters);
  }

  // ─── Agendamentos (§6) ────────────────────────────────────────

  @Get('schedules')
  @ApiOperation({ summary: 'Listar agendamentos' })
  listSchedules(@Query() filters: ScheduleFilterDto) {
    return this.schedules.list(filters);
  }

  @Post('schedules/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Próximas ocorrências de uma configuração (sem gravar)' })
  previewSchedule(@Body() dto: CreateScheduleDto) {
    return this.schedules.preview(dto);
  }

  @Post('schedules')
  @ApiOperation({ summary: 'Criar agendamento' })
  createSchedule(@Body() dto: CreateScheduleDto, @CurrentUser() user: CurrentUserData) {
    return this.schedules.create(dto, user.id);
  }

  @Get('schedules/:id')
  @ApiOperation({ summary: 'Detalhe do agendamento, com as próximas ocorrências' })
  getSchedule(@Param('id') id: string) {
    return this.schedules.get(id);
  }

  @Put('schedules/:id')
  @ApiOperation({ summary: 'Editar agendamento' })
  updateSchedule(@Param('id') id: string, @Body() dto: UpdateScheduleDto) {
    return this.schedules.update(id, dto);
  }

  @Patch('schedules/:id/pause')
  @ApiOperation({ summary: 'Pausar agendamento' })
  pauseSchedule(@Param('id') id: string) {
    return this.schedules.pause(id);
  }

  @Patch('schedules/:id/resume')
  @ApiOperation({ summary: 'Retomar agendamento' })
  resumeSchedule(@Param('id') id: string) {
    return this.schedules.resume(id);
  }

  @Post('schedules/:id/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Executar agora (não altera a próxima ocorrência)' })
  runSchedule(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.schedules.runNow(id, user.id);
  }

  @Delete('schedules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover agendamento' })
  removeSchedule(@Param('id') id: string) {
    return this.schedules.remove(id);
  }

  // ─── Stats ────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard — total de regras, taxa de sucesso, por categoria' })
  stats() {
    return this.svc.getStats();
  }

  // ─── Templates ────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'Biblioteca de templates pré-configurados (7 built-in)' })
  templates() {
    return this.svc.getTemplates();
  }

  @Post('templates/:index/apply')
  @ApiOperation({ summary: 'Aplicar template à lista de automações' })
  applyTemplate(@Param('index', ParseIntPipe) index: number) {
    return this.svc.applyTemplate(index);
  }

  // ─── Init defaults (legacy) ───────────────────────────────────

  @Post('rules/init-defaults')
  @ApiOperation({ summary: '[Legacy] Criar regras padrão se não existirem' })
  initDefaults() {
    return this.svc.initDefaultRules();
  }
}

// src/process-standard/process-standard.controller.ts
import {
  BadRequestException,
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
  Header,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProcessStandardService } from './process-standard.service';
import { ProcessInstancesService } from './process-instances.service';
import { ProcessTasksService } from './process-tasks.service';
import { ProcessApprovalsService } from './process-approvals.service';
import { ProcessAutomationsService } from './process-automations.service';
import { ProcessCalendarService } from './process-calendar.service';
import { ProcessDocumentsService } from './process-documents.service';
import { ProcessReportsService } from './process-reports.service';
import { ProcessAuditTrailService } from './process-audit-trail.service';
import { ProcessSettingsService } from './process-settings.service';
import { ProcessIntegrationsService } from './process-integrations.service';
import { isSettingKey, SettingKey } from './process-settings';
import {
  CreateProcessDto,
  UpdateProcessDto,
  ProcessFilterDto,
  ProcessDashboardFilterDto,
  StartInstanceDto,
  CompleteStepDto,
  RejectStepDto,
  ApprovalActionDto,
  ProcessInstanceFilterDto,
  UpdateInstanceDto,
  AssignInstanceDto,
  ChangePriorityDto,
  ReasonDto,
  OptionalReasonDto,
  DuplicateProcessDto,
  TaskFilterDto,
  ClarificationDto,
  ReassignStepDto,
  StepCommentDto,
  ChecklistDto,
  ApprovalFilterDto,
  DecideApprovalDto,
  RespondApprovalDto,
  SimulateFlowDto,
  DeliverEventDto,
  ProcessAutomationDto,
  AutomationRuleFilterDto,
  TestAutomationDto,
  CalendarFilterDto,
  RescheduleDto,
  ProcessDocumentFilterDto,
  AttachProcessDocumentDto,
  RequestProcessDocumentDto,
  GenerateProcessDocumentDto,
  SubmitDocumentDto,
  DecideDocumentDto,
  NewDocumentVersionDto,
  ArchiveDocumentDto,
  ProcessReportFilterDto,
  ProcessReportRecordsDto,
  ProcessReportExportDto,
  ProcessAuditFilterDto,
  ProcessAuditAttemptsDto,
  ProcessAuditExportDto,
  UpdateProcessSettingDto,
  RestoreProcessSettingDto,
  IntegrationEventDto,
  IntegrationLogFilterDto,
} from './process-standard.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role, AUTHENTICATED_ROLES } from '../auth/enums/role.enum';

@ApiTags('Process Standard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('processes')
export class ProcessStandardController {
  constructor(
    private readonly svc: ProcessStandardService,
    private readonly instances: ProcessInstancesService,
    private readonly tasks: ProcessTasksService,
    private readonly approvals: ProcessApprovalsService,
    private readonly automations: ProcessAutomationsService,
    private readonly calendar: ProcessCalendarService,
    private readonly documents: ProcessDocumentsService,
    private readonly reports: ProcessReportsService,
    private readonly auditTrail: ProcessAuditTrailService,
    private readonly settings: ProcessSettingsService,
    private readonly integrations: ProcessIntegrationsService,
  ) {}

  private settingKey(key: string): SettingKey {
    if (!isSettingKey(key)) {
      throw new BadRequestException(`Secção de configuração desconhecida: ${key}`);
    }
    return key;
  }

  // ── Biblioteca de Processos ────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar processos (com filtros e paginação)' })
  findAll(@Query() filters: ProcessFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.findAll(filters, user);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary:
      'Visão Geral: indicadores, gráficos e filtros (período, departamento, responsável, tipo, estado)',
  })
  dashboard(@Query() filters: ProcessDashboardFilterDto) {
    return this.svc.getDashboard(filters);
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'Minhas tarefas pendentes em instâncias activas' })
  myTasks(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyTasks(user.id);
  }

  // ── §6 Tarefas e Etapas ────────────────────────────────────────────────────

  @Get('tasks')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Tarefas e etapas (minhas, ou todas para perfis de gestão)' })
  listTasks(@Query() filters: TaskFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.tasks.list(filters, user);
  }

  @Get('tasks/:instanceId/:stepId')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Detalhe de uma tarefa: dependências, checklist, comentários, eventos' })
  taskDetail(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tasks.detail(instanceId, stepId, user);
  }

  // ── §7 Aprovações ──────────────────────────────────────────────────────────

  @Get('approvals')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Aprovações: as minhas, os meus pedidos, ou todas (gestão)' })
  listApprovals(@Query() filters: ApprovalFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.approvals.list(filters, user);
  }

  @Get('approvals/:id')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({
    summary: 'Detalhe de uma aprovação: dados analisados, grupo, comentários, histórico',
  })
  approvalDetail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.approvals.detail(id, user);
  }

  @Post('approvals/:id/decide')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decidir: aprovar, rejeitar, devolver, pedir informação, delegar ou escalar',
  })
  decideApproval(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideApprovalDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.approvals.decide(id, user, dto);
  }

  @Post('approvals/:id/respond')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Responder a um pedido de informação adicional' })
  respondApproval(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespondApprovalDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.approvals.respond(id, user, dto);
  }

  // ── §10 Calendário e Prazos ────────────────────────────────────────────────

  @Get('calendar')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({
    summary: 'Calendário: tarefas e processos com datas, dependências, atrasos e conflitos',
  })
  getCalendar(@Query() filters: CalendarFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.calendar.calendar(filters, user);
  }

  @Get('calendar/ics')
  @Roles(...AUTHENTICATED_ROLES)
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="prazos-processos.ics"')
  @ApiOperation({ summary: 'Exportar os prazos (iCalendar) com os mesmos filtros do calendário' })
  calendarIcs(@Query() filters: CalendarFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.calendar.exportIcs(filters, user);
  }

  @Get('instances/:instanceId/deadline-history')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Histórico de alterações do prazo do processo' })
  instanceDeadlineHistory(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendar.deadlineHistory(instanceId, null, user);
  }

  @Get('instances/:instanceId/steps/:stepId/deadline-history')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Histórico de alterações do prazo da tarefa' })
  stepDeadlineHistory(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.calendar.deadlineHistory(instanceId, stepId, user);
  }

  @Patch('instances/:instanceId/steps/:stepId/deadline')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reagendar o prazo da tarefa (guarda prazo anterior, novo, autor e justificação)',
  })
  rescheduleTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RescheduleDto,
  ) {
    return this.calendar.reschedule(instanceId, stepId, user, dto);
  }

  // ── §11 Documentos ─────────────────────────────────────────────────────────

  @Get('documents')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Documentos dos processos (referências ao repositório e à Biblioteca)' })
  listDocuments(@Query() filters: ProcessDocumentFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.documents.list(filters, user);
  }

  @Get('documents/templates')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Modelos a partir dos quais se podem gerar documentos' })
  documentTemplates() {
    return this.documents.templates();
  }

  @Get('documents/sources')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Pesquisar no repositório central e na Biblioteca (respeita o acesso)' })
  @ApiQuery({ name: 'search', required: false })
  documentSources(
    @Query('search') search: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.searchSources(search, user);
  }

  @Get('documents/:id/versions')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Histórico de versões do documento' })
  documentVersions(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.documents.versions(id, user);
  }

  @Get('documents/:id/pdf')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'PDF de um documento gerado a partir de um modelo' })
  async documentPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, filename } = await this.documents.generatedPdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Post('documents/:id/submit')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submeter (ou resubmeter) o documento para aprovação' })
  submitDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.submit(id, dto, user);
  }

  @Post('documents/:id/decide')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar o documento: aprovar ou rejeitar (com justificação)' })
  decideDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.decide(id, dto, user);
  }

  @Post('documents/:id/sign')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assinar um documento aprovado que exige assinatura' })
  signDocument(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.documents.sign(id, user);
  }

  @Post('documents/:id/versions')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nova versão / renovação da validade (volta a exigir validação)' })
  newDocumentVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NewDocumentVersionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.newVersion(id, dto, user);
  }

  @Post('documents/:id/archive')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arquivar (nunca apagar) respeitando as regras de retenção' })
  archiveDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArchiveDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.archive(id, dto, user);
  }

  @Get('instances/:instanceId/documents')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Documentos do processo e estado dos documentos obrigatórios' })
  instanceDocuments(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.forInstance(instanceId, user);
  }

  @Post('instances/:instanceId/documents')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Anexar documento existente (referência ao repositório / Biblioteca)' })
  attachDocument(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body() dto: AttachProcessDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.attach(instanceId, dto, user);
  }

  @Post('instances/:instanceId/documents/request')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Solicitar um documento em falta a um utilizador' })
  requestDocument(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body() dto: RequestProcessDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.request(instanceId, dto, user);
  }

  @Post('instances/:instanceId/documents/generate')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Gerar documento a partir de um modelo' })
  generateDocument(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body() dto: GenerateProcessDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.documents.generate(instanceId, dto, user);
  }

  // ── §12 Indicadores e Relatórios ───────────────────────────────────────────

  @Get('reports')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.AUDITOR)
  @ApiOperation({ summary: 'Indicadores operacionais (com definições) e agrupamento' })
  reportOverview(@Query() filters: ProcessReportFilterDto) {
    return this.reports.overview(filters);
  }

  @Get('reports/records')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.AUDITOR)
  @ApiOperation({ summary: 'Registos que originaram um indicador' })
  reportRecords(@Query() filters: ProcessReportRecordsDto) {
    return this.reports.records(filters);
  }

  @Get('reports/export')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Exportar o relatório (CSV, Excel ou PDF)' })
  async reportExport(
    @Query() filters: ProcessReportExportDto,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, contentType, filename } = await this.reports.export(filters, user);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  // ── §13 Histórico e Auditoria ──────────────────────────────────────────────
  // Só leitura/exportação: não existe rota para eliminar ou editar o histórico.

  @Get('audit/events')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Linha temporal de auditoria (filtros por utilizador, evento, data…)' })
  auditEvents(@Query() filters: ProcessAuditFilterDto) {
    return this.auditTrail.events(filters);
  }

  @Get('audit/filter-options')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Tipos de evento e utilizadores disponíveis para filtrar' })
  auditFilterOptions() {
    return this.auditTrail.filterOptions();
  }

  @Get('audit/attempts')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Tentativas de integração e de automação' })
  auditAttempts(@Query() filters: ProcessAuditAttemptsDto) {
    return this.auditTrail.attempts(filters);
  }

  @Get('audit/export')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Exportar auditoria em CSV (exige justificação; fica registado)' })
  async auditExport(
    @Query() filters: ProcessAuditExportDto,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, contentType, filename } = await this.auditTrail.export(filters, user);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('audit/events/:id')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Detalhe de um evento (decisão, documentos, evento seguinte)' })
  auditEvent(@Param('id', ParseIntPipe) id: number) {
    return this.auditTrail.event(id);
  }

  @Get('audit/instances/:instanceId/timeline')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Percurso completo de um processo, por ordem cronológica' })
  auditTimeline(@Param('instanceId', ParseIntPipe) instanceId: number) {
    return this.auditTrail.instanceTimeline(instanceId);
  }

  // ── §14 Configurações ──────────────────────────────────────────────────────

  @Get('settings')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Todas as secções de configuração do módulo' })
  settingsAll() {
    return this.settings.all();
  }

  @Get('settings/:key/history')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Versões de uma secção de configuração' })
  settingHistory(@Param('key') key: string) {
    return this.settings.history(this.settingKey(key));
  }

  @Put('settings/:key')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Guardar uma secção (valida, versiona e audita)' })
  settingUpdate(
    @Param('key') key: string,
    @Body() dto: UpdateProcessSettingDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.settings.update(this.settingKey(key), dto, user);
  }

  @Post('settings/:key/restore/:version')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restaurar uma versão anterior como nova versão' })
  settingRestore(
    @Param('key') key: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: RestoreProcessSettingDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.settings.restore(this.settingKey(key), version, user, dto.reason);
  }

  @Post('settings/:key/reset')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Repor os valores por omissão (nova versão)' })
  settingReset(
    @Param('key') key: string,
    @Body() dto: RestoreProcessSettingDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.settings.reset(this.settingKey(key), user, dto.reason);
  }

  // ── §15 Integração com os módulos ──────────────────────────────────────────

  @Get('integrations')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Matriz de integração com os módulos e respectivo estado' })
  integrationsOverview() {
    return this.integrations.overview();
  }

  @Get('integrations/logs')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Eventos de integração recebidos, falhas e tentativas' })
  integrationLogs(@Query() filters: IntegrationLogFilterDto) {
    return this.integrations.logs(filters);
  }

  @Post('integrations/events')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receber um evento de outro módulo e iniciar o processo (idempotente)' })
  integrationEvent(@Body() dto: IntegrationEventDto, @CurrentUser() user: CurrentUserData) {
    return this.integrations.receive(dto, user);
  }

  @Post('integrations/logs/:id/retry')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Repetir um evento de integração que falhou' })
  integrationRetry(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.integrations.retry(id, user);
  }

  // ── §9 Automações (regras do módulo Automações, módulo de origem PROCESSES) ──

  @Get('automations/catalog')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eventos, acções, destinatários e modelos de regras' })
  automationCatalog() {
    return this.automations.catalog();
  }

  @Get('automations')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Regras de automação dos processos' })
  listAutomations(@Query() filters: AutomationRuleFilterDto) {
    return this.automations.list(filters);
  }

  @Post('automations')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar regra de automação de processos' })
  createAutomation(@Body() dto: ProcessAutomationDto, @CurrentUser() user: CurrentUserData) {
    return this.automations.create(dto, user);
  }

  @Post('automations/executions/:executionId/rerun')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Repetir uma execução' })
  rerunAutomation(@Param('executionId') executionId: string, @CurrentUser() user: CurrentUserData) {
    return this.automations.rerun(executionId, user);
  }

  @Get('automations/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Detalhe da regra com as últimas execuções' })
  automationDetail(@Param('id', ParseIntPipe) id: number) {
    return this.automations.detail(id);
  }

  @Put('automations/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar regra' })
  updateAutomation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProcessAutomationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.automations.update(id, dto, user);
  }

  @Patch('automations/:id/toggle')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Activar/desactivar regra' })
  toggleAutomation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.automations.toggle(id, user);
  }

  @Post('automations/:id/clone')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Clonar regra (cópia inactiva)' })
  cloneAutomation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.automations.clone(id, user);
  }

  @Delete('automations/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover regra sem histórico de execuções' })
  removeAutomation(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.automations.remove(id, user);
  }

  @Get('automations/:id/executions')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Registo de execuções da regra' })
  @ApiQuery({ name: 'page', required: false })
  automationExecutions(@Param('id', ParseIntPipe) id: number, @Query('page') page?: string) {
    return this.automations.executions(id, page ? parseInt(page) : 1);
  }

  @Post('automations/:id/test')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Testar a regra: simular ou executar uma vez com um payload de exemplo',
  })
  testAutomation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestAutomationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.automations.test(id, dto, user);
  }

  @Get('audit-logs')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Logs de auditoria globais' })
  @ApiQuery({ name: 'processId', required: false })
  @ApiQuery({ name: 'instanceId', required: false })
  @ApiQuery({ name: 'page', required: false })
  auditLogs(
    @Query('processId') processId?: string,
    @Query('instanceId') instanceId?: string,
    @Query('page') page?: string,
  ) {
    return this.svc.getAuditLogs(
      processId ? parseInt(processId) : undefined,
      instanceId ? parseInt(instanceId) : undefined,
      page ? parseInt(page) : 1,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do processo (com steps e versões)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/versions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Versão actual e versões anteriores do modelo' })
  listVersions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listVersions(id);
  }

  @Post(':id/validate')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Testar o fluxo do modelo: ciclos, dependências, responsáveis, simulação',
  })
  validateTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.validateTemplate(id);
  }

  @Post(':id/simulate')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simular o fluxo com um cenário (prioridade, resultados das aprovações, dados)',
  })
  simulateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: SimulateFlowDto) {
    return this.svc.simulateTemplate(id, dto);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Duplicar modelo (novo rascunho v1.0)' })
  duplicateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: DuplicateProcessDto,
  ) {
    return this.svc.duplicate(id, user.id, dto);
  }

  @Get(':id/qr-code')
  @ApiOperation({ summary: 'URL para QR Code do processo' })
  qrCode(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getQRCodeUrl(id);
  }

  @Get(':id/versions/compare')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Comparar duas versões de um processo' })
  @ApiQuery({ name: 'versionA', example: '1.0' })
  @ApiQuery({ name: 'versionB', example: '2.0' })
  compareVersions(
    @Param('id', ParseIntPipe) id: number,
    @Query('versionA') versionA: string,
    @Query('versionB') versionB: string,
  ) {
    return this.svc.compareVersions(id, versionA, versionB);
  }

  // ── Gestão de Processo ─────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar novo processo standard' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateProcessDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar processo (apenas DRAFT)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateProcessDto,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  @Post(':id/new-version')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar nova versão semântica do processo' })
  @HttpCode(HttpStatus.OK)
  newVersion(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.createNewVersion(id, user.id);
  }

  @Patch(':id/submit-review')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Submeter processo para revisão/aprovação' })
  @HttpCode(HttpStatus.OK)
  submitReview(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.submitForReview(id, user.id);
  }

  @Patch(':id/approval')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Aprovar ou rejeitar processo (Admin)' })
  @HttpCode(HttpStatus.OK)
  approvalAction(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.svc.approvalAction(id, user.id, dto);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Arquivar processo' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.archive(id, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar processo (apenas DRAFT/ARCHIVED)' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.remove(id, user.id);
  }

  // ── Instâncias ─────────────────────────────────────────────────────────────

  @Get('instances/list')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({
    summary: 'Todos os Processos: instâncias com filtros, progresso e situação do prazo',
  })
  getInstances(@Query() filters: ProcessInstanceFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.instances.list(filters, user);
  }

  @Get('instances/filter-options')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Opções dos filtros de Todos os Processos' })
  instanceFilterOptions(@CurrentUser() user: CurrentUserData) {
    return this.instances.filterOptions(user);
  }

  @Get('instances/export')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="processos.csv"')
  @ApiOperation({ summary: 'Exportar resultados (CSV) com os mesmos filtros da lista' })
  async exportInstances(
    @Query() filters: ProcessInstanceFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return (await this.instances.exportCsv(filters, user)).csv;
  }

  @Get('instances/:instanceId')
  @ApiOperation({ summary: 'Detalhe de uma instância com progresso dos steps' })
  getInstance(@Param('instanceId', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getInstanceDetail(id, user);
  }

  @Post(':id/start')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Iniciar instância de processo para um colaborador' })
  startInstance(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: StartInstanceDto,
  ) {
    return this.svc.startInstance(id, user.id, dto, user);
  }

  @Patch('instances/:instanceId/cancel')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Cancelar instância' })
  @HttpCode(HttpStatus.OK)
  cancelInstance(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
    @Body('reason') reason: string,
  ) {
    return this.svc.cancelInstance(instanceId, user.id, reason);
  }

  // ── Execução de Steps ──────────────────────────────────────────────────────

  @Post('instances/:instanceId/steps/:stepId/complete')
  @ApiOperation({ summary: 'Completar etapa de uma instância' })
  @HttpCode(HttpStatus.OK)
  completeStep(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CompleteStepDto,
  ) {
    return this.svc.completeStep(instanceId, stepId, user, dto);
  }

  @Post('instances/:instanceId/steps/:stepId/reject')
  @ApiOperation({ summary: 'Rejeitar etapa (coloca instância ON_HOLD)' })
  @HttpCode(HttpStatus.OK)
  rejectStep(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RejectStepDto,
  ) {
    return this.svc.rejectStep(instanceId, stepId, user, dto);
  }

  // ── §4 Acções sobre instâncias ─────────────────────────────────────────────

  @Patch('instances/:instanceId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Editar dados da instância (prazo exige justificação)' })
  updateInstance(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdateInstanceDto,
  ) {
    return this.instances.update(instanceId, dto, user);
  }

  @Patch('instances/:instanceId/assign')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atribuir ou reatribuir o responsável' })
  assignInstance(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AssignInstanceDto,
  ) {
    return this.instances.assign(instanceId, dto, user);
  }

  @Patch('instances/:instanceId/priority')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alterar prioridade' })
  changePriority(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ChangePriorityDto,
  ) {
    return this.instances.changePriority(instanceId, dto, user);
  }

  @Patch('instances/:instanceId/suspend')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender instância' })
  suspendInstance(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: OptionalReasonDto,
  ) {
    return this.instances.suspend(instanceId, user, dto.reason);
  }

  @Patch('instances/:instanceId/resume')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retomar instância suspensa' })
  resumeInstance(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: OptionalReasonDto,
  ) {
    return this.instances.resume(instanceId, user, dto.reason);
  }

  @Patch('instances/:instanceId/archive')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Arquivar instância concluída ou cancelada' })
  archiveInstance(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.instances.archive(instanceId, user);
  }

  @Post('instances/:instanceId/duplicate')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Duplicar: nova instância a partir do mesmo modelo' })
  duplicateInstance(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.instances.duplicate(instanceId, user);
  }

  @Get('instances/:instanceId/history')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Histórico da instância' })
  @ApiQuery({ name: 'page', required: false })
  instanceHistory(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: CurrentUserData,
    @Query('page') page?: string,
  ) {
    return this.instances.history(instanceId, user, page ? parseInt(page) : 1);
  }

  @Post('instances/:instanceId/events')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Entregar um evento a uma instância (conclui esperas por evento)' })
  deliverEvent(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Body() dto: DeliverEventDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.instances.deliverEvent(instanceId, dto.event, user);
  }

  // ── §6 Acções sobre tarefas ────────────────────────────────────────────────

  @Post('instances/:instanceId/steps/:stepId/start')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar tarefa' })
  startTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tasks.start(instanceId, stepId, user);
  }

  @Post('instances/:instanceId/steps/:stepId/block')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloquear tarefa por falta de informação' })
  blockTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ReasonDto,
  ) {
    return this.tasks.block(instanceId, stepId, user, dto.reason);
  }

  @Post('instances/:instanceId/steps/:stepId/unblock')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desbloquear tarefa' })
  unblockTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tasks.unblock(instanceId, stepId, user);
  }

  @Post('instances/:instanceId/steps/:stepId/clarification')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pedido de esclarecimento' })
  clarification(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ClarificationDto,
  ) {
    return this.tasks.requestClarification(instanceId, stepId, user, dto);
  }

  @Post('instances/:instanceId/steps/:stepId/comments')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Comentar tarefa (com menções)' })
  comment(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: StepCommentDto,
  ) {
    return this.tasks.addComment(instanceId, stepId, user, dto);
  }

  @Patch('instances/:instanceId/steps/:stepId/checklist')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Actualizar itens cumpridos da checklist' })
  checklist(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ChecklistDto,
  ) {
    return this.tasks.updateChecklist(instanceId, stepId, user, dto);
  }

  @Patch('instances/:instanceId/steps/:stepId/reassign')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atribuir/reatribuir responsável ou revisor da tarefa' })
  reassignTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ReassignStepDto,
  ) {
    return this.tasks.reassign(instanceId, stepId, user, dto);
  }

  @Post('instances/:instanceId/steps/:stepId/return')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Devolver para correcção (revisor ou gestão)' })
  returnTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ReasonDto,
  ) {
    return this.tasks.returnForCorrection(instanceId, stepId, user, dto.reason);
  }

  @Post('instances/:instanceId/steps/:stepId/reopen')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reabrir tarefa encerrada (gestão, com justificação)' })
  reopenTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: ReasonDto,
  ) {
    return this.tasks.reopen(instanceId, stepId, user, dto.reason);
  }

  @Post('instances/:instanceId/steps/:stepId/remind')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar lembrete ao responsável' })
  remindTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.tasks.remind(instanceId, stepId, user);
  }

  @Post('instances/:instanceId/steps/:stepId/escalate')
  @Roles(...AUTHENTICATED_ROLES)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Escalar tarefa ao gestor e ao dono do processo' })
  escalateTask(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: OptionalReasonDto,
  ) {
    return this.tasks.escalate(instanceId, stepId, user, dto.reason);
  }
}

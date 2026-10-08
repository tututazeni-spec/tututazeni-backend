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
  Header,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { buildCsvString } from '../common/utils/csv-export.util';
import { buildXlsxBuffer } from '../common/utils/xlsx-export.util';
import {
  CreateOnboardingTemplateDto,
  UpdateOnboardingTemplateDto,
  CreateTemplateTaskDto,
  UpdateTemplateTaskDto,
  CreateOnboardingPlanDto,
  CompleteTaskDto,
  SkipTaskDto,
  ApproveTaskDto,
  UploadDocumentDto,
  ValidateDocumentDto,
  SubmitOnboardingSurveyDto,
  OnboardingFilterDto,
  TriggerIntegrationEvaluationDto,
  OnboardingTaskFilterDto,
  OnboardingDocumentFilterDto,
  OnboardingTrainingFilterDto,
  CreateOnboardingCheckinDto,
  RegisterOnboardingCheckinDto,
  SubmitCheckinEmployeeFeedbackDto,
  OnboardingCheckinFilterDto,
  OnboardingReportFilterDto,
} from './onboarding.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard de onboarding (progresso, atrasos, satisfação)' })
  @ApiQuery({ name: 'managerId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'unitId', required: false })
  dashboard(
    @Query('managerId') managerId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('unitId') unitId?: string,
  ) {
    return this.svc.getDashboard(
      managerId ? parseInt(managerId) : undefined,
      departmentId ? parseInt(departmentId) : undefined,
      unitId ? parseInt(unitId) : undefined,
    );
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'Listar templates de onboarding' })
  findAllTemplates() {
    return this.svc.findAllTemplates();
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Detalhe do template (com tarefas)' })
  findOneTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOneTemplate(id);
  }

  @Get('templates/:id/stages')
  @ApiOperation({ summary: 'Etapas do template — tarefas agrupadas por fase' })
  getTemplateStages(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTemplateStages(id);
  }

  @Post('templates')
  @Roles(Role.ADMIN, Role.GESTOR, Role.RH, Role.DIRECTOR, Role.LIDER)
  @ApiOperation({ summary: 'Criar plano de integração (template de onboarding)' })
  createTemplate(@Body() dto: CreateOnboardingTemplateDto) {
    return this.svc.createTemplate(dto);
  }

  @Put('templates/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar template' })
  updateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOnboardingTemplateDto) {
    return this.svc.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar template (apenas sem planos activos)' })
  deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteTemplate(id);
  }

  @Post('templates/tasks')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar tarefa a um template' })
  addTemplateTask(@Body() dto: CreateTemplateTaskDto) {
    return this.svc.addTemplateTask(dto);
  }

  @Put('templates/tasks/:taskId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar tarefa do template' })
  updateTemplateTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTemplateTaskDto,
  ) {
    return this.svc.updateTemplateTask(taskId, dto);
  }

  @Delete('templates/tasks/:taskId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover tarefa do template' })
  deleteTemplateTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.svc.deleteTemplateTask(taskId);
  }

  // ── Planos ────────────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar planos de onboarding com filtros' })
  findAll(@Query() filters: OnboardingFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('my')
  @ApiOperation({ summary: 'O meu plano de onboarding' })
  my(@CurrentUser() user: CurrentUserData) {
    return this.svc.findByUser(user.id);
  }

  @Get('user/:userId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Plano de onboarding de um colaborador' })
  byUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.findByUser(userId);
  }

  // Registadas antes de `@Get(':id')` de propósito — ':id' apanha qualquer
  // segmento e "sombrearia" estas rotas se viessem depois (ver memory
  // project_innova_route_shadowing).

  @Get('tasks')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Tarefas de todos os onboardings, com filtros (docs/onboarding.md ponto 5)',
  })
  findAllTasks(@Query() filters: OnboardingTaskFilterDto) {
    return this.svc.findAllTasks(filters);
  }

  @Get('documents')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Documentos de todos os onboardings (docs/onboarding.md ponto 6)' })
  findAllDocuments(@Query() filters: OnboardingDocumentFilterDto) {
    return this.svc.findAllDocuments(filters);
  }

  @Get('training')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Formação associada aos onboardings (docs/onboarding.md ponto 7)' })
  findAllTraining(@Query() filters: OnboardingTrainingFilterDto) {
    return this.svc.findAllTraining(filters);
  }

  @Get('checkins')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Check-ins de Acompanhamento de todos os onboardings (docs/onboarding.md ponto 8)',
  })
  findAllCheckins(@Query() filters: OnboardingCheckinFilterDto) {
    return this.svc.findAllCheckins(filters);
  }

  @Get('integration-evaluations')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Avaliações de Integração já pedidas (docs/onboarding.md ponto 9)' })
  getIntegrationEvaluations() {
    return this.svc.getIntegrationEvaluations();
  }

  @Get('reports/overview')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatórios de onboarding — agregados (docs/onboarding.md ponto 10)' })
  reportsOverview(@Query() filters: OnboardingReportFilterDto) {
    return this.svc.getReportsOverview(filters);
  }

  @Get('reports/export.csv')
  @Roles(Role.ADMIN, Role.RH)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="onboarding.csv"')
  @ApiOperation({ summary: 'Exportar relatório de onboarding como CSV' })
  async exportReportsCsv(@Query() filters: OnboardingReportFilterDto) {
    const rows = await this.svc.getReportsRows(filters);
    return buildCsvString(rows, [
      'colaborador',
      'departamento',
      'unidade',
      'planoDeIntegracao',
      'responsavel',
      'estado',
      'progresso',
      'dataInicio',
      'dataConclusao',
      'tarefasConcluidas',
    ]);
  }

  @Get('reports/export.xlsx')
  @Roles(Role.ADMIN, Role.RH)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="onboarding.xlsx"')
  @ApiOperation({ summary: 'Exportar relatório de onboarding como XLSX' })
  async exportReportsXlsx(@Query() filters: OnboardingReportFilterDto) {
    const rows = await this.svc.getReportsRows(filters);
    const buffer = await buildXlsxBuffer(
      rows,
      [
        'colaborador',
        'departamento',
        'unidade',
        'planoDeIntegracao',
        'responsavel',
        'estado',
        'progresso',
        'dataInicio',
        'dataConclusao',
        'tarefasConcluidas',
      ],
      'Onboarding',
    );
    return new StreamableFile(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano (tarefas por fase, progresso)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar plano de onboarding para colaborador' })
  create(@Body() dto: CreateOnboardingPlanDto) {
    return this.svc.create(dto);
  }

  @Post('auto-assign/:userId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Atribuir automaticamente o template mais adequado' })
  @ApiQuery({ name: 'positionId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  autoAssign(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('positionId') positionId?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.svc.createFromTemplate(
      userId,
      positionId ? parseInt(positionId) : undefined,
      departmentId ? parseInt(departmentId) : undefined,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover plano de onboarding' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Tarefas ───────────────────────────────────────────────────────────────

  @Post('tasks/complete')
  @ApiOperation({ summary: 'Concluir tarefa (com evidência opcional)' })
  @HttpCode(HttpStatus.OK)
  completeTask(@CurrentUser() user: CurrentUserData, @Body() dto: CompleteTaskDto) {
    return this.svc.completeTask(dto, user.id);
  }

  @Post('tasks/skip')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Saltar tarefa (com motivo)' })
  @HttpCode(HttpStatus.OK)
  skipTask(@CurrentUser() user: CurrentUserData, @Body() dto: SkipTaskDto) {
    return this.svc.skipTask(dto, user.id);
  }

  @Post('tasks/approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Aprovar ou rejeitar tarefa que requer aprovação' })
  @HttpCode(HttpStatus.OK)
  approveTask(@CurrentUser() user: CurrentUserData, @Body() dto: ApproveTaskDto) {
    return this.svc.approveTask(dto, user.id);
  }

  // ── Documentos ────────────────────────────────────────────────────────────

  @Post('documents')
  @ApiOperation({ summary: 'Submeter documento do onboarding' })
  uploadDocument(@CurrentUser() user: CurrentUserData, @Body() dto: UploadDocumentDto) {
    return this.svc.uploadDocument(user.id, dto);
  }

  @Patch('documents/validate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Validar ou rejeitar documento' })
  @HttpCode(HttpStatus.OK)
  validateDocument(@CurrentUser() user: CurrentUserData, @Body() dto: ValidateDocumentDto) {
    return this.svc.validateDocument(dto, user.id);
  }

  // ── Pesquisas ─────────────────────────────────────────────────────────────

  @Post('surveys')
  @ApiOperation({ summary: 'Submeter pesquisa de satisfação (Dia 1, 7, 30, 90)' })
  submitSurvey(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitOnboardingSurveyDto) {
    return this.svc.submitSurvey(user.id, dto);
  }

  // ── Acompanhamento ────────────────────────────────────────────────────────
  // docs/onboarding.md ponto 8 — check-ins DAY_1/WEEK_1/DAY_30/DAY_60/DAY_90
  // são seedados automaticamente em create(); esta secção cobre CUSTOM,
  // registo pelo responsável e feedback do próprio colaborador.

  @Post('checkins')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar um check-in de acompanhamento avulso (CUSTOM)' })
  createCheckin(@Body() dto: CreateOnboardingCheckinDto) {
    return this.svc.createCheckin(dto);
  }

  @Patch('checkins/:id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Registar o check-in (dificuldades, pontos positivos, próximas acções...)',
  })
  registerCheckin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterOnboardingCheckinDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.registerCheckin(id, dto, user);
  }

  @Post('checkins/:id/employee-feedback')
  @ApiOperation({ summary: 'O colaborador regista o seu feedback no check-in' })
  submitCheckinEmployeeFeedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitCheckinEmployeeFeedbackDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.submitCheckinEmployeeFeedback(id, dto, user);
  }

  // ── Avaliação de Integração ─────────────────────────────────────────────────

  @Post(':id/trigger-evaluation')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Despoletar Avaliação de Integração (integra com o módulo Evaluation)' })
  triggerIntegrationEvaluation(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: TriggerIntegrationEvaluationDto,
  ) {
    return this.svc.triggerIntegrationEvaluation(id, dto, user);
  }
}

// src/process-standard/process-standard.controller.ts
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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProcessStandardService } from './process-standard.service';
import { ProcessInstancesService } from './process-instances.service';
import { ProcessTasksService } from './process-tasks.service';
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
  ) {}

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

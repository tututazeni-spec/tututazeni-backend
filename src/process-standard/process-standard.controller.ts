import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  Query, ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProcessStandardService } from './process-standard.service';
import {
  CreateProcessDto, UpdateProcessDto, ProcessFilterDto,
  StartInstanceDto, CompleteStepDto, RejectStepDto,
  ApprovalActionDto, CompareVersionsDto,
} from './process-standard.dto';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Process Standard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('processes')
export class ProcessStandardController {
  constructor(private readonly svc: ProcessStandardService) {}

  // ── Biblioteca de Processos ────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar processos (com filtros e paginação)' })
  findAll(@Query() filters: ProcessFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard operacional de processos' })
  dashboard() {
    return this.svc.getDashboard();
  }

  @Get('my-tasks')
  @ApiOperation({ summary: 'Minhas tarefas pendentes em instâncias activas' })
  myTasks(@CurrentUser() user: any) {
    return this.svc.getMyTasks(user.id);
  }

  @Get('audit-logs')
  @Roles('ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'Logs de auditoria globais' })
  @ApiQuery({ name: 'processId',  required: false })
  @ApiQuery({ name: 'instanceId', required: false })
  @ApiQuery({ name: 'page',       required: false })
  auditLogs(
    @Query('processId')  processId?: string,
    @Query('instanceId') instanceId?: string,
    @Query('page')       page?: string,
  ) {
    return this.svc.getAuditLogs(
      processId  ? parseInt(processId)  : undefined,
      instanceId ? parseInt(instanceId) : undefined,
      page ? parseInt(page) : 1,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do processo (com steps e versões)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/qr-code')
  @ApiOperation({ summary: 'URL para QR Code do processo' })
  qrCode(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getQRCodeUrl(id);
  }

  @Get(':id/versions/compare')
  @Roles('ADMIN', 'RH')
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
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar novo processo standard' })
  create(@CurrentUser() user: any, @Body() dto: CreateProcessDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar processo (apenas DRAFT)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: UpdateProcessDto,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  @Post(':id/new-version')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar nova versão semântica do processo' })
  @HttpCode(HttpStatus.OK)
  newVersion(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.createNewVersion(id, user.id);
  }

  @Patch(':id/submit-review')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Submeter processo para revisão/aprovação' })
  @HttpCode(HttpStatus.OK)
  submitReview(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.submitForReview(id, user.id);
  }

  @Patch(':id/approval')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Aprovar ou rejeitar processo (Admin)' })
  @HttpCode(HttpStatus.OK)
  approvalAction(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: ApprovalActionDto,
  ) {
    return this.svc.approvalAction(id, user.id, dto);
  }

  @Patch(':id/archive')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Arquivar processo' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.archive(id, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar processo (apenas DRAFT/ARCHIVED)' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.remove(id, user.id);
  }

  // ── Instâncias ─────────────────────────────────────────────────────────────

  @Get('instances/list')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar instâncias de processos' })
  @ApiQuery({ name: 'processId', required: false })
  @ApiQuery({ name: 'status',    required: false })
  getInstances(
    @CurrentUser() user: any,
    @Query('processId') processId?: string,
    @Query('status')    status?: string,
    @Query('page')      page?: string,
  ) {
    return this.svc.getInstances({
      processId: processId ? parseInt(processId) : undefined,
      status,
      page: page ? parseInt(page) : 1,
    });
  }

  @Get('instances/:instanceId')
  @ApiOperation({ summary: 'Detalhe de uma instância com progresso dos steps' })
  getInstance(@Param('instanceId', ParseIntPipe) id: number) {
    return this.svc.getInstanceDetail(id);
  }

  @Post(':id/start')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Iniciar instância de processo para um colaborador' })
  startInstance(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: StartInstanceDto,
  ) {
    return this.svc.startInstance(id, user.id, dto);
  }

  @Patch('instances/:instanceId/cancel')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Cancelar instância' })
  @HttpCode(HttpStatus.OK)
  cancelInstance(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @CurrentUser() user: any,
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
    @Param('stepId', ParseIntPipe)     stepId: number,
    @CurrentUser() user: any,
    @Body() dto: CompleteStepDto,
  ) {
    return this.svc.completeStep(instanceId, stepId, user.id, dto);
  }

  @Post('instances/:instanceId/steps/:stepId/reject')
  @ApiOperation({ summary: 'Rejeitar etapa (coloca instância ON_HOLD)' })
  @HttpCode(HttpStatus.OK)
  rejectStep(
    @Param('instanceId', ParseIntPipe) instanceId: number,
    @Param('stepId', ParseIntPipe)     stepId: number,
    @CurrentUser() user: any,
    @Body() dto: RejectStepDto,
  ) {
    return this.svc.rejectStep(instanceId, stepId, user.id, dto);
  }
}

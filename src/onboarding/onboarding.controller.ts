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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
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
} from './onboarding.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard de onboarding (progresso, atrasos, satisfação)' })
  @ApiQuery({ name: 'managerId', required: false })
  dashboard(@Query('managerId') managerId?: string) {
    return this.svc.getDashboard(managerId ? parseInt(managerId) : undefined);
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

  @Post('templates')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar template de onboarding' })
  createTemplate(@Body() dto: CreateOnboardingTemplateDto) {
    return this.svc.createTemplate(dto);
  }

  @Put('templates/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar template' })
  updateTemplate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOnboardingTemplateDto) {
    return this.svc.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Eliminar template (apenas sem planos activos)' })
  deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteTemplate(id);
  }

  @Post('templates/tasks')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Adicionar tarefa a um template' })
  addTemplateTask(@Body() dto: CreateTemplateTaskDto) {
    return this.svc.addTemplateTask(dto);
  }

  @Put('templates/tasks/:taskId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar tarefa do template' })
  updateTemplateTask(
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTemplateTaskDto,
  ) {
    return this.svc.updateTemplateTask(taskId, dto);
  }

  @Delete('templates/tasks/:taskId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover tarefa do template' })
  deleteTemplateTask(@Param('taskId', ParseIntPipe) taskId: number) {
    return this.svc.deleteTemplateTask(taskId);
  }

  // ── Planos ────────────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar planos de onboarding com filtros' })
  findAll(@Query() filters: OnboardingFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('my')
  @ApiOperation({ summary: 'O meu plano de onboarding' })
  my(@CurrentUser() user: any) {
    return this.svc.findByUser(user.id);
  }

  @Get('user/:userId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Plano de onboarding de um colaborador' })
  byUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.findByUser(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano (tarefas por fase, progresso)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar plano de onboarding para colaborador' })
  create(@Body() dto: CreateOnboardingPlanDto) {
    return this.svc.create(dto);
  }

  @Post('auto-assign/:userId')
  @Roles('ADMIN', 'RH')
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
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover plano de onboarding' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Tarefas ───────────────────────────────────────────────────────────────

  @Post('tasks/complete')
  @ApiOperation({ summary: 'Concluir tarefa (com evidência opcional)' })
  @HttpCode(HttpStatus.OK)
  completeTask(@CurrentUser() user: any, @Body() dto: CompleteTaskDto) {
    return this.svc.completeTask(dto, user.id);
  }

  @Post('tasks/skip')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Saltar tarefa (com motivo)' })
  @HttpCode(HttpStatus.OK)
  skipTask(@CurrentUser() user: any, @Body() dto: SkipTaskDto) {
    return this.svc.skipTask(dto, user.id);
  }

  @Post('tasks/approve')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Aprovar ou rejeitar tarefa que requer aprovação' })
  @HttpCode(HttpStatus.OK)
  approveTask(@CurrentUser() user: any, @Body() dto: ApproveTaskDto) {
    return this.svc.approveTask(dto, user.id);
  }

  // ── Documentos ────────────────────────────────────────────────────────────

  @Post('documents')
  @ApiOperation({ summary: 'Submeter documento do onboarding' })
  uploadDocument(@CurrentUser() user: any, @Body() dto: UploadDocumentDto) {
    return this.svc.uploadDocument(user.id, dto);
  }

  @Patch('documents/validate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Validar ou rejeitar documento' })
  @HttpCode(HttpStatus.OK)
  validateDocument(@CurrentUser() user: any, @Body() dto: ValidateDocumentDto) {
    return this.svc.validateDocument(dto, user.id);
  }

  // ── Pesquisas ─────────────────────────────────────────────────────────────

  @Post('surveys')
  @ApiOperation({ summary: 'Submeter pesquisa de satisfação (Dia 1, 7, 30, 90)' })
  submitSurvey(@CurrentUser() user: any, @Body() dto: SubmitOnboardingSurveyDto) {
    return this.svc.submitSurvey(user.id, dto);
  }
}

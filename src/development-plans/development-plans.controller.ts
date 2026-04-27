// src/development-plans/development-plans.controller.ts
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DevelopmentPlansService } from './development-plans.service';
import {
  CreateDevelopmentPlanDto, UpdateDevelopmentPlanDto, DevelopmentPlanFilterDto,
  CreatePlanActionDto, UpdatePlanActionDto, AddEvidenceDto,
  CreatePlanGoalDto, UpdatePlanGoalProgressDto,
  CreateCheckpointDto, CompleteCheckpointDto,
  ApprovePlanDto,
} from './development-plans.dto';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Development Plans (PDI)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('development-plans')
export class DevelopmentPlansController {
  constructor(private readonly svc: DevelopmentPlansService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Os meus planos de desenvolvimento' })
  myPlans(@CurrentUser() user: any) { return this.svc.getMyPlans(user.id); }

  @Get('my/stats')
  @ApiOperation({ summary: 'As minhas estatísticas de PDI (planos, acções, XP)' })
  myStats(@CurrentUser() user: any) { return this.svc.getStats(user.id); }

  @Get('team/dashboard')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard da equipa (gestor vê progresso de todos os PDIs)' })
  teamDashboard(@CurrentUser() user: any) { return this.svc.getTeamDashboard(user.id); }

  // ── Catálogo ──────────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar planos com filtros e paginação' })
  findAll(@Query() filters: DevelopmentPlanFilterDto) { return this.svc.findAll(filters); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano (com acções, metas, checkpoints)' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  // ── Gestão do Plano ───────────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Criar plano de desenvolvimento' })
  create(@Body() dto: CreateDevelopmentPlanDto) { return this.svc.create(dto); }

  @Put(':id')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Actualizar plano' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDevelopmentPlanDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/submit')
  @ApiOperation({ summary: 'Submeter plano para aprovação (DRAFT → PENDING_APPROVAL)' })
  @HttpCode(HttpStatus.OK)
  submit(@Param('id', ParseIntPipe) id: number) { return this.svc.submitForApproval(id); }

  @Post('approve')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Aprovar ou rejeitar plano (gestor/RH)' })
  @HttpCode(HttpStatus.OK)
  approve(@CurrentUser() user: any, @Body() dto: ApprovePlanDto) {
    return this.svc.approvePlan(dto, user.id);
  }

  @Patch(':id/complete')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Concluir plano (emite certificado + XP)' })
  @HttpCode(HttpStatus.OK)
  complete(@Param('id', ParseIntPipe) id: number) { return this.svc.complete(id); }

  @Patch(':id/cancel')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Cancelar plano' })
  @HttpCode(HttpStatus.OK)
  @ApiQuery({ name: 'reason', required: false })
  cancel(@Param('id', ParseIntPipe) id: number, @Query('reason') reason?: string) {
    return this.svc.cancel(id, reason);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar plano (apenas DRAFT)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }

  // ── Acções ────────────────────────────────────────────────────────────────

  @Post('actions')
  @ApiOperation({ summary: 'Adicionar acção ao plano (curso, mentoria, projecto, etc.)' })
  addAction(@Body() dto: CreatePlanActionDto) { return this.svc.addAction(dto); }

  @Put('actions/:actionId')
  @ApiOperation({ summary: 'Actualizar acção (status, progresso, notas)' })
  updateAction(
    @Param('actionId', ParseIntPipe) actionId: number,
    @CurrentUser() user: any,
    @Body() dto: UpdatePlanActionDto,
  ) {
    return this.svc.updateAction(actionId, dto, user.id);
  }

  @Delete('actions/:actionId')
  @ApiOperation({ summary: 'Remover acção do plano' })
  removeAction(@Param('actionId', ParseIntPipe) actionId: number) {
    return this.svc.removeAction(actionId);
  }

  // ── Evidências ────────────────────────────────────────────────────────────

  @Post('evidence')
  @ApiOperation({ summary: 'Registar evidência de uma acção (upload, link ou nota)' })
  addEvidence(@CurrentUser() user: any, @Body() dto: AddEvidenceDto) {
    return this.svc.addEvidence(user.id, dto);
  }

  // ── Metas ─────────────────────────────────────────────────────────────────

  @Post('goals')
  @ApiOperation({ summary: 'Adicionar meta SMART ao plano' })
  addGoal(@Body() dto: CreatePlanGoalDto) { return this.svc.addGoal(dto); }

  @Patch('goals/progress')
  @ApiOperation({ summary: 'Actualizar progresso de uma meta' })
  @HttpCode(HttpStatus.OK)
  updateGoalProgress(@CurrentUser() user: any, @Body() dto: UpdatePlanGoalProgressDto) {
    return this.svc.updateGoalProgress(user.id, dto);
  }

  // ── Checkpoints ───────────────────────────────────────────────────────────

  @Post('checkpoints')
  @ApiOperation({ summary: 'Agendar checkpoint/check-in do plano' })
  addCheckpoint(@Body() dto: CreateCheckpointDto) { return this.svc.addCheckpoint(dto); }

  @Patch('checkpoints/complete')
  @ApiOperation({ summary: 'Registar conclusão de checkpoint' })
  @HttpCode(HttpStatus.OK)
  completeCheckpoint(@Body() dto: CompleteCheckpointDto) {
    return this.svc.completeCheckpoint(dto);
  }
}

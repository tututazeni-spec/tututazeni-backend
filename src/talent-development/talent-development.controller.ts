// src/talent-development/talent-development.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TalentDevelopmentService } from './talent-development.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import {
  PlanFilterDto,
  CreateDevelopmentPlanDto,
  UpdateDevelopmentPlanDto,
  CancelPlanDto,
  CreateGoalDto,
  UpdateGoalDto,
  CreateActionDto,
  UpdateActionDto,
  UpdateProgressDto,
  ApproveActionDto,
  TalentFilterDto,
  SkillGapFilterDto,
  CreateMentoringDto,
  CreateMentoringSessionDto,
  MentoringFilterDto,
  CareerSimulationDto,
  CreateFromTemplateDto,
  DashboardFilterDto,
} from './talent-development.dto';

const ALL_ROLES = ['ADMIN', 'RH', 'LIDER', 'COLABORADOR'] as const;
const MGMT_ROLES = ['ADMIN', 'RH', 'LIDER'] as const;
const ADMIN_ROLES = ['ADMIN', 'RH'] as const;

@ApiTags('Talent Development')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('talent')
export class TalentDevelopmentController {
  constructor(private readonly svc: TalentDevelopmentService) {}

  // ─── Talent Pool & 9-Box ─────────────────────────────────────

  @Get('pool')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Pool de talento com scores e tiers' })
  pool(@Query() filters: TalentFilterDto) {
    return this.svc.getTalentPool(filters);
  }

  @Get('high-potentials')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Lista de High Potentials (HiPos)' })
  highPotentials(@Query('limit') limit?: string, @Query('departmentId') departmentId?: string) {
    return this.svc.getHighPotentials(
      limit ? +limit : 20,
      departmentId ? +departmentId : undefined,
    );
  }

  @Get('matrix')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Matriz de talento 9-box' })
  matrix() {
    return this.svc.getTalentMatrix();
  }

  // ─── Succession ──────────────────────────────────────────────

  @Get('succession/dashboard')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Dashboard de sucessão — cobertura de todas as posições' })
  successionDashboard() {
    return this.svc.getSuccessionDashboard();
  }

  @Get('succession/:positionId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Candidatos à sucessão de uma posição' })
  succession(@Param('positionId', ParseIntPipe) id: number) {
    return this.svc.getSuccessionCandidates(id);
  }

  // ─── Development Plans ───────────────────────────────────────

  @Get('plans/templates')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Templates de planos de desenvolvimento' })
  templates() {
    return this.svc.getTemplates();
  }

  @Post('plans/from-template/:templateId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Criar plano a partir de template' })
  fromTemplate(
    @Param('templateId', ParseIntPipe) templateId: number,
    @Body() dto: CreateFromTemplateDto,
    @Req() req: any,
  ) {
    return this.svc.createFromTemplate(templateId, dto, req.user.id);
  }

  @Post('plans')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Criar plano de desenvolvimento (PDI)' })
  createPlan(@Body() dto: CreateDevelopmentPlanDto, @Req() req: any) {
    return this.svc.createPlan(dto, req.user.id);
  }

  @Get('plans')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar planos de desenvolvimento' })
  getPlans(@Query() filters: PlanFilterDto) {
    return this.svc.getPlans(filters);
  }

  @Get('plans/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe de um plano' })
  getPlan(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPlan(id);
  }

  @Patch('plans/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Actualizar plano' })
  updatePlan(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDevelopmentPlanDto) {
    return this.svc.updatePlan(id, dto);
  }

  @Post('plans/:id/activate')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Activar plano' })
  activate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.svc.activatePlan(id, req.user.id);
  }

  @Post('plans/:id/pause')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Pausar plano' })
  pause(@Param('id', ParseIntPipe) id: number, @Body('reason') reason?: string) {
    return this.svc.pausePlan(id, reason);
  }

  @Post('plans/:id/complete')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Concluir plano e atribuir XP' })
  complete(@Param('id', ParseIntPipe) id: number) {
    return this.svc.completePlan(id);
  }

  @Post('plans/:id/cancel')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Cancelar plano' })
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelPlanDto) {
    return this.svc.cancelPlan(id, dto.reason);
  }

  // ─── Goals ───────────────────────────────────────────────────

  @Post('plans/:id/goals')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Adicionar meta ao plano' })
  addGoal(@Param('id', ParseIntPipe) planId: number, @Body() dto: CreateGoalDto) {
    return this.svc.addGoal(planId, dto);
  }

  @Patch('goals/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Actualizar meta (inclui progresso)' })
  updateGoal(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGoalDto) {
    return this.svc.updateGoal(id, dto);
  }

  @Delete('goals/:id')
  @Roles(...MGMT_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover meta' })
  deleteGoal(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteGoal(id);
  }

  // ─── Actions ─────────────────────────────────────────────────

  @Post('plans/:id/actions')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Adicionar acção de desenvolvimento ao plano' })
  addAction(@Param('id', ParseIntPipe) planId: number, @Body() dto: CreateActionDto) {
    return this.svc.addAction(planId, dto);
  }

  @Patch('actions/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Actualizar acção (campos gerais)' })
  updateAction(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateActionDto) {
    return this.svc.updateAction(id, dto);
  }

  @Patch('actions/:id/progress')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Colaborador actualiza o seu próprio progresso + evidência' })
  updateProgress(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProgressDto,
    @Req() req: any,
  ) {
    return this.svc.updateActionProgress(id, dto, req.user.id);
  }

  @Post('actions/:id/approve')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Gestor aprova ou rejeita evidência de uma acção' })
  approveAction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveActionDto,
    @Req() req: any,
  ) {
    return this.svc.approveActionEvidence(id, dto, req.user.id);
  }

  @Delete('actions/:id')
  @Roles(...MGMT_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover acção' })
  deleteAction(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteAction(id);
  }

  // ─── Skill Gaps ──────────────────────────────────────────────

  @Get('skill-gaps/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Gaps de skills de um colaborador vs. o seu cargo' })
  skillGaps(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserSkillGaps(userId);
  }

  @Get('training-needs')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Necessidades de formação da organização (ordenado por gap médio)' })
  trainingNeeds(@Query() filters: SkillGapFilterDto) {
    return this.svc.getTrainingNeeds(filters);
  }

  @Get('skill-heatmap')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Heatmap de skills por departamento' })
  skillHeatmap(@Query('departmentId') departmentId?: string) {
    return this.svc.getOrgSkillHeatmap(departmentId ? +departmentId : undefined);
  }

  // ─── Mentoring ───────────────────────────────────────────────

  @Get('mentoring/match/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Mentores recomendados (IA matching por competência)' })
  mentorMatch(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getMentorRecommendations(userId);
  }

  @Get('mentoring/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe de mentoria + sessões' })
  getMentoring(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMentoring(id);
  }

  @Get('mentoring')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar mentorias' })
  getMentorings(@Query() filters: MentoringFilterDto) {
    return this.svc.getMentorings(filters);
  }

  @Post('mentoring')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Criar mentoria (pareamento)' })
  createMentoring(@Body() dto: CreateMentoringDto) {
    return this.svc.createMentoring(dto);
  }

  @Post('mentoring/:id/sessions')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Registar sessão de mentoria' })
  addSession(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateMentoringSessionDto) {
    return this.svc.addMentoringSession(id, dto);
  }

  @Post('mentoring/:id/complete')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Concluir mentoria' })
  completeMentoring(@Param('id', ParseIntPipe) id: number) {
    return this.svc.completeMentoring(id);
  }

  // ─── Analytics ───────────────────────────────────────────────

  @Get('analytics/dashboard')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Dashboard principal de talent development' })
  dashboard(@Query() filters: DashboardFilterDto) {
    return this.svc.getDashboard(filters);
  }

  @Get('analytics/talent-health')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Talent Health Score organizacional (A-D)' })
  talentHealth(@Query('departmentId') departmentId?: string) {
    return this.svc.getTalentHealthScore(departmentId ? +departmentId : undefined);
  }

  @Get('analytics/evolution/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Linha de evolução de um colaborador ao longo do tempo' })
  evolution(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserEvolution(userId);
  }

  // ─── AI / Recommendations ────────────────────────────────────

  @Get('recommendations/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Recomendações personalizadas (cursos, mentores, insights)' })
  recommendations(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getRecommendations(userId);
  }

  @Post('career-simulation/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Simulação de carreira — tempo e passos para atingir um cargo' })
  careerSimulation(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: CareerSimulationDto,
  ) {
    return this.svc.simulateCareer(userId, dto);
  }
}

// src/career/career.controller.ts
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
import { CareerService } from './career.service';
import {
  CreateCareerPathDto,
  UpdateCareerPathDto,
  AddCareerPathStepDto,
  CreateCareerPlanDto,
  UpdateCareerPlanDto,
  AddCareerGoalDto,
  CreateInternalVacancyDto,
  ApplyToVacancyDto,
  UpdateApplicationStatusDto,
  CreateSuccessionPlanDto,
  CareerInterestDto,
  VacancyFilterDto,
  CareerAnalyticsFilterDto,
} from './career.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Career')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('career')
export class CareerController {
  constructor(private readonly svc: CareerService) {}

  // ── Perfil de Carreira ────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Dashboard de carreira do utilizador autenticado' })
  myProfile(@CurrentUser() user: any) {
    return this.svc.getCareerProfile(user.id);
  }

  @Get('me/gap-analysis')
  @ApiOperation({ summary: 'Análise de gap de competências para o cargo actual' })
  myGapAnalysis(@CurrentUser() user: any) {
    return this.svc.getCompetencyGapsForUser(user.id);
  }

  @Get('me/promotion-eligibility')
  @ApiOperation({ summary: 'Verificar elegibilidade para promoção' })
  myPromotionEligibility(@CurrentUser() user: any) {
    return this.svc.checkPromotionEligibility(user.id);
  }

  @Post('me/promotion-request')
  @ApiOperation({ summary: 'Submeter pedido de promoção' })
  @HttpCode(HttpStatus.OK)
  requestPromotion(
    @CurrentUser() user: any,
    @Body('targetPositionId', ParseIntPipe) targetPositionId: number,
    @Body('justification') justification: string,
  ) {
    return this.svc.requestPromotion(user.id, targetPositionId, justification);
  }

  @Get('me/simulate/:targetPositionId')
  @ApiOperation({ summary: 'Simulador de carreira — o que falta para chegar ao cargo X' })
  simulate(
    @CurrentUser() user: any,
    @Param('targetPositionId', ParseIntPipe) targetPositionId: number,
  ) {
    return this.svc.simulateNextRole(user.id, targetPositionId);
  }

  @Put('me/interests')
  @ApiOperation({ summary: 'Atualizar interesses e objetivos de carreira' })
  updateInterests(@CurrentUser() user: any, @Body() dto: CareerInterestDto) {
    return this.svc.updateCareerInterests(user.id, dto);
  }

  @Get('users/:userId/profile')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard de carreira de um colaborador específico (RH/Gestor)' })
  userProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getCareerProfile(userId);
  }

  @Get('users/:userId/gap-analysis')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Gap analysis de um colaborador' })
  userGapAnalysis(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getCompetencyGapsForUser(userId);
  }

  @Get('users/:userId/simulate/:targetPositionId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Simular carreira de um colaborador' })
  simulateUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('targetPositionId', ParseIntPipe) targetPositionId: number,
  ) {
    return this.svc.simulateNextRole(userId, targetPositionId);
  }

  // ── Trilhas de Carreira ───────────────────────────────────────────────────

  @Get('paths')
  @ApiOperation({ summary: 'Listar trilhas de carreira' })
  @ApiQuery({ name: 'departmentId', required: false })
  findPaths(@Query('departmentId') deptId?: string) {
    return this.svc.findAllCareerPaths(deptId ? parseInt(deptId) : undefined);
  }

  @Get('paths/:id')
  @ApiOperation({ summary: 'Detalhe de uma trilha' })
  findPath(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOneCareerPath(id);
  }

  @Post('paths')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar trilha de carreira' })
  createPath(@Body() dto: CreateCareerPathDto) {
    return this.svc.createCareerPath(dto);
  }

  @Put('paths/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar trilha' })
  updatePath(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCareerPathDto) {
    return this.svc.updateCareerPath(id, dto);
  }

  @Post('paths/:id/steps')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Adicionar cargo à trilha' })
  addStep(@Param('id', ParseIntPipe) id: number, @Body() dto: AddCareerPathStepDto) {
    return this.svc.addCareerPathStep(id, dto);
  }

  @Delete('paths/steps/:stepId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover passo da trilha' })
  removeStep(@Param('stepId', ParseIntPipe) stepId: number) {
    return this.svc.removeCareerPathStep(stepId);
  }

  // ── Plano de Carreira Pessoal ─────────────────────────────────────────────

  @Get('me/plan')
  @ApiOperation({ summary: 'Obter plano de carreira activo' })
  myPlan(@CurrentUser() user: any) {
    return this.svc.getMyCareerPlan(user.id);
  }

  @Post('me/plan')
  @ApiOperation({ summary: 'Criar plano de carreira' })
  createPlan(@CurrentUser() user: any, @Body() dto: CreateCareerPlanDto) {
    return this.svc.createCareerPlan(user.id, dto);
  }

  @Put('me/plan/:planId')
  @ApiOperation({ summary: 'Actualizar plano de carreira' })
  updatePlan(
    @CurrentUser() user: any,
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: UpdateCareerPlanDto,
  ) {
    return this.svc.updateCareerPlan(planId, user.id, dto);
  }

  @Post('me/plan/:planId/goals')
  @ApiOperation({ summary: 'Adicionar objetivo ao plano' })
  addGoal(
    @CurrentUser() user: any,
    @Param('planId', ParseIntPipe) planId: number,
    @Body() dto: AddCareerGoalDto,
  ) {
    return this.svc.addGoalToPlan(planId, user.id, dto);
  }

  @Patch('me/goals/:goalId/progress')
  @ApiOperation({ summary: 'Atualizar progresso de um objetivo (0-100)' })
  @HttpCode(HttpStatus.OK)
  updateGoal(
    @CurrentUser() user: any,
    @Param('goalId', ParseIntPipe) goalId: number,
    @Body('progress', ParseIntPipe) progress: number,
  ) {
    return this.svc.updateGoalProgress(goalId, user.id, progress);
  }

  // ── Vagas Internas ────────────────────────────────────────────────────────

  @Get('vacancies')
  @ApiOperation({ summary: 'Listar vagas internas (com match score se autenticado)' })
  findVacancies(@Query() filters: VacancyFilterDto, @CurrentUser() user: any) {
    return this.svc.findAllVacancies(filters, user.id);
  }

  @Post('vacancies')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Criar vaga interna' })
  createVacancy(@CurrentUser() user: any, @Body() dto: CreateInternalVacancyDto) {
    return this.svc.createVacancy(user.id, dto);
  }

  @Patch('vacancies/:id/publish')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Publicar vaga (notifica colaboradores com match)' })
  @HttpCode(HttpStatus.OK)
  publishVacancy(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishVacancy(id);
  }

  @Post('vacancies/:id/apply')
  @ApiOperation({ summary: 'Candidatar-se a uma vaga interna' })
  apply(
    @Param('id', ParseIntPipe) vacancyId: number,
    @CurrentUser() user: any,
    @Body() dto: ApplyToVacancyDto,
  ) {
    return this.svc.applyToVacancy(vacancyId, user.id, dto);
  }

  @Get('me/applications')
  @ApiOperation({ summary: 'As minhas candidaturas' })
  myApplications(@CurrentUser() user: any) {
    return this.svc.getMyApplications(user.id);
  }

  @Patch('vacancies/applications/:appId/status')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Atualizar status de candidatura' })
  @HttpCode(HttpStatus.OK)
  updateAppStatus(
    @Param('appId', ParseIntPipe) appId: number,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.svc.updateApplicationStatus(appId, dto);
  }

  // ── Planeamento de Sucessão ───────────────────────────────────────────────

  @Get('succession')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar planos de sucessão' })
  @ApiQuery({ name: 'positionId', required: false })
  getSuccession(@Query('positionId') posId?: string) {
    return this.svc.getSuccessionPlans(posId ? parseInt(posId) : undefined);
  }

  @Post('succession')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar plano de sucessão' })
  createSuccession(@Body() dto: CreateSuccessionPlanDto) {
    return this.svc.createSuccessionPlan(dto);
  }

  @Patch('succession/:id/readiness')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Actualizar nível de prontidão de um sucessor' })
  @HttpCode(HttpStatus.OK)
  updateReadiness(
    @Param('id', ParseIntPipe) id: number,
    @Body('readiness') readiness: string,
    @Body('justification') justification?: string,
  ) {
    return this.svc.updateSuccessionReadiness(id, readiness, justification);
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  @Get('analytics')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Analytics de carreira (promoções, vagas, PDI, risco)' })
  analytics(@Query() filters: CareerAnalyticsFilterDto) {
    return this.svc.getCareerAnalytics(filters);
  }

  @Get('analytics/talent-heatmap')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Heatmap de talentos (9-box)' })
  @ApiQuery({ name: 'departmentId', required: false })
  heatmap(@Query('departmentId') deptId?: string) {
    return this.svc.getTalentHeatmap(deptId ? parseInt(deptId) : undefined);
  }
}

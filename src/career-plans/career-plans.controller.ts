// ─── src/career-plans/career-plans.controller.ts ─────────────────────────────
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CareerPlansService } from './career-plans.service';
import {
  CareerPlanFilterDto,
  PromotionFilterDto,
  CreateCareerPlanDto,
  UpdateCareerPlanDto,
  AddCareerGoalDto,
  UpdateGoalProgressDto,
  CreateRoleDto,
  CreateSkillDto,
  SetRoleSkillsDto,
  CreateCareerPathDto,
  CreateProgressionRuleDto,
  CreatePromotionRequestDto,
  ReviewPromotionDto,
  SimulateCareerDto,
} from './career-plans.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Career Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('career-plans')
export class CareerPlansController {
  constructor(private readonly svc: CareerPlansService) {}

  // ── Analytics & Dashboard ─────────────────────────────────────────

  @Get('analytics')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Analytics — planos, promoções, tempo médio' })
  @ApiQuery({ name: 'department', required: false })
  getAnalytics(@Query('department') department?: string) {
    return this.svc.getAnalytics(department);
  }

  @Get('succession')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard de sucessão — risco por cargo sénior' })
  @ApiQuery({ name: 'department', required: false })
  getSuccessionDashboard(@Query('department') department?: string) {
    return this.svc.getSuccessionDashboard(department);
  }

  @Get('succession/:roleId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Pipeline de sucessão para um cargo específico' })
  getSuccessionPipeline(@Param('roleId', ParseIntPipe) roleId: number) {
    return this.svc.getSuccessionPipeline(roleId);
  }

  // ── Roles & Levels ────────────────────────────────────────────────

  @Get('roles')
  @ApiOperation({ summary: 'Listar cargos com skill requirements' })
  @ApiQuery({ name: 'department', required: false })
  getRoles(@Query('department') department?: string) {
    return this.svc.getRoles(department);
  }

  @Get('roles/:id')
  @ApiOperation({ summary: 'Detalhe do cargo (skills, regras de progressão)' })
  getRole(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRole(id);
  }

  @Post('roles')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar cargo / nível' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.svc.createRole(dto);
  }

  @Post('roles/skills')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Configurar skill requirements de um cargo' })
  setRoleSkills(@Body() dto: SetRoleSkillsDto) {
    return this.svc.setRoleSkills(dto);
  }

  // ── Skills Catalogue ──────────────────────────────────────────────

  @Get('skills')
  @ApiOperation({ summary: 'Catálogo de skills/competências' })
  @ApiQuery({ name: 'type', required: false })
  getSkills(@Query('type') type?: string) {
    return this.svc.getSkills(type);
  }

  @Post('skills')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar skill/competência' })
  createSkill(@Body() dto: CreateSkillDto) {
    return this.svc.createSkill(dto);
  }

  // ── Career Paths ──────────────────────────────────────────────────

  @Get('paths')
  @ApiOperation({ summary: 'Listar trilhas de carreira' })
  @ApiQuery({ name: 'department', required: false })
  getCareerPaths(@Query('department') department?: string) {
    return this.svc.getCareerPaths(department);
  }

  @Post('paths')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar trilha de carreira (linear, Y, W, horizontal)' })
  createCareerPath(@Body() dto: CreateCareerPathDto, @CurrentUser() user: any) {
    return this.svc.createCareerPath(dto, user.id);
  }

  // ── Progression Rules ─────────────────────────────────────────────

  @Get('progression-rules')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar regras de progressão' })
  @ApiQuery({ name: 'fromRoleId', required: false, type: Number })
  getProgressionRules(@Query('fromRoleId') fromRoleId?: string) {
    return this.svc.getProgressionRules(fromRoleId ? +fromRoleId : undefined);
  }

  @Post('progression-rules')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar regra de progressão entre cargos' })
  createProgressionRule(@Body() dto: CreateProgressionRuleDto) {
    return this.svc.createProgressionRule(dto);
  }

  // ── Readiness ─────────────────────────────────────────────────────

  @Get('readiness/:userId/:targetRoleId')
  @ApiOperation({ summary: 'Calcular prontidão de um colaborador para um cargo' })
  getReadiness(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('targetRoleId', ParseIntPipe) targetRoleId: number,
  ) {
    return this.svc.calculateReadiness(userId, targetRoleId);
  }

  @Post('simulate')
  @ApiOperation({ summary: 'Simular carreira (what-if) — readiness + estimativa + paths' })
  simulate(@Body() dto: SimulateCareerDto) {
    return this.svc.simulateCareer(dto);
  }

  // ── My Plan ───────────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'Meu plano de carreira activo com readiness e metas' })
  myPlan(@CurrentUser() user: any) {
    return this.svc.getMyPlan(user.id);
  }

  // ── Plans CRUD ────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar planos de carreira com readiness enriquecido' })
  findAll(@Query() filters: CareerPlanFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano (roles, path, goals, readiness)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Progresso do plano (goals + readiness)' })
  getProgress(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getProgress(id);
  }

  @Post()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Criar plano (auto-gera metas com base no gap de skills)' })
  create(@Body() dto: CreateCareerPlanDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.id);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Actualizar plano' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCareerPlanDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  @Patch(':id/activate')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Activar plano de carreira' })
  activate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.activate(id, user.id);
  }

  // ── Goals / PDI Actions ───────────────────────────────────────────

  @Post('goals')
  @ApiOperation({ summary: 'Adicionar meta ao plano (curso, projecto, mentoria, etc.)' })
  addGoal(@Body() dto: AddCareerGoalDto) {
    return this.svc.addGoal(dto);
  }

  @Patch('goals/:goalId/progress')
  @ApiOperation({ summary: 'Actualizar progresso de uma meta' })
  updateGoalProgress(
    @Param('goalId', ParseIntPipe) goalId: number,
    @Body() dto: UpdateGoalProgressDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateGoalProgress(goalId, dto, user.id);
  }

  // ── Promotions ────────────────────────────────────────────────────

  @Get('promotions')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar pedidos de promoção' })
  getPromotions(@Query() filters: PromotionFilterDto) {
    return this.svc.getPromotions(filters);
  }

  @Post('promotions')
  @ApiOperation({ summary: 'Solicitar promoção (valida regras + calcula readiness)' })
  requestPromotion(@Body() dto: CreatePromotionRequestDto, @CurrentUser() user: any) {
    return this.svc.requestPromotion(dto, user.id);
  }

  @Patch('promotions/:id/review')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Aprovar / rejeitar promoção' })
  reviewPromotion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewPromotionDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.reviewPromotion(id, dto, user.id, user.role);
  }
}

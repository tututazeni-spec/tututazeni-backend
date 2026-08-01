// src/evaluation/evaluation.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EvaluationService } from './evaluation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { assertCanAccess } from '../common/authz/ownership';
import { Role, AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
import {
  CreateCycleDto,
  UpdateCycleDto,
  CycleFilterDto,
  CreateFormDto,
  SubmitEvaluationDto,
  AssignEvaluatorDto,
  BulkAssignDto,
  CalibrateScoreDto,
  EvaluationAnalyticsFilterDto,
  CreateEvaluationDto,
} from './evaluation.dto';

const ALL_ROLES = AUTHENTICATED_ROLES;
const MGMT_ROLES = [Role.ADMIN, Role.RH, Role.LIDER, Role.GESTOR] as const;
const ADMIN_ROLES = [Role.ADMIN, Role.RH] as const;

@ApiTags('Evaluation 360°')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('evaluations')
export class EvaluationController {
  constructor(private readonly svc: EvaluationService) {}

  // ─── Cycles ──────────────────────────────────────────────────

  @Post('cycles')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar ciclo de avaliação com pesos por tipo de avaliador' })
  createCycle(@Body() dto: CreateCycleDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createCycle(dto, user.id);
  }

  @Get('cycles')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Listar ciclos de avaliação' })
  getCycles(@Query() filters: CycleFilterDto) {
    return this.svc.getCycles(filters);
  }

  @Get('cycles/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Detalhe do ciclo com taxa de participação' })
  getCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getCycle(id);
  }

  @Patch('cycles/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Actualizar ciclo (datas, status)' })
  updateCycle(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCycleDto) {
    return this.svc.updateCycle(id, dto);
  }

  @Post('cycles/:id/publish')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Publicar ciclo (DRAFT → PUBLISHED)' })
  publishCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishCycle(id);
  }

  @Post('cycles/:id/activate')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Activar ciclo — auto-assign pedidos + notificar participantes' })
  activateCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.activateCycle(id);
  }

  // ─── Forms ───────────────────────────────────────────────────

  @Post('forms')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar formulário de avaliação com perguntas por competência' })
  createForm(@Body() dto: CreateFormDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createForm(dto, user.id);
  }

  @Get('forms')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Listar formulários (incluindo templates)' })
  getForms() {
    return this.svc.getForms();
  }

  @Get('forms/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Detalhe do formulário com perguntas' })
  getForm(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getForm(id);
  }

  // ─── Assignments ─────────────────────────────────────────────

  @Post('assign')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Atribuir avaliador a um colaborador' })
  assign(@Body() dto: AssignEvaluatorDto) {
    return this.svc.assignEvaluator(dto);
  }

  @Post('bulk-assign')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Atribuição em massa de avaliadores num ciclo' })
  bulkAssign(@Body() dto: BulkAssignDto) {
    return this.svc.bulkAssign(dto);
  }

  // ─── Submit ──────────────────────────────────────────────────

  @Post('submit')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Submeter avaliação (ou guardar rascunho)' })
  submit(@CurrentUser() user: CurrentUserData, @Body() dto: SubmitEvaluationDto) {
    return this.svc.submitEvaluation(user.id, dto);
  }

  // ─── Legacy endpoint (backward compat) ───────────────────────

  @Post()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: '[Legacy] Submeter avaliação simples (compatibilidade)' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateEvaluationDto) {
    return this.svc.create(user.id, dto);
  }

  // ─── Pending / My evaluations ────────────────────────────────

  @Get('pending')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Avaliações que me estão pendentes' })
  pending(@CurrentUser() user: CurrentUserData) {
    return this.svc.getPendingEvaluations(user.id);
  }

  @Get('my-progress')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'O meu progresso de avaliações (taxa de conclusão)' })
  myProgress(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyProgress(user.id);
  }

  @Get('my-evaluations')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'As minhas avaliações recebidas' })
  myEvals(@CurrentUser() user: CurrentUserData, @Query('period') period?: string) {
    return this.svc.findByUser(user.id, period);
  }

  @Get('user/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Avaliações recebidas por um colaborador' })
  byUser(@Param('userId', ParseIntPipe) id: number, @Query('period') period?: string) {
    return this.svc.findByUser(id, period);
  }

  @Get('summary/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Sumário de avaliação por período' })
  summary(@Param('userId', ParseIntPipe) id: number, @Query('period') period: string) {
    return this.svc.getSummary(id, period);
  }

  // ─── Results ─────────────────────────────────────────────────

  @Get('results/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Resultados 360° completos (score, concordância, competências, qualitativo)',
  })
  results(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('cycleId') cycleId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    // A10-3: sem esta verificação, qualquer COLABORADOR lia o 360 completo
    // (score, nomes de avaliadores, texto qualitativo) de qualquer colega.
    assertCanAccess({}, userId, user, [Role.ADMIN, Role.RH, Role.LIDER, Role.GESTOR]);
    return this.svc.getResults(userId, cycleId ? +cycleId : undefined);
  }

  @Get('evolution/:userId')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Evolução do colaborador ao longo dos ciclos' })
  evolution(@Param('userId', ParseIntPipe) userId: number, @CurrentUser() user: CurrentUserData) {
    assertCanAccess({}, userId, user, [Role.ADMIN, Role.RH, Role.LIDER, Role.GESTOR]);
    return this.svc.getUserEvolution(userId);
  }

  // ─── Calibration ─────────────────────────────────────────────

  @Get('calibration/:cycleId')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Painel de calibração — dispersão, percentil, avaliadores com viés' })
  calibrationPanel(@Param('cycleId', ParseIntPipe) cycleId: number) {
    return this.svc.getCycleForCalibration(cycleId);
  }

  @Post('calibration/:cycleId/calibrate')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Calibrar score de um colaborador num ciclo' })
  calibrate(
    @Param('cycleId', ParseIntPipe) cycleId: number,
    @Body() dto: CalibrateScoreDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.calibrateScore(cycleId, dto, user.id);
  }

  // ─── Analytics ───────────────────────────────────────────────

  @Get('analytics/dashboard')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary: 'Dashboard de analytics — distribuição, top performers, por departamento',
  })
  analyticsDashboard(@Query() filters: EvaluationAnalyticsFilterDto) {
    return this.svc.getAnalyticsDashboard(filters);
  }

  @Get('analytics/team/:managerId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Dashboard da equipa do gestor (ranking + pendentes + percentil)' })
  teamDashboard(
    @Param('managerId', ParseIntPipe) managerId: number,
    @Query('cycleId') cycleId?: string,
  ) {
    return this.svc.getTeamDashboard(managerId, cycleId ? +cycleId : undefined);
  }

  // ─── Auto PDI ────────────────────────────────────────────────

  @Post('results/:userId/trigger-pdi')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Gerar sugestão de PDI baseada nos gaps identificados' })
  triggerPDI(@Param('userId', ParseIntPipe) userId: number, @Query('cycleId') cycleId?: string) {
    return this.svc.triggerPDIFromResults(userId, cycleId ? +cycleId : undefined);
  }
}

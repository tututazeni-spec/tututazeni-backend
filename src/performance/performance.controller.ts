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
import { PerformanceService } from './performance.service';
import {
  PerformanceCreateCycleDto,
  CreatePerformanceReviewDto,
  UpdatePerformanceReviewDto,
  SubmitReviewDto,
  CreateGoalDto,
  UpdatePerformanceGoalProgressDto,
  PerformanceCreateFeedbackDto,
  CalibrateReviewDto,
  PerformanceCreateDisputeDto,
  Update9BoxDto,
  PerformanceFilterDto,
} from './performance.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Performance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('performance')
export class PerformanceController {
  constructor(private readonly svc: PerformanceService) {}

  // ── Ciclos ─────────────────────────────────────────────────────────────────

  @Get('cycles')
  @ApiOperation({ summary: 'Listar ciclos de avaliação' })
  getCycles() {
    return this.svc.getCycles();
  }

  @Get('cycles/current')
  @ApiOperation({ summary: 'Ciclo de avaliação activo' })
  getCurrentCycle() {
    return this.svc.getCurrentCycle();
  }

  @Post('cycles')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar ciclo de avaliação' })
  createCycle(@Body() dto: PerformanceCreateCycleDto) {
    return this.svc.createCycle(dto);
  }

  @Patch('cycles/:id/activate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Activar ciclo (notifica todos os colaboradores)' })
  @HttpCode(HttpStatus.OK)
  activateCycle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.activateCycle(id);
  }

  // ── Reviews ────────────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar avaliações com filtros' })
  findAll(@Query() filters: PerformanceFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('my')
  @ApiOperation({ summary: 'O meu histórico de performance (reviews, goals, feedback)' })
  myHistory(@CurrentUser() user: any) {
    return this.svc.getUserHistory(user.id);
  }

  @Get('my/goals')
  @ApiOperation({ summary: 'Os meus goals activos' })
  @ApiQuery({ name: 'cycleId', required: false })
  myGoals(@CurrentUser() user: any, @Query('cycleId') cycleId?: string) {
    return this.svc.getUserGoals(user.id, cycleId ? parseInt(cycleId) : undefined);
  }

  @Get('my/feedback')
  @ApiOperation({ summary: 'O meu feedback contínuo recebido' })
  @ApiQuery({ name: 'cycleId', required: false })
  myFeedback(@CurrentUser() user: any, @Query('cycleId') cycleId?: string) {
    return this.svc.getUserFeedback(user.id, cycleId ? parseInt(cycleId) : undefined);
  }

  @Get('analytics')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Analytics globais (distribuição, divergências, top performers)' })
  @ApiQuery({ name: 'cycleId', required: false })
  analytics(@Query('cycleId') cycleId?: string) {
    return this.svc.getPerformanceAnalytics(cycleId ? parseInt(cycleId) : undefined);
  }

  @Get('9box')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: '9-Box Matrix (Performance vs Potencial)' })
  @ApiQuery({ name: 'cycleId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  get9Box(@Query('cycleId') cycleId?: string, @Query('departmentId') departmentId?: string) {
    return this.svc.get9Box(
      cycleId ? parseInt(cycleId) : undefined,
      departmentId ? parseInt(departmentId) : undefined,
    );
  }

  @Get('team')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Performance da minha equipa' })
  @ApiQuery({ name: 'cycleId', required: false })
  teamPerformance(@CurrentUser() user: any, @Query('cycleId') cycleId?: string) {
    return this.svc.getTeamPerformance(user.id, cycleId ? parseInt(cycleId) : undefined);
  }

  @Get('periods')
  @ApiOperation({ summary: 'Listar ciclos disponíveis' })
  periods() {
    return this.svc.getPeriods();
  }

  @Get('department/:departmentId/stats')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Estatísticas de performance por departamento' })
  @ApiQuery({ name: 'cycleId', required: false })
  departmentStats(
    @Param('departmentId', ParseIntPipe) id: number,
    @Query('cycleId') cycleId?: string,
  ) {
    return this.svc.getDepartmentStats(id, cycleId ? parseInt(cycleId) : undefined);
  }

  @Get('user/:userId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Histórico de performance de um colaborador' })
  userHistory(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserHistory(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma avaliação' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar avaliação de desempenho' })
  create(@Body() dto: CreatePerformanceReviewDto) {
    return this.svc.create(dto);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submeter avaliação (self ou manager) com scores ponderados' })
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() user: any, @Body() dto: SubmitReviewDto) {
    return this.svc.submitReview(user.id, dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar avaliação' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePerformanceReviewDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover avaliação' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  @Post('goals')
  @ApiOperation({ summary: 'Criar goal / OKR' })
  createGoal(@Body() dto: CreateGoalDto) {
    return this.svc.createGoal(dto);
  }

  @Patch('goals/:goalId/progress')
  @ApiOperation({ summary: 'Actualizar progresso de um goal' })
  @HttpCode(HttpStatus.OK)
  updateGoalProgress(
    @Param('goalId', ParseIntPipe) goalId: number,
    @CurrentUser() user: any,
    @Body() dto: UpdatePerformanceGoalProgressDto,
  ) {
    return this.svc.updateGoalProgress(goalId, user.id, dto);
  }

  @Get('goals/user/:userId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Goals de um utilizador' })
  @ApiQuery({ name: 'cycleId', required: false })
  userGoals(@Param('userId', ParseIntPipe) userId: number, @Query('cycleId') cycleId?: string) {
    return this.svc.getUserGoals(userId, cycleId ? parseInt(cycleId) : undefined);
  }

  // ── Feedback contínuo ─────────────────────────────────────────────────────

  @Post('feedback')
  @ApiOperation({ summary: 'Dar feedback contínuo a um colega' })
  createFeedback(@CurrentUser() user: any, @Body() dto: PerformanceCreateFeedbackDto) {
    return this.svc.createFeedback(user.id, dto);
  }

  @Get('feedback/user/:userId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Feedback de um colaborador' })
  userFeedback(@Param('userId', ParseIntPipe) userId: number, @Query('cycleId') cycleId?: string) {
    return this.svc.getUserFeedback(userId, cycleId ? parseInt(cycleId) : undefined);
  }

  // ── Calibração ─────────────────────────────────────────────────────────────

  @Post('calibrate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Calibrar score de uma avaliação' })
  @HttpCode(HttpStatus.OK)
  calibrate(@CurrentUser() user: any, @Body() dto: CalibrateReviewDto) {
    return this.svc.calibrateReview(user.id, dto);
  }

  // ── Disputa ────────────────────────────────────────────────────────────────

  @Post('dispute')
  @ApiOperation({ summary: 'Contestar avaliação publicada' })
  dispute(@CurrentUser() user: any, @Body() dto: PerformanceCreateDisputeDto) {
    return this.svc.createDispute(user.id, dto);
  }

  // ── 9-Box ──────────────────────────────────────────────────────────────────

  @Put('9box')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Posicionar/mover colaborador na 9-box (drag & drop)' })
  update9Box(@CurrentUser() user: any, @Body() dto: Update9BoxDto) {
    return this.svc.update9Box(user.id, dto);
  }
}

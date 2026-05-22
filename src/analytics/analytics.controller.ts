// src/analytics/analytics.controller.ts
import { Controller, Get, Post, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsFilterDto } from './analytics.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Analytics & Intelligence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  // ── Overview (C-Level) ────────────────────────────────────────────────────

  @Get('overview')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'KPIs globais da organização (C-Level / Board)' })
  overview() {
    return this.svc.getOrganizationOverview();
  }

  // ── Dashboards por persona ────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Dashboard pessoal do colaborador autenticado' })
  myDashboard(@CurrentUser() user: any) {
    return this.svc.getCollaboratorDashboard(user.id);
  }

  @Get('manager')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard do gestor (equipa, 9-box, alertas, gaps)' })
  managerDashboard(@CurrentUser() user: any) {
    return this.svc.getManagerDashboard(user.id);
  }

  @Get('hr')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard RH (people analytics, PDI, turnover, learning)' })
  hrDashboard(@Query() filters: AnalyticsFilterDto) {
    return this.svc.getHRDashboard(filters);
  }

  // ── Módulos específicos ───────────────────────────────────────────────────

  @Get('learning')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Analytics de aprendizagem (cursos, conclusões, certificados)' })
  learning(@Query() filters: AnalyticsFilterDto) {
    return this.svc.getLearningAnalytics(filters);
  }

  @Get('people')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'People analytics (headcount, turnover, diversidade)' })
  people(@Query() filters: AnalyticsFilterDto) {
    return this.svc.getPeopleAnalytics(filters);
  }

  @Get('pdi')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Analytics de PDIs (adopção, progresso, acções, tipos)' })
  pdi(@Query() filters: AnalyticsFilterDto) {
    return this.svc.getPDIAnalytics(filters);
  }

  @Get('competency-gaps')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Mapa de gaps de competências (actual vs desejado)' })
  competencyGaps(@Query() filters: AnalyticsFilterDto) {
    return this.svc.getCompetencyGapAnalytics(filters);
  }

  @Get('engagement')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Métricas de engagement (activos 30d, leaderboard, AI, knowledge)' })
  engagement(@Query() filters: AnalyticsFilterDto) {
    return this.svc.getEngagementMetrics(filters);
  }

  @Get('risks')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Alertas de risco (inactivos, PDIs atrasados, acções críticas)' })
  risks(@Query() filters: AnalyticsFilterDto) {
    return this.svc.getRiskAlerts(filters);
  }

  @Get('roi')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'ROI de treinamento (horas investidas, impacto, certificados)' })
  roi() {
    return this.svc.getTrainingROI();
  }

  // ── Curso específico ──────────────────────────────────────────────────────

  @Get('courses')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Performance de todos os cursos' })
  courses() {
    return this.svc.getCoursePerformance();
  }

  @Get('courses/:courseId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Performance de um curso específico (feedback, assessment)' })
  courseDetail(@Param('courseId', ParseIntPipe) courseId: number) {
    return this.svc.getCoursePerformance(courseId);
  }

  // ── Departamento ──────────────────────────────────────────────────────────

  @Get('departments/:departmentId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Analytics de departamento específico' })
  department(@Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.svc.getDepartmentAnalytics(departmentId);
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────

  @Get('snapshots')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Histórico de snapshots executivos' })
  @ApiQuery({ name: 'departmentId', required: false })
  snapshots(@Query('departmentId') departmentId?: string) {
    return this.svc.getSnapshots(departmentId ? parseInt(departmentId) : undefined);
  }

  @Post('snapshots/generate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gerar snapshot executivo agora' })
  @ApiQuery({ name: 'departmentId', required: false })
  generateSnapshot(@Query('departmentId') departmentId?: string) {
    return this.svc.generateDashboardSnapshot(departmentId ? parseInt(departmentId) : undefined);
  }
}

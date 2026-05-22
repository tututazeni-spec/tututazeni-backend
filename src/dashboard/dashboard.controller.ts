// src/dashboard/dashboard.controller.ts
import { Controller, Get, Post, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { DashboardFilterDto, OrgFilterDto, DashboardPeriod } from './dashboard.dto';

const ALL_ROLES = ['ADMIN', 'RH', 'LIDER', 'COLABORADOR'] as const;
const MGMT_ROLES = ['ADMIN', 'RH', 'LIDER'] as const;
const ADMIN_ROLES = ['ADMIN', 'RH'] as const;

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  // ─── Per-profile dashboards ───────────────────────────────────

  @Get('my')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Dashboard pessoal — learning, PDI, gamification, pendências' })
  myDashboard(@CurrentUser() user: any) {
    return this.svc.getMyDashboard(user.id);
  }

  @Get('manager')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Dashboard do gestor — equipa, KPIs, alertas, drill-down' })
  managerDashboard(@CurrentUser() user: any, @Query() filters: DashboardFilterDto) {
    return this.svc.getManagerDashboard(user.id, filters);
  }

  @Get('organization')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Resumo estratégico — headcount, learning, talent, insights' })
  organizationSummary(@Query() filters: OrgFilterDto) {
    return this.svc.getOrganizationSummary(filters);
  }

  @Get('executive')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Dashboard executivo — ROI, talent health, riscos, top talento' })
  executive() {
    return this.svc.getExecutiveDashboard();
  }

  // ─── Department drill-down ────────────────────────────────────

  @Get('department/:id')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Dashboard de um departamento específico' })
  department(@Param('id', ParseIntPipe) id: number, @Query('period') period?: DashboardPeriod) {
    return this.svc.getDepartmentDashboard(id, period);
  }

  // ─── Alerts ───────────────────────────────────────────────────

  @Get('alerts')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Central de alertas personalizada por perfil' })
  alerts(@CurrentUser() user: any) {
    return this.svc.getAlerts(user.id, user.roleCode);
  }

  // ─── Gamification leaderboard ─────────────────────────────────

  @Get('leaderboard')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Leaderboard gamificado (XP + badges)' })
  leaderboard(@Query('departmentId') departmentId?: string, @Query('limit') limit?: string) {
    return this.svc.getLeaderboard(departmentId ? +departmentId : undefined, limit ? +limit : 10);
  }

  // ─── Global search ────────────────────────────────────────────

  @Get('search')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Busca global — colaboradores, cursos, competências' })
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.svc.globalSearch(q, limit ? +limit : 10);
  }

  // ─── Snapshots ────────────────────────────────────────────────

  @Get('snapshots')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Histórico de snapshots organizacionais' })
  snapshots() {
    return this.svc.listSnapshots();
  }

  @Post('snapshots/generate')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Gerar novo snapshot do estado actual da organização' })
  generateSnapshot() {
    return this.svc.generateSnapshot();
  }
}

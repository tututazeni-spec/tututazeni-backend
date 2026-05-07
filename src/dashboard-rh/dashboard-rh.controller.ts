// src/dashboard-rh/dashboard-rh.controller.ts
import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardRhService }  from './dashboard-rh.service';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { Roles }         from '../common/decorators';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;
const MGMT  = ['ADMIN', 'RH', 'DIRECTOR', 'LIDER'] as const;

@ApiTags('Dashboard RH')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard-rh')
export class DashboardRhController {
  constructor(private readonly svc: DashboardRhService) {}

  // ─── Overview ────────────────────────────────────────────────

  @Get()
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Dashboard RH completo — todos os KPIs em paralelo' })
  fullDashboard() { return this.svc.getFullRhDashboard(); }

  // ─── Headcount ───────────────────────────────────────────────

  @Get('headcount')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Headcount — total, distribuição por dept/cargo/tenure' })
  headcount(@Query('departmentId') deptId?: string) {
    return this.svc.getHeadcountPanel(deptId ? +deptId : undefined);
  }

  @Get('headcount-trend')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Evolução mensal do headcount' })
  headcountTrend(@Query('months') months?: string) {
    return this.svc.getHeadcountTrend(months ? +months : 6);
  }

  // ─── Turnover ────────────────────────────────────────────────

  @Get('turnover')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Turnover, retenção e colaboradores em risco' })
  turnover(@Query('months') months?: string) {
    return this.svc.getTurnoverPanel(months ? +months : 12);
  }

  // ─── Engagement ──────────────────────────────────────────────

  @Get('engagement')
  @Roles(...MGMT)
  @ApiOperation({ summary: 'Engagement — surveys, reconhecimento, humor, gamification' })
  engagement(@Query('departmentId') deptId?: string) {
    return this.svc.getEngagementPanel(deptId ? +deptId : undefined);
  }

  // ─── Performance ─────────────────────────────────────────────

  @Get('performance')
  @Roles(...MGMT)
  @ApiOperation({ summary: 'Performance — score médio, distribuição, HiPos, at-risk' })
  performance(@Query('departmentId') deptId?: string) {
    return this.svc.getPerformancePanel(deptId ? +deptId : undefined);
  }

  // ─── Skills ──────────────────────────────────────────────────

  @Get('skills')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Skills — competências, gaps críticos, avaliação' })
  skills(@Query('departmentId') deptId?: string) {
    return this.svc.getSkillsPanel(deptId ? +deptId : undefined);
  }

  // ─── Training ────────────────────────────────────────────────

  @Get('training')
  @Roles(...MGMT)
  @ApiOperation({ summary: 'Formação — conclusões, obrigatórias, top cursos, ROI' })
  training(@Query('departmentId') deptId?: string) {
    return this.svc.getTrainingPanel(deptId ? +deptId : undefined);
  }

  // ─── Compliance ──────────────────────────────────────────────

  @Get('compliance')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Compliance — formações obrigatórias, certificações, auditoria' })
  compliance() { return this.svc.getCompliancePanel(); }

  // ─── Attendance ──────────────────────────────────────────────

  @Get('attendance')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Presenças — taxa de absentismo, por departamento' })
  attendance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getAttendancePanel(from, to);
  }

  // ─── Talent Pipeline ─────────────────────────────────────────

  @Get('talent-pipeline')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Pipeline de talento — sucessão, HiPos, posições em risco' })
  talentPipeline() { return this.svc.getTalentPipeline(); }

  // ─── People Events ───────────────────────────────────────────

  @Get('birthdays')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Aniversários do mês' })
  birthdays() { return this.svc.getBirthdaysThisMonth(); }

  @Get('anniversaries')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Aniversários de empresa este mês' })
  anniversaries() { return this.svc.getAnniversariesThisMonth(); }

  // ─── Payroll ─────────────────────────────────────────────────

  @Get('payroll')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Resumo da folha salarial por período' })
  payroll(@Query('period') period: string) { return this.svc.getPayrollPanel(period); }

  // ─── AI Insights ─────────────────────────────────────────────

  @Get('alerts')
  @Roles(...MGMT)
  @ApiOperation({ summary: 'Alertas inteligentes — performance, compliance, engagement, PDI' })
  alerts() { return this.svc.getAlerts(); }

  @Get('predictions')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Previsões IA — risco de saída, queda de performance' })
  predictions() { return this.svc.getPredictions(); }

  @Get('correlations')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'People Analytics — correlações treino×performance, engagement×performance' })
  correlations() { return this.svc.getCorrelations(); }
}



















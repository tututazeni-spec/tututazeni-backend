// src/reports/reports.controller.ts
import {
  Controller, Get, Post, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard }   from '../common/guards/jwt-auth.guard';
import { RolesGuard }     from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import {
  ReportFilterDto, SaveReportDto, CreateScheduleDto, ReportCategory,
} from './reports.dto';

const ALL_MGMT = ['ADMIN', 'RH', 'LIDER', 'DIRECTOR'] as const;
const ADMIN    = ['ADMIN', 'RH']                       as const;

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  // ─── HR Reports ──────────────────────────────────────────────

  @Get('hr/headcount')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Headcount por período, departamento e cargo' })
  headcount(@Query() filter: ReportFilterDto) { return this.svc.headcountReport(filter); }

  @Get('hr/turnover')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Turnover, retenção e admissões/saídas' })
  turnover(@Query() filter: ReportFilterDto) { return this.svc.turnoverReport(filter); }

  @Get('hr/attendance')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Relatório de presenças' })
  attendance(
    @Query('from') from: string, @Query('to') to: string,
    @Query('departmentId') deptId?: string,
  ) { return this.svc.attendanceReport(from, to, deptId ? +deptId : undefined); }

  @Get('hr/payroll')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Resumo da folha salarial por período' })
  payroll(@Query('period') period: string) { return this.svc.payrollSummary(period); }

  // ─── Learning Reports ─────────────────────────────────────────

  @Get('learning/training')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Relatório de formação — conclusões, abandono, top cursos' })
  training(@Query() filter: ReportFilterDto) { return this.svc.trainingReportFull(filter); }

  @Get('learning/skill-gap')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Gaps de competências por departamento e skill' })
  skillGap(@Query() filter: ReportFilterDto) { return this.svc.skillGapReport(filter); }

  // ─── Performance Reports ──────────────────────────────────────

  @Get('performance')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Performance — avaliações, distribuição, top performers, em risco' })
  performance(@Query() filter: ReportFilterDto) { return this.svc.performanceReportFull(filter); }

  // Legacy endpoint compatibility
  @Get('performance/by-period')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: '[Legacy] Performance por período' })
  performanceLegacy(@Query('period') period: string, @Query('departmentId') deptId?: string) {
    return this.svc.performanceReport(period, deptId ? +deptId : undefined);
  }

  // ─── Engagement Reports ───────────────────────────────────────

  @Get('engagement')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Engagement — surveys, eNPS, reconhecimento, humor' })
  engagement(@Query() filter: ReportFilterDto) { return this.svc.engagementReport(filter); }

  // ─── Talent Reports ───────────────────────────────────────────

  @Get('talent')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Talent intelligence — HiPos, PDI, sucessão, competências' })
  talent(@Query() filter: ReportFilterDto) { return this.svc.talentReport(filter); }

  // ─── Compliance ───────────────────────────────────────────────

  @Get('compliance')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Compliance — formações obrigatórias, certificações, auditoria' })
  compliance(@Query() filter: ReportFilterDto) { return this.svc.complianceReport(filter); }

  // ─── Competency gap (legacy compat) ──────────────────────────

  @Get('competency-gap')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Gaps de competências (legacy)' })
  competencyGap(@Query('departmentId') deptId?: string) {
    return this.svc.competencyGapReport(deptId ? +deptId : undefined);
  }

  // ─── Platform Usage ───────────────────────────────────────────

  @Get('operational/usage')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Uso da plataforma — conteúdos, sessões, utilizadores activos' })
  usage(@Query() filter: ReportFilterDto) { return this.svc.platformUsageReport(filter); }

  // ─── AI Insights ─────────────────────────────────────────────

  @Get('insights')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Insights inteligentes — padrões, riscos e recomendações de toda a plataforma' })
  insights(@Query() filter: ReportFilterDto) { return this.svc.getInsights(filter); }

  // ─── Saved Reports ────────────────────────────────────────────

  @Get('saved')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Listar relatórios guardados do utilizador' })
  listSaved(
    @CurrentUser() user: any,
    @Query('category') category?: ReportCategory,
  ) { return this.svc.listSavedReports(user.id, category); }

  @Post('saved')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Guardar relatório personalizado' })
  saveReport(@CurrentUser() user: any, @Body() dto: SaveReportDto) {
    return this.svc.saveReport(user.id, dto);
  }

  @Delete('saved/:id')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Remover relatório guardado' })
  deleteReport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteReport(id);
  }

  // ─── Templates ────────────────────────────────────────────────

  @Get('templates')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Biblioteca de templates pré-configurados (9 templates built-in)' })
  templates() { return this.svc.getTemplates(); }

  // ─── Schedules ────────────────────────────────────────────────

  @Post('schedules')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Agendar relatório recorrente com distribuição por email' })
  createSchedule(@CurrentUser() user: any, @Body() dto: CreateScheduleDto) {
    return this.svc.createSchedule(user.id, dto);
  }

  @Get('schedules')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Listar agendamentos activos' })
  listSchedules(@CurrentUser() user: any) { return this.svc.listSchedules(user.id); }

  @Delete('schedules/:id')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Cancelar agendamento' })
  deleteSchedule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteSchedule(id);
  }

  // ─── CSV Export ───────────────────────────────────────────────

  @Get('export/skill-gap-csv')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="skill-gap.csv"')
  @ApiOperation({ summary: 'Exportar gaps de competências como CSV' })
  async exportSkillGapCsv(@Query() filter: ReportFilterDto) {
    const data    = await this.svc.skillGapReport(filter);
    const rows    = (data.skills as any[]).map((s: any) => ({
      skill:       s.competency?.name,
      type:        s.competency?.type,
      users:       s.count,
      usersWithGap:s.usersWithGap,
      avgGap:      s.avgGap,
    }));
    return this.svc.exportToCsv(rows, ['skill', 'type', 'users', 'usersWithGap', 'avgGap']);
  }

  @Get('export/performance-csv')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="performance.csv"')
  @ApiOperation({ summary: 'Exportar relatório de performance como CSV' })
  async exportPerfCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.performanceReportFull(filter);
    const rows = (data.topPerformers as any[]).map((r: any) => ({
      name:       r.user?.fullName,
      department: r.user?.department?.name,
      position:   r.user?.position?.name,
      score:      r.score,
      type:       r.type,
    }));
    return this.svc.exportToCsv(rows, ['name', 'department', 'position', 'score', 'type']);
  }
}


















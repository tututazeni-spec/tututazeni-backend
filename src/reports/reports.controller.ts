// src/reports/reports.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { ReportFilterDto, SaveReportDto, CreateScheduleDto } from './reports.dto';
import { ReportCategory } from '@prisma/client';
import { Role } from '../auth/enums/role.enum';

// ALL_MGMT hand-rolava ['ADMIN','RH','LIDER','DIRECTOR'] e omitia GESTOR — o
// papel canónico de "gestor de equipa" (ver Role em role.enum.ts) — trancando
// qualquer gestor de linha real fora de todos os relatórios deste módulo.
// Mesmo padrão já encontrado em dashboard/dashboard-rh/engagement.
const ALL_MGMT = [Role.ADMIN, Role.RH, Role.LIDER, Role.DIRECTOR, Role.GESTOR] as const;
const ADMIN = [Role.ADMIN, Role.RH] as const;

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
  headcount(@Query() filter: ReportFilterDto) {
    return this.svc.headcountReport(filter);
  }

  @Get('hr/turnover')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Turnover, retenção e admissões/saídas' })
  turnover(@Query() filter: ReportFilterDto) {
    return this.svc.turnoverReport(filter);
  }

  @Get('hr/attendance')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Relatório de presenças' })
  attendance(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('departmentId') deptId?: string,
  ) {
    return this.svc.attendanceReport(from, to, deptId ? +deptId : undefined);
  }

  @Get('hr/payroll')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Resumo da folha salarial por período' })
  payroll(@Query('period') period: string) {
    return this.svc.payrollSummary(period);
  }

  // ─── Learning Reports ─────────────────────────────────────────

  @Get('learning/training')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Relatório de formação — conclusões, abandono, top cursos' })
  training(@Query() filter: ReportFilterDto) {
    return this.svc.trainingReportFull(filter);
  }

  @Get('learning/skill-gap')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Gaps de competências por departamento e skill' })
  skillGap(@Query() filter: ReportFilterDto) {
    return this.svc.skillGapReport(filter);
  }

  // ─── Performance Reports ──────────────────────────────────────

  @Get('performance')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Performance — avaliações, distribuição, top performers, em risco' })
  performance(@Query() filter: ReportFilterDto) {
    return this.svc.performanceReportFull(filter);
  }

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
  engagement(@Query() filter: ReportFilterDto) {
    return this.svc.engagementReport(filter);
  }

  // ─── Talent Reports ───────────────────────────────────────────

  @Get('talent')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Talent intelligence — HiPos, PDI, sucessão, competências' })
  talent(@Query() filter: ReportFilterDto) {
    return this.svc.talentReport(filter);
  }

  // ─── Compliance ───────────────────────────────────────────────

  @Get('compliance')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Compliance — formações obrigatórias, certificações, auditoria' })
  compliance(@Query() filter: ReportFilterDto) {
    return this.svc.complianceReport(filter);
  }

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
  usage(@Query() filter: ReportFilterDto) {
    return this.svc.platformUsageReport(filter);
  }

  // ─── AI Insights ─────────────────────────────────────────────

  @Get('insights')
  @Roles(...ALL_MGMT)
  @ApiOperation({
    summary: 'Insights inteligentes — padrões, riscos e recomendações de toda a plataforma',
  })
  insights(@Query() filter: ReportFilterDto) {
    return this.svc.getInsights(filter);
  }

  // ─── Saved Reports ────────────────────────────────────────────

  @Get('saved')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Listar relatórios guardados do utilizador' })
  listSaved(@CurrentUser() user: CurrentUserData, @Query('category') category?: ReportCategory) {
    return this.svc.listSavedReports(user.id, category);
  }

  @Post('saved')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Guardar relatório personalizado' })
  saveReport(@CurrentUser() user: CurrentUserData, @Body() dto: SaveReportDto) {
    return this.svc.saveReport(user.id, dto);
  }

  @Delete('saved/:id')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Remover relatório guardado' })
  deleteReport(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.deleteReport(id, user);
  }

  // ─── Templates ────────────────────────────────────────────────

  @Get('templates')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Biblioteca de templates pré-configurados (9 templates built-in)' })
  templates() {
    return this.svc.getTemplates();
  }

  // ─── Schedules ────────────────────────────────────────────────

  @Post('schedules')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Agendar relatório recorrente com distribuição por email' })
  createSchedule(@CurrentUser() user: CurrentUserData, @Body() dto: CreateScheduleDto) {
    return this.svc.createSchedule(user.id, dto);
  }

  @Get('schedules')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Listar agendamentos activos' })
  listSchedules(@CurrentUser() user: CurrentUserData) {
    return this.svc.listSchedules(user.id);
  }

  @Delete('schedules/:id')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Cancelar agendamento' })
  deleteSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.deleteSchedule(id, user);
  }

  // ─── CSV Export ───────────────────────────────────────────────

  @Get('export/headcount-csv')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="headcount.csv"')
  @ApiOperation({ summary: 'Exportar headcount como CSV' })
  async exportHeadcountCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.headcountReport(filter);
    const rows = [
      ...data.byDepartment.map(d => ({ grupo: 'Departamento', nome: d.name, quantidade: d.count })),
      ...data.byPosition.map(p => ({ grupo: 'Cargo', nome: p.name, quantidade: p.count })),
    ];
    return this.svc.exportToCsv(rows, ['grupo', 'nome', 'quantidade']);
  }

  @Get('export/turnover-csv')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="turnover.csv"')
  @ApiOperation({ summary: 'Exportar turnover como CSV' })
  async exportTurnoverCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.turnoverReport(filter);
    return this.svc.exportToCsv(
      [data.summary],
      ['total', 'inactive', 'newInPeriod', 'leftInPeriod', 'turnoverRate', 'retentionRate'],
    );
  }

  @Get('export/training-csv')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="training.csv"')
  @ApiOperation({ summary: 'Exportar relatório de formação como CSV' })
  async exportTrainingCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.trainingReportFull(filter);
    const rows = data.topCourses.map(c => ({
      curso: c.course?.title,
      categoria: c.course?.category,
      inscricoes: c.enrollments,
      conclusoes: c.completions,
      taxaConclusao: c.completionRate,
    }));
    return this.svc.exportToCsv(rows, [
      'curso',
      'categoria',
      'inscricoes',
      'conclusoes',
      'taxaConclusao',
    ]);
  }

  @Get('export/engagement-csv')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="engagement.csv"')
  @ApiOperation({ summary: 'Exportar relatório de envolvimento como CSV' })
  async exportEngagementCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.engagementReport(filter);
    const rows = data.surveys.map(s => ({
      titulo: s.title,
      tipo: s.type,
      respostas: s.responses,
      scoreMedio: s.avgScore,
    }));
    return this.svc.exportToCsv(rows, ['titulo', 'tipo', 'respostas', 'scoreMedio']);
  }

  @Get('export/talent-csv')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="talent.csv"')
  @ApiOperation({ summary: 'Exportar relatório de talento como CSV' })
  async exportTalentCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.talentReport(filter);
    const rows = data.successionPlans.map(sp => ({
      cargo: sp.position?.name,
      nivel: sp.position?.level,
      candidato: sp.candidate?.fullName,
      preparacao: sp.readiness,
    }));
    return this.svc.exportToCsv(rows, ['cargo', 'nivel', 'candidato', 'preparacao']);
  }

  @Get('export/compliance-csv')
  @Roles(...ADMIN)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="compliance.csv"')
  @ApiOperation({ summary: 'Exportar relatório de compliance como CSV' })
  async exportComplianceCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.complianceReport(filter);
    const rows = data.recentCertifications.map(c => ({
      colaborador: c.user?.fullName,
      departamento: c.user?.department?.name,
      tipo: c.type,
      codigo: c.code,
      emitidoEm: c.issuedAt,
    }));
    return this.svc.exportToCsv(rows, [
      'colaborador',
      'departamento',
      'tipo',
      'codigo',
      'emitidoEm',
    ]);
  }

  @Get('export/usage-csv')
  @Roles(...ADMIN)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="usage.csv"')
  @ApiOperation({ summary: 'Exportar relatório de uso da plataforma como CSV' })
  async exportUsageCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.platformUsageReport(filter);
    const rows = data.topContent.map(tc => ({
      conteudo: tc.content?.title,
      tipo: tc.content?.type,
      visualizacoes: tc.views,
    }));
    return this.svc.exportToCsv(rows, ['conteudo', 'tipo', 'visualizacoes']);
  }

  @Get('export/skill-gap-csv')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="skill-gap.csv"')
  @ApiOperation({ summary: 'Exportar gaps de competências como CSV' })
  async exportSkillGapCsv(@Query() filter: ReportFilterDto) {
    const data = await this.svc.skillGapReport(filter);
    const rows = data.skills.map(s => ({
      skill: s.competency?.name,
      type: s.competency?.type,
      users: s.count,
      usersWithGap: s.usersWithGap,
      avgGap: s.avgGap,
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
    const rows = data.topPerformers.map(r => ({
      name: r.user?.fullName,
      department: r.user?.department?.name,
      position: r.user?.position?.name,
      score: r.score,
      type: r.type,
    }));
    return this.svc.exportToCsv(rows, ['name', 'department', 'position', 'score', 'type']);
  }

  // ─── XLSX Export ──────────────────────────────────────────────

  @Get('export/headcount-xlsx')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="headcount.xlsx"')
  @ApiOperation({ summary: 'Exportar headcount como XLSX' })
  async exportHeadcountXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.headcountReport(filter);
    const rows = [
      ...data.byDepartment.map(d => ({ grupo: 'Departamento', nome: d.name, quantidade: d.count })),
      ...data.byPosition.map(p => ({ grupo: 'Cargo', nome: p.name, quantidade: p.count })),
    ];
    const buffer = await this.svc.exportToXlsx(rows, ['grupo', 'nome', 'quantidade'], 'Headcount');
    return new StreamableFile(buffer);
  }

  @Get('export/turnover-xlsx')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="turnover.xlsx"')
  @ApiOperation({ summary: 'Exportar turnover como XLSX' })
  async exportTurnoverXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.turnoverReport(filter);
    const buffer = await this.svc.exportToXlsx(
      [data.summary],
      ['total', 'inactive', 'newInPeriod', 'leftInPeriod', 'turnoverRate', 'retentionRate'],
      'Rotatividade',
    );
    return new StreamableFile(buffer);
  }

  @Get('export/training-xlsx')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="training.xlsx"')
  @ApiOperation({ summary: 'Exportar relatório de formação como XLSX' })
  async exportTrainingXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.trainingReportFull(filter);
    const rows = data.topCourses.map(c => ({
      curso: c.course?.title,
      categoria: c.course?.category,
      inscricoes: c.enrollments,
      conclusoes: c.completions,
      taxaConclusao: c.completionRate,
    }));
    const buffer = await this.svc.exportToXlsx(
      rows,
      ['curso', 'categoria', 'inscricoes', 'conclusoes', 'taxaConclusao'],
      'Formação',
    );
    return new StreamableFile(buffer);
  }

  @Get('export/engagement-xlsx')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="engagement.xlsx"')
  @ApiOperation({ summary: 'Exportar relatório de envolvimento como XLSX' })
  async exportEngagementXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.engagementReport(filter);
    const rows = data.surveys.map(s => ({
      titulo: s.title,
      tipo: s.type,
      respostas: s.responses,
      scoreMedio: s.avgScore,
    }));
    const buffer = await this.svc.exportToXlsx(
      rows,
      ['titulo', 'tipo', 'respostas', 'scoreMedio'],
      'Envolvimento',
    );
    return new StreamableFile(buffer);
  }

  @Get('export/talent-xlsx')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="talent.xlsx"')
  @ApiOperation({ summary: 'Exportar relatório de talento como XLSX' })
  async exportTalentXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.talentReport(filter);
    const rows = data.successionPlans.map(sp => ({
      cargo: sp.position?.name,
      nivel: sp.position?.level,
      candidato: sp.candidate?.fullName,
      preparacao: sp.readiness,
    }));
    const buffer = await this.svc.exportToXlsx(
      rows,
      ['cargo', 'nivel', 'candidato', 'preparacao'],
      'Talento',
    );
    return new StreamableFile(buffer);
  }

  @Get('export/compliance-xlsx')
  @Roles(...ADMIN)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="compliance.xlsx"')
  @ApiOperation({ summary: 'Exportar relatório de compliance como XLSX' })
  async exportComplianceXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.complianceReport(filter);
    const rows = data.recentCertifications.map(c => ({
      colaborador: c.user?.fullName,
      departamento: c.user?.department?.name,
      tipo: c.type,
      codigo: c.code,
      emitidoEm: c.issuedAt,
    }));
    const buffer = await this.svc.exportToXlsx(
      rows,
      ['colaborador', 'departamento', 'tipo', 'codigo', 'emitidoEm'],
      'Compliance',
    );
    return new StreamableFile(buffer);
  }

  @Get('export/usage-xlsx')
  @Roles(...ADMIN)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="usage.xlsx"')
  @ApiOperation({ summary: 'Exportar relatório de uso da plataforma como XLSX' })
  async exportUsageXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.platformUsageReport(filter);
    const rows = data.topContent.map(tc => ({
      conteudo: tc.content?.title,
      tipo: tc.content?.type,
      visualizacoes: tc.views,
    }));
    const buffer = await this.svc.exportToXlsx(
      rows,
      ['conteudo', 'tipo', 'visualizacoes'],
      'Uso da Plataforma',
    );
    return new StreamableFile(buffer);
  }

  @Get('export/skill-gap-xlsx')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="skill-gap.xlsx"')
  @ApiOperation({ summary: 'Exportar gaps de competências como XLSX' })
  async exportSkillGapXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.skillGapReport(filter);
    const rows = data.skills.map(s => ({
      skill: s.competency?.name,
      type: s.competency?.type,
      users: s.count,
      usersWithGap: s.usersWithGap,
      avgGap: s.avgGap,
    }));
    const buffer = await this.svc.exportToXlsx(
      rows,
      ['skill', 'type', 'users', 'usersWithGap', 'avgGap'],
      'Lacunas de Competências',
    );
    return new StreamableFile(buffer);
  }

  @Get('export/performance-xlsx')
  @Roles(...ALL_MGMT)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="performance.xlsx"')
  @ApiOperation({ summary: 'Exportar relatório de performance como XLSX' })
  async exportPerfXlsx(@Query() filter: ReportFilterDto) {
    const data = await this.svc.performanceReportFull(filter);
    const rows = data.topPerformers.map(r => ({
      name: r.user?.fullName,
      department: r.user?.department?.name,
      position: r.user?.position?.name,
      score: r.score,
      type: r.type,
    }));
    const buffer = await this.svc.exportToXlsx(
      rows,
      ['name', 'department', 'position', 'score', 'type'],
      'Performance',
    );
    return new StreamableFile(buffer);
  }
}

import { Injectable } from '@nestjs/common';

import { AnalyticsService } from '../../intelligence/analytics/analytics.service';
import { RoiImpactService } from '../../intelligence/roiimpact/roiimpact.service';
import { ReportsService } from '../../intelligence/reports/reports.service';
import { DashboardService } from '../../hr/dashboard/dashboard.service';
import { DashboardRhService } from '../../hr/dashboard-rh/dashboard-rh.service';
import { GamificationService } from '../../engagement/gamification/gamification.service';

@Injectable()
export class PainelFinalIntegradoService {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly roiImpactService: RoiImpactService,
    private readonly reportsService: ReportsService,
    private readonly dashboardService: DashboardService,
    private readonly dashboardRhService: DashboardRhService,
    private readonly gamificationService: GamificationService,
  ) {}

  async painelExecutivoGlobal() {
    const dashboard = await this.dashboardService.getExecutiveDashboard();

    const ranking = await this.gamificationService.ranking();

    const rh = await this.dashboardRhService.getDashboardSummary();

    return {
      dashboard,
      ranking,
      rh,
    };
  }

  async painelDepartamento(departmentId: number) {
    return this.dashboardService.getDepartmentDashboard(departmentId);
  }

  async analyticsCurso(courseId: number) {
    return this.analyticsService.courseStats(courseId);
  }

  async relatorioCurso(courseId: number) {
    return this.reportsService.courseReport(courseId);
  }

  async metricasUnidade(unitId: number) {
    return this.roiImpactService.getUnitMetrics(unitId);
  }

  async snapshotsHistoricos() {
    return this.dashboardService.listSnapshots();
  }

  async rankingGamificacao() {
    return this.gamificationService.ranking();
  }

  async resumoRh() {
    return this.dashboardRhService.getDashboardSummary();
  }
}
import { Controller, Get, Param, Post } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // 📊 Dashboard Executivo
  @Get('executive')
  getExecutiveDashboard() {
    return this.dashboardService.getExecutiveDashboard();
  }

  // 🏢 Dashboard por Departamento
  @Get('department/:departmentId')
  getDepartmentDashboard(@Param('departmentId') departmentId: string) {
    return this.dashboardService.getDepartmentDashboard(Number(departmentId));
  }

  // 📈 Gerar Snapshot Manual
  @Post('snapshot/:departmentId')
  generateSnapshot(@Param('departmentId') departmentId: string) {
    return this.dashboardService.generateSnapshot(Number(departmentId));
  }

  // 📚 Listar Snapshots
  @Get('snapshots')
  listSnapshots() {
    return this.dashboardService.listSnapshots();
  }
}
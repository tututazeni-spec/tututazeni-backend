import { Controller, Get, Param, Query } from '@nestjs/common';
import { DashboardRhService } from './dashboard-rh.service';

@Controller('dashboard-rh')
export class DashboardRhController {
  constructor(private readonly dashboardRhService: DashboardRhService) {}

  // EMPLOYEES
  @Get('employees')
  getAllEmployees() {
    return this.dashboardRhService.getAllEmployees();
  }

  @Get('employee/:id')
  getEmployee(@Param('id') id: string) {
    return this.dashboardRhService.getEmployeeById(id);
  }

  // CONTRACTS
  @Get('contracts/active')
  getActiveContracts() {
    return this.dashboardRhService.getActiveContracts();
  }

  @Get('contracts/expiring-soon')
  getContractsExpiringSoon(@Query('days') days: string) {
    return this.dashboardRhService.getContractsExpiringSoon(Number(days) || 30);
  }

  // EVALUATIONS
  @Get('evaluations/:employeeId')
  getEvaluations(@Param('employeeId') employeeId: string) {
    return this.dashboardRhService.getEvaluationsForEmployee(employeeId);
  }

  @Get('evaluations/:employeeId/average')
  getAverageEvaluation(@Param('employeeId') employeeId: string) {
    return this.dashboardRhService.getAverageEvaluation(employeeId);
  }

  // ATTENDANCE
  @Get('attendance/:employeeId')
  getAttendance(@Param('employeeId') employeeId: string) {
    return this.dashboardRhService.getAttendanceForEmployee(employeeId);
  }

  @Get('attendance/:employeeId/summary')
  getAttendanceSummary(@Param('employeeId') employeeId: string) {
    return this.dashboardRhService.getAttendanceSummary(employeeId);
  }

  // DASHBOARD METRICS
  @Get('summary')
  getDashboardSummary() {
    return this.dashboardRhService.getDashboardSummary();
  }
}
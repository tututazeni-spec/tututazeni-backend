import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Reports (Relatórios)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH', 'DIRECTOR', 'GESTOR')
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}
 
  @Get('training') @ApiOperation({ summary: 'Relatório de formação por período' })
  training(@Query('from') from: string, @Query('to') to: string, @Query('departmentId') deptId?: number) {
    return this.svc.trainingReport(from, to, deptId ? +deptId : undefined);
  }
 
  @Get('performance') @ApiOperation({ summary: 'Relatório de desempenho por período' })
  performance(@Query('period') period: string, @Query('departmentId') deptId?: number) {
    return this.svc.performanceReport(period, deptId ? +deptId : undefined);
  }
 
  @Get('attendance') @ApiOperation({ summary: 'Relatório de presenças' })
  attendance(@Query('from') from: string, @Query('to') to: string, @Query('departmentId') deptId?: number) {
    return this.svc.attendanceReport(from, to, deptId ? +deptId : undefined);
  }
 
  @Get('payroll') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Resumo da folha salarial por período' })
  payroll(@Query('period') period: string) { return this.svc.payrollSummary(period); }
 
  @Get('competency-gap') @ApiOperation({ summary: 'Relatório de lacunas de competências' })
  competencyGap(@Query('departmentId') deptId?: number) {
    return this.svc.competencyGapReport(deptId ? +deptId : undefined);
  }
}
 


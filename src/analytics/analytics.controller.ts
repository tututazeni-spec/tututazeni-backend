import { Controller, Get, Post, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { AnalyticsFilterDto } from './analytics.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Analytics & Intelligence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH', 'LIDER')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}
 
  @Get('overview')
  @ApiOperation({ summary: 'Visão geral da organização' })
  overview() { return this.svc.getOrganizationOverview(); }
 
  @Get('learning')
  @ApiOperation({ summary: 'Analytics de aprendizagem' })
  learning(@Query() filters: AnalyticsFilterDto) { return this.svc.getLearningAnalytics(filters); }
 
  @Get('engagement')
  @ApiOperation({ summary: 'Métricas de engajamento' })
  engagement(@Query() filters: AnalyticsFilterDto) { return this.svc.getEngagementMetrics(filters); }
 
  @Get('courses')
  @ApiOperation({ summary: 'Performance de cursos' })
  courses(@Query('courseId') courseId?: number) { return this.svc.getCoursePerformance(courseId); }
 
  @Get('courses/:courseId')
  @ApiOperation({ summary: 'Performance de curso específico' })
  courseDetail(@Param('courseId', ParseIntPipe) courseId: number) {
    return this.svc.getCoursePerformance(courseId);
  }
 
  @Get('departments/:departmentId')
  @ApiOperation({ summary: 'Analytics por departamento' })
  department(@Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.svc.getDepartmentAnalytics(departmentId);
  }
 
  @Get('snapshots')
  @ApiOperation({ summary: 'Histórico de snapshots do dashboard' })
  snapshots(@Query('departmentId') departmentId?: number) {
    return this.svc.getSnapshots(departmentId);
  }
 
  @Get('roi')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'ROI de treinamento' })
  roi() { return this.svc.getTrainingROI(); }
 
  @Post('snapshots/generate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gerar snapshot do dashboard' })
  generateSnapshot(@Query('departmentId') departmentId?: number) {
    return this.svc.generateDashboardSnapshot(departmentId);
  }
}
 

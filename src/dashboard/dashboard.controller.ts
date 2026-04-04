import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Dashboard (Painel Principal)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}
 
  @Get('my') @ApiOperation({ summary: 'Dashboard pessoal do colaborador' })
  myDashboard(@CurrentUser() user: any) { return this.svc.getMyDashboard(user.id); }
 
  @Get('manager') @Roles('GESTOR', 'DIRECTOR', 'ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard do gestor — equipa e pendentes' })
  managerDashboard(@CurrentUser() user: any) { return this.svc.getManagerDashboard(user.id); }
 
  @Get('organization') @Roles('ADMIN', 'DIRECTOR', 'RH')
  @ApiOperation({ summary: 'Resumo executivo da organização' })
  organizationSummary() { return this.svc.getOrganizationSummary(); }
}
 

 

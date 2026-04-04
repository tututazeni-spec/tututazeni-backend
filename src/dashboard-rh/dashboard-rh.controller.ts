import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardRhService } from './dashboard-rh.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Dashboard RH (Painel de Recursos Humanos)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH', 'DIRECTOR')
@Controller('dashboard-rh')
export class DashboardRhController {
  constructor(private readonly svc: DashboardRhService) {}
 
  @Get() @ApiOperation({ summary: 'Dashboard completo de RH — headcount, pendentes, presenças' })
  fullDashboard() { return this.svc.getFullRhDashboard(); }
 
  @Get('birthdays') @ApiOperation({ summary: 'Aniversários do mês' })
  birthdays() { return this.svc.getBirthdaysThisMonth(); }
 
  @Get('anniversaries') @ApiOperation({ summary: 'Aniversários de empresa este mês' })
  anniversaries() { return this.svc.getAnniversariesThisMonth(); }
 
  @Get('headcount-trend') @ApiOperation({ summary: 'Evolução do headcount nos últimos N meses' })
  trend(@Query('months') months?: number) {
    return this.svc.getHeadcountTrend(months ? +months : 6);
  }
}
 

 

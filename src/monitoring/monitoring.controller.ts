import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { MonitoringService } from './monitoring.service';
import { CreateIndicatorDto, CreateRecordDto, FilterIndicatorDto } from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Monitoria')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  // ─── DASHBOARD ───────────────────────────────────────

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard de Monitoria' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ─── INDICADORES ─────────────────────────────────────

  @Post('indicators')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar indicador de monitoria' })
  createIndicator(@Body() dto: CreateIndicatorDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createIndicator(dto, user.id);
  }

  @Get('indicators')
  @ApiOperation({ summary: 'Listar indicadores (paginado)' })
  findAllIndicators(@Query() filters: FilterIndicatorDto) {
    return this.service.findAllIndicators(filters);
  }

  @Post('indicators/:id/records')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar valor do indicador' })
  addRecord(
    @Param('id') id: string,
    @Body() dto: CreateRecordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addRecord(id, dto, user.id);
  }

  @Get('indicators/:id/history')
  @ApiOperation({ summary: 'Histórico do indicador' })
  getIndicatorHistory(@Param('id') id: string) {
    return this.service.getIndicatorHistory(id);
  }
}

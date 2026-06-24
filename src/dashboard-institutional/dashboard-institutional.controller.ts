import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { DashboardInstitutionalService } from './dashboard-institutional.service';
import { CreateSnapshotDto, CreateWidgetDto, UpdateWidgetDto, FilterSnapshotDto } from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Dashboard Institucional')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard-institutional')
export class DashboardInstitutionalController {
  constructor(private readonly service: DashboardInstitutionalService) {}

  // ─── LEITURA / AGREGAÇÃO ─────────────────────────────

  @Get('summary')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Resumo executivo (KPIs globais)' })
  getExecutiveSummary() {
    return this.service.getExecutiveSummary();
  }

  @Get('growth-trend')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Tendência de crescimento (N meses)' })
  getGrowthTrend(@Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number) {
    return this.service.getGrowthTrend(months);
  }

  @Get('geographic')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Distribuição geográfica' })
  getGeographicDistribution() {
    return this.service.getGeographicDistribution();
  }

  @Get('alerts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Alertas institucionais' })
  getAlerts() {
    return this.service.getAlerts();
  }

  // ─── SNAPSHOTS ───────────────────────────────────────

  @Post('snapshots')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar snapshot de KPIs do período' })
  createSnapshot(@Body() dto: CreateSnapshotDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createSnapshot(dto, user.id);
  }

  @Get('snapshots')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar snapshots (histórico de KPIs)' })
  findAllSnapshots(@Query() filters: FilterSnapshotDto) {
    return this.service.findAllSnapshots(filters);
  }

  @Get('snapshots/compare')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Comparar dois períodos' })
  compareSnapshots(
    @Query('period1') period1: string,
    @Query('period2') period2: string,
    @Query('type') type?: string,
  ) {
    return this.service.compareSnapshots(period1, period2, type);
  }

  // ─── WIDGETS ─────────────────────────────────────────

  @Post('widgets')
  @ApiOperation({ summary: 'Criar widget personalizado' })
  createWidget(@Body() dto: CreateWidgetDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createWidget(dto, user.id);
  }

  @Get('widgets')
  @ApiOperation({ summary: 'Meus widgets' })
  getMyWidgets(@CurrentUser() user: CurrentUserData) {
    return this.service.getMyWidgets(user.id);
  }

  @Put('widgets/:id')
  @ApiOperation({ summary: 'Actualizar widget' })
  updateWidget(
    @Param('id') id: string,
    @Body() dto: UpdateWidgetDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateWidget(id, dto, user.id);
  }

  @Delete('widgets/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover widget' })
  deleteWidget(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.deleteWidget(id, user.id);
  }
}

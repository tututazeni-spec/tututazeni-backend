// modulo_scalability.md §7-9 — rotas das abas API & Backend e Base de Dados.

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FrontendPerfSampleDto } from './frontend-perf.dto';
import { ScalabilityCapacityService } from './scalability-capacity.service';
import {
  UpdateAutoScalingDto,
  UpdateCapacityLimitsDto,
  UpdateForecastSettingsDto,
  UpdateResilienceDto,
} from './scalability-capacity.dto';
import { ScalabilityForecastService } from './scalability-forecast.service';
import { ScalabilityIncidentsService } from './scalability-incidents.service';
import {
  CreateIncidentDto,
  ListIncidentsQueryDto,
  UpdateIncidentDto,
} from './scalability-incidents.dto';
import { ScalabilityInfraService } from './scalability-infra.service';
import { ScalabilityIntegrationsPerfService } from './scalability-integrations-perf.service';
import { ScalabilityQueuesService } from './scalability-queues.service';
import { ScalabilityStorageService } from './scalability-storage.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserData } from '../common/types/current-user';

@ApiTags('Escalabilidade')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scalability')
export class ScalabilityInfraController {
  constructor(
    private readonly infra: ScalabilityInfraService,
    private readonly queues: ScalabilityQueuesService,
    private readonly storage: ScalabilityStorageService,
    private readonly integrationsPerf: ScalabilityIntegrationsPerfService,
    private readonly capacity: ScalabilityCapacityService,
    private readonly incidents: ScalabilityIncidentsService,
    private readonly forecasts: ScalabilityForecastService,
  ) {}

  @Get('api-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba API & Backend: latência, percentis, erros e endpoints' })
  getApiMetrics() {
    return this.infra.getApiMetrics();
  }

  @Get('database-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({
    summary: 'Aba Base de Dados: indicadores, queries lentas, índices e crescimento',
  })
  getDatabaseMetrics() {
    return this.infra.getDatabaseMetrics();
  }

  // Qualquer utilizador autenticado reporta a sua própria navegação (RUM).
  @Post('frontend-perf')
  @ApiOperation({ summary: 'Recebe uma amostra de performance de página do browser' })
  recordFrontendPerf(@Body() dto: FrontendPerfSampleDto) {
    return this.infra.recordFrontendSample(dto);
  }

  @Get('frontend-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Conteúdo & CDN: Web Vitals, bundle, cache e páginas críticas' })
  getFrontendMetrics() {
    return this.infra.getFrontendMetrics();
  }

  @Get('queue-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Filas & Jobs: estado das filas, throughput e queue depth' })
  getQueueMetrics() {
    return this.queues.getQueueMetrics();
  }

  @Get('storage-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Storage: utiliza��o por m�dulo, tipo, unidade e crescimento' })
  getStorageMetrics() {
    return this.storage.getStorageMetrics();
  }

  @Get('integration-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({
    summary: 'Aba Integrações: requests, erros, latência, retries e jobs por integração',
  })
  getIntegrationMetrics() {
    return this.integrationsPerf.getIntegrationMetrics();
  }

  @Get('performance-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Performance: KPIs transversais com classificação' })
  getPerformanceMetrics() {
    return this.integrationsPerf.getPerformanceMetrics();
  }

  @Get('capacity-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Capacidade: uso actual vs. capacidade máxima por recurso' })
  getCapacityMetrics() {
    return this.capacity.getCapacityMetrics();
  }

  @Patch('capacity-limits')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Define os limites de concurrent users e API RPS' })
  updateCapacityLimits(@Body() dto: UpdateCapacityLimitsDto, @CurrentUser() user: CurrentUserData) {
    return this.capacity.updateCapacityLimits(dto, Number(user.id));
  }

  @Get('auto-scaling')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Auto Scaling: política e avaliação das regras' })
  getAutoScaling() {
    return this.capacity.getAutoScaling();
  }

  @Patch('auto-scaling')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualiza a política de auto scaling (registada no Audit)' })
  updateAutoScaling(@Body() dto: UpdateAutoScalingDto, @CurrentUser() user: CurrentUserData) {
    return this.capacity.updateAutoScaling(dto, Number(user.id));
  }

  @Get('resilience-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Resiliência: verificações, RPO/RTO, backups e DR' })
  getResilienceMetrics() {
    return this.capacity.getResilienceMetrics();
  }

  @Patch('resilience')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualiza objectivos RPO/RTO e factos de infra (registado no Audit)' })
  updateResilience(@Body() dto: UpdateResilienceDto, @CurrentUser() user: CurrentUserData) {
    return this.capacity.updateResilience(dto, Number(user.id));
  }

  @Get('incidents')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Incidentes de Capacidade: lista e resumo' })
  listIncidents(@Query() q: ListIncidentsQueryDto) {
    return this.incidents.list(q);
  }

  @Post('incidents')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Regista um incidente de capacidade (registado no Audit)' })
  createIncident(@Body() dto: CreateIncidentDto, @CurrentUser() user: CurrentUserData) {
    return this.incidents.create(dto, Number(user.id));
  }

  @Patch('incidents/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualiza um incidente / muda o estado (registado no Audit)' })
  updateIncident(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.incidents.update(id, dto, Number(user.id));
  }

  @Get('forecasts')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Previsões: crescimento projectado e datas de esgotamento' })
  getForecasts() {
    return this.forecasts.getForecasts();
  }

  @Patch('forecast-settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Define a capacidade da BD usada nas previsões (registado no Audit)' })
  updateForecastSettings(
    @Body() dto: UpdateForecastSettingsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.forecasts.updateForecastSettings(dto.dbCapacityGb ?? null, Number(user.id));
  }
}

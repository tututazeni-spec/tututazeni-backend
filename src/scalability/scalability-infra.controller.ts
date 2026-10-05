// modulo_scalability.md §7-9 — rotas das abas API & Backend e Base de Dados.

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FrontendPerfSampleDto } from './frontend-perf.dto';
import { ScalabilityWhatIfService, WhatIfDto } from './scalability-whatif.service';
import { ScalabilityHistoryService } from './scalability-history.service';
import { ScalabilityCapacityService } from './scalability-capacity.service';
import {
  UpdateAutoScalingDto,
  UpdateCapacityLimitsDto,
  UpdateForecastSettingsDto,
  UpdateResilienceDto,
} from './scalability-capacity.dto';
import { ScalabilityAlertsService } from './scalability-alerts.service';
import { ScalabilityCostsService, SaveCostsDto } from './scalability-costs.service';
import { ScalabilityForecastService } from './scalability-forecast.service';
import { ScalabilityLoadTestsService } from './scalability-loadtests.service';
import {
  CreateLoadTestDto,
  ListLoadTestsQueryDto,
  UpdateLoadTestDto,
} from './scalability-loadtests.dto';
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
import {
  ReportFormat,
  ScalabilityReportsService,
  ScalabilityReportType,
} from './scalability-reports.service';
import { ScalabilitySettingsService } from './scalability-settings.service';
import { ScalabilityModulesService } from './scalability-modules.service';
import { ReportExportQueryDto } from './scalability-reports.dto';
import { UpdateScalabilitySettingsDto as UpdateScalabilityDto } from './scalability-settings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AUTHENTICATED_ROLES, Role } from '../auth/enums/role.enum';
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
    private readonly loadTests: ScalabilityLoadTestsService,
    private readonly costs: ScalabilityCostsService,
    private readonly alertRules: ScalabilityAlertsService,
    private readonly reports: ScalabilityReportsService,
    private readonly settings: ScalabilitySettingsService,
    private readonly modules: ScalabilityModulesService,
    private readonly history: ScalabilityHistoryService,
    private readonly whatIf: ScalabilityWhatIfService,
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
  @Get('load-tests')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Testes de Carga: lista, resumo e limiares' })
  listLoadTests(@Query() q: ListLoadTestsQueryDto) {
    return this.loadTests.list(q);
  }

  @Post('load-tests')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Regista um teste de carga (registado no Audit)' })
  createLoadTest(@Body() dto: CreateLoadTestDto, @CurrentUser() user: CurrentUserData) {
    return this.loadTests.create(dto, Number(user.id));
  }

  @Patch('load-tests/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Actualiza estado/resultados/veredicto de um teste (registado no Audit)',
  })
  updateLoadTest(
    @Param('id') id: string,
    @Body() dto: UpdateLoadTestDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loadTests.update(id, dto, Number(user.id));
  }

  @Get('costs')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Custos: indicadores, histórico e previsão por escalão' })
  getCosts() {
    return this.costs.getCosts();
  }

  @Put('costs')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Guarda os custos de um mês por categoria (registado no Audit)' })
  saveCosts(@Body() dto: SaveCostsDto, @CurrentUser() user: CurrentUserData) {
    return this.costs.saveCosts(dto, Number(user.id));
  }

  @Get('alert-rules')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Alertas: regras automáticas por grupo e estado actual' })
  getAlertRules() {
    return this.alertRules.getOverview();
  }

  @Post('alert-rules/evaluate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Avalia já as regras de alerta (cria/resolve alertas)' })
  evaluateAlertRules() {
    return this.alertRules.evaluateAndRaise();
  }

  @Get('history/queues')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: '§27 QueueMetric: histórico persistido das filas' })
  getQueueHistory(@Query('hours') hours?: string, @Query('queue') queue?: string) {
    return this.history.getQueueHistory(Number(hours) || 24, queue);
  }

  @Get('history/endpoints')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: '§27 PerformanceMetric: p50/p95/p99 por endpoint ao longo do tempo' })
  getEndpointHistory(@Query('hours') hours?: string, @Query('endpoint') endpoint?: string) {
    return this.history.getEndpointHistory(Number(hours) || 24, endpoint);
  }

  @Get('history/hourly')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: '§28: métricas agregadas por hora (downsampling)' })
  getHourlyHistory(@Query('days') days?: string) {
    return this.history.getHourlyHistory(Number(days) || 30);
  }

  @Get('history/retention')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: '§28: estado de retenção e downsampling' })
  getRetentionStatus() {
    return this.history.getRetentionStatus();
  }

  @Post('what-if')
  @Roles(Role.ADMIN, Role.AUDITOR, Role.DIRECTOR)
  @ApiOperation({ summary: '§29 P2: simulação de crescimento e recomendações de dimensionamento' })
  simulateWhatIf(@Body() dto: WhatIfDto) {
    return this.whatIf.simulate(dto);
  }

  @Get('module-usage')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: '§25: volume e crescimento por módulo da INNOVA' })
  getModuleUsage() {
    return this.modules.getModuleUsage();
  }

  @Get('technical-integrations')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({
    summary:
      '§26: estado da integração com Audit, Processes, Automations, Notifications, Analytics',
  })
  getTechnicalIntegrations() {
    return this.modules.getTechnicalIntegrations();
  }

  @Get('capacity-summary')
  @Roles(Role.ADMIN, Role.AUDITOR, Role.DIRECTOR)
  @ApiOperation({ summary: '§26: resumo de capacidade consumível por Analytics/Executive Reports' })
  getCapacitySummary() {
    return this.modules.getCapacitySummary();
  }

  // §23 Relatórios e §24 Configurações — acesso por perfil configurável (ADMIN sempre);
  // o RolesGuard só exige sessão válida, a lista de perfis autorizados é verificada no serviço.
  @Get('reports')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Aba Relatórios: catálogo de relatórios e formatos' })
  async listReports(@CurrentUser() user: CurrentUserData) {
    await this.settings.assertCanAccess(user);
    return this.reports.catalog();
  }

  @Get('reports/:type')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Pré-visualiza um relatório (resumo + tabelas)' })
  async previewReport(@Param('type') type: string, @CurrentUser() user: CurrentUserData) {
    await this.settings.assertCanAccess(user);
    return this.reports.build(type as ScalabilityReportType);
  }

  @Get('reports/:type/export')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Exporta um relatório em csv | xlsx | pdf (registado no Audit)' })
  async exportReport(
    @Param('type') type: string,
    @Query() q: ReportExportQueryDto,
    @CurrentUser() user: CurrentUserData,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.settings.assertCanAccess(user);
    const out = await this.reports.export(
      type as ScalabilityReportType,
      q.format as ReportFormat,
      Number(user.id),
    );
    res.set({
      'Content-Type': out.mimeType,
      'Content-Disposition': `attachment; filename="${out.fileName}"`,
    });
    return new StreamableFile(out.buffer);
  }

  @Get('settings')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Aba Configurações: limites, regras, janelas, retenção, perfis' })
  async getSettings(@CurrentUser() user: CurrentUserData) {
    await this.settings.assertCanAccess(user);
    return this.settings.getSettings();
  }

  @Patch('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualiza as configurações do módulo (registado no Audit)' })
  updateSettings(@Body() dto: UpdateScalabilityDto, @CurrentUser() user: CurrentUserData) {
    return this.settings.update(dto, Number(user.id));
  }
}

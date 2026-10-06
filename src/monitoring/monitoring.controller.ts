// modulo_monitoring.md §1-9 — Visão Geral, Módulos, Processos, Automações, Integrações,
// Performance, Alertas, Incidentes e Health Check.
// Leitura para perfis técnicos/de gestão; as ações (alertas e incidentes) só para ADMIN. Acesso restrito a perfis técnicos/de gestão (o módulo não aparece
// para colaboradores comuns — ver recomendação no documento).

import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserData } from '../common/types/current-user';
import { Role } from '../auth/enums/role.enum';
import { CreateIncidentDto, UpdateIncidentDto } from '../scalability/scalability-incidents.dto';
import { MonitoringOverviewService } from './monitoring-overview.service';
import { MonitoringModulesService } from './monitoring-modules.service';
import { MonitoringProcessesService } from './monitoring-processes.service';
import { MonitoringAutomationsService } from './monitoring-automations.service';
import { MonitoringIntegrationsService } from './monitoring-integrations.service';
import { MonitoringPerformanceService } from './monitoring-performance.service';
import { MonitoringAlertsService } from './monitoring-alerts.service';
import {
  AlertActionDto,
  AssignAlertDto,
  ListAlertsQueryDto,
  ResolveAlertActionDto,
} from './monitoring-alerts.dto';
import { MonitoringIncidentsService } from './monitoring-incidents.service';
import {
  INCIDENT_KINDS,
  IncidentKind,
  ListMonitoringIncidentsQueryDto,
} from './monitoring-incidents.dto';
import { MonitoringHealthService } from './monitoring-health.service';

@ApiTags('Monitoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.AUDITOR, Role.RH, Role.DIRECTOR, Role.GESTOR)
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly overview: MonitoringOverviewService,
    private readonly modules: MonitoringModulesService,
    private readonly processes: MonitoringProcessesService,
    private readonly automations: MonitoringAutomationsService,
    private readonly integrations: MonitoringIntegrationsService,
    private readonly performance: MonitoringPerformanceService,
    private readonly alerts: MonitoringAlertsService,
    private readonly incidents: MonitoringIncidentsService,
    private readonly health: MonitoringHealthService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Visão Geral: estado da plataforma, alertas, SLA, incidentes' })
  getOverview() {
    return this.overview.getOverview();
  }

  @Get('modules')
  @ApiOperation({ summary: 'Estado, disponibilidade, erros e dependências de cada módulo' })
  getModules() {
    return this.modules.getModules();
  }

  @Get('processes')
  @ApiOperation({ summary: 'Processos em execução, atrasados, bloqueados, SLA e falhas' })
  getProcesses() {
    return this.processes.getProcesses();
  }

  @Get('automations')
  @ApiOperation({ summary: 'Automações: execuções, sucesso/falhas, retries, próximas execuções' })
  getAutomations() {
    return this.automations.getAutomations();
  }

  @Get('integrations')
  @ApiOperation({
    summary: 'Integrações: estado da ligação, sincronização, falhas, tempo de resposta',
  })
  getIntegrations() {
    return this.integrations.getIntegrations();
  }

  @Get('performance')
  @ApiOperation({
    summary: 'Performance: API, CPU/memória, base de dados, filas, storage, endpoints',
  })
  getPerformance() {
    return this.performance.getPerformance();
  }

  // ── §7 Alertas ────────────────────────────────────────────────────────────

  @Get('alerts')
  @ApiOperation({ summary: 'Alertas por área, severidade e estado, com responsável e ações' })
  listAlerts(@Query() q: ListAlertsQueryDto) {
    return this.alerts.list(q);
  }

  @Patch('alerts/:id/acknowledge')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reconhece um alerta (registado no Audit)' })
  acknowledgeAlert(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.alerts.acknowledge(id, Number(user.id));
  }

  @Patch('alerts/:id/assign')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Atribui um responsável ao alerta (registado no Audit)' })
  assignAlert(
    @Param('id') id: string,
    @Body() dto: AssignAlertDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.alerts.assign(id, dto.assigneeId, Number(user.id));
  }

  @Post('alerts/:id/actions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Regista a ação tomada sobre o alerta (registado no Audit)' })
  addAlertAction(
    @Param('id') id: string,
    @Body() dto: AlertActionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.alerts.addAction(id, dto.note, Number(user.id));
  }

  @Patch('alerts/:id/resolve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Resolve um alerta (registado no Audit)' })
  resolveAlert(
    @Param('id') id: string,
    @Body() dto: ResolveAlertActionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.alerts.resolve(id, dto.note, Number(user.id));
  }

  @Post('alerts/:id/incident')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Abre um incidente operacional a partir de um alerta' })
  createIncidentFromAlert(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.alerts.createIncident(id, Number(user.id));
  }

  // ── §8 Incidentes ─────────────────────────────────────────────────────────

  @Get('incidents')
  @ApiOperation({ summary: 'Incidentes operacionais e de segurança, activos e resolvidos' })
  listIncidents(@Query() q: ListMonitoringIncidentsQueryDto) {
    return this.incidents.list(q);
  }

  @Get('incidents/:kind/:id')
  @ApiOperation({ summary: 'Detalhe de um incidente: causa, resolução, timeline' })
  getIncident(
    @Param('kind', new ParseEnumPipe(INCIDENT_KINDS)) kind: IncidentKind,
    @Param('id') id: string,
  ) {
    return this.incidents.detail(kind, id);
  }

  @Post('incidents')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Novo incidente operacional (registado no Audit)' })
  createIncident(@Body() dto: CreateIncidentDto, @CurrentUser() user: CurrentUserData) {
    return this.incidents.create(dto, Number(user.id));
  }

  @Patch('incidents/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualiza/muda o estado de um incidente operacional' })
  updateIncident(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.incidents.update(id, dto, Number(user.id));
  }

  // ── §9 Health Check ───────────────────────────────────────────────────────

  @Get('health')
  @ApiOperation({
    summary:
      'Health Check: API, frontend, backend, PostgreSQL, Redis, storage, workers, filas, crons',
  })
  getHealth(@Query('fresh') fresh?: string) {
    return this.health.getHealth(fresh === 'true');
  }
}

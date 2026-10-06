// modulo_monitoring.md §1-6 — Visão Geral, Módulos, Processos, Automações, Integrações e Performance.
// Só leitura. Acesso restrito a perfis técnicos/de gestão (o módulo não aparece
// para colaboradores comuns — ver recomendação no documento).

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { MonitoringOverviewService } from './monitoring-overview.service';
import { MonitoringModulesService } from './monitoring-modules.service';
import { MonitoringProcessesService } from './monitoring-processes.service';
import { MonitoringAutomationsService } from './monitoring-automations.service';
import { MonitoringIntegrationsService } from './monitoring-integrations.service';
import { MonitoringPerformanceService } from './monitoring-performance.service';

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
}

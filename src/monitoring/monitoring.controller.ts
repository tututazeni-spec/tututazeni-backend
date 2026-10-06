// modulo_monitoring.md §1-3 — Visão Geral, Módulos e Processos.
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
}

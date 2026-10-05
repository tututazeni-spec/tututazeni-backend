// modulo_scalability.md §7-9 — rotas das abas API & Backend e Base de Dados.

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScalabilityInfraService } from './scalability-infra.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Escalabilidade')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scalability')
export class ScalabilityInfraController {
  constructor(private readonly infra: ScalabilityInfraService) {}

  @Get('api-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba API & Backend: latência, percentis, erros e endpoints' })
  getApiMetrics() {
    return this.infra.getApiMetrics();
  }

  @Get('database-metrics')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Aba Base de Dados: indicadores, queries lentas, índices e crescimento' })
  getDatabaseMetrics() {
    return this.infra.getDatabaseMetrics();
  }
}

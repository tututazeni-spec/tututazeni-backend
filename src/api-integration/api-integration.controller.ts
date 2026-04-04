import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiIntegrationService } from './api-integration.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';

@ApiTags('API Integration (Integrações com Sistemas Externos)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('api-integrations')
export class ApiIntegrationController {
  constructor(private readonly svc: ApiIntegrationService) {}

  @Get()
  @ApiOperation({ summary: 'Listar integrações configuradas' })
  findAll() {
    return this.svc.getIntegrations();
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Logs de chamadas de uma integração' })
  logs(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: number) {
    return this.svc.getLogs(id, limit ? +limit : 50);
  }

  // FIX: body actualizado para corresponder à interface IntegrationData (type e endpoint obrigatórios)
  @Post()
  @ApiOperation({ summary: 'Registar nova integração' })
  create(
    @Body() body: {
      name: string;
      type: string;
      endpoint: string;
      baseUrl?: string;
      apiKey?: string;
      active?: boolean;
    },
  ) {
    return this.svc.createIntegration(body);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Testar conectividade da integração' })
  test(@Param('id', ParseIntPipe) id: number) {
    return this.svc.testIntegration(id);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Activar/desactivar integração' })
  toggle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleIntegration(id);
  }
}
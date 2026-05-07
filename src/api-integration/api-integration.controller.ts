// src/api-integration/api-integration.controller.ts
import {
  Controller, Get, Post, Patch, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiIntegrationService } from './api-integration.service';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import {
  CreateIntegrationDto, UpdateIntegrationDto, IntegrationLogFilterDto,
  CreateApiKeyDto, CreateWebhookDto, TriggerWebhookDto,
} from './api-integration.dto';

const ADMIN = ['ADMIN', 'RH'] as const;

@ApiTags('API Integration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('api-integrations')
export class ApiIntegrationController {
  constructor(private readonly svc: ApiIntegrationService) {}

  // ─── Integrations ─────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar integrações com status de saúde' })
  findAll() { return this.svc.getIntegrations(); }

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard de monitoramento — saúde, logs 24h, latência média' })
  stats() { return this.svc.getStats(); }

  @Get('logs')
  @ApiOperation({ summary: 'Todos os logs de integração (paginados)' })
  allLogs(@Query() filters: IntegrationLogFilterDto) {
    return this.svc.getAllLogs(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma integração com stats de erro' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getIntegration(id);
  }

  @Post()
  @ApiOperation({ summary: 'Registar nova integração (HRIS, ERP, LMS, BI…)' })
  create(@Body() dto: CreateIntegrationDto) {
    return this.svc.createIntegration(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar integração' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIntegrationDto) {
    return this.svc.updateIntegration(id, dto);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Testar conectividade (HEAD request + log latência)' })
  test(@Param('id', ParseIntPipe) id: number) {
    return this.svc.testIntegration(id);
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: 'Activar/desactivar integração' })
  toggle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleIntegration(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover integração' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteIntegration(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Logs de chamadas de uma integração específica' })
  logs(@Param('id', ParseIntPipe) id: number, @Query() filters: IntegrationLogFilterDto) {
    return this.svc.getLogs(id, filters);
  }

  // ─── API Keys ────────────────────────────────────────────────

  @Get('api-keys/list')
  @ApiOperation({ summary: 'Listar API Keys (sem revelar o valor)' })
  getApiKeys(@CurrentUser() user: any) {
    return this.svc.getApiKeys();
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'Criar nova API Key (retorna o valor RAW uma única vez)' })
  createApiKey(@Body() dto: CreateApiKeyDto, @CurrentUser() user: any) {
    return this.svc.createApiKey(dto, user.id);
  }

  @Post('api-keys/:id/revoke')
  @ApiOperation({ summary: 'Revogar API Key imediatamente' })
  revokeApiKey(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.revokeApiKey(id, user.id);
  }

  @Post('api-keys/:id/rotate')
  @ApiOperation({ summary: 'Rotacionar API Key (gera nova, invalida antiga)' })
  rotateApiKey(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.rotateApiKey(id, user.id);
  }

  @Post('api-keys/validate')
  @ApiOperation({ summary: 'Validar uma API Key (para middleware de autenticação)' })
  validateApiKey(@Body() body: { key: string }) {
    return this.svc.validateApiKey(body.key);
  }

  // ─── Webhooks ────────────────────────────────────────────────

  @Get('webhooks/list')
  @ApiOperation({ summary: 'Listar webhooks configurados com estatísticas de entrega' })
  getWebhooks() { return this.svc.getWebhooks(); }

  @Post('webhooks')
  @ApiOperation({ summary: 'Registar webhook externo (URL + eventos subscritos)' })
  createWebhook(@Body() dto: CreateWebhookDto, @CurrentUser() user: any) {
    return this.svc.createWebhook(dto, user.id);
  }

  @Patch('webhooks/:id/toggle')
  @ApiOperation({ summary: 'Activar/desactivar webhook' })
  toggleWebhook(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleWebhook(id);
  }

  @Delete('webhooks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover webhook' })
  deleteWebhook(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteWebhook(id);
  }

  @Post('webhooks/trigger')
  @ApiOperation({ summary: 'Disparar evento para todos os webhooks subscritos' })
  triggerWebhook(@Body() dto: TriggerWebhookDto) {
    return this.svc.triggerWebhook(dto);
  }

  @Get('webhooks/:id/deliveries')
  @ApiOperation({ summary: 'Histórico de entregas de um webhook (status, attempts, timestamp)' })
  webhookDeliveries(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getWebhookDeliveries(id, limit ? +limit : 20);
  }
}

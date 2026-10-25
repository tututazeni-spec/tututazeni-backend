// src/api-integration/api-integration.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ApiIntegrationService } from './api-integration.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import {
  CreateIntegrationDto,
  UpdateIntegrationDto,
  TestIntegrationConnectionDto,
  IntegrationLogFilterDto,
  CreateApiKeyDto,
  CreateWebhookDto,
  TriggerWebhookDto,
  ValidateApiKeyBodyDto,
} from './api-integration.dto';

import { ADMIN_RH_ROLES } from '../auth/enums/role-groups';

const ADMIN = ADMIN_RH_ROLES;

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
  findAll() {
    return this.svc.getIntegrations();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard de monitoramento — saúde, logs 24h, latência média' })
  stats() {
    return this.svc.getStats();
  }

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

  // Rota estática ("test-connection") — sem conflito com `:id/test` (dois
  // segmentos). Usada pelo botão "Testar conexão" do formulário de criação,
  // antes de a integração existir.
  @Post('test-connection')
  @ApiOperation({ summary: 'Testar conectividade antes de criar a integração' })
  testConnectionDraft(@Body() dto: TestIntegrationConnectionDto) {
    return this.svc.testConnectionDraft(dto);
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
  getApiKeys(@CurrentUser() _user: CurrentUserData) {
    return this.svc.getApiKeys();
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'Criar nova API Key (retorna o valor RAW uma única vez)' })
  @Roles(Role.ADMIN)
  createApiKey(@Body() dto: CreateApiKeyDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createApiKey(dto, user.id);
  }

  @Post('api-keys/:id/revoke')
  @ApiOperation({ summary: 'Revogar API Key imediatamente' })
  @Roles(Role.ADMIN)
  revokeApiKey(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.revokeApiKey(id, user.id);
  }

  @Post('api-keys/:id/rotate')
  @ApiOperation({ summary: 'Rotacionar API Key (gera nova, invalida antiga)' })
  @Roles(Role.ADMIN)
  rotateApiKey(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.rotateApiKey(id, user.id);
  }

  @Post('api-keys/validate')
  @ApiOperation({ summary: 'Validar uma API Key (para middleware de autenticação)' })
  validateApiKey(@Body() dto: ValidateApiKeyBodyDto) {
    return this.svc.validateApiKey(dto.key);
  }

  // ─── Webhooks ────────────────────────────────────────────────

  @Get('webhooks/list')
  @ApiOperation({ summary: 'Listar webhooks configurados com estatísticas de entrega' })
  getWebhooks() {
    return this.svc.getWebhooks();
  }

  @Post('webhooks')
  @ApiOperation({ summary: 'Registar webhook externo (URL + eventos subscritos)' })
  @Roles(Role.ADMIN)
  createWebhook(@Body() dto: CreateWebhookDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createWebhook(dto, user.id);
  }

  @Patch('webhooks/:id/toggle')
  @ApiOperation({ summary: 'Activar/desactivar webhook' })
  @Roles(Role.ADMIN)
  toggleWebhook(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleWebhook(id);
  }

  @Delete('webhooks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover webhook' })
  @Roles(Role.ADMIN)
  deleteWebhook(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteWebhook(id);
  }

  @Post('webhooks/trigger')
  @ApiOperation({ summary: 'Disparar evento para todos os webhooks subscritos' })
  @Roles(Role.ADMIN)
  triggerWebhook(@Body() dto: TriggerWebhookDto) {
    return this.svc.triggerWebhook(dto);
  }

  @Get('webhooks/:id/deliveries')
  @ApiOperation({ summary: 'Histórico de entregas de um webhook (status, attempts, timestamp)' })
  webhookDeliveries(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.svc.getWebhookDeliveries(id, limit ? +limit : 20);
  }
}

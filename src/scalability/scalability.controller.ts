// ============================================================
// INNOVA PLATFORM — SCALABILITY MODULE — CONTROLLER
// src/modules/scalability/scalability.controller.ts
// ============================================================

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ScalabilityService } from './scalability.service';
import {
  CreateTenantConfigDto,
  UpdateTenantConfigDto,
  CreateIntegrationConfigDto,
  UpdateIntegrationConfigDto,
  TriggerSyncDto,
  CreateAutomationRuleDto,
  UpdateAutomationRuleDto,
  ExecuteAutomationRuleDto,
  CreateSlaConfigDto,
  UpdateSlaConfigDto,
  UpdateContentDeliveryConfigDto,
  MetricsQueryDto,
  CreateAlertDto,
  AlertsQueryDto,
  ResolveAlertDto,
  BulkUserImportDto,
  LoadTestConfigDto,
  PaginationDto,
} from './scalability.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Escalabilidade')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scalability')
export class ScalabilityController {
  constructor(private readonly service: ScalabilityService) {}

  // ============================================================
  // DASHBOARD
  // ============================================================

  @Get('dashboard/:tenantId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard de escalabilidade do tenant' })
  async getDashboard(@Param('tenantId') tenantId: string) {
    return this.service.getDashboard(tenantId);
  }

  // ============================================================
  // TENANT CONFIG
  // ============================================================

  @Post('tenants')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar novo tenant (empresa)' })
  @ApiResponse({ status: 201, description: 'Tenant criado com sucesso' })
  async createTenant(@Body() dto: CreateTenantConfigDto, @Request() req: any) {
    return this.service.createTenant(dto, req.user.id);
  }

  @Patch('tenants/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar configuração do tenant' })
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantConfigDto,
    @Request() req: any,
  ) {
    return this.service.updateTenant(id, dto, req.user.id);
  }

  @Get('tenants')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Listar todos os tenants' })
  async listTenants(@Query() query: PaginationDto) {
    return this.service.listTenants(query);
  }

  @Get('tenants/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Obter tenant por ID' })
  async getTenant(@Param('id') id: string) {
    return this.service.findTenantOrFail(id);
  }

  // ============================================================
  // INTEGRATIONS
  // ============================================================

  @Post('integrations')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar nova integração (ERP, Slack, Teams...)' })
  async createIntegration(@Body() dto: CreateIntegrationConfigDto, @Request() req: any) {
    return this.service.createIntegration(dto, req.user.id);
  }

  @Patch('integrations/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar configuração de integração' })
  async updateIntegration(
    @Param('id') id: string,
    @Body() dto: UpdateIntegrationConfigDto,
    @Request() req: any,
  ) {
    return this.service.updateIntegration(id, dto, req.user.id);
  }

  @Get('integrations/tenant/:tenantId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Listar integrações de um tenant' })
  async listIntegrations(@Param('tenantId') tenantId: string, @Query() query: PaginationDto) {
    return this.service.listIntegrations(tenantId, query);
  }

  @Post('integrations/sync')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Disparar sincronização manual de integração' })
  async triggerSync(@Body() dto: TriggerSyncDto, @Request() req: any) {
    return this.service.triggerSync(dto.integrationId, req.user.id);
  }

  @Get('integrations/:integrationId/sync-logs')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Histórico de sincronizações de uma integração' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getSyncLogs(
    @Param('integrationId') integrationId: string,
    @Query('limit', new DefaultValuePipe(20)) limit: number,
  ) {
    return this.service.getIntegrationSyncLogs(integrationId, +limit);
  }

  // ============================================================
  // AUTOMATION RULES
  // ============================================================

  @Post('automations')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar regra de automação' })
  async createAutomationRule(@Body() dto: CreateAutomationRuleDto, @Request() req: any) {
    return this.service.createAutomationRule(dto, req.user.id);
  }

  @Patch('automations/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar regra de automação' })
  async updateAutomationRule(
    @Param('id') id: string,
    @Body() dto: UpdateAutomationRuleDto,
    @Request() req: any,
  ) {
    return this.service.updateAutomationRule(id, dto, req.user.id);
  }

  @Get('automations/tenant/:tenantId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Listar regras de automação de um tenant' })
  async listAutomationRules(@Param('tenantId') tenantId: string, @Query() query: PaginationDto) {
    return this.service.listAutomationRules(tenantId, query);
  }

  @Post('automations/execute')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Executar uma regra de automação manualmente' })
  async executeAutomationRule(@Body() dto: ExecuteAutomationRuleDto, @Request() req: any) {
    return this.service.executeAutomationRule(dto, req.user.id);
  }

  // ============================================================
  // SLA CONFIG
  // ============================================================

  @Post('sla')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar configuração de SLA' })
  async createSla(@Body() dto: CreateSlaConfigDto, @Request() req: any) {
    return this.service.createSlaConfig(dto, req.user.id);
  }

  @Patch('sla/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar SLA' })
  async updateSla(@Param('id') id: string, @Body() dto: UpdateSlaConfigDto, @Request() req: any) {
    return this.service.updateSlaConfig(id, dto, req.user.id);
  }

  @Get('sla/tenant/:tenantId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Listar SLAs de um tenant' })
  async listSlas(@Param('tenantId') tenantId: string) {
    return this.service.listSlaConfigs(tenantId);
  }

  // ============================================================
  // CONTENT DELIVERY
  // ============================================================

  @Get('content-delivery/:tenantId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Obter configuração de entrega de conteúdo' })
  async getContentDelivery(@Param('tenantId') tenantId: string) {
    return this.service.getContentDeliveryConfig(tenantId);
  }

  @Patch('content-delivery/:tenantId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar configuração de CDN e bitrate' })
  async updateContentDelivery(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateContentDeliveryConfigDto,
    @Request() req: any,
  ) {
    return this.service.updateContentDeliveryConfig(tenantId, dto, req.user.id);
  }

  // ============================================================
  // METRICS
  // ============================================================

  @Get('metrics')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Obter métricas de performance do sistema' })
  async getMetrics(@Query() query: MetricsQueryDto) {
    return this.service.getMetrics(query);
  }

  @Get('metrics/realtime')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Métricas em tempo real (último snapshot)' })
  @ApiQuery({ name: 'tenantId', required: false })
  async getRealtimeMetrics(@Query('tenantId') tenantId?: string) {
    return this.service.getRealtimeMetrics(tenantId);
  }

  // ============================================================
  // ALERTS
  // ============================================================

  @Post('alerts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar alerta de sistema' })
  async createAlert(@Body() dto: CreateAlertDto, @Request() req: any) {
    return this.service.createAlert(dto, req.user.id);
  }

  @Patch('alerts/:id/resolve')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Resolver alerta de sistema' })
  async resolveAlert(@Param('id') id: string, @Body() dto: ResolveAlertDto) {
    return this.service.resolveAlert(id, dto);
  }

  @Get('alerts')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Listar alertas de sistema' })
  async listAlerts(@Query() query: AlertsQueryDto) {
    return this.service.listAlerts(query);
  }

  // ============================================================
  // BULK IMPORT
  // ============================================================

  @Post('users/bulk-import')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Importação em massa de utilizadores (CSV ou JSON base64)' })
  async bulkImport(@Body() dto: BulkUserImportDto, @Request() req: any) {
    return this.service.bulkImportUsers(dto, req.user.id);
  }

  // ============================================================
  // LOAD TEST
  // ============================================================

  @Post('load-test')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Agendar teste de carga (stress test)' })
  async scheduleLoadTest(@Body() dto: LoadTestConfigDto, @Request() req: any) {
    return this.service.scheduleLoadTest(dto, req.user.id);
  }
}

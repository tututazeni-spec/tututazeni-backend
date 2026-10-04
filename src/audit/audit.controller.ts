// src/audit/audit.controller.ts
import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditHealthService } from './audit-health.service';
import { AccessFilterDto, AuditFilterDto, ChangesFilterDto } from './audit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
// §16: RH e GESTOR só consultam registos dentro do seu âmbito (resolveScope); tudo o que é
// agregado global, segurança ou configuração é ADMIN/AUDITOR.
@Roles(Role.ADMIN, Role.AUDITOR, Role.RH, Role.GESTOR)
@Controller('audit')
export class AuditController {
  constructor(
    private readonly svc: AuditService,
    private readonly health: AuditHealthService,
  ) {}

  // ── Listagem ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar logs com filtros (entity, action, severity, período, IP)' })
  async findAll(@Query() filters: AuditFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.findAll(filters, await this.svc.resolveScope(user));
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Estatísticas (por acção, entidade, severidade, top utilizadores)' })
  stats() {
    return this.svc.getStats();
  }

  @Get('overview')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({
    summary: 'Visão Geral: indicadores, séries diárias, módulos, gravidade, utilizadores',
  })
  @ApiQuery({ name: 'days', required: false, description: '1-365, por omissão 30' })
  overview(@Query('days') days?: string) {
    return this.svc.getOverview(days ? parseInt(days, 10) : 30);
  }

  @Get('coverage')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Cobertura de auditoria por módulo (matriz §13) e estado da cadeia' })
  @ApiQuery({ name: 'days', required: false, description: '1-365, por omissão 30' })
  coverage(@Query('days') days?: string) {
    return this.svc.getCoverage(days ? parseInt(days, 10) : 30);
  }

  @Get('health')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Saúde da gravação de auditoria (fila, falhas, última falha)' })
  getHealth() {
    return this.health.getHealth();
  }

  @Get('anomalies')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({
    summary: 'Resumo de anomalias (logins suspeitos, exportações em massa, deletes)',
  })
  anomalies() {
    return this.svc.getAnomalySummary();
  }

  @Get('filter-options')
  @ApiOperation({ summary: 'Valores distintos para os filtros (entidades, acções, departamentos)' })
  filterOptions() {
    return this.svc.getFilterOptions();
  }

  // ── Acessos e Sessões (§6) ────────────────────────────────────────────────

  @Get('access/summary')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Indicadores, série diária e alertas de acesso' })
  @ApiQuery({ name: 'days', required: false, description: '1-365, por omissão 30' })
  accessSummary(@Query('days') days?: string) {
    return this.svc.getAccessSummary(days ? parseInt(days, 10) : 30);
  }

  @Get('access/events')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Eventos de acesso: login, logout, falhas, palavra-passe, permissões' })
  accessEvents(@Query() filters: AccessFilterDto) {
    return this.svc.getAccessEvents(filters);
  }

  @Get('access/sessions')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Sessões actualmente activas' })
  accessSessions(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.getActiveSessions(
      page ? parseInt(page, 10) || 1 : 1,
      limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20,
    );
  }

  // ── Alterações de Dados (§7) ──────────────────────────────────────────────

  @Get('changes/summary')
  @ApiOperation({ summary: 'Indicadores das alterações de dados (por entidade e acção)' })
  @ApiQuery({ name: 'days', required: false, description: '1-365, por omissão 30' })
  async changesSummary(
    @Query('days') days: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getChangesSummary(
      days ? parseInt(days, 10) : 30,
      user.role?.name,
      await this.svc.resolveScope(user),
    );
  }

  @Get('changes')
  @ApiOperation({ summary: 'Alterações de dados campo a campo (valores sensíveis ocultados)' })
  async changes(@Query() filters: ChangesFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.getChanges(filters, user.role?.name, await this.svc.resolveScope(user));
  }

  @Get(':id/detail')
  @ApiOperation({ summary: 'Detalhe do evento (modal): diff, contexto, eventos relacionados' })
  async detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getEventDetail(id, user.role?.name, await this.svc.resolveScope(user));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um log (com diff antes/depois)' })
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(id, await this.svc.resolveScope(user));
  }

  // ── Timeline ──────────────────────────────────────────────────────────────

  @Get('timeline/:entity/:entityId')
  @ApiOperation({ summary: 'Timeline completa de um recurso (ex: PDI/42, User/5)' })
  async timeline(
    @Param('entity') entity: string,
    @Param('entityId', ParseIntPipe) entityId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getTimeline(entity, entityId, await this.svc.resolveScope(user));
  }

  // ── Utilizador ────────────────────────────────────────────────────────────

  @Get('users/:userId/history')
  @ApiOperation({ summary: 'Histórico completo de acções de um utilizador' })
  async userHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getUserHistory(userId, await this.svc.resolveScope(user), user.role?.name);
  }

  // ── Integridade ───────────────────────────────────────────────────────────

  @Get('integrity/verify')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Verificar integridade da hash chain (detecta adulteração)' })
  @ApiQuery({ name: 'limit', required: false })
  verify(@Query('limit') limit?: string) {
    return this.svc.verifyIntegrity(limit ? parseInt(limit) : 100);
  }

  // ── Exportação ────────────────────────────────────────────────────────────

  @Post('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exportar logs (regista a própria exportação como evento auditável)' })
  @HttpCode(HttpStatus.OK)
  export(@CurrentUser() user: CurrentUserData, @Query() filters: AuditFilterDto) {
    return this.svc.exportLogs(filters, user.id);
  }
}

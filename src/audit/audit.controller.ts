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
import { AccessFilterDto, AuditFilterDto } from './audit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  // ── Listagem ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar logs com filtros (entity, action, severity, período, IP)' })
  findAll(@Query() filters: AuditFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas (por acção, entidade, severidade, top utilizadores)' })
  stats() {
    return this.svc.getStats();
  }

  @Get('overview')
  @ApiOperation({
    summary: 'Visão Geral: indicadores, séries diárias, módulos, gravidade, utilizadores',
  })
  @ApiQuery({ name: 'days', required: false, description: '1-365, por omissão 30' })
  overview(@Query('days') days?: string) {
    return this.svc.getOverview(days ? parseInt(days, 10) : 30);
  }

  @Get('anomalies')
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
  @ApiOperation({ summary: 'Indicadores, série diária e alertas de acesso' })
  @ApiQuery({ name: 'days', required: false, description: '1-365, por omissão 30' })
  accessSummary(@Query('days') days?: string) {
    return this.svc.getAccessSummary(days ? parseInt(days, 10) : 30);
  }

  @Get('access/events')
  @ApiOperation({ summary: 'Eventos de acesso: login, logout, falhas, palavra-passe, permissões' })
  accessEvents(@Query() filters: AccessFilterDto) {
    return this.svc.getAccessEvents(filters);
  }

  @Get('access/sessions')
  @ApiOperation({ summary: 'Sessões actualmente activas' })
  accessSessions(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.getActiveSessions(
      page ? parseInt(page, 10) || 1 : 1,
      limit ? Math.min(parseInt(limit, 10) || 20, 100) : 20,
    );
  }

  @Get(':id/detail')
  @ApiOperation({ summary: 'Detalhe do evento (modal): diff, contexto, eventos relacionados' })
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getEventDetail(id, user.role?.name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um log (com diff antes/depois)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  // ── Timeline ──────────────────────────────────────────────────────────────

  @Get('timeline/:entity/:entityId')
  @ApiOperation({ summary: 'Timeline completa de um recurso (ex: PDI/42, User/5)' })
  timeline(@Param('entity') entity: string, @Param('entityId', ParseIntPipe) entityId: number) {
    return this.svc.getTimeline(entity, entityId);
  }

  // ── Utilizador ────────────────────────────────────────────────────────────

  @Get('users/:userId/history')
  @ApiOperation({ summary: 'Histórico completo de acções de um utilizador' })
  userHistory(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserHistory(userId);
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

// src/audit/audit.controller.ts
import {
  Controller, Get, Post, Query, Param, ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditService }    from './audit.service';
import { AuditFilterDto }  from './audit.dto';
import { JwtAuthGuard }    from '../common/guards/jwt-auth.guard';
import { RolesGuard }      from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH')
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  // ── Listagem ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar logs com filtros (entity, action, severity, período, IP)' })
  findAll(@Query() filters: AuditFilterDto) { return this.svc.findAll(filters); }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas (por acção, entidade, severidade, top utilizadores)' })
  stats() { return this.svc.getStats(); }

  @Get('anomalies')
  @ApiOperation({ summary: 'Resumo de anomalias (logins suspeitos, exportações em massa, deletes)' })
  anomalies() { return this.svc.getAnomalySummary(); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um log (com diff antes/depois)' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  // ── Timeline ──────────────────────────────────────────────────────────────

  @Get('timeline/:entity/:entityId')
  @ApiOperation({ summary: 'Timeline completa de um recurso (ex: PDI/42, User/5)' })
  timeline(
    @Param('entity')                      entity:   string,
    @Param('entityId', ParseIntPipe) entityId: number,
  ) {
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
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Verificar integridade da hash chain (detecta adulteração)' })
  @ApiQuery({ name: 'limit', required: false })
  verify(@Query('limit') limit?: string) {
    return this.svc.verifyIntegrity(limit ? parseInt(limit) : 100);
  }

  // ── Exportação ────────────────────────────────────────────────────────────

  @Post('export')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Exportar logs (regista a própria exportação como evento auditável)' })
  @HttpCode(HttpStatus.OK)
  export(@CurrentUser() user: any, @Query() filters: AuditFilterDto) {
    return this.svc.exportLogs(filters, user.id);
  }
}
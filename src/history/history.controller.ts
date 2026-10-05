// src/history/history.controller.ts
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import {
  HistoryFilterDto,
  TimelineFilterDto,
  HistoryCreateEventDto,
  HistoryScopeDto,
  HistoryReportDto,
  HistoryExportDto,
} from './history.dto';
import { HistoryHubService } from './history-hub.service';
import { HistoryReportsService } from './history-reports.service';
import { Role, AUTHENTICATED_ROLES } from '../auth/enums/role.enum';

// Tiers indexados pelo enum Role — nunca literais soltos (ver memory
// role-array-drift: arrays locais já esqueceram GESTOR 5x nesta sessão).
const ALL_ROLES = AUTHENTICATED_ROLES;
const MGMT_ROLES = [Role.ADMIN, Role.RH, Role.LIDER, Role.GESTOR] as const;
const ADMIN_ROLES = [Role.ADMIN, Role.RH] as const;

@ApiTags('History & Timeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('history')
export class HistoryController {
  constructor(
    private readonly svc: HistoryService,
    private readonly hub: HistoryHubService,
    private readonly reports: HistoryReportsService,
  ) {}

  // ─── Hub (docs/history.md) — vistas organizacionais: ADMIN/RH ───

  @Get('overview')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Visão Geral — KPIs, últimas actividades, rankings' })
  overview(@Query() scope: HistoryScopeDto) {
    return this.hub.getOverview(scope);
  }

  @Get('feed')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Histórico — linha cronológica central com filtros globais' })
  feed(@Query() scope: HistoryScopeDto) {
    return this.hub.getHistory(scope);
  }

  @Get('movements')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary: 'Movimentos profissionais (admissões, transferências, promoções, saídas…)',
  })
  movements(@Query() scope: HistoryScopeDto) {
    return this.hub.getMovements(scope);
  }

  @Get('org-changes')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Alterações organizacionais (departamentos, responsáveis)' })
  orgChanges(@Query() scope: HistoryScopeDto) {
    return this.hub.getOrgChanges(scope);
  }

  @Get('documents')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Documentos & Registos — histórico de acções sobre documentos' })
  documents(@Query() scope: HistoryScopeDto) {
    return this.hub.getDocuments(scope);
  }

  @Get('activities')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Actividades relevantes dos utilizadores na plataforma' })
  activities(@Query() scope: HistoryScopeDto) {
    return this.hub.getActivities(scope);
  }

  @Get('reports')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Relatório do History em JSON (pré-visualização)' })
  report(@Query() dto: HistoryReportDto) {
    return this.reports.build(dto);
  }

  @Get('reports/export')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Exportar relatório do History (csv | xlsx | pdf)' })
  async exportReport(@Query() dto: HistoryExportDto, @Res({ passthrough: true }) res: Response) {
    const { buffer, contentType, filename } = await this.reports.export(dto, dto.format);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  // ─── Audit Log ────────────────────────────────────────────────

  @Get()
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Audit log completo com filtros (entity, action, categoria, módulo)' })
  findAll(@Query() filters: HistoryFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('user/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Actividade bruta de um utilizador (AuditLog)' })
  async userActivity(
    @CurrentUser() actor: CurrentUserData,
    @Param('userId', ParseIntPipe) id: number,
    @Query('limit') limit?: string,
  ) {
    await this.hub.assertCanViewUser(actor, id);
    return this.svc.getUserActivity(id, limit ? +limit : 50);
  }

  @Post('events')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Registar evento manual (promoção, marco de carreira, etc.)' })
  createEvent(@Body() dto: HistoryCreateEventDto) {
    return this.svc.createEvent(dto);
  }

  // ─── Smart Timeline ───────────────────────────────────────────

  @Get('timeline/me')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Timeline pessoal — multi-fonte: cursos, badges, PDI, avaliações, avatar',
  })
  async myTimeline(@CurrentUser() user: CurrentUserData, @Query() filters: TimelineFilterDto) {
    const extras = await this.hub.timelineExtras(user.id, filters, true);
    return this.svc.getUserTimeline(user.id, filters, extras);
  }

  @Get('timeline/user/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Timeline de um colaborador (gestor/RH)' })
  async userTimeline(
    @CurrentUser() actor: CurrentUserData,
    @Param('userId', ParseIntPipe) userId: number,
    @Query() filters: TimelineFilterDto,
  ) {
    await this.hub.assertCanViewUser(actor, userId);
    const canSeeSalary = actor.id === userId || ['ADMIN', 'RH'].includes(actor.role?.name ?? '');
    const extras = await this.hub.timelineExtras(userId, filters, canSeeSalary);
    return this.svc.getUserTimeline(userId, filters, extras);
  }

  @Get('timeline/team')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Timeline da equipa do gestor' })
  teamTimeline(@CurrentUser() user: CurrentUserData, @Query() filters: TimelineFilterDto) {
    return this.svc.getTeamTimeline(user.id, filters);
  }

  // ─── Milestones ───────────────────────────────────────────────

  @Get('milestones/me')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Os meus marcos: PDI concluídos, certificados, promoções, badges' })
  myMilestones(@CurrentUser() user: CurrentUserData) {
    return this.svc.getUserMilestones(user.id);
  }

  @Get('milestones/user/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Marcos de carreira de um colaborador' })
  async userMilestones(
    @CurrentUser() actor: CurrentUserData,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.hub.assertCanViewUser(actor, userId);
    return this.svc.getUserMilestones(userId);
  }

  // ─── Activity Stats ───────────────────────────────────────────

  @Get('stats/me')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Estatísticas pessoais: streak, heatmap, conclusões, XP' })
  myStats(@CurrentUser() user: CurrentUserData) {
    return this.svc.getUserActivityStats(user.id);
  }

  @Get('stats/user/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Estatísticas de actividade de um colaborador' })
  async userStats(
    @CurrentUser() actor: CurrentUserData,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    await this.hub.assertCanViewUser(actor, userId);
    return this.svc.getUserActivityStats(userId);
  }

  // ─── Upcoming Events ──────────────────────────────────────────

  @Get('upcoming')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Próximos eventos: aniversários, certificados a expirar' })
  upcoming() {
    return this.svc.getUpcomingEvents();
  }

  // ─── Audit Analytics ─────────────────────────────────────────

  @Get('audit/stats')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Estatísticas do audit log — top acções, utilizadores, alertas' })
  auditStats(@Query('from') from?: string, @Query('to') to?: string) {
    return this.svc.getAuditStats(from, to);
  }

  // ─── Histórico por Entidade ───────────────────────────────────
  // NOTA: rota paramétrica genérica — tem de ser a última GET declarada,
  // senão captura rotas estáticas como timeline/me, stats/me, milestones/me

  @Get(':entity/:entityId')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Histórico de uma entidade específica' })
  entityHistory(@Param('entity') entity: string, @Param('entityId', ParseIntPipe) id: number) {
    return this.svc.getEntityHistory(entity, id);
  }
}

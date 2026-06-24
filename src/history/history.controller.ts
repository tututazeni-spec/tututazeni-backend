// src/history/history.controller.ts
import { Controller, Get, Post, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { HistoryFilterDto, TimelineFilterDto, HistoryCreateEventDto } from './history.dto';

const ALL_ROLES = ['ADMIN', 'RH', 'LIDER', 'COLABORADOR'] as const;
const MGMT_ROLES = ['ADMIN', 'RH', 'LIDER'] as const;
const ADMIN_ROLES = ['ADMIN', 'RH'] as const;

@ApiTags('History & Timeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('history')
export class HistoryController {
  constructor(private readonly svc: HistoryService) {}

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
  userActivity(@Param('userId', ParseIntPipe) id: number, @Query('limit') limit?: string) {
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
  myTimeline(@CurrentUser() user: CurrentUserData, @Query() filters: TimelineFilterDto) {
    return this.svc.getUserTimeline(user.id, filters);
  }

  @Get('timeline/user/:userId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Timeline de um colaborador (gestor/RH)' })
  userTimeline(@Param('userId', ParseIntPipe) userId: number, @Query() filters: TimelineFilterDto) {
    return this.svc.getUserTimeline(userId, filters);
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
  userMilestones(@Param('userId', ParseIntPipe) userId: number) {
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
  userStats(@Param('userId', ParseIntPipe) userId: number) {
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

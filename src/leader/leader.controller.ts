// src/leader/leader.controller.ts
import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaderService }    from './leader.service';
import { JwtAuthGuard }     from '../common/guards/jwt-auth.guard';
import { RolesGuard }       from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import {
  CreateLeaderProfileDto, GiveFeedbackDto, CreateOneOnOneDto,
  AssignCourseDto, TeamFilterDto, AlertFilterDto,
} from './leader.dto';

const ALL_MGMT  = ['ADMIN', 'RH', 'LIDER', 'DIRECTOR'] as const;
const ADMIN     = ['ADMIN', 'RH']                       as const;

@ApiTags('Leader — Team Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leaders')
export class LeaderController {
  constructor(private readonly svc: LeaderService) {}

  // ─── Leaders list ─────────────────────────────────────────────

  @Get()
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Listar todos os líderes da organização' })
  getLeaders() { return this.svc.getLeaders(); }

  // ─── Personal dashboard (my view) ─────────────────────────────

  @Get('my-dashboard')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Dashboard pessoal do líder — KPIs, alertas, recomendações IA' })
  myDashboard(@CurrentUser() user: any) {
    return this.svc.getLeaderDashboard(user.id);
  }

  @Get('my-team')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'A minha equipa com scores, PDI, risco e alertas' })
  myTeam(@CurrentUser() user: any, @Query() filters: TeamFilterDto) {
    return this.svc.getTeam(user.id, filters);
  }

  @Get('my-team-plans')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'PDIs da minha equipa (saúde, progresso, health indicator)' })
  myTeamPlans(@CurrentUser() user: any) {
    return this.svc.getTeamPlans(user.id);
  }

  @Get('my-talent-pipeline')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Talent pipeline — HiPos, prontos para promoção, em risco' })
  myTalentPipeline(@CurrentUser() user: any) {
    return this.svc.getTalentPipeline(user.id);
  }

  @Get('my-alerts')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Alertas inteligentes da minha equipa' })
  myAlerts(@CurrentUser() user: any) {
    return this.svc.getLeaderAlerts(user.id);
  }

  @Get('my-recommendations')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Recomendações IA — acções prioritárias para o líder' })
  myRecommendations(@CurrentUser() user: any) {
    return this.svc.getAiRecommendations(user.id);
  }

  // ─── Member detail ────────────────────────────────────────────

  @Get('my-team/member/:memberId')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Perfil completo de um membro da equipa' })
  memberProfile(
    @CurrentUser() user: any,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.svc.getMemberProfile(user.id, memberId);
  }

  // ─── Admin view (specific leader) ────────────────────────────

  @Get(':id/dashboard')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Dashboard de um líder específico (RH/Admin)' })
  dashboard(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getLeaderDashboard(id);
  }

  @Get(':id/team-performance')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Performance da equipa de um líder' })
  teamPerf(@Param('id', ParseIntPipe) id: number, @Query('period') period?: string) {
    return this.svc.getTeamPerformance(id, period);
  }

  // ─── Feedback ────────────────────────────────────────────────

  @Post('feedback')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Dar feedback a um membro da equipa (suporte a formato SBI)' })
  giveFeedback(@CurrentUser() user: any, @Body() dto: GiveFeedbackDto) {
    return this.svc.giveFeedback(user.id, dto);
  }

  @Get('feedback/team')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Feedbacks dados à equipa' })
  teamFeedbacks(@CurrentUser() user: any, @Query('userId') userId?: string) {
    return this.svc.getTeamFeedbacks(user.id, userId ? +userId : undefined);
  }

  // ─── 1:1 Meetings ────────────────────────────────────────────

  @Post('1on1')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Agendar reunião 1:1' })
  create1on1(@CurrentUser() user: any, @Body() dto: CreateOneOnOneDto) {
    return this.svc.createOneOnOne(user.id, dto);
  }

  @Get('1on1')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Listar reuniões 1:1 (filtrar por membro)' })
  list1on1(@CurrentUser() user: any, @Query('memberId') memberId?: string) {
    return this.svc.getOneOnOnes(user.id, memberId ? +memberId : undefined);
  }

  @Patch('1on1/:id/complete')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Concluir reunião 1:1 com notas/actas' })
  complete1on1(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes: string },
  ) {
    return this.svc.completeOneOnOne(id, body.notes);
  }

  // ─── PDI Approval ─────────────────────────────────────────────

  @Patch('plans/:planId/approve')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Aprovar PDI de um membro da equipa' })
  approvePlan(@Param('planId', ParseIntPipe) planId: number, @CurrentUser() user: any) {
    return this.svc.approvePlan(planId, user.id);
  }

  // ─── Course assignment ────────────────────────────────────────

  @Post('assign-course')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Atribuir curso a um ou vários membros da equipa' })
  assignCourse(@Body() dto: AssignCourseDto) {
    return this.svc.assignCourse(dto);
  }

  // ─── Leader profile ───────────────────────────────────────────

  @Post('profile')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Criar/actualizar perfil de liderança' })
  upsertProfile(@Body() dto: CreateLeaderProfileDto) {
    return this.svc.upsertProfile(dto);
  }

  @Get('profile/:userId')
  @Roles(...ALL_MGMT)
  @ApiOperation({ summary: 'Ver perfil de liderança de um utilizador' })
  getProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getProfile(userId);
  }
}

// src/avatar-training/avatar-training.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AvatarTrainingService } from './avatar-training.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import {
  CreateAvatarDto,
  UpdateAvatarDto,
  AvatarFilterDto,
  CreateScenarioDto,
  ScenarioFilterDto,
  StartSessionDto,
  SendMessageDto,
  CompleteSessionDto,
  AnalyticsFilterDto,
} from './avatar-training.dto';

const ALL_ROLES = ['ADMIN', 'RH', 'LIDER', 'COLABORADOR'] as const;
const MGMT_ROLES = ['ADMIN', 'RH', 'LIDER'] as const;
const ADMIN_ROLES = ['ADMIN', 'RH'] as const;

@ApiTags('Avatar Training')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('avatar-training')
export class AvatarTrainingController {
  constructor(private readonly svc: AvatarTrainingService) {}

  // ─── Avatars ─────────────────────────────────────────────────

  @Post('avatars')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar avatar de treino (tutor, coach, personagem, clone…)' })
  createAvatar(@CurrentUser() user: any, @Body() dto: CreateAvatarDto) {
    return this.svc.createAvatar(user.id, dto);
  }

  @Get('avatars')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar avatares disponíveis (filtrar por role, público)' })
  getAvatars(@Query() filters: AvatarFilterDto) {
    return this.svc.getAvatars(filters);
  }

  @Get('avatars/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe de um avatar' })
  getAvatar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAvatar(id);
  }

  @Patch('avatars/:id')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Actualizar avatar (personalidade, prompt, imagem)' })
  updateAvatar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAvatarDto) {
    return this.svc.updateAvatar(id, dto);
  }

  @Delete('avatars/:id')
  @Roles(...ADMIN_ROLES)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desactivar avatar' })
  deleteAvatar(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteAvatar(id);
  }

  @Post('avatars/:id/knowledge')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Adicionar documento à base de conhecimento do avatar (RAG)' })
  uploadKnowledge(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { fileUrl: string; title: string },
  ) {
    return this.svc.uploadKnowledge(id, body.fileUrl, body.title);
  }

  // ─── Scenarios ───────────────────────────────────────────────

  @Post('scenarios')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Criar cenário de simulação com turns e árvore de decisão' })
  createScenario(@CurrentUser() user: any, @Body() dto: CreateScenarioDto) {
    return this.svc.createScenario(user.id, dto);
  }

  @Get('scenarios')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Catálogo de cenários (filtrar por categoria, dificuldade, competência)',
  })
  getScenarios(@Query() filters: ScenarioFilterDto) {
    return this.svc.getScenarios(filters);
  }

  @Get('scenarios/recommended')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Cenários recomendados baseados no perfil e gaps do utilizador' })
  recommended(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.svc.getRecommendedScenarios(user.id, limit ? +limit : 6);
  }

  @Get('scenarios/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe do cenário com turns e melhor tentativa do utilizador' })
  getScenario(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.getScenario(id, user.id);
  }

  @Get('scenarios/:scenarioId/leaderboard')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Ranking de pontuação de um cenário' })
  leaderboard(@Param('scenarioId', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.svc.getLeaderboard(id, limit ? +limit : 10);
  }

  // ─── Sessions — Lifecycle ─────────────────────────────────────

  @Post('sessions/start')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Iniciar sessão de simulação com avatar' })
  start(@CurrentUser() user: any, @Body() dto: StartSessionDto) {
    return this.svc.startSession(user.id, dto);
  }

  @Post('sessions/:id/message')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Enviar mensagem na sessão — avatar responde + score em tempo real' })
  sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: SendMessageDto,
  ) {
    return this.svc.sendMessage(id, user.id, dto);
  }

  @Post('sessions/:id/complete')
  @Roles(...ALL_ROLES)
  @ApiOperation({
    summary: 'Concluir sessão — score final, XP, feedback comportamental, próximo cenário',
  })
  complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: CompleteSessionDto,
  ) {
    return this.svc.completeSession(id, user.id, dto);
  }

  @Post('sessions/:id/pause')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Pausar sessão' })
  pause(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.pauseSession(id, user.id);
  }

  @Post('sessions/:id/resume')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Retomar sessão pausada' })
  resume(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.resumeSession(id, user.id);
  }

  @Get('sessions/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe de sessão com histórico de conversa + scores comportamentais' })
  sessionDetail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.getSessionDetail(id, user.id);
  }

  // ─── History & Progress ───────────────────────────────────────

  @Get('my-history')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Meu histórico + estatísticas (streak, score médio, XP)' })
  myHistory(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.svc.getMyHistory(user.id, limit ? +limit : 20);
  }

  @Get('my-analytics')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Análise pessoal aprofundada (por categoria, evolução, competências)' })
  myAnalytics(@CurrentUser() user: any) {
    return this.svc.getUserAnalytics(user.id);
  }

  // ─── Leaderboard & Social ─────────────────────────────────────

  @Get('leaderboard')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Leaderboard global (opcionalmente por departamento)' })
  globalLeaderboard(@Query('departmentId') departmentId?: string, @Query('limit') limit?: string) {
    return this.svc.getGlobalLeaderboard(
      departmentId ? +departmentId : undefined,
      limit ? +limit : 20,
    );
  }

  // ─── Analytics ───────────────────────────────────────────────

  @Get('analytics/dashboard')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Dashboard de analytics (KPIs, top cenários, por categoria)' })
  dashboard(@Query() filters: AnalyticsFilterDto) {
    return this.svc.getDashboard(filters);
  }

  @Get('analytics/team/:managerId')
  @Roles(...MGMT_ROLES)
  @ApiOperation({ summary: 'Performance da equipa do gestor (ranking + alertas de risco)' })
  teamAnalytics(@Param('managerId', ParseIntPipe) managerId: number) {
    return this.svc.getTeamAnalytics(managerId);
  }
}

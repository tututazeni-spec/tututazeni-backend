// src/ai-tutor/ai-tutor.controller.ts
import { AnyAuthenticated } from '../common/decorators/authz.decorators';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiTutorService } from './ai-tutor.service';
import { AiProvidersService } from './ai-providers.service';
import { AiKnowledgeService } from './ai-knowledge.service';
import { SimliService } from './simli.service';
import { IsisSpeechService } from './isis-speech.service';
import { Request, Response } from 'express';
import {
  StartAiSessionDto,
  SendAiMessageDto,
  AiSessionFilterDto,
  AdminSessionFilterDto,
  RateMessageDto,
  ExecuteAgentActionDto,
  GenerateContentDto,
  ExerciseFeedbackDto,
  KnowledgeSearchDto,
  AcceptRecommendationDto,
  UpdateAiTutorSettingsDto,
  AvatarSpeechDto,
} from './ai-tutor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { isPrivileged } from '../common/authz/ownership';

import { ADMIN_RH_ROLES } from '../auth/enums/role-groups';

const AI_TUTOR_ADMIN_ROLES = ADMIN_RH_ROLES;

// Credenciais do próprio utilizador (cookie httpOnly ou Bearer) que a Ísis
// reencaminha ao consultar os módulos — nunca uma conta de serviço.
function accessFrom(user: CurrentUserData, req: Request) {
  const cookies = (req?.cookies ?? {}) as Record<string, string | undefined>;
  const bearer = req?.headers?.authorization?.replace(/^Bearer\s+/i, '');
  return { user, auth: { token: cookies.token ?? bearer } };
}

@ApiTags('AI Tutor — Ísis (Groq / Gemini / Ollama)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai-tutor')
export class AiTutorController {
  constructor(
    private readonly svc: AiTutorService,
    private readonly providers: AiProvidersService,
    private readonly knowledge: AiKnowledgeService,
    private readonly simli: SimliService,
    private readonly speech: IsisSpeechService,
  ) {}

  // ── Info ──────────────────────────────────────────────────────────────────

  @Get('provider')
  @ApiOperation({ summary: 'Fornecedor IA activo (Groq/Gemini/Ollama)' })
  @AnyAuthenticated()
  getProvider() {
    return this.providers.getProviderInfo();
  }

  @Get('avatar/status')
  @ApiOperation({ summary: 'O avatar Simli da Ísis está configurado?' })
  @AnyAuthenticated()
  avatarStatus(@CurrentUser() user: CurrentUserData) {
    return { enabled: this.simli.isConfigured() && this.simli.isAllowedFor(user.role?.name) };
  }

  @Post('avatar/session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Token temporário de sessão do avatar Simli da Ísis' })
  @AnyAuthenticated()
  createAvatarSession(@CurrentUser() user: CurrentUserData) {
    this.simli.assertAllowedFor(user.role?.name);
    return this.simli.createSession();
  }

  @Post('avatar/speech')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Voz da Ísis em PCM16 16 kHz (ElevenLabs) para alimentar o avatar' })
  @AnyAuthenticated()
  async avatarSpeech(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AvatarSpeechDto,
    @Res() res: Response,
  ) {
    this.simli.assertAllowedFor(user.role?.name);
    const pcm = await this.speech.synthesizePcm16k(dto.text);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': pcm.length,
      'Cache-Control': 'no-store',
    });
    res.end(pcm);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Estatísticas de uso (sessões, mensagens, rating, tokens)' })
  stats() {
    return this.svc.getUsageStats();
  }

  @Get('overview')
  @ApiOperation({
    summary:
      'Visão Geral (secção 1): estatísticas da plataforma para ADMIN/RH, ou pessoais para os restantes',
  })
  @AnyAuthenticated()
  overview(@CurrentUser() user: CurrentUserData) {
    return isPrivileged(user, AI_TUTOR_ADMIN_ROLES)
      ? this.svc.getUsageStats()
      : this.svc.getMyUsageStats(user.id);
  }

  // ── Base de Conhecimento (secção 3) ─────────────────────────────────────────

  @Get('knowledge/sources')
  @ApiOperation({ summary: 'Contagens de conteúdos indexados na Base de Conhecimento' })
  @AnyAuthenticated()
  knowledgeSources() {
    return this.knowledge.getSources();
  }

  @Get('knowledge/search')
  @ApiOperation({ summary: 'Pesquisar conteúdos autorizados (RAG) por palavras-chave' })
  @AnyAuthenticated()
  knowledgeSearch(@Query() dto: KnowledgeSearchDto) {
    return this.knowledge.search(dto.q, dto.limit ?? 5);
  }

  // ── Sessões (secção 4) ───────────────────────────────────────────────────────

  @Get('sessions')
  @ApiOperation({ summary: 'As minhas sessões com o tutor' })
  @AnyAuthenticated()
  mySessions(@CurrentUser() user: CurrentUserData, @Query() filters: AiSessionFilterDto) {
    return this.svc.getMySessions(user.id, filters);
  }

  @Get('sessions/all')
  @Roles(...AI_TUTOR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Todas as sessões da plataforma, com filtros (ADMIN/RH)' })
  allSessions(@Query() filters: AdminSessionFilterDto) {
    return this.svc.listAllSessions(filters);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Detalhe da sessão com histórico de mensagens' })
  @AnyAuthenticated()
  getSession(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getSession(user.id, id, isPrivileged(user, AI_TUTOR_ADMIN_ROLES));
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Eliminar histórico de uma sessão' })
  @AnyAuthenticated()
  deleteSession(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteSession(
      id,
      isPrivileged(user, AI_TUTOR_ADMIN_ROLES) ? undefined : user.id,
    );
  }

  @Post('sessions')
  @ApiOperation({
    summary: 'Iniciar sessão com Ísis (contexto de curso, lição, PDI, personalidade)',
  })
  @AnyAuthenticated()
  startSession(@CurrentUser() user: CurrentUserData, @Body() dto: StartAiSessionDto) {
    return this.svc.startSession(user.id, dto);
  }

  // Igual a sessions/message, mas o texto sai à medida que é gerado (SSE):
  // `event: token` com {t} por pedaço e `event: done` com a resposta final.
  // Permite à Ísis começar a falar sem esperar pela resposta inteira.
  @Post('sessions/message/stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar mensagem ao tutor com resposta em streaming (SSE)' })
  @AnyAuthenticated()
  async sendMessageStream(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SendAiMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const send = (event: string, data: unknown) =>
      res.write(['event: ' + event, 'data: ' + JSON.stringify(data), '', ''].join('\n'));
    try {
      const result = await this.svc.sendMessage(
        user.id,
        dto,
        t => send('token', { t }),
        accessFrom(user, req),
      );
      send('done', result);
    } catch (e) {
      send('error', { message: e instanceof Error ? e.message : 'Erro ao gerar a resposta' });
    } finally {
      res.end();
    }
  }

  @Post('sessions/message')
  @ApiOperation({ summary: 'Enviar mensagem ao tutor e receber resposta contextualizada' })
  @AnyAuthenticated()
  sendMessage(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SendAiMessageDto,
    @Req() req: Request,
  ) {
    return this.svc.sendMessage(user.id, dto, undefined, accessFrom(user, req));
  }

  @Patch('sessions/:id/end')
  @ApiOperation({ summary: 'Encerrar sessão' })
  @HttpCode(HttpStatus.OK)
  @AnyAuthenticated()
  endSession(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.svc.endSession(user.id, id);
  }

  // ── Avaliação ─────────────────────────────────────────────────────────────

  @Patch('messages/rate')
  @ApiOperation({ summary: 'Avaliar qualidade de uma resposta do tutor (1-5)' })
  @HttpCode(HttpStatus.OK)
  @AnyAuthenticated()
  rateMessage(@CurrentUser() user: CurrentUserData, @Body() dto: RateMessageDto) {
    return this.svc.rateMessage(user.id, dto);
  }

  // ── Agentic Actions ───────────────────────────────────────────────────────

  @Post('agent/execute')
  @ApiOperation({
    summary: 'Executar acção agentic (inscrever curso, actualizar PDI, notificar gestor)',
  })
  @AnyAuthenticated()
  executeAction(@CurrentUser() user: CurrentUserData, @Body() dto: ExecuteAgentActionDto) {
    return this.svc.executeAgentAction(user.id, dto);
  }

  // ── Geração de conteúdo ───────────────────────────────────────────────────

  @Post('generate')
  @ApiOperation({
    summary:
      'Gerar exercícios (quiz, V/F, perguntas abertas, casos, simulações, cenários, flashcards), resumo ou plano de estudo com IA',
  })
  @AnyAuthenticated()
  generateContent(@CurrentUser() user: CurrentUserData, @Body() dto: GenerateContentDto) {
    return this.svc.generateContent(user.id, dto);
  }

  @Post('exercises/feedback')
  @ApiOperation({
    summary: 'Obter feedback de IA sobre a resposta a um exercício aberto/caso/cenário',
  })
  @AnyAuthenticated()
  exerciseFeedback(@CurrentUser() user: CurrentUserData, @Body() dto: ExerciseFeedbackDto) {
    return this.svc.exerciseFeedback(user.id, dto);
  }

  // ── Recomendações ─────────────────────────────────────────────────────────

  @Get('recommendations')
  @ApiOperation({ summary: 'Recomendações personalizadas de aprendizagem com insight IA' })
  @AnyAuthenticated()
  recommendations(@CurrentUser() user: CurrentUserData) {
    return this.svc.getRecommendations(user.id);
  }

  @Post('recommendations/:id/accept')
  @ApiOperation({ summary: 'Aceitar uma recomendação e inscrever-se no curso' })
  @AnyAuthenticated()
  acceptRecommendation(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcceptRecommendationDto,
  ) {
    return this.svc.acceptRecommendation(user.id, id, dto.courseId);
  }

  // ── Histórico (secção 6) ────────────────────────────────────────────────────

  @Get('history')
  @ApiOperation({
    summary: 'Feed de actividade: perguntas, exercícios, recomendações, conteúdos consultados',
  })
  @AnyAuthenticated()
  history(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyActivity(user.id);
  }

  // ── Analytics (secção 7) ────────────────────────────────────────────────────

  @Get('analytics')
  @Roles(...AI_TUTOR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Métricas detalhadas de utilização (ADMIN/RH)' })
  analytics() {
    return this.svc.getAnalytics();
  }

  // ── Configurações (secção 8) ────────────────────────────────────────────────

  @Get('settings')
  @Roles(...AI_TUTOR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Configuração actual do AI Tutor (ADMIN/RH)' })
  getSettings() {
    return this.svc.getSettings();
  }

  @Patch('settings')
  @Roles(...AI_TUTOR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Actualizar configuração do AI Tutor (ADMIN/RH)' })
  updateSettings(@CurrentUser() user: CurrentUserData, @Body() dto: UpdateAiTutorSettingsDto) {
    return this.svc.updateSettings(user.id, dto);
  }

  @Post('settings/purge-history')
  @Roles(...AI_TUTOR_ADMIN_ROLES)
  @ApiOperation({ summary: 'Eliminar sessões mais antigas que a retenção configurada (ADMIN/RH)' })
  purgeHistory() {
    return this.svc.purgeOldHistory();
  }
}

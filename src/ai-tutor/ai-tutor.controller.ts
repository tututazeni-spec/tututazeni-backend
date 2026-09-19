// src/ai-tutor/ai-tutor.controller.ts
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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiTutorService } from './ai-tutor.service';
import { AiProvidersService } from './ai-providers.service';
import { AiKnowledgeService } from './ai-knowledge.service';
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
} from './ai-tutor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { isPrivileged } from '../common/authz/ownership';

const AI_TUTOR_ADMIN_ROLES = [Role.ADMIN, Role.RH];

@ApiTags('AI Tutor — Ísis (Groq / Gemini / Ollama)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai-tutor')
export class AiTutorController {
  constructor(
    private readonly svc: AiTutorService,
    private readonly providers: AiProvidersService,
    private readonly knowledge: AiKnowledgeService,
  ) {}

  // ── Info ──────────────────────────────────────────────────────────────────

  @Get('provider')
  @ApiOperation({ summary: 'Fornecedor IA activo (Groq/Gemini/Ollama)' })
  getProvider() {
    return this.providers.getProviderInfo();
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
  overview(@CurrentUser() user: CurrentUserData) {
    return isPrivileged(user, AI_TUTOR_ADMIN_ROLES)
      ? this.svc.getUsageStats()
      : this.svc.getMyUsageStats(user.id);
  }

  // ── Base de Conhecimento (secção 3) ─────────────────────────────────────────

  @Get('knowledge/sources')
  @ApiOperation({ summary: 'Contagens de conteúdos indexados na Base de Conhecimento' })
  knowledgeSources() {
    return this.knowledge.getSources();
  }

  @Get('knowledge/search')
  @ApiOperation({ summary: 'Pesquisar conteúdos autorizados (RAG) por palavras-chave' })
  knowledgeSearch(@Query() dto: KnowledgeSearchDto) {
    return this.knowledge.search(dto.q, dto.limit ?? 5);
  }

  // ── Sessões (secção 4) ───────────────────────────────────────────────────────

  @Get('sessions')
  @ApiOperation({ summary: 'As minhas sessões com o tutor' })
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
  getSession(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getSession(user.id, id, isPrivileged(user, AI_TUTOR_ADMIN_ROLES));
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Eliminar histórico de uma sessão' })
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
  startSession(@CurrentUser() user: CurrentUserData, @Body() dto: StartAiSessionDto) {
    return this.svc.startSession(user.id, dto);
  }

  @Post('sessions/message')
  @ApiOperation({ summary: 'Enviar mensagem ao tutor e receber resposta contextualizada' })
  sendMessage(@CurrentUser() user: CurrentUserData, @Body() dto: SendAiMessageDto) {
    return this.svc.sendMessage(user.id, dto);
  }

  @Patch('sessions/:id/end')
  @ApiOperation({ summary: 'Encerrar sessão' })
  @HttpCode(HttpStatus.OK)
  endSession(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.svc.endSession(user.id, id);
  }

  // ── Avaliação ─────────────────────────────────────────────────────────────

  @Patch('messages/rate')
  @ApiOperation({ summary: 'Avaliar qualidade de uma resposta do tutor (1-5)' })
  @HttpCode(HttpStatus.OK)
  rateMessage(@CurrentUser() user: CurrentUserData, @Body() dto: RateMessageDto) {
    return this.svc.rateMessage(user.id, dto);
  }

  // ── Agentic Actions ───────────────────────────────────────────────────────

  @Post('agent/execute')
  @ApiOperation({
    summary: 'Executar acção agentic (inscrever curso, actualizar PDI, notificar gestor)',
  })
  executeAction(@CurrentUser() user: CurrentUserData, @Body() dto: ExecuteAgentActionDto) {
    return this.svc.executeAgentAction(user.id, dto);
  }

  // ── Geração de conteúdo ───────────────────────────────────────────────────

  @Post('generate')
  @ApiOperation({
    summary:
      'Gerar exercícios (quiz, V/F, perguntas abertas, casos, simulações, cenários, flashcards), resumo ou plano de estudo com IA',
  })
  generateContent(@CurrentUser() user: CurrentUserData, @Body() dto: GenerateContentDto) {
    return this.svc.generateContent(user.id, dto);
  }

  @Post('exercises/feedback')
  @ApiOperation({
    summary: 'Obter feedback de IA sobre a resposta a um exercício aberto/caso/cenário',
  })
  exerciseFeedback(@CurrentUser() user: CurrentUserData, @Body() dto: ExerciseFeedbackDto) {
    return this.svc.exerciseFeedback(user.id, dto);
  }

  // ── Recomendações ─────────────────────────────────────────────────────────

  @Get('recommendations')
  @ApiOperation({ summary: 'Recomendações personalizadas de aprendizagem com insight IA' })
  recommendations(@CurrentUser() user: CurrentUserData) {
    return this.svc.getRecommendations(user.id);
  }
}

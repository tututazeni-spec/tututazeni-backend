// src/ai-tutor/ai-tutor.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
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
import {
  StartAiSessionDto,
  SendAiMessageDto,
  AiSessionFilterDto,
  RateMessageDto,
  ExecuteAgentActionDto,
  GenerateContentDto,
} from './ai-tutor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('AI Tutor — NOVA (Groq / Gemini / Ollama)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai-tutor')
export class AiTutorController {
  constructor(
    private readonly svc: AiTutorService,
    private readonly providers: AiProvidersService,
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

  // ── Sessões ───────────────────────────────────────────────────────────────

  @Get('sessions')
  @ApiOperation({ summary: 'As minhas sessões com o tutor' })
  mySessions(@CurrentUser() user: CurrentUserData, @Query() filters: AiSessionFilterDto) {
    return this.svc.getMySessions(user.id, filters);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Detalhe da sessão com histórico de mensagens' })
  getSession(@CurrentUser() user: CurrentUserData, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getSession(user.id, id);
  }

  @Post('sessions')
  @ApiOperation({
    summary: 'Iniciar sessão com NOVA (contexto de curso, lição, PDI, personalidade)',
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
  @ApiOperation({ summary: 'Gerar quiz, flashcards, resumo ou plano de estudo com IA' })
  generateContent(@CurrentUser() user: CurrentUserData, @Body() dto: GenerateContentDto) {
    return this.svc.generateContent(user.id, dto);
  }

  // ── Recomendações ─────────────────────────────────────────────────────────

  @Get('recommendations')
  @ApiOperation({ summary: 'Recomendações personalizadas de aprendizagem com insight IA' })
  recommendations(@CurrentUser() user: CurrentUserData) {
    return this.svc.getRecommendations(user.id);
  }
}

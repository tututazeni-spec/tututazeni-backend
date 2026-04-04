// src/ai-tutor/ai-tutor.controller.ts
import {
  Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiTutorService } from './ai-tutor.service';
import { AiProvidersService } from './ai-providers.service';
import { StartAiSessionDto, SendAiMessageDto, AiSessionFilterDto } from './ai-tutor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('AI Tutor (Gratuito — Groq / Gemini / Ollama)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai-tutor')
export class AiTutorController {
  constructor(
    private readonly svc: AiTutorService,
    private readonly providers: AiProvidersService,
  ) {}
 
  @Get('provider')
  @ApiOperation({ summary: 'Ver fornecedor de IA activo e informações' })
  getProvider() { return this.providers.getProviderInfo(); }
 
  @Get('sessions')
  @ApiOperation({ summary: 'Listar minhas sessões com o tutor' })
  mySessions(@CurrentUser() user: any, @Query() filters: AiSessionFilterDto) {
    return this.svc.getMySessions(user.id, filters);
  }
 
  @Get('stats')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Estatísticas de uso — sessões, mensagens, tokens, custo (grátis!)' })
  stats() { return this.svc.getUsageStats(); }
 
  @Get('sessions/:id')
  @ApiOperation({ summary: 'Detalhe de sessão com histórico de mensagens' })
  getSession(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getSession(user.id, id);
  }
 
  @Post('sessions')
  @ApiOperation({ summary: 'Iniciar sessão com AI Tutor (opcional: com contexto de curso)' })
  startSession(@CurrentUser() user: any, @Body() dto: StartAiSessionDto) {
    return this.svc.startSession(user.id, dto);
  }
 
  @Post('sessions/message')
  @ApiOperation({ summary: 'Enviar mensagem ao AI Tutor e receber resposta' })
  sendMessage(@CurrentUser() user: any, @Body() dto: SendAiMessageDto) {
    return this.svc.sendMessage(user.id, dto);
  }
 
  @Patch('sessions/:id/end')
  @ApiOperation({ summary: 'Encerrar sessão com o tutor' })
  endSession(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.svc.endSession(user.id, id);
  }
}
 

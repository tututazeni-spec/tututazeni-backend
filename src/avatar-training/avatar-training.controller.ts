// src/avatar-training/avatar-training.controller.ts
import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AvatarTrainingService } from './avatar-training.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
 
@ApiTags('Avatar Training (Treino com Avatar/Simulação)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('avatar-training')
export class AvatarTrainingController {
  constructor(private readonly svc: AvatarTrainingService) {}
 
  @Get('scenarios') @ApiOperation({ summary: 'Listar cenários de simulação disponíveis' })
  scenarios(@Query('competencyId') cid?: number) { return this.svc.getScenarios(cid ? +cid : undefined); }
 
  @Get('my-history') @ApiOperation({ summary: 'Meu histórico de sessões' })
  myHistory(@CurrentUser() user: any) { return this.svc.getMyHistory(user.id); }
 
  @Get('leaderboard/:scenarioId') @ApiOperation({ summary: 'Ranking de pontuação de um cenário' })
  leaderboard(@Param('scenarioId', ParseIntPipe) id: number) { return this.svc.getLeaderboard(id); }
 
  @Post('start') @ApiOperation({ summary: 'Iniciar sessão de simulação' })
  start(@CurrentUser() user: any, @Body() body: { scenarioId: number }) {
    return this.svc.startSession(user.id, body.scenarioId);
  }
 
  @Post('complete/:sessionId') @ApiOperation({ summary: 'Concluir sessão com pontuação' })
  complete(
    @Param('sessionId', ParseIntPipe) id: number,
    @Body() body: { score: number; feedback: string },
  ) { return this.svc.completeSession(id, body.score, body.feedback); }
}
 

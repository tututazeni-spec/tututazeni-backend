// src/evaluation/evaluation.controller.ts
import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EvaluationService, CreateEvaluationDto } from './evaluation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Evaluation (Avaliação 360°)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('evaluations')
export class EvaluationController {
  constructor(private readonly svc: EvaluationService) {}
 
  @Get('pending') @ApiOperation({ summary: 'Avaliações pendentes a completar' })
  pending(@CurrentUser() user: any) { return this.svc.getPendingEvaluations(user.id); }
 
  @Get('user/:userId') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Avaliações recebidas por um colaborador' })
  byUser(@Param('userId', ParseIntPipe) id: number, @Query('period') period?: string) {
    return this.svc.findByUser(id, period);
  }
 
  @Get('summary/:userId') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Sumário de avaliação por período' })
  summary(@Param('userId', ParseIntPipe) id: number, @Query('period') period: string) {
    return this.svc.getSummary(id, period);
  }
 
  @Get('my-evaluations') @ApiOperation({ summary: 'Minhas avaliações recebidas' })
  myEvals(@CurrentUser() user: any, @Query('period') period?: string) {
    return this.svc.findByUser(user.id, period);
  }
 
  @Post() @ApiOperation({ summary: 'Submeter avaliação' })
  create(@CurrentUser() user: any, @Body() dto: CreateEvaluationDto) {
    return this.svc.create(user.id, dto);
  }
}
 

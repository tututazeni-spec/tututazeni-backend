// src/engagement/engagement.controller.ts
import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EngagementService, CreateSurveyDto, SubmitSurveyDto } from './engagement.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Engagement (Engajamento de Colaboradores)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('engagement')
export class EngagementController {
  constructor(private readonly svc: EngagementService) {}
 
  @Get('surveys') @ApiOperation({ summary: 'Listar inquéritos de engajamento activos' })
  surveys() { return this.svc.getSurveys(true); }
 
  @Get('surveys/all') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Todos os inquéritos' })
  allSurveys() { return this.svc.getSurveys(false); }
 
  @Get('surveys/:id') @ApiOperation({ summary: 'Detalhe do inquérito' })
  survey(@Param('id', ParseIntPipe) id: number) { return this.svc.getSurvey(id); }
 
  @Get('surveys/:id/results') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Resultados do inquérito' })
  results(@Param('id', ParseIntPipe) id: number) { return this.svc.getSurveyResults(id); }
 
  @Get('index') @Roles('ADMIN', 'RH', 'DIRECTOR')
  @ApiOperation({ summary: 'Índice de engajamento da organização' })
  index() { return this.svc.getEngagementIndex(); }
 
  @Post('surveys') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar inquérito de engajamento' })
  createSurvey(@Body() dto: CreateSurveyDto) { return this.svc.createSurvey(dto); }
 
  @Post('surveys/respond') @ApiOperation({ summary: 'Responder a inquérito' })
  respond(@CurrentUser() user: any, @Body() dto: SubmitSurveyDto) {
    return this.svc.submitSurvey(user.id, dto);
  }
}
 

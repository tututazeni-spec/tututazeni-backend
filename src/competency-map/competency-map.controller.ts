// src/competency-map/competency-map.controller.ts
import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompetencyMapService, CreateCompetencyMapDto } from './competency-map.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Competency Map (Mapa de Competências)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('competency-map')
export class CompetencyMapController {
  constructor(private readonly svc: CompetencyMapService) {}
 
  @Get('my') @ApiOperation({ summary: 'Meu mapa de competências' })
  myMap(@CurrentUser() user: any) { return this.svc.getMap(user.id); }
 
  @Get('user/:userId') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Mapa de competências de um colaborador' })
  userMap(@Param('userId', ParseIntPipe) id: number) { return this.svc.getMap(id); }
 
  @Get('department/:deptId') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Mapa de competências do departamento' })
  deptMap(@Param('deptId', ParseIntPipe) id: number) { return this.svc.getDepartmentMap(id); }
 
  @Get('gap-analysis') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Análise de lacunas de competências' })
  gapAnalysis(@Query('departmentId') deptId?: number) {
    return this.svc.getGapAnalysis(deptId ? +deptId : undefined);
  }
 
  @Post() @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Registar/actualizar nível de competência' })
  upsert(@Body() dto: CreateCompetencyMapDto) { return this.svc.upsert(dto); }
}
 

 

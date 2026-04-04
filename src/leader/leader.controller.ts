import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaderService, CreateLeaderProfileDto } from './leader.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Leader (Gestão de Líderes)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leaders')
export class LeaderController {
  constructor(private readonly svc: LeaderService) {}
 
  @Get() @Roles('ADMIN', 'RH', 'DIRECTOR')
  @ApiOperation({ summary: 'Listar todos os líderes da organização' })
  getLeaders() { return this.svc.getLeaders(); }
 
  @Get('my-dashboard')
  @ApiOperation({ summary: 'Dashboard do líder — equipa, pendentes, performance' })
  myDashboard(@CurrentUser() user: any) { return this.svc.getLeaderDashboard(user.id); }
 
  @Get(':id/dashboard') @Roles('ADMIN', 'RH', 'DIRECTOR')
  @ApiOperation({ summary: 'Dashboard de um líder específico' })
  dashboard(@Param('id', ParseIntPipe) id: number) { return this.svc.getLeaderDashboard(id); }
 
  @Get(':id/team-performance') @Roles('ADMIN', 'RH', 'DIRECTOR', 'GESTOR')
  @ApiOperation({ summary: 'Performance da equipa de um líder' })
  teamPerf(@Param('id', ParseIntPipe) id: number, @Query('period') period?: string) {
    return this.svc.getTeamPerformance(id, period);
  }
 
  @Post('profile') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar/actualizar perfil de liderança' })
  upsertProfile(@Body() dto: CreateLeaderProfileDto) { return this.svc.upsertProfile(dto); }
}
 

 

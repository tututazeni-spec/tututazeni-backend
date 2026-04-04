import {
  Controller, Get, Post, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import { CreateBadgeDto, AwardBadgeDto, AddPointsDto, LeaderboardFilterDto } from './gamification.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Gamification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gamification')
export class GamificationController {
  constructor(private readonly svc: GamificationService) {}
 
  @Get('badges')
  @ApiOperation({ summary: 'Listar todos os badges' })
  badges() { return this.svc.findAllBadges(); }
 
  @Get('leaderboard')
  @ApiOperation({ summary: 'Ranking de pontos' })
  leaderboard(@Query() filters: LeaderboardFilterDto) { return this.svc.getLeaderboard(filters); }
 
  @Get('my-points')
  @ApiOperation({ summary: 'Meus pontos e badges' })
  myPoints(@CurrentUser() user: any) { return this.svc.getUserPoints(user.id); }
 
  @Get('users/:userId/points')
  @ApiOperation({ summary: 'Pontos e badges de um utilizador' })
  userPoints(@Param('userId', ParseIntPipe) userId: number) { return this.svc.getUserPoints(userId); }
 
  @Get('users/:userId/badges')
  @ApiOperation({ summary: 'Badges de um utilizador' })
  userBadges(@Param('userId', ParseIntPipe) userId: number) { return this.svc.getUserBadges(userId); }
 
  @Post('badges')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Criar badge' })
  createBadge(@Body() dto: CreateBadgeDto) { return this.svc.createBadge(dto); }
 
  @Post('badges/init-defaults')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Inicializar badges padrão do sistema' })
  initDefaults() { return this.svc.initDefaultBadges(); }
 
  @Post('badges/award')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atribuir badge manualmente a utilizador' })
  awardBadge(@Body() dto: AwardBadgeDto) { return this.svc.awardBadge(dto); }
 
  @Post('points/add')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Adicionar pontos a utilizador' })
  addPoints(@Body() dto: AddPointsDto) { return this.svc.addPoints(dto); }
 
  @Delete('badges/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover badge' })
  removeBadge(@Param('id', ParseIntPipe) id: number) { return this.svc.removeBadge(id); }
}
 

import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CompetenciesService } from './competencies.service';
import { CreateCompetencyDto, UpdateCompetencyDto, UpsertUserCompetencyDto, CompetencyFilterDto } from './competencies.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Competencies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('competencies')
export class CompetenciesController {
  constructor(private readonly svc: CompetenciesService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar competências' })
  findAll(@Query() filters: CompetencyFilterDto) { return this.svc.findAll(filters); }
 
  @Get('top')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Top competências da organização' })
  top(@Query('limit') limit?: number) { return this.svc.getTopCompetencies(limit); }
 
  @Get('user/:userId')
  @ApiOperation({ summary: 'Competências de um utilizador' })
  userCompetencies(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserCompetencies(userId);
  }
 
  @Get('user/:userId/gap/:positionId')
  @ApiOperation({ summary: 'Análise de gap de competências para uma posição' })
  gapAnalysis(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('positionId', ParseIntPipe) positionId: number,
  ) { return this.svc.getCompetencyGap(userId, positionId); }
 
  @Get('my')
  @ApiOperation({ summary: 'Minhas competências' })
  myCompetencies(@CurrentUser() user: any) { return this.svc.getUserCompetencies(user.id); }
 
  @Get('my/gap/:positionId')
  @ApiOperation({ summary: 'Meu gap para uma posição' })
  myGap(@CurrentUser() user: any, @Param('positionId', ParseIntPipe) positionId: number) {
    return this.svc.getCompetencyGap(user.id, positionId);
  }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da competência' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar competência' })
  create(@Body() dto: CreateCompetencyDto) { return this.svc.create(dto); }
 
  @Post('user')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Atribuir/atualizar competência de utilizador' })
  upsertUser(@Body() dto: UpsertUserCompetencyDto) { return this.svc.upsertUserCompetency(dto); }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar competência' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompetencyDto) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover competência' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

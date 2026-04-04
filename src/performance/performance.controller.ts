import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { CreatePerformanceReviewDto, UpdatePerformanceReviewDto, PerformanceFilterDto } from './performance.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Performance Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('performance')
export class PerformanceController {
  constructor(private readonly svc: PerformanceService) {}
 
  @Get()
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Listar avaliações de desempenho' })
  findAll(@Query() filters: PerformanceFilterDto) { return this.svc.findAll(filters); }
 
  @Get('periods')
  @ApiOperation({ summary: 'Listar períodos disponíveis' })
  periods() { return this.svc.getPeriods(); }
 
  @Get('my')
  @ApiOperation({ summary: 'Meu histórico de desempenho' })
  myHistory(@CurrentUser() user: any) { return this.svc.getUserHistory(user.id); }
 
  @Get('team')
  @Roles('LIDER', 'ADMIN', 'RH')
  @ApiOperation({ summary: 'Desempenho da equipa' })
  teamPerformance(@CurrentUser() user: any) { return this.svc.getTeamPerformance(user.id); }
 
  @Get('department/:departmentId/stats')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Estatísticas de desempenho por departamento' })
  departmentStats(@Param('departmentId', ParseIntPipe) id: number) { return this.svc.getDepartmentStats(id); }
 
  @Get('user/:userId')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Histórico de desempenho de utilizador' })
  userHistory(@Param('userId', ParseIntPipe) userId: number) { return this.svc.getUserHistory(userId); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da avaliação' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post()
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Criar avaliação de desempenho' })
  create(@Body() dto: CreatePerformanceReviewDto) { return this.svc.create(dto); }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar avaliação' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePerformanceReviewDto) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover avaliação' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

// src/history/history.controller.ts
import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HistoryService, HistoryFilterDto } from './history.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('History (Histórico de Actividades)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH', 'DIRECTOR')
@Controller('history')
export class HistoryController {
  constructor(private readonly svc: HistoryService) {}
 
  @Get() @ApiOperation({ summary: 'Histórico de acções com filtros' })
  findAll(@Query() filters: HistoryFilterDto) { return this.svc.findAll(filters); }
 
  @Get('user/:userId') @ApiOperation({ summary: 'Actividade de um utilizador' })
  userActivity(@Param('userId', ParseIntPipe) id: number, @Query('limit') limit?: number) {
    return this.svc.getUserActivity(id, limit ? +limit : 50);
  }
 
  @Get(':entity/:entityId') @ApiOperation({ summary: 'Histórico de uma entidade específica' })
  entityHistory(@Param('entity') entity: string, @Param('entityId', ParseIntPipe) id: number) {
    return this.svc.getEntityHistory(entity, id);
  }
}
 

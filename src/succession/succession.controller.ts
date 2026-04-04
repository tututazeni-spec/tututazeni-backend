import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SuccessionService } from './succession.service';
import { CreateSuccessionPlanDto, UpdateSuccessionPlanDto, SuccessionFilterDto } from './succession.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Succession Planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH')
@Controller('succession')
export class SuccessionController {
  constructor(private readonly svc: SuccessionService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar planos de sucessão' })
  findAll(@Query() filters: SuccessionFilterDto) { return this.svc.findAll(filters); }
 
  @Get('org-chart')
  @ApiOperation({ summary: 'Organograma de sucessão' })
  orgChart() { return this.svc.getOrganizationChart(); }
 
  @Get('position/:positionId/summary')
  @ApiOperation({ summary: 'Resumo de sucessão por posição' })
  positionSummary(@Param('positionId', ParseIntPipe) id: number) {
    return this.svc.getPositionSummary(id);
  }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano de sucessão' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post()
  @ApiOperation({ summary: 'Criar plano de sucessão' })
  create(@Body() dto: CreateSuccessionPlanDto) { return this.svc.create(dto); }
 
  @Put(':id')
  @ApiOperation({ summary: 'Atualizar plano de sucessão' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSuccessionPlanDto) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id')
  @ApiOperation({ summary: 'Remover plano de sucessão' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DevelopmentPlansService } from './development-plans.service';
import { CreateDevelopmentPlanDto, UpdateDevelopmentPlanDto, DevelopmentPlanFilterDto } from './development-plans.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Development Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('development-plans')
export class DevelopmentPlansController {
  constructor(private readonly svc: DevelopmentPlansService) {}
 
  @Get()
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Listar planos de desenvolvimento' })
  findAll(@Query() filters: DevelopmentPlanFilterDto) { return this.svc.findAll(filters); }
 
  @Get('my')
  @ApiOperation({ summary: 'Meus planos de desenvolvimento' })
  myPlans(@CurrentUser() user: any) { return this.svc.getMyPlans(user.id); }
 
  @Get('my/stats')
  @ApiOperation({ summary: 'Estatísticas dos meus planos' })
  myStats(@CurrentUser() user: any) { return this.svc.getStats(user.id); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post()
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Criar plano de desenvolvimento' })
  create(@Body() dto: CreateDevelopmentPlanDto) { return this.svc.create(dto); }
 
  @Put(':id')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Atualizar plano' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDevelopmentPlanDto) {
    return this.svc.update(id, dto);
  }
 
  @Patch(':id/complete')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Marcar plano como concluído e gerar certificado' })
  complete(@Param('id', ParseIntPipe) id: number) { return this.svc.complete(id); }
 
  @Patch(':id/cancel')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Cancelar plano' })
  cancel(@Param('id', ParseIntPipe) id: number) { return this.svc.cancel(id); }
 
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover plano' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

// src/career-plans/career-plans.controller.ts
import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CareerPlansService } from './career-plans.service';
import {
  CreateCareerPlanDto,
  UpdateCareerPlanDto,
  AddCareerGoalDto,
  CareerPlanFilterDto,
} from './career-plans.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Career Plans (Planos de Carreira)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('career-plans')
export class CareerPlansController {
  constructor(private readonly svc: CareerPlansService) {}
 
  @Get() @Roles('ADMIN', 'RH', 'GESTOR') @ApiOperation({ summary: 'Listar planos de carreira' })
  findAll(@Query() filters: CareerPlanFilterDto) { return this.svc.findAll(filters); }
 
  @Get('my') @ApiOperation({ summary: 'Meu plano de carreira activo' })
  myPlan(@CurrentUser() user: any) { return this.svc.getMyPlan(user.id); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe do plano' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Get(':id/progress') @ApiOperation({ summary: 'Progresso do plano' })
  progress(@Param('id', ParseIntPipe) id: number) { return this.svc.getProgress(id); }
 
  @Post() @Roles('ADMIN', 'RH', 'GESTOR') @ApiOperation({ summary: 'Criar plano de carreira' })
  create(@Body() dto: CreateCareerPlanDto) { return this.svc.create(dto); }
 
  @Post('goals') @ApiOperation({ summary: 'Adicionar objectivo ao plano' })
  addGoal(@Body() dto: AddCareerGoalDto) { return this.svc.addGoal(dto); }
 
  @Put(':id') @Roles('ADMIN', 'RH', 'GESTOR') @ApiOperation({ summary: 'Actualizar plano' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCareerPlanDto) {
    return this.svc.update(id, dto);
  }
 
  @Patch(':id/activate') @Roles('ADMIN', 'RH', 'GESTOR') @ApiOperation({ summary: 'Activar plano' })
  activate(@Param('id', ParseIntPipe) id: number) { return this.svc.activate(id); }
 
  @Patch('goals/:goalId/status') @ApiOperation({ summary: 'Actualizar estado de objectivo' })
  goalStatus(
    @Param('goalId', ParseIntPipe) id: number,
    @Body() body: { status: string; progress?: number },
  ) { return this.svc.updateGoalStatus(id, body.status, body.progress); }
}
 

 

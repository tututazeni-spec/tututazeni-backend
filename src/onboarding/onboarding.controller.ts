import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, ParseIntPipe, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { CreateOnboardingPlanDto, UpdateOnboardingTaskDto } from './onboarding.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}
 
  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar todos os planos de onboarding' })
  findAll() { return this.svc.findAll(); }
 
  @Get('dashboard')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard geral de onboarding' })
  dashboard() { return this.svc.getDashboard(); }
 
  @Get('my')
  @ApiOperation({ summary: 'Meus planos de onboarding' })
  my(@CurrentUser() user: any) { return this.svc.findByUser(user.id); }
 
  @Get('user/:userId')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Planos de onboarding de utilizador' })
  byUser(@Param('userId', ParseIntPipe) userId: number) { return this.svc.findByUser(userId); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do plano' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar plano de onboarding' })
  create(@Body() dto: CreateOnboardingPlanDto) { return this.svc.create(dto); }
 
  @Post('from-template/:userId/:template')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar plano a partir de template (standard|tech)' })
  fromTemplate(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('template') template: string,
  ) { return this.svc.createFromTemplate(userId, template); }
 
  @Patch(':id/tasks')
  @ApiOperation({ summary: 'Atualizar tarefa do plano' })
  updateTask(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOnboardingTaskDto) {
    return this.svc.updateTask(id, dto);
  }
 
  @Patch(':id/tasks/:index/complete')
  @ApiOperation({ summary: 'Marcar tarefa como concluída' })
  completeTask(
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
  ) { return this.svc.completeTask(id, index); }
 
  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover plano de onboarding' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

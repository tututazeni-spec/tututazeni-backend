import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProcessStandardService, CreateProcessDto, UpdateProcessDto } from './process-standard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Process Standard (Processos Standard)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('processes')
export class ProcessStandardController {
  constructor(private readonly svc: ProcessStandardService) {}
 
  @Get() @ApiOperation({ summary: 'Listar processos standard' })
  findAll(@Query('category') cat?: string) { return this.svc.findAll(cat); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe do processo' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar processo standard' })
  create(@CurrentUser() user: any, @Body() dto: CreateProcessDto) {
    return this.svc.create(user.id, dto);
  }
 
  @Post(':id/start') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Iniciar instância de processo para um colaborador' })
  start(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() body: { targetUserId: number },
  ) { return this.svc.startInstance(id, user.id, body.targetUserId); }
 
  @Post('instances/:instanceId/steps/:stepId/complete')
  @ApiOperation({ summary: 'Marcar passo como concluído' })
  completeStep(
    @Param('instanceId', ParseIntPipe) iId: number,
    @Param('stepId', ParseIntPipe) sId: number,
    @CurrentUser() user: any,
    @Body() body: { notes?: string },
  ) { return this.svc.completeStep(iId, sId, user.id, body.notes); }
 
  @Put(':id') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Actualizar processo' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProcessDto) {
    return this.svc.update(id, dto);
  }
}
 

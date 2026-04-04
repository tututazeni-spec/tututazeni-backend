import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MicroLearningService } from './micro-learning.service';
import {
  CreateMicroLearningDto, UpdateMicroLearningDto,
  DispatchMicroLearningDto, MicroLearningFilterDto,
} from './micro-learning.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Micro Learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('micro-learning')
export class MicroLearningController {
  constructor(private readonly svc: MicroLearningService) {}
 
  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar conteúdos de micro-learning' })
  findAll(@Query() filters: MicroLearningFilterDto) { return this.svc.findAll(filters); }
 
  @Get('my-feed')
  @ApiOperation({ summary: 'Feed de micro-learnings do utilizador' })
  myFeed(@CurrentUser() user: any) { return this.svc.getMyFeed(user.id); }
 
  @Get(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Detalhe do micro-learning' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Get(':id/stats')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Estatísticas de visualização' })
  stats(@Param('id', ParseIntPipe) id: number) { return this.svc.getDispatchStats(id); }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar conteúdo de micro-learning' })
  create(@Body() dto: CreateMicroLearningDto) { return this.svc.create(dto); }
 
  @Post('dispatch')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Enviar micro-learning a utilizadores' })
  dispatch(@Body() dto: DispatchMicroLearningDto) { return this.svc.dispatch(dto); }
 
  @Post(':id/dispatch-all')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Enviar micro-learning a todos os utilizadores ativos' })
  dispatchAll(@Param('id', ParseIntPipe) id: number) { return this.svc.dispatchToAll(id); }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar micro-learning' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMicroLearningDto) {
    return this.svc.update(id, dto);
  }
 
  @Patch('dispatch/:dispatchId/viewed')
  @ApiOperation({ summary: 'Marcar micro-learning como visto' })
  markViewed(@CurrentUser() user: any, @Param('dispatchId', ParseIntPipe) dispatchId: number) {
    return this.svc.markViewed(user.id, dispatchId);
  }
 
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover micro-learning' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

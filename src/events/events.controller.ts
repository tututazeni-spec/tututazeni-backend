import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto, UpdateEventParticipantStatusDto, EventFilterDto } from './events.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly svc: EventsService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar eventos' })
  findAll(@Query() filters: EventFilterDto) { return this.svc.findAll(filters); }
 
  @Get('upcoming')
  @ApiOperation({ summary: 'Próximos eventos' })
  upcoming() { return this.svc.getUpcoming(); }
 
  @Get('my')
  @ApiOperation({ summary: 'Meus eventos' })
  myEvents(@CurrentUser() user: any) { return this.svc.getMyEvents(user.id); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do evento' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post()
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Criar evento' })
  create(@CurrentUser() user: any, @Body() dto: CreateEventDto) {
    return this.svc.create(user.id, dto);
  }
 
  @Post(':id/join')
  @ApiOperation({ summary: 'Inscrever-se no evento' })
  join(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.join(id, user.id);
  }
 
  @Post(':id/leave')
  @ApiOperation({ summary: 'Cancelar inscrição no evento' })
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.leave(id, user.id);
  }
 
  @Put(':id')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Atualizar evento' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEventDto) {
    return this.svc.update(id, dto);
  }
 
  @Patch(':id/participants/:userId/status')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Atualizar status de participante' })
  participantStatus(
    @Param('id', ParseIntPipe) eventId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateEventParticipantStatusDto,
  ) { return this.svc.updateParticipantStatus(eventId, userId, dto); }
 
  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover evento' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

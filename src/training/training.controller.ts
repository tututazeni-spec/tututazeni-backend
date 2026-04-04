import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrainingService } from './training.service';
import {
  CreateTrainingDto, UpdateTrainingDto, CreateTrainingSessionDto,
  RegisterParticipantDto, UpdateParticipantStatusDto, TrainingFilterDto,
} from './trainings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Trainings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trainings')
export class TrainingController {
  constructor(private readonly svc: TrainingService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar treinamentos' })
  findAll(@Query() filters: TrainingFilterDto) { return this.svc.findAll(filters); }
 
  @Get('my')
  @ApiOperation({ summary: 'Meus treinamentos' })
  myTrainings(@CurrentUser() user: any) { return this.svc.getMyTrainings(user.id); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do treinamento' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Get(':id/attendance-report')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Relatório de presença do treinamento' })
  attendance(@Param('id', ParseIntPipe) id: number) { return this.svc.getAttendanceReport(id); }
 
  @Get('sessions/:sessionId/participants')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Participantes de uma sessão' })
  sessionParticipants(@Param('sessionId', ParseIntPipe) id: number) {
    return this.svc.getSessionParticipants(id);
  }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar treinamento' })
  create(@Body() dto: CreateTrainingDto) { return this.svc.create(dto); }
 
  @Post('sessions')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar sessão de treinamento' })
  createSession(@Body() dto: CreateTrainingSessionDto) { return this.svc.createSession(dto); }
 
  @Post('sessions/register')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Registar participante em sessão' })
  register(@Body() dto: RegisterParticipantDto) { return this.svc.registerParticipant(dto); }
 
  @Post('sessions/self-register/:sessionId')
  @ApiOperation({ summary: 'Auto-registo em sessão' })
  selfRegister(@CurrentUser() user: any, @Param('sessionId', ParseIntPipe) sessionId: number) {
    return this.svc.registerParticipant({ sessionId, userId: user.id });
  }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar treinamento' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrainingDto) {
    return this.svc.update(id, dto);
  }
 
  @Patch('participants/:id/status')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Atualizar status de participante' })
  participantStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateParticipantStatusDto,
  ) { return this.svc.updateParticipantStatus(id, dto); }
 
  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover treinamento' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
 
  @Delete('sessions/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover sessão' })
  removeSession(@Param('id', ParseIntPipe) id: number) { return this.svc.removeSession(id); }
 
  @Delete('participants/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover participante' })
  removeParticipant(@Param('id', ParseIntPipe) id: number) { return this.svc.removeParticipant(id); }
}
 

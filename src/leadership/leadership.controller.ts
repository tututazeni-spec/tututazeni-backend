import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadershipService } from './leadership.service';
import {
  CreateLeadershipProgramDto, UpdateLeadershipProgramDto,
  EnrollLeadershipDto, UpdateParticipantProgressDto,
} from './leadership.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Leadership Programs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leadership')
export class LeadershipController {
  constructor(private readonly svc: LeadershipService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar programas de liderança' })
  findAll() { return this.svc.findAll(); }
 
  @Get('my')
  @ApiOperation({ summary: 'Meus programas de liderança' })
  myPrograms(@CurrentUser() user: any) { return this.svc.getMyPrograms(user.id); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do programa' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Get(':id/stats')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Estatísticas do programa' })
  stats(@Param('id', ParseIntPipe) id: number) { return this.svc.getProgramStats(id); }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar programa de liderança' })
  create(@Body() dto: CreateLeadershipProgramDto) { return this.svc.create(dto); }
 
  @Post('enroll')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Inscrever utilizador num programa' })
  enroll(@Body() dto: EnrollLeadershipDto) { return this.svc.enroll(dto); }
 
  @Post('self-enroll/:programId')
  @ApiOperation({ summary: 'Auto-inscrição num programa' })
  selfEnroll(@CurrentUser() user: any, @Param('programId', ParseIntPipe) programId: number) {
    return this.svc.enroll({ userId: user.id, programId });
  }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar programa' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLeadershipProgramDto) {
    return this.svc.update(id, dto);
  }
 
  @Patch(':programId/participants/:userId/progress')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar progresso do participante' })
  updateProgress(
    @Param('programId', ParseIntPipe) programId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateParticipantProgressDto,
  ) { return this.svc.updateProgress(userId, programId, dto); }
 
  @Patch(':programId/withdraw')
  @ApiOperation({ summary: 'Abandonar programa' })
  withdraw(@CurrentUser() user: any, @Param('programId', ParseIntPipe) programId: number) {
    return this.svc.withdraw(user.id, programId);
  }
 
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover programa' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

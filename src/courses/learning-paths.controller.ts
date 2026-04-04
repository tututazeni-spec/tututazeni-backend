import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LearningPathsService } from './learning-paths.service';
import { CreateLearningPathDto, UpdateLearningPathDto, AssignLearningPathDto } from './learning-paths.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Learning Paths')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('learning-paths')
export class LearningPathsController {
  constructor(private readonly svc: LearningPathsService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar trilhas de aprendizagem' })
  findAll() { return this.svc.findAll(); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da trilha' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Get(':id/assignments')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atribuições da trilha' })
  assignments(@Param('id', ParseIntPipe) id: number) { return this.svc.getAssignments(id); }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar trilha' })
  create(@Body() dto: CreateLearningPathDto) { return this.svc.create(dto); }
 
  @Post('assign')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atribuir trilha a unidade/role' })
  assign(@Body() dto: AssignLearningPathDto) { return this.svc.assign(dto); }
 
  @Post(':id/courses/:courseId/:seq')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Adicionar curso à trilha' })
  addCourse(
    @Param('id', ParseIntPipe) id: number,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Param('seq', ParseIntPipe) seq: number,
  ) { return this.svc.addCourse(id, courseId, seq); }
 
  @Post('assignments/:assignmentId/enroll')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Matricular utilizadores automaticamente da atribuição' })
  enrollFromAssignment(@Param('assignmentId', ParseIntPipe) id: number) {
    return this.svc.enrollUsersFromAssignment(id);
  }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar trilha' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLearningPathDto) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover trilha' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
 
  @Delete(':id/courses/:courseId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover curso da trilha' })
  removeCourse(
    @Param('id', ParseIntPipe) id: number,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) { return this.svc.removeCourse(id, courseId); }
}

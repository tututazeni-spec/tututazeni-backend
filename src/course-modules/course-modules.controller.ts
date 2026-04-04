import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CourseModulesService } from './course-modules.service';
import {
  CreateModuleDto, UpdateModuleDto,
  CreateLessonDto, UpdateLessonDto,
  MarkLessonCompleteDto,
} from './course-modules.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Course Modules & Lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CourseModulesController {
  constructor(private readonly svc: CourseModulesService) {}
 
  // MODULES
  @Post('modules')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar módulo' })
  createModule(@Body() dto: CreateModuleDto) { return this.svc.createModule(dto); }
 
  @Get('modules/:id')
  @ApiOperation({ summary: 'Detalhe do módulo' })
  findModule(@Param('id', ParseIntPipe) id: number) { return this.svc.findModuleOrFail(id); }
 
  @Put('modules/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar módulo' })
  updateModule(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateModuleDto) {
    return this.svc.updateModule(id, dto);
  }
 
  @Patch('modules/reorder/:courseId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Reordenar módulos' })
  reorderModules(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() order: { id: number; seq: number }[],
  ) { return this.svc.reorderModules(courseId, order); }
 
  @Delete('modules/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover módulo' })
  deleteModule(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteModule(id); }
 
  // LESSONS
  @Post('lessons')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar lição' })
  createLesson(@Body() dto: CreateLessonDto) { return this.svc.createLesson(dto); }
 
  @Put('lessons/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar lição' })
  updateLesson(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLessonDto) {
    return this.svc.updateLesson(id, dto);
  }
 
  @Patch('lessons/reorder/:moduleId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Reordenar lições' })
  reorderLessons(
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Body() order: { id: number; seq: number }[],
  ) { return this.svc.reorderLessons(moduleId, order); }
 
  @Delete('lessons/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover lição' })
  deleteLesson(@Param('id', ParseIntPipe) id: number) { return this.svc.deleteLesson(id); }
 
  // PROGRESS
  @Post('lessons/progress')
  @ApiOperation({ summary: 'Marcar lição como concluída' })
  markComplete(@Body() dto: MarkLessonCompleteDto) { return this.svc.markLessonComplete(dto); }
 
  @Get('lessons/progress/:enrollmentId')
  @ApiOperation({ summary: 'Progresso das lições por matrícula' })
  getProgress(@Param('enrollmentId', ParseIntPipe) enrollmentId: number) {
    return this.svc.getLessonProgress(enrollmentId);
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CourseModulesService } from './course-modules.service';
import {
  CreateModuleDto,
  UpdateModuleDto,
  ReorderModulesDto,
  CreateModuleLessonDto,
  UpdateModuleLessonDto,
  MoveLessonDto,
  MarkModuleLessonCompleteDto,
  CreateModuleMaterialDto,
  CloneModuleDto,
} from './course-modules.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Course Modules & Lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CourseModulesController {
  constructor(private readonly svc: CourseModulesService) {}

  // ── Módulos ────────────────────────────────────────────────────────────────

  @Post('modules')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar módulo num curso' })
  createModule(@Body() dto: CreateModuleDto) {
    return this.svc.createModule(dto);
  }

  @Get('modules/:id')
  @ApiOperation({ summary: 'Detalhe do módulo (aulas + materiais)' })
  findModule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findModuleOrFail(id);
  }

  @Get('modules/:id/analytics')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Analytics do módulo (conclusão, drop-off, tempo)' })
  moduleAnalytics(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getModuleAnalytics(id);
  }

  @Put('modules/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar módulo' })
  updateModule(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateModuleDto) {
    return this.svc.updateModule(id, dto);
  }

  @Patch('modules/:id/publish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Publicar módulo (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publishModule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishModule(id);
  }

  @Patch('modules/reorder/:courseId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Reordenar módulos de um curso (drag & drop)' })
  @HttpCode(HttpStatus.OK)
  reorderModules(
    @Param('courseId', ParseIntPipe) courseId: number,
    @Body() dto: ReorderModulesDto,
  ) {
    return this.svc.reorderModules(courseId, dto);
  }

  @Post('modules/:id/clone')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Clonar módulo para outro curso (inclui aulas e materiais)' })
  cloneModule(@Param('id', ParseIntPipe) id: number, @Body() dto: CloneModuleDto) {
    return this.svc.cloneModule(id, dto);
  }

  @Delete('modules/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar módulo (bloqueia se há progresso activo)' })
  deleteModule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteModule(id);
  }

  // ── Materiais complementares ───────────────────────────────────────────────

  @Post('modules/:id/materials')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar material complementar ao módulo' })
  addMaterial(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateModuleMaterialDto) {
    return this.svc.addMaterial(id, dto);
  }

  @Delete('modules/materials/:materialId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover material complementar' })
  removeMaterial(@Param('materialId', ParseIntPipe) materialId: number) {
    return this.svc.removeMaterial(materialId);
  }

  // ── Aulas ──────────────────────────────────────────────────────────────────

  @Post('lessons')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar aula num módulo' })
  createLesson(@Body() dto: CreateModuleLessonDto) {
    return this.svc.createLesson(dto);
  }

  @Put('lessons/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar aula' })
  updateLesson(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateModuleLessonDto) {
    return this.svc.updateLesson(id, dto);
  }

  @Patch('lessons/:id/move')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Mover aula para outro módulo' })
  @HttpCode(HttpStatus.OK)
  moveLesson(@Param('id', ParseIntPipe) id: number, @Body() dto: MoveLessonDto) {
    return this.svc.moveLesson(id, dto);
  }

  @Patch('lessons/reorder/:moduleId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Reordenar aulas de um módulo (drag & drop)' })
  @HttpCode(HttpStatus.OK)
  reorderLessons(
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Body() order: Array<{ id: number; seq: number }>,
  ) {
    return this.svc.reorderLessons(moduleId, order);
  }

  @Delete('lessons/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar aula' })
  deleteLesson(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteLesson(id);
  }

  // ── Progresso (colaborador) ────────────────────────────────────────────────

  @Post('lessons/progress')
  @ApiOperation({ summary: 'Marcar aula como concluída (com validação de acesso)' })
  @HttpCode(HttpStatus.OK)
  markComplete(@CurrentUser() user: CurrentUserData, @Body() dto: MarkModuleLessonCompleteDto) {
    return this.svc.markLessonComplete(user.id, dto);
  }

  @Get('courses/:courseId/progress')
  @ApiOperation({ summary: 'Progresso completo do utilizador num curso (módulos + aulas)' })
  getCourseProgress(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getLessonProgress(user.id, courseId);
  }

  @Get('modules/:id/completed')
  @ApiOperation({ summary: 'Verificar se módulo está concluído pelo utilizador' })
  isModuleCompleted(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.isModuleCompleted(id, user.id);
  }
}

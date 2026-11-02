import { AnyAuthenticated, AllowExternal } from '../common/decorators/authz.decorators';
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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
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
import { omitForExternal } from '../common/authz/external-scope';
import {
  ExternalCourseScope,
  ExternalCourseScopeGuard,
} from '../common/authz/external-course-scope.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { canManageLessonContent, redactModuleFiles } from '../common/authz/lesson-files';

import { UploadThrottle } from '../common/security/upload-throttle';
@ApiTags('Course Modules & Lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ExternalCourseScopeGuard)
@Controller()
export class CourseModulesController {
  constructor(private readonly svc: CourseModulesService) {}

  // ── Módulos ────────────────────────────────────────────────────────────────

  @Post('modules')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'course', key: 'courseId', from: 'body' })
  @ApiOperation({ summary: 'Criar módulo num curso' })
  createModule(@Body() dto: CreateModuleDto) {
    return this.svc.createModule(dto);
  }

  @Get('modules/:id')
  @ApiOperation({ summary: 'Detalhe do módulo (aulas + materiais)' })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalCourseScope({ kind: 'module', key: 'id' })
  async findModule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    const mod = await this.svc.findModuleOrFail(id);
    // Os PDFs inline só vão por inteiro a quem gere conteúdos.
    return canManageLessonContent(user) ? mod : redactModuleFiles(mod);
  }

  @Get('modules/:id/analytics')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Analytics do módulo (conclusão, drop-off, tempo)' })
  moduleAnalytics(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getModuleAnalytics(id);
  }

  @Put('modules/:id')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'module', key: 'id' })
  @ApiOperation({ summary: 'Actualizar módulo' })
  updateModule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateModuleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // O externo não muda o curso de um módulo (mover conteúdo para outro curso é ADMIN/RH).
    return this.svc.updateModule(id, omitForExternal(user, dto, ['courseId']));
  }

  @Patch('modules/:id/publish')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'module', key: 'id' })
  @ApiOperation({ summary: 'Publicar módulo (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publishModule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishModule(id);
  }

  @Patch('modules/reorder/:courseId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'course', key: 'courseId' })
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
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'module', key: 'id' })
  @ApiOperation({ summary: 'Eliminar módulo (bloqueia se há progresso activo)' })
  deleteModule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteModule(id);
  }

  // ── Materiais complementares ───────────────────────────────────────────────

  @Post('modules/:id/materials')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'module', key: 'id' })
  @ApiOperation({ summary: 'Adicionar material complementar ao módulo' })
  addMaterial(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateModuleMaterialDto) {
    return this.svc.addMaterial(id, dto);
  }

  @Delete('modules/materials/:materialId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'moduleMaterial', key: 'materialId' })
  @ApiOperation({ summary: 'Remover material complementar' })
  removeMaterial(@Param('materialId', ParseIntPipe) materialId: number) {
    return this.svc.removeMaterial(materialId);
  }

  // ── Aulas ──────────────────────────────────────────────────────────────────

  @UploadThrottle()
  @Post('lessons')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'module', key: 'moduleId', from: 'body' })
  @ApiOperation({ summary: 'Criar aula num módulo' })
  createLesson(@Body() dto: CreateModuleLessonDto) {
    return this.svc.createLesson(dto);
  }

  @UploadThrottle()
  @Put('lessons/:id')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'lesson', key: 'id' })
  @ApiOperation({ summary: 'Actualizar aula' })
  updateLesson(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateModuleLessonDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Mover aula entre módulos só por PATCH lessons/:id/move (que valida os dois lados).
    return this.svc.updateLesson(id, omitForExternal(user, dto, ['moduleId']));
  }

  @Patch('lessons/:id/move')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope(
    { kind: 'lesson', key: 'id' },
    { kind: 'module', key: 'targetModuleId', from: 'body' },
  )
  @ApiOperation({ summary: 'Mover aula para outro módulo' })
  @HttpCode(HttpStatus.OK)
  moveLesson(@Param('id', ParseIntPipe) id: number, @Body() dto: MoveLessonDto) {
    return this.svc.moveLesson(id, dto);
  }

  @Patch('lessons/reorder/:moduleId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'module', key: 'moduleId' })
  @ApiOperation({ summary: 'Reordenar aulas de um módulo (drag & drop)' })
  @HttpCode(HttpStatus.OK)
  reorderLessons(
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Body() order: Array<{ id: number; seq: number }>,
  ) {
    return this.svc.reorderLessons(moduleId, order);
  }

  @Delete('lessons/:id')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR_EXTERNO)
  @ExternalCourseScope({ kind: 'lesson', key: 'id' })
  @ApiOperation({ summary: 'Eliminar aula' })
  deleteLesson(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteLesson(id);
  }

  // ── Progresso (colaborador) ────────────────────────────────────────────────

  @Post('lessons/progress')
  @ApiOperation({ summary: 'Marcar aula como concluída (com validação de acesso)' })
  @HttpCode(HttpStatus.OK)
  @AnyAuthenticated()
  markComplete(@CurrentUser() user: CurrentUserData, @Body() dto: MarkModuleLessonCompleteDto) {
    return this.svc.markLessonComplete(user.id, dto);
  }

  @Get('lessons/:id/file')
  @ApiOperation({
    summary: 'PDF da aula (valida matrícula/publicação/drip; gestores de conteúdos sempre)',
  })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalCourseScope({ kind: 'lesson', key: 'id' })
  async getLessonFile(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
  ) {
    const pdf = await this.svc.getLessonFile(id, user.id, canManageLessonContent(user));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': 'inline; filename="aula.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(pdf);
  }

  @Get('lessons/:id/audio')
  @ApiOperation({
    summary: 'Áudio da aula gerado por text-to-speech (proxy — chave fica no backend)',
  })
  @AnyAuthenticated()
  @AllowExternal()
  @ExternalCourseScope({ kind: 'lesson', key: 'id' })
  async getLessonAudio(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
  ) {
    const audio = await this.svc.getLessonAudio(id, user.id);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
      'Cache-Control': 'private, max-age=86400',
    });
    res.end(audio);
  }

  // NOTA: courses.controller.ts já regista GET /courses/:id/progress (progresso simples).
  // Esta rota usa um path distinto para não colidir e ficar permanentemente inacessível
  // (a mesma classe de bug já vista no módulo performance — route-shadowing por ordem de registo).
  @Get('courses/:courseId/module-progress')
  @ApiOperation({
    summary: 'Progresso completo do utilizador num curso, por módulo e aula (drip/sequencial)',
  })
  @AnyAuthenticated()
  getCourseProgress(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getLessonProgress(user.id, courseId, canManageLessonContent(user));
  }

  @Get('modules/:id/completed')
  @ApiOperation({ summary: 'Verificar se módulo está concluído pelo utilizador' })
  @AnyAuthenticated()
  isModuleCompleted(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.isModuleCompleted(id, user.id);
  }
}

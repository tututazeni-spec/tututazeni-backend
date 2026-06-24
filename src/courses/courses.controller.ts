import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import {
  CreateCourseDto,
  UpdateCourseDto,
  CourseFilterDto,
  CreateCourseModuleDto,
  UpdateCourseModuleDto,
  CreateLessonDto,
  UpdateLessonDto,
  MarkLessonCompleteDto,
  EnrollDto,
  AssignCourseDto,
  CreateQuizDto,
  SubmitQuizDto,
  CourseFeedbackDto,
} from './courses.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly svc: CoursesService) {}

  // ── Catálogo & Descoberta ─────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Catálogo de cursos com filtros e paginação' })
  findAll(@Query() filters: CourseFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias disponíveis com contagem' })
  categories() {
    return this.svc.getCategories();
  }

  @Get('admin/dashboard')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard administrativo de cursos' })
  adminDashboard() {
    return this.svc.getAdminDashboard();
  }

  @Get('my/enrollments')
  @ApiOperation({ summary: 'As minhas matrículas e progresso' })
  myEnrollments(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyEnrollments(user.id);
  }

  @Get('my/certificates')
  @ApiOperation({ summary: 'Os meus certificados' })
  myCertificates(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyCertificates(user.id);
  }

  @Get('certificates/verify/:code')
  @ApiOperation({ summary: 'Verificar validade de certificado por código' })
  verifyCertificate(@Param('code') code: string) {
    return this.svc.verifyCertificate(code);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe completo do curso (módulos, aulas, feedback)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/analytics')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @ApiOperation({ summary: 'Analytics detalhados do curso' })
  analytics(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getCourseAnalytics(id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Progresso do utilizador autenticado num curso' })
  progress(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getCourseProgress(id, user.id);
  }

  // ── Gestão de Cursos (Admin/RH) ──────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar curso' })
  create(@Body() dto: CreateCourseDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar curso' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCourseDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Publicar curso (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Arquivar curso' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archive(id);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Duplicar curso (cria cópia em DRAFT)' })
  duplicate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.duplicate(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar curso (apenas DRAFT sem matrículas)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Competências ──────────────────────────────────────────────────────────

  @Post(':id/competencies/:competencyId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Associar competência ao curso' })
  addCompetency(
    @Param('id', ParseIntPipe) id: number,
    @Param('competencyId', ParseIntPipe) cId: number,
  ) {
    return this.svc.addCompetency(id, cId);
  }

  @Delete(':id/competencies/:competencyId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover competência do curso' })
  removeCompetency(
    @Param('id', ParseIntPipe) id: number,
    @Param('competencyId', ParseIntPipe) cId: number,
  ) {
    return this.svc.removeCompetency(id, cId);
  }

  // ── Módulos ───────────────────────────────────────────────────────────────

  @Post(':id/modules')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar módulo no curso' })
  createModule(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCourseModuleDto) {
    return this.svc.createModule(id, dto);
  }

  @Put(':id/modules/:moduleId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar módulo' })
  updateModule(
    @Param('id', ParseIntPipe) id: number,
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Body() dto: UpdateCourseModuleDto,
  ) {
    return this.svc.updateModule(id, moduleId, dto);
  }

  @Patch(':id/modules/reorder')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Reordenar módulos (drag & drop)' })
  @HttpCode(HttpStatus.OK)
  reorderModules(@Param('id', ParseIntPipe) id: number, @Body('orderedIds') ids: number[]) {
    return this.svc.reorderModules(id, ids);
  }

  @Delete(':id/modules/:moduleId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover módulo' })
  removeModule(
    @Param('id', ParseIntPipe) id: number,
    @Param('moduleId', ParseIntPipe) moduleId: number,
  ) {
    return this.svc.removeModule(id, moduleId);
  }

  // ── Aulas ─────────────────────────────────────────────────────────────────

  @Post('modules/:moduleId/lessons')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar aula num módulo' })
  createLesson(@Param('moduleId', ParseIntPipe) moduleId: number, @Body() dto: CreateLessonDto) {
    return this.svc.createLesson(moduleId, dto);
  }

  @Put('lessons/:lessonId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar aula' })
  updateLesson(@Param('lessonId', ParseIntPipe) lessonId: number, @Body() dto: UpdateLessonDto) {
    return this.svc.updateLesson(lessonId, dto);
  }

  @Patch('modules/:moduleId/lessons/reorder')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Reordenar aulas (drag & drop)' })
  @HttpCode(HttpStatus.OK)
  reorderLessons(
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Body('orderedIds') ids: number[],
  ) {
    return this.svc.reorderLessons(moduleId, ids);
  }

  @Delete('lessons/:lessonId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover aula' })
  removeLesson(@Param('lessonId', ParseIntPipe) lessonId: number) {
    return this.svc.removeLesson(lessonId);
  }

  @Post('lessons/:lessonId/complete')
  @ApiOperation({ summary: 'Marcar aula como concluída e actualizar progresso' })
  @HttpCode(HttpStatus.OK)
  markComplete(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: MarkLessonCompleteDto,
  ) {
    return this.svc.markLessonComplete(lessonId, user.id, dto);
  }

  // ── Matrículas ────────────────────────────────────────────────────────────

  @Post(':id/enroll')
  @ApiOperation({ summary: 'Matricular utilizador autenticado' })
  enroll(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: EnrollDto,
  ) {
    return this.svc.enroll(id, user.id, dto);
  }

  @Post(':id/assign')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Atribuir curso a utilizador, departamento ou cargo' })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: AssignCourseDto,
  ) {
    return this.svc.assignCourse(id, dto, user.id);
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────

  @Post('lessons/:lessonId/quiz')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar quiz para uma aula' })
  createQuiz(@Param('lessonId', ParseIntPipe) lessonId: number, @Body() dto: CreateQuizDto) {
    return this.svc.createQuiz(lessonId, dto);
  }

  @Post('quizzes/:quizId/submit')
  @ApiOperation({ summary: 'Submeter respostas do quiz' })
  @HttpCode(HttpStatus.OK)
  submitQuiz(
    @Param('quizId', ParseIntPipe) quizId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.svc.submitQuiz(quizId, user.id, dto);
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Submeter ou actualizar feedback do curso' })
  feedback(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CourseFeedbackDto,
  ) {
    return this.svc.addFeedback(id, user.id, dto);
  }
}

import { AnyAuthenticated } from '../common/decorators/authz.decorators';
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
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { safeDownloadHeaders } from '../common/files/safe-download';
import { CohortsExportService } from './cohorts-export.service';
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
  UpdateQuizDto,
  SubmitQuizDto,
  CourseFeedbackDto,
  CreateLessonActivityDto,
  UpdateLessonActivityDto,
  CreateLessonResourceDto,
  UpdateLessonResourceDto,
  CreateCourseAudienceGroupDto,
  UpdateCourseAudienceGroupDto,
  CreateCourseCohortDto,
  UpdateCourseCohortDto,
  AddCohortParticipantsDto,
  MarkCohortAttendanceDto,
  CreateCourseCategoryDto,
  UpdateCourseCategoryDto,
  SetCategoryCoursesDto,
} from './courses.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { canManageLessonContent, redactCourseFiles } from '../common/authz/lesson-files';
import { Role, AUTHENTICATED_ROLES } from '../auth/enums/role.enum';

import { UploadThrottle } from '../common/security/upload-throttle';
@ApiTags('Courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
  constructor(
    private readonly svc: CoursesService,
    private readonly cohortsExport: CohortsExportService,
  ) {}

  // ── Catálogo & Descoberta ─────────────────────────────────────────────────

  @Get()
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Catálogo de cursos com filtros e paginação' })
  findAll(@Query() filters: CourseFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('categories')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Listar categorias disponíveis com contagem' })
  categories() {
    return this.svc.getCategories();
  }

  // Rotas de um só segmento ('reports', 'categories/manage' tem 2 mas
  // 'reports' tem 1) têm de vir antes de @Get(':id') — caso contrário
  // ':id' (single-segment) intercepta-as primeiro e ParseIntPipe rebenta
  // com "reports" como valor. Ver docs/modulo_courses.md secções 6-7.
  @Get('categories/manage')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Listar categorias geridas (descrição, estado, cursos associados)' })
  listCategoriesManaged() {
    return this.svc.listCategoriesManaged();
  }

  @Get('deleted')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Reciclagem: cursos eliminados nos últimos 30 dias' })
  listDeleted() {
    return this.svc.listDeleted();
  }

  @Get('reports')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatórios do módulo Cursos' })
  reports() {
    return this.svc.getCourseReports();
  }

  @Get('admin/dashboard')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard administrativo de cursos' })
  adminDashboard() {
    return this.svc.getAdminDashboard();
  }

  @Get('my/enrollments')
  @ApiOperation({ summary: 'As minhas matrículas e progresso' })
  @AnyAuthenticated()
  myEnrollments(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyEnrollments(user.id);
  }

  @Get('my/certificates')
  @ApiOperation({ summary: 'Os meus certificados' })
  @AnyAuthenticated()
  myCertificates(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyCertificates(user.id);
  }

  @Get('certificates/verify/:code')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Verificar validade de certificado por código' })
  verifyCertificate(@Param('code') code: string) {
    return this.svc.verifyCertificate(code);
  }

  @Get(':id')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Detalhe completo do curso (módulos, aulas, feedback)' })
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    const course = await this.svc.findOne(id);
    // PDFs das aulas só vão por inteiro a quem gere conteúdos; o aluno usa /lessons/:id/file.
    return canManageLessonContent(user) ? course : redactCourseFiles(course);
  }

  @Get(':id/analytics')
  @Roles(Role.ADMIN, Role.RH, Role.LIDER)
  @ApiOperation({ summary: 'Analytics detalhados do curso' })
  analytics(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getCourseAnalytics(id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Progresso do utilizador autenticado num curso' })
  @AnyAuthenticated()
  progress(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.getCourseProgress(id, user.id);
  }

  // ── Gestão de Cursos (Admin/RH) ──────────────────────────────────────────

  @UploadThrottle()
  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar curso' })
  create(@Body() dto: CreateCourseDto) {
    return this.svc.create(dto);
  }

  @UploadThrottle()
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
  @ApiOperation({ summary: 'Eliminar curso (vai para a reciclagem durante 30 dias)' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.remove(id, user.id);
  }

  @Post(':id/restore')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Restaurar curso da reciclagem' })
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.svc.restore(id);
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

  // ── Instrutores ─────────────────────────────────────────────────────────

  @Post(':id/instructors/:userId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Associar instrutor (co-instrutor) ao curso' })
  addInstructor(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.svc.addInstructor(id, userId);
  }

  @Delete(':id/instructors/:userId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover instrutor do curso' })
  removeInstructor(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.svc.removeInstructor(id, userId);
  }

  // ── Grupos de audiência (visibilidade = Apenas grupos seleccionados) ────

  @Post(':id/audience-groups')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar grupo de audiência do curso' })
  createAudienceGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateCourseAudienceGroupDto,
  ) {
    return this.svc.createAudienceGroup(id, dto);
  }

  @Put('audience-groups/:groupId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar grupo de audiência' })
  updateAudienceGroup(
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: UpdateCourseAudienceGroupDto,
  ) {
    return this.svc.updateAudienceGroup(groupId, dto);
  }

  @Delete('audience-groups/:groupId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover grupo de audiência' })
  removeAudienceGroup(@Param('groupId', ParseIntPipe) groupId: number) {
    return this.svc.removeAudienceGroup(groupId);
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

  // ── Competências do módulo ─────────────────────────────────────────────

  @Post(':id/modules/:moduleId/competencies/:competencyId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Associar competência ao módulo' })
  addModuleCompetency(
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Param('competencyId', ParseIntPipe) competencyId: number,
  ) {
    return this.svc.addModuleCompetency(moduleId, competencyId);
  }

  @Delete(':id/modules/:moduleId/competencies/:competencyId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover competência do módulo' })
  removeModuleCompetency(
    @Param('moduleId', ParseIntPipe) moduleId: number,
    @Param('competencyId', ParseIntPipe) competencyId: number,
  ) {
    return this.svc.removeModuleCompetency(moduleId, competencyId);
  }

  // ── Aulas ─────────────────────────────────────────────────────────────────

  @UploadThrottle()
  @Post('modules/:moduleId/lessons')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar aula num módulo' })
  createLesson(@Param('moduleId', ParseIntPipe) moduleId: number, @Body() dto: CreateLessonDto) {
    return this.svc.createLesson(moduleId, dto);
  }

  @UploadThrottle()
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
  @AnyAuthenticated()
  markComplete(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: MarkLessonCompleteDto,
  ) {
    return this.svc.markLessonComplete(lessonId, user.id, dto);
  }

  // ── Actividades da aula ──────────────────────────────────────────────────

  @Post('lessons/:lessonId/activities')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar actividade dentro da aula' })
  createLessonActivity(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: CreateLessonActivityDto,
  ) {
    return this.svc.createLessonActivity(lessonId, dto);
  }

  @Put('lessons/activities/:activityId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar actividade da aula' })
  updateLessonActivity(
    @Param('activityId', ParseIntPipe) activityId: number,
    @Body() dto: UpdateLessonActivityDto,
  ) {
    return this.svc.updateLessonActivity(activityId, dto);
  }

  @Delete('lessons/activities/:activityId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover actividade da aula' })
  removeLessonActivity(@Param('activityId', ParseIntPipe) activityId: number) {
    return this.svc.removeLessonActivity(activityId);
  }

  // ── Recursos da aula ─────────────────────────────────────────────────────

  @Post('lessons/:lessonId/resources')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar recurso/material de apoio à aula' })
  createLessonResource(
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @Body() dto: CreateLessonResourceDto,
  ) {
    return this.svc.createLessonResource(lessonId, dto);
  }

  @Put('lessons/resources/:resourceId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar recurso da aula' })
  updateLessonResource(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Body() dto: UpdateLessonResourceDto,
  ) {
    return this.svc.updateLessonResource(resourceId, dto);
  }

  @Delete('lessons/resources/:resourceId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover recurso da aula' })
  removeLessonResource(@Param('resourceId', ParseIntPipe) resourceId: number) {
    return this.svc.removeLessonResource(resourceId);
  }

  // ── Matrículas ────────────────────────────────────────────────────────────

  @Post(':id/enroll')
  @ApiOperation({ summary: 'Matricular utilizador autenticado' })
  @AnyAuthenticated()
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

  @Get(':id/enrollments/pending')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Pedidos de inscrição pendentes de aprovação (cursos que exigem aprovação)',
  })
  pendingEnrollments(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listPendingEnrollments(id);
  }

  @Patch('enrollments/:enrollmentId/approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Aprovar pedido de inscrição pendente' })
  approveEnrollment(@Param('enrollmentId', ParseIntPipe) enrollmentId: number) {
    return this.svc.approveEnrollment(enrollmentId);
  }

  @Patch('enrollments/:enrollmentId/reject')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Rejeitar pedido de inscrição pendente' })
  rejectEnrollment(
    @Param('enrollmentId', ParseIntPipe) enrollmentId: number,
    @Body('reason') reason?: string,
  ) {
    return this.svc.rejectEnrollment(enrollmentId, reason);
  }

  // ── Quiz ──────────────────────────────────────────────────────────────────

  @Get('lessons/:lessonId/quiz')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Ler quiz de uma aula para edição (inclui respostas certas)' })
  getQuizForEdit(@Param('lessonId', ParseIntPipe) lessonId: number) {
    return this.svc.getQuizForEdit(lessonId);
  }

  @Post('lessons/:lessonId/quiz')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar quiz para uma aula' })
  createQuiz(@Param('lessonId', ParseIntPipe) lessonId: number, @Body() dto: CreateQuizDto) {
    return this.svc.createQuiz(lessonId, dto);
  }

  @Put('quizzes/:quizId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar configurações e perguntas do quiz' })
  updateQuiz(@Param('quizId', ParseIntPipe) quizId: number, @Body() dto: UpdateQuizDto) {
    return this.svc.updateQuiz(quizId, dto);
  }

  @Get('quizzes/:quizId/attempt')
  @ApiOperation({ summary: 'Ler quiz para o aluno responder (sem respostas certas) + tentativas' })
  @AnyAuthenticated()
  getQuizForAttempt(
    @Param('quizId', ParseIntPipe) quizId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getQuizForAttempt(quizId, user.id);
  }

  @Post('quizzes/:quizId/submit')
  @ApiOperation({ summary: 'Submeter respostas do quiz' })
  @HttpCode(HttpStatus.OK)
  @AnyAuthenticated()
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
  @AnyAuthenticated()
  feedback(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CourseFeedbackDto,
  ) {
    return this.svc.addFeedback(id, user.id, dto);
  }

  // ── Turmas (docs/modulo_courses.md secção 5) — cursos presenciais/híbridos ─

  @Get(':id/cohorts')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Listar turmas de um curso' })
  listCohorts(@Param('id', ParseIntPipe) id: number) {
    return this.svc.listCohorts(id);
  }

  @Post(':id/cohorts')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Criar turma' })
  createCohort(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCourseCohortDto) {
    return this.svc.createCohort(id, dto);
  }

  @Get('cohorts/open')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({
    summary: 'Listar turmas abertas (OPEN) ou activas (ACTIVE) de todos os cursos',
  })
  listOpenCohorts(@CurrentUser() user: CurrentUserData, @Query('status') status?: string) {
    return this.svc.listOpenCohorts(user, status);
  }

  // Declarada antes de 'cohorts/:cohortId' para não ser apanhada por esse parâmetro.
  @Get('cohorts/mine')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Turmas em que o utilizador autenticado está inscrito' })
  listMyCohorts(@CurrentUser() user: CurrentUserData) {
    return this.svc.listMyCohorts(user.id);
  }

  @Get('cohorts/export')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Relatório de turmas abertas/activas/encerradas em Excel ou PDF' })
  async exportCohorts(
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('format') format?: string,
  ) {
    if (status !== 'OPEN' && status !== 'ACTIVE' && status !== 'CLOSED') {
      throw new BadRequestException('status deve ser OPEN, ACTIVE ou CLOSED');
    }
    if (format !== 'xlsx' && format !== 'pdf') {
      throw new BadRequestException('format deve ser xlsx ou pdf');
    }
    const file = await this.cohortsExport.export(status, format, user);
    res.set(
      safeDownloadHeaders({
        filename: file.filename,
        mime: file.contentType,
        extra: { 'Content-Length': String(file.buffer.length) },
      }),
    );
    res.end(file.buffer);
  }

  @Get('cohorts/:cohortId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Detalhe da turma (com participantes)' })
  getCohort(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getCohort(cohortId, user);
  }

  @Patch('cohorts/:cohortId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Actualizar turma' })
  updateCohort(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @Body() dto: UpdateCourseCohortDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.updateCohort(cohortId, dto, user);
  }

  @Patch('cohorts/:cohortId/close')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Encerrar turma' })
  @HttpCode(HttpStatus.OK)
  closeCohort(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.closeCohort(cohortId, user);
  }

  @Delete('cohorts/:cohortId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Eliminar turma (remove também os participantes)' })
  deleteCohort(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.deleteCohort(cohortId, user);
  }

  @Post('cohorts/:cohortId/participants')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Adicionar participantes à turma' })
  addCohortParticipants(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @Body() dto: AddCohortParticipantsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addCohortParticipants(cohortId, dto, user);
  }

  @Delete('cohorts/:cohortId/participants/:userId')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Remover participante da turma' })
  removeCohortParticipant(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeCohortParticipant(cohortId, userId, user);
  }

  @Post('cohorts/:cohortId/attendance')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Marcar presenças da turma numa data' })
  markCohortAttendance(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @Body() dto: MarkCohortAttendanceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.markCohortAttendance(cohortId, dto, user);
  }

  @Get('cohorts/:cohortId/attendance/export')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Folha de presenças da turma em Excel ou PDF' })
  async exportCohortAttendance(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
    @Query('format') format?: string,
  ) {
    if (format !== 'xlsx' && format !== 'pdf') {
      throw new BadRequestException('format deve ser xlsx ou pdf');
    }
    const file = await this.cohortsExport.exportAttendance(cohortId, format, user);
    res.set(
      safeDownloadHeaders({
        filename: file.filename,
        mime: file.contentType,
        extra: { 'Content-Length': String(file.buffer.length) },
      }),
    );
    res.end(file.buffer);
  }

  @Get('cohorts/:cohortId/attendance/sheet')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Folha de presenças da turma: todos os dias de aula × participantes' })
  getCohortAttendanceSheet(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getCohortAttendanceSheet(cohortId, user);
  }

  @Get('cohorts/:cohortId/attendance')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Ler presenças já marcadas da turma numa data' })
  getCohortAttendance(
    @Param('cohortId', ParseIntPipe) cohortId: number,
    @Query('date') date: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.getCohortAttendance(cohortId, date, user);
  }

  // ── Categorias (docs/modulo_courses.md secção 6) — gestão ADMIN/RH ────────
  // GET 'categories/manage' e GET 'reports' estão antes de @Get(':id') —
  // ver comentário nessa secção.

  @Post('categories')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar categoria de curso' })
  createCategory(@Body() dto: CreateCourseCategoryDto) {
    return this.svc.createCategory(dto);
  }

  @Patch('categories/:categoryId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar categoria de curso' })
  updateCategory(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() dto: UpdateCourseCategoryDto,
  ) {
    return this.svc.updateCategory(categoryId, dto);
  }

  @Get('categories/:categoryId/courses')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Cursos do catálogo com indicação de pertença à categoria' })
  listCategoryCourses(@Param('categoryId', ParseIntPipe) categoryId: number) {
    return this.svc.listCategoryCourses(categoryId);
  }

  @Put('categories/:categoryId/courses')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Definir os cursos que pertencem à categoria' })
  setCategoryCourses(
    @Param('categoryId', ParseIntPipe) categoryId: number,
    @Body() dto: SetCategoryCoursesDto,
  ) {
    return this.svc.setCategoryCourses(categoryId, dto.courseIds);
  }

  @Delete('categories/:categoryId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover categoria de curso (só sem cursos associados)' })
  removeCategory(@Param('categoryId', ParseIntPipe) categoryId: number) {
    return this.svc.removeCategory(categoryId);
  }
}

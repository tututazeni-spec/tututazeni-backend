// src/instructor/instructor.controller.ts
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InstructorService } from './instructor.service';
import {
  CreateInstructorProfileDto, UpdateInstructorProfileDto,
  CreateMarketplaceCourseDto, InstructorReviewDto, InstructorFilterDto,
  CreateCohortDto, UpdateCohortDto, AddParticipantsDto, CohortFilterDto,
} from './instructor.dto';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Instructors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instructors')
export class InstructorController {
  constructor(private readonly svc: InstructorService) {}

  // ── Listagem ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar instrutores (com filtros e busca)' })
  findAll(@Query() filters: InstructorFilterDto) { return this.svc.findAll(filters); }

  @Get('marketplace')
  @ApiOperation({ summary: 'Cursos do marketplace' })
  marketplace(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.svc.getMarketplaceCourses(page, limit);
  }

  // ── Meu perfil de instrutor ───────────────────────────────────────────────

  @Get('my/profile')
  @ApiOperation({ summary: 'Meu perfil de instrutor' })
  myProfile(@CurrentUser() user: any) { return this.svc.findByUser(user.id); }

  @Get('my/dashboard')
  @ApiOperation({ summary: 'Dashboard do instrutor (métricas, turmas activas, alertas)' })
  myDashboard(@CurrentUser() user: any) { return this.svc.getMyDashboard(user.id); }

  @Get('my/analytics')
  @ApiOperation({ summary: 'Analytics do instrutor (totais, avaliações, rating)' })
  myAnalytics(@CurrentUser() user: any) { return this.svc.getAnalytics(user.id); }

  @Get('my/at-risk-students')
  @ApiOperation({ summary: 'Alunos em risco nas minhas turmas activas' })
  atRisk(@CurrentUser() user: any) { return this.svc.getAtRiskStudents(user.id); }

  @Get('my/payouts')
  @ApiOperation({ summary: 'Histórico de pagamentos (instrutores externos)' })
  myPayouts(@CurrentUser() user: any) { return this.svc.getPayoutHistory(user.id); }

  // ── Turmas (Cohorts) ──────────────────────────────────────────────────────

  @Get('my/cohorts')
  @ApiOperation({ summary: 'As minhas turmas com filtros' })
  myCohorts(@CurrentUser() user: any, @Query() filters: CohortFilterDto) {
    return this.svc.getCohorts(user.id, filters);
  }

  @Get('my/cohorts/:id')
  @ApiOperation({ summary: 'Detalhe de turma (participantes, progresso, alertas)' })
  cohortDetail(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getCohortDetail(id, user.id);
  }

  @Post('my/cohorts')
  @ApiOperation({ summary: 'Criar nova turma' })
  createCohort(@CurrentUser() user: any, @Body() dto: CreateCohortDto) {
    return this.svc.createCohort(user.id, dto);
  }

  @Put('my/cohorts/:id')
  @ApiOperation({ summary: 'Actualizar turma' })
  updateCohort(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCohortDto,
  ) {
    return this.svc.updateCohort(id, user.id, dto);
  }

  @Post('my/cohorts/:id/participants')
  @ApiOperation({ summary: 'Adicionar participantes à turma' })
  addParticipants(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddParticipantsDto,
  ) {
    return this.svc.addParticipants(id, user.id, dto);
  }

  @Delete('my/cohorts/:id/participants/:userId')
  @ApiOperation({ summary: 'Remover participante da turma' })
  removeParticipant(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) participantUserId: number,
  ) {
    return this.svc.removeParticipant(id, participantUserId, user.id);
  }

  // ── Perfil ────────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe público do instrutor' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post('profile')
  @ApiOperation({ summary: 'Criar perfil de instrutor' })
  createProfile(@CurrentUser() user: any, @Body() dto: CreateInstructorProfileDto) {
    return this.svc.createProfile(user.id, dto);
  }

  @Put('my/profile')
  @ApiOperation({ summary: 'Actualizar meu perfil de instrutor' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateInstructorProfileDto) {
    return this.svc.updateProfile(user.id, dto);
  }

  // ── Reviews ───────────────────────────────────────────────────────────────

  @Post('reviews')
  @ApiOperation({ summary: 'Avaliar instrutor (1-5)' })
  review(@CurrentUser() user: any, @Body() dto: InstructorReviewDto) {
    return this.svc.addReview(user.id, dto);
  }

  // ── Marketplace ───────────────────────────────────────────────────────────

  @Post('marketplace/courses')
  @ApiOperation({ summary: 'Criar curso no marketplace' })
  createCourse(@CurrentUser() user: any, @Body() dto: CreateMarketplaceCourseDto) {
    return this.svc.createMarketplaceCourse(user.id, dto);
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  @Patch(':id/approve')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Aprovar instrutor' })
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseIntPipe) id: number) { return this.svc.approve(id); }

  @Patch(':id/revoke')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Revogar aprovação de instrutor' })
  @HttpCode(HttpStatus.OK)
  revoke(@Param('id', ParseIntPipe) id: number) { return this.svc.revoke(id); }

  @Post(':id/payout')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registar pagamento ao instrutor' })
  payout(@Param('id', ParseIntPipe) id: number, @Body() body: { amount: number }) {
    return this.svc.createPayout(id, body.amount);
  }
}
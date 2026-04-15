import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LearningPathsService } from './learning-paths.service';
import {
  CreateLearningPathDto, UpdateLearningPathDto, LearningPathFilterDto,
  AssignLearningPathDto, LearningPathStepDto, ReorderStepsDto,
} from './learning-paths.dto';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Learning Paths')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('learning-paths')
export class LearningPathsController {
  constructor(private readonly svc: LearningPathsService) {}

  // ── Catálogo & Descoberta ─────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Catálogo de trilhas com filtros e paginação' })
  findAll(@Query() filters: LearningPathFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('admin/dashboard')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard administrativo de Learning Paths' })
  adminDashboard() {
    return this.svc.getAdminDashboard();
  }

  @Get('my/enrollments')
  @ApiOperation({ summary: 'As minhas trilhas de aprendizagem' })
  myEnrollments(@CurrentUser() user: any) {
    return this.svc.getMyEnrollments(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da trilha (steps + milestones)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/analytics')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Analytics da trilha (conclusão, drop-off por etapa)' })
  analytics(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAnalytics(id);
  }

  @Get(':id/assignments')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atribuições da trilha' })
  assignments(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAssignments(id);
  }

  @Get(':id/progress')
  @ApiOperation({ summary: 'Progresso do utilizador autenticado na trilha' })
  progress(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.svc.getMyProgress(id, user.id);
  }

  // ── Gestão (Admin/RH) ────────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar trilha de aprendizagem' })
  create(@Body() dto: CreateLearningPathDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar trilha' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLearningPathDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/publish')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Publicar trilha (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Patch(':id/archive')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Arquivar trilha' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archive(id);
  }

  @Post(':id/duplicate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Duplicar trilha (cria cópia em DRAFT)' })
  duplicate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.duplicate(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar trilha (apenas DRAFT sem matrículas)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Steps ─────────────────────────────────────────────────────────────────

  @Post(':id/steps')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Adicionar curso à trilha' })
  addStep(@Param('id', ParseIntPipe) id: number, @Body() dto: LearningPathStepDto) {
    return this.svc.addStep(id, dto);
  }

  @Patch(':id/steps/reorder')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Reordenar steps da trilha (drag & drop)' })
  @HttpCode(HttpStatus.OK)
  reorderSteps(@Param('id', ParseIntPipe) id: number, @Body() dto: ReorderStepsDto) {
    return this.svc.reorderSteps(id, dto);
  }

  @Delete(':id/steps/:courseId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover curso da trilha' })
  removeStep(
    @Param('id', ParseIntPipe)       id: number,
    @Param('courseId', ParseIntPipe) courseId: number,
  ) {
    return this.svc.removeStep(id, courseId);
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  @Post(':id/milestones')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar milestone na trilha' })
  createMilestone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { title: string; description?: string; seq: number },
  ) {
    return this.svc.createMilestone(id, dto);
  }

  @Delete('milestones/:milestoneId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover milestone' })
  removeMilestone(@Param('milestoneId', ParseIntPipe) milestoneId: number) {
    return this.svc.removeMilestone(milestoneId);
  }

  // ── Matrículas ────────────────────────────────────────────────────────────

  @Post(':id/enroll')
  @ApiOperation({ summary: 'Auto-matrícula do utilizador autenticado' })
  selfEnroll(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.selfEnroll(id, user.id);
  }

  @Post('assign')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Atribuir trilha a utilizador, departamento, cargo, unidade ou role' })
  assign(@Body() dto: AssignLearningPathDto) {
    return this.svc.assign(dto);
  }
}

// src/assessments/assessments.controller.ts
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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import {
  CreateAssessmentDto,
  UpdateAssessmentDto,
  AssessmentFilterDto,
  StartAttemptDto,
  SubmitAttemptDto,
  AutoSaveDto,
  ReviewAnswerDto,
  CreateQuestionDto,
} from './assessments.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly svc: AssessmentsService) {}

  // ── Catálogo & Descoberta ─────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar avaliações com filtros' })
  findAll(@Query() filters: AssessmentFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('pending-reviews')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Respostas abertas aguardando revisão manual' })
  pendingReviews() {
    return this.svc.getPendingReviews();
  }

  @Get('my/attempts')
  @ApiOperation({ summary: 'As minhas tentativas' })
  @ApiQuery({ name: 'assessmentId', required: false })
  myAttempts(@CurrentUser() user: any, @Query('assessmentId') assessmentId?: string) {
    return this.svc.getUserAttempts(user.id, assessmentId ? parseInt(assessmentId) : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da avaliação (sem respostas correctas para colaborador)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id, true);
  }

  @Get(':id/analytics')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Analytics da avaliação (taxa aprovação, perguntas difíceis)' })
  analytics(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAnalytics(id);
  }

  @Get('attempts/:attemptId')
  @ApiOperation({ summary: 'Detalhe de uma tentativa (para revisão)' })
  attemptDetail(@Param('attemptId', ParseIntPipe) attemptId: number, @CurrentUser() user: any) {
    return this.svc.getAttemptDetail(attemptId, user.id);
  }

  // ── Gestão (Admin/RH) ────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar avaliação' })
  create(@Body() dto: CreateAssessmentDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar avaliação' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssessmentDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Publicar avaliação (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Arquivar avaliação' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archive(id);
  }

  @Post(':id/duplicate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Duplicar avaliação' })
  duplicate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.duplicate(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar avaliação' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Perguntas ─────────────────────────────────────────────────────────────

  @Post(':id/questions')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar pergunta à avaliação' })
  addQuestion(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateQuestionDto) {
    return this.svc.addQuestion(id, dto);
  }

  @Delete('questions/:questionId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover pergunta' })
  removeQuestion(@Param('questionId', ParseIntPipe) questionId: number) {
    return this.svc.removeQuestion(questionId);
  }

  // ── Execução (Colaborador) ────────────────────────────────────────────────

  @Post('attempts/start')
  @ApiOperation({ summary: 'Iniciar ou retomar tentativa' })
  startAttempt(@CurrentUser() user: any, @Body() dto: StartAttemptDto) {
    return this.svc.startAttempt(user.id, dto);
  }

  @Post('attempts/save')
  @ApiOperation({ summary: 'Auto-save das respostas (durante tentativa)' })
  @HttpCode(HttpStatus.OK)
  autoSave(@CurrentUser() user: any, @Body() dto: AutoSaveDto) {
    return this.svc.autoSave(user.id, dto);
  }

  @Post('attempts/submit')
  @ApiOperation({ summary: 'Submeter tentativa e calcular score' })
  @HttpCode(HttpStatus.OK)
  submitAttempt(@CurrentUser() user: any, @Body() dto: SubmitAttemptDto) {
    return this.svc.submitAttempt(user.id, dto);
  }

  // ── Revisão Manual ────────────────────────────────────────────────────────

  @Post('review')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Avaliar resposta aberta manualmente' })
  reviewAnswer(@CurrentUser() reviewer: any, @Body() dto: ReviewAnswerDto) {
    return this.svc.reviewAnswer(dto, reviewer.id);
  }

  // Endpoints legacy (compatibilidade com código existente) ─────────────────

  @Get('course/:courseId')
  @ApiOperation({ summary: 'Listar avaliações de um curso' })
  findByCourse(@Param('courseId', ParseIntPipe) courseId: number) {
    return this.svc.findAll({ courseId });
  }

  @Get('attempts/user/:userId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Tentativas de um utilizador (Admin/RH)' })
  userAttempts(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('assessmentId') assessmentId?: string,
  ) {
    return this.svc.getUserAttempts(userId, assessmentId ? parseInt(assessmentId) : undefined);
  }
}

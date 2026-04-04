import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import {
  CreateAssessmentDto, UpdateAssessmentDto,
  SubmitAssessmentDto, SubmitEvaluationDto,
} from './assessments.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Assessments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly svc: AssessmentsService) {}
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar avaliação' })
  create(@Body() dto: CreateAssessmentDto) { return this.svc.create(dto); }
 
  @Get('course/:courseId')
  @ApiOperation({ summary: 'Listar avaliações por curso' })
  findByCourse(@Param('courseId', ParseIntPipe) courseId: number) { return this.svc.findByCourse(courseId); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da avaliação' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar avaliação' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAssessmentDto) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover avaliação' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
 
  @Post('submit')
  @ApiOperation({ summary: 'Submeter respostas de avaliação' })
  submit(@CurrentUser() user: any, @Body() dto: SubmitAssessmentDto) {
    return this.svc.submit(user.id, dto);
  }
 
  @Get('attempts/my')
  @ApiOperation({ summary: 'Minhas tentativas' })
  myAttempts(
    @CurrentUser() user: any,
    @Query('assessmentId') assessmentId?: number,
  ) { return this.svc.getUserAttempts(user.id, assessmentId); }
 
  // EVALUATIONS
  @Post('evaluations/submit')
  @ApiOperation({ summary: 'Submeter avaliação detalhada' })
  submitEvaluation(@Body() dto: SubmitEvaluationDto) { return this.svc.submitEvaluation(dto); }
 
  @Get('evaluations/attempts/:enrollmentId')
  @ApiOperation({ summary: 'Tentativas de avaliação por matrícula' })
  evalAttempts(@Param('enrollmentId', ParseIntPipe) enrollmentId: number) {
    return this.svc.getEvaluationAttempts(enrollmentId);
  }
}
 

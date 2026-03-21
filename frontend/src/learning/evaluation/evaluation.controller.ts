import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EvaluationService } from './evaluation.service';

@Controller('evaluations')
export class EvaluationController {
  constructor(private readonly service: EvaluationService) {}

  @Post()
  createEvaluation(@Body() data: Prisma.EvaluationCreateInput) {
    return this.service.createEvaluation(data);
  }

  @Post('questions')
  createQuestion(@Body() data: Prisma.EvaluationQuestionCreateInput) {
    return this.service.createQuestion(data);
  }

  @Get('course/:courseId')
  findByCourse(@Param('courseId') courseId: string) {
    return this.service.findByCourse(Number(courseId));
  }

  @Post('attempt')
  createAttempt(@Body() data: Prisma.EvaluationAttemptCreateInput) {
    return this.service.createAttempt(data);
  }

  @Get('attempts/:enrollmentId')
  findAttempts(@Param('enrollmentId') enrollmentId: string) {
    return this.service.findAttemptsByEnrollment(Number(enrollmentId));
  }
}
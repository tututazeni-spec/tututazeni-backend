import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';

@Controller('assessments')
export class AssessmentsController {
  constructor(private service: AssessmentsService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Get('course/:courseId')
  findByCourse(@Param('courseId') courseId: string) {
    return this.service.findByCourse(Number(courseId));
  }

  @Post('attempt')
  submit(@Body() body: any) {
    return this.service.submitAttempt(body);
  }
}

import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
export class FeedbackController {
  constructor(private service: FeedbackService) {}

  @Post()
  submit(@Body() body: any) {
    return this.service.submit(body);
  }

  @Get('course/:courseId')
  get(@Param('courseId') courseId: string) {
    return this.service.getByCourse(Number(courseId));
  }
}

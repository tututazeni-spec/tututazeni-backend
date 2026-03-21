import { Controller, Get, Param } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  @Get('course/:courseId')
  stats(@Param('courseId') courseId: string) {
    return this.service.courseStats(Number(courseId));
  }
}


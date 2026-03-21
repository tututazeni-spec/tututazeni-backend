import { Controller, Get, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private service: ReportsService) {}

  @Get('course/:courseId')
  course(@Param('courseId') courseId: string) {
    return this.service.courseReport(Number(courseId));
  }
}

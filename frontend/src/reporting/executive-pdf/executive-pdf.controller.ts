import { Controller, Post, Param, Get } from '@nestjs/common';
import { ExecutivePdfService } from './executive-pdf.service';

@Controller('executive-reports')
export class ExecutivePdfController {
  constructor(private readonly service: ExecutivePdfService) {}

  @Post('department/:departmentId/generate/:userId')
  generateReport(
    @Param('departmentId') departmentId: string,
    @Param('userId') userId: string,
  ) {
    return this.service.generateDepartmentReport(
      Number(departmentId),
      Number(userId),
    );
  }

  @Get()
  listReports() {
    return this.service.listReports();
  }
}
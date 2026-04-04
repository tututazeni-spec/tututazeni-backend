import { Module } from '@nestjs/common';
import { ExecutiveReportsService } from './executive-reports.service';
import { ExecutiveReportsController } from './executive-reports.controller';
 
@Module({
  providers: [ExecutiveReportsService],
  controllers: [ExecutiveReportsController],
  exports: [ExecutiveReportsService],
})
export class ExecutiveReportsModule {}
 

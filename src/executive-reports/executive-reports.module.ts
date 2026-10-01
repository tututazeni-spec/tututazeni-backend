// src/executive-reports/executive-reports.module.ts
import { Module } from '@nestjs/common';
import { ExecutiveReportsService } from './executive-reports.service';
import { ExecutiveReportsController } from './executive-reports.controller';
import { ExecutiveReportsMetricsService } from './executive-reports.metrics.service';
import { ExecutiveReportsChartsService } from './executive-reports.charts.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [
    ExecutiveReportsService,
    ExecutiveReportsMetricsService,
    ExecutiveReportsChartsService,
  ],
  controllers: [ExecutiveReportsController],
  exports: [ExecutiveReportsService],
})
export class ExecutiveReportsModule {}

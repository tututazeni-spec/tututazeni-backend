// src/reports/reports.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { MetricsAggregationModule } from '../metrics-aggregation/metrics-aggregation.module';

@Module({
  imports: [PrismaModule, MetricsAggregationModule],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService],
})
export class ReportsModule {}

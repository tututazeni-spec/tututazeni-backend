// src/executive-reports/executive-reports.module.ts
import { Module } from '@nestjs/common';
import { ExecutiveReportsService } from './executive-reports.service';
import { ExecutiveReportsController } from './executive-reports.controller';
import { ExecutiveReportsMetricsService } from './executive-reports.metrics.service';
import { ExecutiveReportsChartsService } from './executive-reports.charts.service';
import { ExecutiveReportsAlertsService } from './executive-reports.alerts.service';
import { ExecutiveReportsBuilderService } from './executive-reports.builder.service';
import { ExecutiveReportsExportService } from './executive-reports.export.service';
import { ExecutiveReportsGenerationService } from './executive-reports.generation.service';
import { ExecutiveReportsSchedulerService } from './executive-reports.scheduler.service';
import { ExecutiveReportsAuditService } from './executive-reports.audit.service';
import { ExecutiveReportsDataService } from './executive-reports.data.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [
    ExecutiveReportsService,
    ExecutiveReportsMetricsService,
    ExecutiveReportsChartsService,
    ExecutiveReportsAlertsService,
    ExecutiveReportsBuilderService,
    ExecutiveReportsExportService,
    ExecutiveReportsGenerationService,
    ExecutiveReportsSchedulerService,
    ExecutiveReportsAuditService,
    ExecutiveReportsDataService,
  ],
  controllers: [ExecutiveReportsController],
  exports: [ExecutiveReportsService],
})
export class ExecutiveReportsModule {}

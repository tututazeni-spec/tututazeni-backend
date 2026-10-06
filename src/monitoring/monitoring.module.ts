import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { ScalabilityModule } from '../scalability/scalability.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringOverviewService } from './monitoring-overview.service';
import { MonitoringModulesService } from './monitoring-modules.service';
import { MonitoringProcessesService } from './monitoring-processes.service';
import { MonitoringAutomationsService } from './monitoring-automations.service';
import { MonitoringIntegrationsService } from './monitoring-integrations.service';
import { MonitoringPerformanceService } from './monitoring-performance.service';

@Module({
  imports: [
    PrismaModule,
    ScalabilityModule,
    BullModule.registerQueue(
      { name: 'audit' },
      { name: 'email' },
      { name: 'notifications' },
      { name: 'webhooks' },
    ),
  ],
  controllers: [MonitoringController],
  providers: [
    MonitoringOverviewService,
    MonitoringModulesService,
    MonitoringProcessesService,
    MonitoringAutomationsService,
    MonitoringIntegrationsService,
    MonitoringPerformanceService,
  ],
  exports: [MonitoringModulesService],
})
export class MonitoringModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringOverviewService } from './monitoring-overview.service';
import { MonitoringModulesService } from './monitoring-modules.service';
import { MonitoringProcessesService } from './monitoring-processes.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: 'audit' },
      { name: 'email' },
      { name: 'notifications' },
      { name: 'webhooks' },
    ),
  ],
  controllers: [MonitoringController],
  providers: [MonitoringOverviewService, MonitoringModulesService, MonitoringProcessesService],
  exports: [MonitoringModulesService],
})
export class MonitoringModule {}

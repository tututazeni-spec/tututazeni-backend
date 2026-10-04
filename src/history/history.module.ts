// src/history/history.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { HistoryHubService } from './history-hub.service';
import { HistoryReportsService } from './history-reports.service';

@Module({
  imports: [PrismaModule],
  providers: [HistoryService, HistoryHubService, HistoryReportsService],
  controllers: [HistoryController],
  exports: [HistoryService],
})
export class HistoryModule {}

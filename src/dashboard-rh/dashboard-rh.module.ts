// src/dashboard-rh/dashboard-rh.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardRhService } from './dashboard-rh.service';
import { DashboardRhController } from './dashboard-rh.controller';

@Module({
  imports: [PrismaModule],
  providers: [DashboardRhService],
  controllers: [DashboardRhController],
  exports: [DashboardRhService],
})
export class DashboardRhModule {}

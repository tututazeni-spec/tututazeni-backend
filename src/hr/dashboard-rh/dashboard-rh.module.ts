import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardRhService } from './dashboard-rh.service';
import { DashboardRhController } from './dashboard-rh.controller';

@Module({
  controllers: [DashboardRhController],
  providers: [DashboardRhService, PrismaService],
})
export class DashboardRhModule {}
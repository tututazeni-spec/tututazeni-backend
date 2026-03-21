import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DashboardRhService } from './dashboard-rh.service';
import { DashboardRhController } from './dashboard-rh.controller';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardRhController],
  providers: [DashboardRhService],
  exports: [DashboardRhService], 
})
export class DashboardRhModule {}
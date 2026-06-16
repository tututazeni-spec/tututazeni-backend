import { Module } from '@nestjs/common';
import { DashboardInstitutionalController } from './dashboard-institutional.controller';
import { DashboardInstitutionalService } from './dashboard-institutional.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DashboardInstitutionalController],
  providers: [DashboardInstitutionalService],
  exports: [DashboardInstitutionalService],
})
export class DashboardInstitutionalModule {}

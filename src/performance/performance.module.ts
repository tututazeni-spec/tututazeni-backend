import { Module } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';

@Module({
  imports: [PrismaModule, DevelopmentPlansModule, OneOnOneModule],
  providers: [PerformanceService],
  controllers: [PerformanceController],
  exports: [PerformanceService],
})
export class PerformanceModule {}

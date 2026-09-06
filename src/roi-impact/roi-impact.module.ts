// src/roi-impact/roi-impact.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RoiImpactService } from './roi-impact.service';
import { RoiImpactController } from './roi-impact.controller';
import { MetricsAggregationModule } from '../metrics-aggregation/metrics-aggregation.module';

@Module({
  imports: [PrismaModule, MetricsAggregationModule],
  providers: [RoiImpactService],
  controllers: [RoiImpactController],
  exports: [RoiImpactService],
})
export class RoiImpactModule {}

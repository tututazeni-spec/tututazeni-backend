// src/metrics-aggregation/metrics-aggregation.module.ts
//
// Módulo standalone e read-only. NÃO é registado em app.module.ts nesta task —
// as Tasks 6-8 adicionam-no aos `imports` de cada consumidor (dashboard,
// dashboard-rh, reports, analytics, roi-impact).
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MetricsAggregationService } from './metrics-aggregation.service';

@Module({
  imports: [PrismaModule],
  providers: [MetricsAggregationService],
  exports: [MetricsAggregationService],
})
export class MetricsAggregationModule {}

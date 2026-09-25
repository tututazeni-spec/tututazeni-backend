// src/roi-impact/roi-impact.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RoiImpactService } from './roi-impact.service';
import { RoiImpactController } from './roi-impact.controller';
import { RoiAnalysisService } from './roi-analysis.service';
import { RoiAnalysisController } from './roi-analysis.controller';
import { ImpactRecordService } from './impact-record.service';
import { ImpactRecordController } from './impact-record.controller';
import { RoiEvaluationModelService } from './roi-evaluation-model.service';
import { RoiEvaluationModelController } from './roi-evaluation-model.controller';
import { CostEntryService } from './cost-entry.service';
import { CostEntryController } from './cost-entry.controller';
import { KpiDefinitionService } from './kpi-definition.service';
import { KpiDefinitionController } from './kpi-definition.controller';
import { MetricsAggregationModule } from '../metrics-aggregation/metrics-aggregation.module';

@Module({
  imports: [PrismaModule, MetricsAggregationModule],
  providers: [
    RoiImpactService,
    RoiAnalysisService,
    ImpactRecordService,
    RoiEvaluationModelService,
    CostEntryService,
    KpiDefinitionService,
  ],
  controllers: [
    RoiImpactController,
    RoiAnalysisController,
    ImpactRecordController,
    RoiEvaluationModelController,
    CostEntryController,
    KpiDefinitionController,
  ],
  exports: [
    RoiImpactService,
    RoiAnalysisService,
    ImpactRecordService,
    RoiEvaluationModelService,
    CostEntryService,
    KpiDefinitionService,
  ],
})
export class RoiImpactModule {}

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
import { CorrelationService } from './correlation.service';
import { CorrelationController } from './correlation.controller';
import { ScenarioService } from './scenario.service';
import { ScenarioController } from './scenario.controller';
import { BenchmarkService } from './benchmark.service';
import { BenchmarkController } from './benchmark.controller';
import { RoiReportsService } from './roi-reports.service';
import { RoiReportsController } from './roi-reports.controller';
import { MetricsAggregationModule } from '../metrics-aggregation/metrics-aggregation.module';
import { TrainingModule } from '../trainings/trainings.module';

@Module({
  imports: [PrismaModule, MetricsAggregationModule, TrainingModule],
  providers: [
    RoiImpactService,
    RoiAnalysisService,
    ImpactRecordService,
    RoiEvaluationModelService,
    CostEntryService,
    KpiDefinitionService,
    CorrelationService,
    ScenarioService,
    BenchmarkService,
    RoiReportsService,
  ],
  controllers: [
    RoiImpactController,
    RoiAnalysisController,
    ImpactRecordController,
    RoiEvaluationModelController,
    CostEntryController,
    KpiDefinitionController,
    CorrelationController,
    ScenarioController,
    BenchmarkController,
    RoiReportsController,
  ],
  exports: [
    RoiImpactService,
    RoiAnalysisService,
    ImpactRecordService,
    RoiEvaluationModelService,
    CostEntryService,
    KpiDefinitionService,
    CorrelationService,
    ScenarioService,
    BenchmarkService,
    RoiReportsService,
  ],
})
export class RoiImpactModule {}

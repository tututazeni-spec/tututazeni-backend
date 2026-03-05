import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../../intelligence/analytics/analytics.module';
import { RoiImpactModule } from '../../intelligence/roiimpact/roiimpact.module';
import { ReportsModule } from '../../intelligence/reports/reports.module';

import { DashboardModule } from '../../hr/dashboard/dashboard.module';
import { DashboardRhModule } from '../../hr/dashboard-rh/dashboard-rh.module';

import { GamificationModule } from '../../engagement/gamification/gamification.module';

import { PainelFinalIntegradoService } from './painel-final-integrado.service';
import { PainelFinalIntegradoController } from './painel-final-integrado.controller';

@Module({
  imports: [
    AnalyticsModule,
    RoiImpactModule,
    ReportsModule,
    DashboardModule,
    DashboardRhModule,
    GamificationModule,
  ],
  controllers: [PainelFinalIntegradoController],
  providers: [PainelFinalIntegradoService],
})
export class PainelFinalIntegradoModule {}
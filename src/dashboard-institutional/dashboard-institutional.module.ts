import { Module } from '@nestjs/common';
import { DashboardInstitutionalController } from './dashboard-institutional.controller';
import { DashboardInstitutionalService } from './dashboard-institutional.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { EventsModule } from '../events/events.module';
import { ProcessStandardModule } from '../process-standard/process-standard.module';
import { WorkDeclarationModule } from '../work-declaration/work-declaration.module';
import { AuditModule } from '../audit/audit.module';
import { AutomationModule } from '../automation/automation.module';
import { ScalabilityModule } from '../scalability/scalability.module';

// ─── VISÃO CRUZADA DE MÓDULOS ──────────────────────────
// dashboard-institutional/modules agrega, por leitura directa dos serviços
// (não HTTP), painéis já existentes de outros módulos — em vez de duplicar
// as suas queries. Cada módulo importado abaixo só entra por causa disto;
// nenhuma destas dependências existia antes.
//
// DashboardModule entra por GET /dashboard-institutional/executive: em vez
// de duplicar getOrganizationSummary/getTalentHealthScore/getENPS/
// getTopTalent (já existem, testados, em src/dashboard/dashboard.service.ts),
// este módulo compõe-os com o resumo/alertas/tendência/geografia/módulos
// institucionais já existentes aqui — um único endpoint para o frontend
// consumir, sem duplicar lógica de nenhum dos dois lados.
@Module({
  imports: [
    PrismaModule,
    DashboardModule,
    OnboardingModule,
    EventsModule,
    ProcessStandardModule,
    WorkDeclarationModule,
    AuditModule,
    AutomationModule,
    ScalabilityModule,
  ],
  controllers: [DashboardInstitutionalController],
  providers: [DashboardInstitutionalService],
  exports: [DashboardInstitutionalService],
})
export class DashboardInstitutionalModule {}

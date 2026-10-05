// src/audit/audit.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditIncidentsController } from './audit-incidents.controller';
import { AuditIncidentsService } from './audit-incidents.service';
import { AuditInternalController } from './audit-internal.controller';
import { AuditInternalService } from './audit-internal.service';
import { AuditReportsController } from './audit-reports.controller';
import { AuditReportsService } from './audit-reports.service';
import { AuditExportsService } from './audit-exports.service';
import { AuditPolicyService } from './audit-policy.service';
import { AuditHealthService } from './audit-health.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'audit' })],
  providers: [
    AuditService,
    AuditIncidentsService,
    AuditInternalService,
    AuditPolicyService,
    AuditHealthService,
    AuditExportsService,
    AuditReportsService,
  ],
  // Os controllers com sub-rotas literais (audit/incidents, audit/audits, audit/reports|exports|policy)
  // vêm antes de AuditController, cujo GET audit/:id as engoliria.
  controllers: [
    AuditIncidentsController,
    AuditInternalController,
    AuditReportsController,
    AuditController,
  ],
  exports: [AuditService],
})
export class AuditModule {}

// src/audit/audit.module.ts
import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditIncidentsController } from './audit-incidents.controller';
import { AuditIncidentsService } from './audit-incidents.service';
import { AuditInternalController } from './audit-internal.controller';
import { AuditInternalService } from './audit-internal.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AuditService, AuditIncidentsService, AuditInternalService],
  // Os controllers com sub-rotas literais (audit/incidents, audit/audits)
  // vêm antes de AuditController, cujo GET audit/:id as engoliria.
  controllers: [AuditIncidentsController, AuditInternalController, AuditController],
  exports: [AuditService],
})
export class AuditModule {}

// src/automation/automation.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { AutomationScheduleService } from './automation-schedule.service';
import { AutomationHistoryService } from './automation-history.service';
import { AutomationTasksService } from './automation-tasks.service';
import { AutomationReportsService } from './automation-reports.service';
import { AutomationGovernanceController } from './automation-governance.controller';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationSettingsService } from './automation-settings.service';
import { AutomationAccessService } from './automation-access.service';
import { AutomationConnectionsService } from './automation-connections.service';
import { AutomationFailuresService } from './automation-failures.service';
import { AutomationRetentionService } from './automation-retention.service';
import { AutomationTemplatesService } from './automation-templates.service';
import { AutomationPermissionGuard } from './automation-permission.guard';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';
import { GamificationModule } from '../gamification/gamification.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    PrismaModule,
    EnrollmentsModule,
    DevelopmentPlansModule,
    GamificationModule,
    MailModule,
    SmsModule,
  ],
  providers: [
    AutomationService,
    AutomationScheduleService,
    AutomationHistoryService,
    AutomationTasksService,
    AutomationReportsService,
    AutomationAuditService,
    AutomationSettingsService,
    AutomationAccessService,
    AutomationConnectionsService,
    AutomationFailuresService,
    AutomationRetentionService,
    AutomationTemplatesService,
    AutomationPermissionGuard,
  ],
  controllers: [AutomationController, AutomationGovernanceController],
  exports: [AutomationService, AutomationScheduleService, AutomationAuditService],
})
export class AutomationModule {}

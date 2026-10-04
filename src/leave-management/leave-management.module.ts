// ─── src/leave-management/leave-management.module.ts ─────────────────────────

import { Module } from '@nestjs/common';
import { LeaveManagementService } from './leave-management.service';
import { LeaveOverviewService } from './leave-overview.service';
import { LeaveManagementController } from './leave-management.controller';
import { LeaveAbsencesController } from './leave-absences.controller';
import { LeaveAbsencesService } from './leave-absences.service';
import { LeaveLicensesService } from './leave-licenses.service';
import { LeaveAbsenceCalendarService } from './leave-absence-calendar.service';
import { LeaveApprovalsService } from './leave-approvals.service';
import { LeavePlanningService } from './leave-planning.service';
import { LeaveReportsService } from './leave-reports.service';
import { LeaveSettingsService } from './leave-settings.service';
import { LeaveSettingsController } from './leave-settings.controller';
import { LeaveEffectsService } from './leave-effects.service';
import { LeaveRemindersService } from './leave-reminders.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [PrismaModule, AuditModule, AutomationModule],
  providers: [
    LeaveManagementService,
    LeaveOverviewService,
    LeaveLicensesService,
    LeaveAbsencesService,
    LeaveAbsenceCalendarService,
    LeaveApprovalsService,
    LeavePlanningService,
    LeaveReportsService,
    LeaveSettingsService,
    LeaveEffectsService,
    LeaveRemindersService,
  ],
  // LeaveAbsencesController primeiro: `GET /leave/absences` não pode ser
  // engolido por `GET /leave/:id`.
  controllers: [LeaveAbsencesController, LeaveSettingsController, LeaveManagementController],
  exports: [LeaveManagementService, LeaveSettingsService],
})
export class LeaveManagementModule {}

// ─── src/leave-management/leave-management.module.ts ─────────────────────────

import { Module } from '@nestjs/common';
import { LeaveManagementService } from './leave-management.service';
import { LeaveOverviewService } from './leave-overview.service';
import { LeaveManagementController } from './leave-management.controller';
import { LeaveAbsencesController } from './leave-absences.controller';
import { LeaveAbsencesService } from './leave-absences.service';
import { LeaveLicensesService } from './leave-licenses.service';
import { LeaveAbsenceCalendarService } from './leave-absence-calendar.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    LeaveManagementService,
    LeaveOverviewService,
    LeaveLicensesService,
    LeaveAbsencesService,
    LeaveAbsenceCalendarService,
  ],
  // LeaveAbsencesController primeiro: `GET /leave/absences` não pode ser
  // engolido por `GET /leave/:id`.
  controllers: [LeaveAbsencesController, LeaveManagementController],
  exports: [LeaveManagementService],
})
export class LeaveManagementModule {}

// ─── src/leave-management/leave-management.module.ts ─────────────────────────

import { Module } from '@nestjs/common';
import { LeaveManagementService } from './leave-management.service';
import { LeaveManagementController } from './leave-management.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [LeaveManagementService],
  controllers: [LeaveManagementController],
  exports: [LeaveManagementService],
})
export class LeaveManagementModule {}

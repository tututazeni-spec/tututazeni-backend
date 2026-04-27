// ─── src/attendance/attendance.module.ts ─────────────────────────────────────
import { Module } from '@nestjs/common';
import { AttendanceService }    from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { PrismaModule }         from '../prisma/prisma.module';
import { AuditModule }          from '../common/modules/audit.module';
 
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [AttendanceService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}


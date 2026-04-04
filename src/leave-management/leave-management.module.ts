import { Module } from '@nestjs/common';
import { LeaveManagementService } from './leave-management.service';
import { LeaveManagementController } from './leave-management.controller';
 
@Module({
  providers: [LeaveManagementService],
  controllers: [LeaveManagementController],
  exports: [LeaveManagementService],
})
export class LeaveManagementModule {}
 

 

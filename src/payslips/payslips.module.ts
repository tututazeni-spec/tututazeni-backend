// ─── src/payslips/payslips.module.ts ─────────────────────────────────────────

import { Module }                from '@nestjs/common';
import { PayslipsService }       from './payslips.service';
import { PayslipsController }    from './payslips.controller';
import { PayrollEngineService }  from './payroll-engine.service';
import { PrismaModule }          from '../prisma/prisma.module';
import { AuditModule }           from '../common/modules/audit.module';
 
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [PayslipsService, PayrollEngineService],
  controllers: [PayslipsController],
  exports: [PayslipsService, PayrollEngineService],
})
export class PayslipsModule {}


 

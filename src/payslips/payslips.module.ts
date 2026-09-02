// src/payslips/payslips.module.ts
import { Module } from '@nestjs/common';
import { PayslipsService } from './payslips.service';
import { PayslipsController } from './payslips.controller';
import { PayrollEngineService } from './payroll-engine.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollWorkflowService } from './payroll-workflow.service';
import { PayrollRunController } from './payroll-run.controller';
import { SalaryComponentService } from './salary-component.service';
import { SalaryComponentController } from './salary-component.controller';
import { EmployeeCompensationService } from './employee-compensation.service';
import { EmployeeCompensationController } from './employee-compensation.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    PayslipsService,
    PayrollEngineService,
    PayrollCalculationService,
    PayrollWorkflowService,
    SalaryComponentService,
    EmployeeCompensationService,
  ],
  controllers: [
    PayslipsController,
    PayrollRunController,
    SalaryComponentController,
    EmployeeCompensationController,
  ],
  exports: [
    PayslipsService,
    PayrollEngineService,
    PayrollCalculationService,
    PayrollWorkflowService,
    SalaryComponentService,
    EmployeeCompensationService,
  ],
})
export class PayslipsModule {}

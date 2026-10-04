// src/payslips/payslips.module.ts
import { Module } from '@nestjs/common';
import { PayslipsService } from './payslip/payslips.service';
import { PayslipsController } from './payslip/payslips.controller';
import { PayrollEngineService } from './taxes/payroll-engine.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollWorkflowService } from './payroll-workflow.service';
import { PayrollRunController } from './payroll-run.controller';
import { SalaryComponentService } from './remuneration/salary-component.service';
import { SalaryComponentController } from './remuneration/salary-component.controller';
import { EmployeeCompensationService } from './remuneration/employee-compensation.service';
import { EmployeeCompensationController } from './remuneration/employee-compensation.controller';
import { PayrollInsightsService } from './reports/payroll-insights.service';
import { PayrollPaymentsService } from './payments/payroll-payments.service';
import { PayrollOpsController } from './payroll-ops.controller';
import { PayslipPdfService } from './payslip/payslip-pdf.service';
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
    PayslipPdfService,
    PayrollInsightsService,
    PayrollPaymentsService,
  ],
  controllers: [
    PayslipsController,
    PayrollRunController,
    SalaryComponentController,
    EmployeeCompensationController,
    PayrollOpsController,
  ],
  exports: [
    PayslipsService,
    PayrollEngineService,
    PayrollCalculationService,
    PayrollWorkflowService,
    SalaryComponentService,
    EmployeeCompensationService,
    PayslipPdfService,
  ],
})
export class PayslipsModule {}

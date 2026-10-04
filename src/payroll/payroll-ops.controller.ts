// src/payslips/payroll-ops.controller.ts
// Endpoints de leitura agregada, pagamentos e fecho do Payroll
// (docs/payroll.md §1, §3, §5, §7, §8, §9).
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { PayrollInsightsService } from './reports/payroll-insights.service';
import { PayrollPaymentsService } from './payments/payroll-payments.service';
import {
  CreatePayrollPaymentDto,
  PayrollEmployeesFilterDto,
  PayrollReportFilterDto,
  UpdatePaymentStatusDto,
  UpsertTaxConfigDto,
} from './payroll.dto';

@ApiTags('Payroll')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('payroll')
export class PayrollOpsController {
  constructor(
    private readonly insights: PayrollInsightsService,
    private readonly payments: PayrollPaymentsService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Visão geral do processamento salarial' })
  overview(@Query('period') period?: string) {
    return this.insights.overview(period);
  }

  @Get('runs/:id/employees')
  @ApiOperation({ summary: 'Colaboradores de um processamento' })
  runEmployees(@Param('id', ParseIntPipe) id: number, @Query() filter: PayrollEmployeesFilterDto) {
    return this.insights.runEmployees(id, filter);
  }

  @Get('employees/:userId')
  @ApiOperation({ summary: 'Ficha salarial do colaborador' })
  employee(@Param('userId', ParseIntPipe) userId: number) {
    return this.insights.employeeProfile(userId);
  }

  @Get('deductions')
  @ApiOperation({ summary: 'Deduções & impostos do período' })
  deductions(@Query('period') period?: string) {
    return this.insights.deductions(period);
  }

  @Get('taxes')
  @ApiOperation({ summary: 'Regras INSS/IRT do ano' })
  taxes(@Query('year') year?: string) {
    return this.insights.taxConfig(year ? Number(year) : new Date().getFullYear());
  }

  @Put('taxes')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar/actualizar regras INSS/IRT de um ano' })
  upsertTaxes(@Body() dto: UpsertTaxConfigDto) {
    return this.insights.upsertTaxConfig(dto);
  }

  @Get('reports/:type')
  @ApiOperation({ summary: 'Relatórios do Payroll' })
  report(@Param('type') type: string, @Query() filter: PayrollReportFilterDto) {
    return this.insights.report(type, filter);
  }

  // ─── Pagamentos ───────────────────────────────────────────────────────────

  @Get('payments')
  listPayments(
    @Query('runId') runId?: string,
    @Query('status') status?: string,
    @Query('period') period?: string,
  ) {
    return this.payments.list({ runId: runId ? Number(runId) : undefined, status, period });
  }

  @Post('payments')
  createPayment(@Body() dto: CreatePayrollPaymentDto, @CurrentUser() user: CurrentUserData) {
    return this.payments.create(dto, user.id);
  }

  @Patch('payments/:id/status')
  updatePaymentStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.payments.updateStatus(id, dto, user.id);
  }

  @Get('payments/:id/bank-file')
  @ApiOperation({ summary: 'Gerar ficheiro bancário (CSV)' })
  bankFile(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.payments.bankFile(id, user.id);
  }

  // ─── Fecho salarial ───────────────────────────────────────────────────────

  @Get('runs/:id/closure')
  closure(@Param('id', ParseIntPipe) id: number) {
    return this.payments.closureOverview(id);
  }

  @Post('runs/:id/closure/validate-hr')
  validateHr(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.payments.validate(id, 'hr', user.id);
  }

  @Post('runs/:id/closure/validate-finance')
  validateFinance(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.payments.validate(id, 'finance', user.id);
  }

  @Post('runs/:id/closure/close')
  close(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.payments.close(id, user.id);
  }
}

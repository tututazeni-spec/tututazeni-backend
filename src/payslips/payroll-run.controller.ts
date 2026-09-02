// src/payslips/payroll-run.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { PayrollWorkflowService } from './payroll-workflow.service';
import {
  CreatePayrollRunDto,
  PayrollRunFilterDto,
  RejectRunDto,
  CancelRunDto,
  RecalcPayslipInputsDto,
} from './payroll.dto';

@ApiTags('Payroll Runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('payroll/runs')
export class PayrollRunController {
  constructor(private readonly wf: PayrollWorkflowService) {}

  @Post()
  @ApiOperation({ summary: 'Criar folha de vencimentos (run)' })
  create(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: CurrentUserData) {
    return this.wf.createRun(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar runs' })
  list(@Query() filter: PayrollRunFilterDto) {
    return this.wf.list(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do run + timeline' })
  getRun(@Param('id', ParseIntPipe) id: number) {
    return this.wf.getRun(id);
  }

  @Get(':id/payslips')
  @ApiOperation({ summary: 'Recibos do run' })
  payslips(@Param('id', ParseIntPipe) id: number, @Query() filter: PayrollRunFilterDto) {
    return this.wf.listPayslips(id, filter);
  }

  @Get(':id/exceptions')
  @ApiOperation({ summary: 'Exceções do run (lista plana)' })
  exceptions(@Param('id', ParseIntPipe) id: number) {
    return this.wf.listExceptions(id);
  }

  @Post(':id/process')
  @HttpCode(HttpStatus.OK)
  process(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.wf.process(id, user.id);
  }

  @Patch(':id/payslips/:payslipId/recalc')
  recalc(
    @Param('id', ParseIntPipe) id: number,
    @Param('payslipId', ParseIntPipe) payslipId: number,
    @Body() dto: RecalcPayslipInputsDto,
  ) {
    return this.wf.recalcPayslip(id, payslipId, dto);
  }

  @Patch(':id/payslips/:payslipId/exclude')
  exclude(
    @Param('id', ParseIntPipe) id: number,
    @Param('payslipId', ParseIntPipe) payslipId: number,
  ) {
    return this.wf.excludePayslip(id, payslipId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.wf.submit(id, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.wf.approve(id, user);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: RejectRunDto,
  ) {
    return this.wf.reject(id, user.id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.wf.publish(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CancelRunDto,
  ) {
    return this.wf.cancel(id, user.id, dto);
  }
}

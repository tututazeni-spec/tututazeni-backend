// src/payslips/payslips.controller.ts
import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayslipsService } from './payslips.service';
import { CreatePayslipDto, UpdatePayslipDto, PayslipFilterDto } from './payslips.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Payslips (Recibos de Salário)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payslips')
export class PayslipsController {
  constructor(private readonly svc: PayslipsService) {}
 
  @Get() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Listar recibos' })
  findAll(@Query() filters: PayslipFilterDto) { return this.svc.findAll(filters); }
 
  @Get('my') @ApiOperation({ summary: 'Meus recibos de salário' })
  myPayslips(@CurrentUser() user: any) { return this.svc.getMyPayslips(user.id); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe do recibo' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar recibo individual' })
  create(@Body() dto: CreatePayslipDto) { return this.svc.create(dto); }
 
  @Post('bulk-create') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gerar recibos em massa para um período' })
  bulkCreate(@Body() body: { period: string; userIds?: number[] }) {
    return this.svc.bulkCreate(body.period, body.userIds);
  }
 
  @Patch(':id/issue') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Emitir recibo (notifica colaborador)' })
  issue(@Param('id', ParseIntPipe) id: number) { return this.svc.issue(id); }
 
  @Patch(':id/acknowledge') @ApiOperation({ summary: 'Colaborador confirma recepção do recibo' })
  acknowledge(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.acknowledge(id, user.id);
  }
 
  @Put(':id') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Actualizar recibo' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePayslipDto) {
    return this.svc.update(id, dto);
  }
}
 

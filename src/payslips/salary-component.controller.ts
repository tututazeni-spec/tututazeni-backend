// src/payslips/salary-component.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { SalaryComponentService } from './salary-component.service';
import {
  SalaryComponentFilterDto,
  CreateSalaryComponentDto,
  UpdateSalaryComponentDto,
} from './payroll.dto';

@ApiTags('Payroll Components')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('payroll/components')
export class SalaryComponentController {
  constructor(private readonly service: SalaryComponentService) {}

  @Get()
  @ApiOperation({ summary: 'Listar componentes salariais' })
  list(@Query() filter: SalaryComponentFilterDto) {
    return this.service.list(filter);
  }

  @Post()
  @ApiOperation({ summary: 'Criar componente salarial' })
  create(@Body() dto: CreateSalaryComponentDto) {
    return this.service.create(dto);
  }

  @Get(':code')
  @ApiOperation({ summary: 'Detalhe de um componente salarial' })
  get(@Param('code') code: string) {
    return this.service.get(code);
  }

  @Put(':code')
  @ApiOperation({ summary: 'Actualizar componente salarial' })
  update(@Param('code') code: string, @Body() dto: UpdateSalaryComponentDto) {
    return this.service.update(code, dto);
  }

  @Delete(':code')
  @ApiOperation({ summary: 'Remover componente (soft-delete se referenciado)' })
  remove(@Param('code') code: string) {
    return this.service.remove(code);
  }
}

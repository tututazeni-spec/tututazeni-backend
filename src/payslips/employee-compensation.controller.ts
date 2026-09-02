// src/payslips/employee-compensation.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { EmployeeCompensationService } from './employee-compensation.service';
import {
  CreateEmployeeCompensationDto,
  UpdateEmployeeCompensationDto,
  UpsertCompensationComponentsDto,
} from './payroll.dto';

@ApiTags('Payroll Compensation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('payroll/compensation')
export class EmployeeCompensationController {
  constructor(private readonly service: EmployeeCompensationService) {}

  @Get()
  @ApiOperation({ summary: 'Histórico de compensação de um colaborador' })
  history(@Query('userId', ParseIntPipe) userId: number) {
    return this.service.history(userId);
  }

  @Get('current/:userId')
  @ApiOperation({ summary: 'Compensação activa de um colaborador' })
  current(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.current(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Criar registo de compensação (fecha o anterior)' })
  create(@Body() dto: CreateEmployeeCompensationDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar registo de compensação' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeCompensationDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/components')
  @ApiOperation({ summary: 'Definir overrides de componentes da compensação' })
  setComponents(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertCompensationComponentsDto,
  ) {
    return this.service.setComponents(id, dto);
  }
}

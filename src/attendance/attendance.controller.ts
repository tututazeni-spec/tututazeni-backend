import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import {
  CreateAttendanceDto, UpdateAttendanceDto,
  AttendanceFilterDto, ClockInDto,
} from './attendance.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Attendance (Controle de Presenças)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}
 
  @Get() @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar presenças com filtros' })
  findAll(@Query() filters: AttendanceFilterDto) {
    return this.svc.findAll(filters);
  }
 
  @Get('my') @ApiOperation({ summary: 'Minhas presenças' })
  myAttendance(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.svc.findByUser(user.id, from, to); }
 
  @Get('report') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Relatório mensal de presenças' })
  report(
    @Query('year') year: number,
    @Query('month') month: number,
    @Query('departmentId') departmentId?: number,
  ) {
    return this.svc.getMonthlyReport(
      +year, +month,
      departmentId ? +departmentId : undefined,
    );
  }
 
  @Get('user/:userId') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Presenças de um colaborador' })
  byUser(
    @Param('userId', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.svc.findByUser(id, from, to); }
 
  @Post('clock-in') @ApiOperation({ summary: 'Clock-in (entrada)' })
  clockIn(@CurrentUser() user: any, @Body() dto: ClockInDto) {
    return this.svc.clockIn(user.id, dto);
  }
 
  @Post('clock-out') @ApiOperation({ summary: 'Clock-out (saída)' })
  clockOut(@CurrentUser() user: any) {
    return this.svc.clockOut(user.id);
  }
 
  @Post() @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Registar presença manualmente' })
  create(@Body() dto: CreateAttendanceDto) { return this.svc.create(dto); }
 
  @Put(':id') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar registo de presença' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
  ) { return this.svc.update(id, dto); }
 
  @Delete(':id') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover registo' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

 

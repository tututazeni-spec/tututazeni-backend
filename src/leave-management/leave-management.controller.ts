import {
  Controller, Get, Post, Put, Patch,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeaveManagementService } from './leave-management.service';
import {
  CreateLeaveRequestDto, UpdateLeaveRequestDto,
  ApproveLeaveDto, LeaveFilterDto,
} from './leave-management.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Leave Management (Férias e Licenças)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveManagementController {
  constructor(private readonly svc: LeaveManagementService) {}
 
  @Get() @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar pedidos de licença/férias' })
  findAll(@Query() filters: LeaveFilterDto) { return this.svc.findAll(filters); }
 
  @Get('calendar') @ApiOperation({ summary: 'Calendário de ausências aprovadas' })
  calendar(
    @Query('departmentId') deptId?: number,
    @Query('year') year?: number,
  ) {
    return this.svc.getCalendar(deptId ? +deptId : undefined, year ? +year : undefined);
  }
 
  @Get('my-requests') @ApiOperation({ summary: 'Meus pedidos de licença' })
  myRequests(@CurrentUser() user: any, @Query() filters: LeaveFilterDto) {
    return this.svc.findAll({ ...filters, userId: user.id });
  }
 
  @Get('balance/me') @ApiOperation({ summary: 'Meu saldo de dias disponíveis' })
  myBalance(@CurrentUser() user: any) { return this.svc.getBalance(user.id); }
 
  @Get('balance/:userId') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Saldo de dias de um colaborador' })
  balance(@Param('userId', ParseIntPipe) id: number) { return this.svc.getBalance(id); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe do pedido' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @ApiOperation({ summary: 'Submeter pedido de licença/férias' })
  create(@Body() dto: CreateLeaveRequestDto) { return this.svc.create(dto); }
 
  @Patch(':id/approve') @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Aprovar ou rejeitar pedido' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: ApproveLeaveDto,
  ) { return this.svc.approve(id, user.id, dto); }
 
  @Patch(':id/cancel') @ApiOperation({ summary: 'Cancelar pedido' })
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) { return this.svc.cancel(id, user.id); }
 
  @Put('balance/:userId') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar saldo de dias de um colaborador' })
  updateBalance(
    @Param('userId', ParseIntPipe) id: number,
    @Body() body: { vacationDays?: number; sickDays?: number; otherDays?: number },
  ) { return this.svc.updateBalance(id, body); }
}
 

 

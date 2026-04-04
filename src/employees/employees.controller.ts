import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto, UpdateEmployeeDto, CreateContractDto,
  CreateAttendanceDto, CreateFeedback360Dto, CreateCareerPlanDto, EmployeeFilterDto,
} from './employees.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Employees (HR)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly svc: EmployeesService) {}
 
  @Get() @Roles('ADMIN','RH','LIDER') @ApiOperation({ summary: 'Listar colaboradores' })
  findAll(@Query() filters: EmployeeFilterDto) { return this.svc.findAll(filters); }
 
  @Get(':id') @Roles('ADMIN','RH','LIDER') @ApiOperation({ summary: 'Detalhe do colaborador' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Get(':id/stats') @Roles('ADMIN','RH') @ApiOperation({ summary: 'Estatísticas do colaborador' })
  stats(@Param('id', ParseIntPipe) id: number) { return this.svc.getEmployeeStats(id); }
 
  @Get(':id/contracts') @Roles('ADMIN','RH') @ApiOperation({ summary: 'Contratos do colaborador' })
  contracts(@Param('id', ParseIntPipe) id: number) { return this.svc.getContracts(id); }
 
  @Get(':id/attendance') @Roles('ADMIN','RH','LIDER') @ApiOperation({ summary: 'Presenças' })
  attendance(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.svc.getAttendance(id, from, to); }
 
  @Get(':id/feedback360') @Roles('ADMIN','RH') @ApiOperation({ summary: 'Feedback 360 do colaborador' })
  feedback360(@Param('id', ParseIntPipe) id: number) { return this.svc.getFeedback360(id); }
 
  @Get(':id/career-plans') @Roles('ADMIN','RH','LIDER') @ApiOperation({ summary: 'Planos de carreira' })
  careerPlans(@Param('id', ParseIntPipe) id: number) { return this.svc.getCareerPlans(id); }
 
  @Post() @Roles('ADMIN','RH') @ApiOperation({ summary: 'Criar colaborador' })
  create(@Body() dto: CreateEmployeeDto) { return this.svc.create(dto); }
 
  @Post('contracts') @Roles('ADMIN','RH') @ApiOperation({ summary: 'Criar contrato' })
  createContract(@Body() dto: CreateContractDto) { return this.svc.createContract(dto); }
 
  @Post('attendance') @Roles('ADMIN','RH','LIDER') @ApiOperation({ summary: 'Registar presença' })
  logAttendance(@Body() dto: CreateAttendanceDto) { return this.svc.logAttendance(dto); }
 
  @Post('feedback360') @Roles('ADMIN','RH','LIDER') @ApiOperation({ summary: 'Adicionar Feedback 360' })
  addFeedback(@Body() dto: CreateFeedback360Dto) { return this.svc.addFeedback360(dto); }
 
  @Post('career-plans') @Roles('ADMIN','RH') @ApiOperation({ summary: 'Criar plano de carreira' })
  createCareerPlan(@Body() dto: CreateCareerPlanDto) { return this.svc.createCareerPlan(dto); }
 
  @Put(':id') @Roles('ADMIN','RH') @ApiOperation({ summary: 'Atualizar colaborador' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEmployeeDto) {
    return this.svc.update(id, dto);
  }
 
  @Patch('contracts/:id/status') @Roles('ADMIN','RH') @ApiOperation({ summary: 'Atualizar status do contrato' })
  contractStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status: string }) {
    return this.svc.updateContractStatus(id, body.status);
  }
 
  @Patch('career-plans/:id/status') @Roles('ADMIN','RH') @ApiOperation({ summary: 'Atualizar status plano de carreira' })
  careerPlanStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status: string }) {
    return this.svc.updateCareerPlanStatus(id, body.status);
  }
 
  @Delete(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Remover colaborador' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

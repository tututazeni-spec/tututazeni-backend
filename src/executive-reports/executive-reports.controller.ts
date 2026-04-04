import {
  Controller, Get, Post, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ExecutiveReportsService } from './executive-reports.service';
import { CreateExecutiveReportDto, ReportFilterDto } from './executive-reports.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Executive Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH')
@Controller('executive-reports')
export class ExecutiveReportsController {
  constructor(private readonly svc: ExecutiveReportsService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar relatórios executivos' })
  findAll(@Query() filters: ReportFilterDto) { return this.svc.findAll(filters); }
 
  @Get('snapshots/:orgId')
  @ApiOperation({ summary: 'Snapshots executivos por organização' })
  snapshots(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.svc.getExecutiveSnapshot(orgId);
  }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do relatório' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post()
  @ApiOperation({ summary: 'Criar relatório executivo' })
  create(@CurrentUser() user: any, @Body() dto: CreateExecutiveReportDto) {
    return this.svc.create(user.id, dto);
  }
 
  @Post('auto-generate')
  @ApiOperation({ summary: 'Gerar relatório automaticamente com métricas actuais' })
  autoGenerate(
    @CurrentUser() user: any,
    @Query('departmentId') departmentId?: number,
  ) { return this.svc.generateAutoReport(user.id, departmentId); }
 
  @Delete(':id')
  @ApiOperation({ summary: 'Remover relatório' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 

// src/executive-reports/executive-reports.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ExecutiveReportsService } from './executive-reports.service';
import {
  CreateExecutiveReportDto,
  UpdateExecutiveReportDto,
  ReportFilterDto,
  ApproveReportDto,
  ReportType,
} from './executive-reports.dto';
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

  // ── Listagem ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar relatórios executivos com filtros' })
  findAll(@Query() filters: ReportFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estatísticas de relatórios (por status, por tipo)' })
  stats() {
    return this.svc.getReportStats();
  }

  @Get('templates')
  @ApiOperation({ summary: 'Templates disponíveis (Flash, Monthly, Quarterly, Annual)' })
  templates() {
    return this.svc.getTemplates();
  }

  @Get('snapshots/:orgId')
  @ApiOperation({ summary: 'Snapshots executivos por organização' })
  snapshots(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.svc.getExecutiveSnapshot(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do relatório (regista acesso)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.id);
  }

  // ── Gestão ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Criar relatório executivo manualmente' })
  create(@CurrentUser() user: any, @Body() dto: CreateExecutiveReportDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar relatório (apenas DRAFT/IN_REVIEW)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateExecutiveReportDto) {
    return this.svc.update(id, dto);
  }

  @Post('auto-generate')
  @ApiOperation({ summary: 'Gerar relatório automaticamente com métricas actuais + narrativa' })
  @ApiQuery({ name: 'type', required: false, enum: ReportType })
  @ApiQuery({ name: 'departmentId', required: false })
  autoGenerate(
    @CurrentUser() user: any,
    @Query('type') type?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    return this.svc.generateAutoReport(
      user.id,
      (type as ReportType) ?? ReportType.MONTHLY,
      departmentId ? parseInt(departmentId) : undefined,
    );
  }

  // ── Workflow ──────────────────────────────────────────────────────────────

  @Patch(':id/submit')
  @ApiOperation({ summary: 'Submeter para revisão (DRAFT → IN_REVIEW)' })
  @HttpCode(HttpStatus.OK)
  submit(@Param('id', ParseIntPipe) id: number) {
    return this.svc.submitForReview(id);
  }

  @Post('approve')
  @ApiOperation({ summary: 'Aprovar ou rejeitar relatório (IN_REVIEW → APPROVED/DRAFT)' })
  @HttpCode(HttpStatus.OK)
  approve(@CurrentUser() user: any, @Body() dto: ApproveReportDto) {
    return this.svc.approveReport(dto, user.id);
  }

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publicar relatório aprovado' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publishReport(id);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Arquivar relatório' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archiveReport(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar relatório (apenas não publicados)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}

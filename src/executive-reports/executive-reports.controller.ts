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
  ExecutiveReportsReportFilterDto,
  ApproveReportDto,
  ReportType,
} from './executive-reports.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { ExecutiveFiltersDto } from './dto/executive-filters.dto';

const EXEC_FULL = [Role.ADMIN, Role.RH, Role.DIRECTOR] as const;
const EXEC_MGMT = [...EXEC_FULL, Role.GESTOR, Role.LIDER] as const;

@ApiTags('Executive Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('executive-reports')
export class ExecutiveReportsController {
  constructor(private readonly svc: ExecutiveReportsService) {}

  // ── Dashboard executivo (docs/Executive_Reports.md §1-3) ──────────────────
  // Declarados antes de `:id` para não serem apanhados pelo ParseIntPipe.

  @Get('tabs')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Separadores visíveis para o papel do utilizador' })
  tabs(@CurrentUser() user: CurrentUserData) {
    return this.svc.getTabs(user);
  }

  @Get('overview')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Visão Executiva — KPIs, indicadores complementares e alertas' })
  overview(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.svc.getOverview(user, filters);
  }

  @Get('kpis')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'KPIs executivos com meta, variação, tendência e fonte' })
  kpis(@CurrentUser() user: CurrentUserData, @Query() filters: ExecutiveFiltersDto) {
    return this.svc.getKpis(user, filters);
  }

  @Get('kpis/definitions')
  @Roles(...EXEC_MGMT)
  @ApiOperation({ summary: 'Definições dos KPIs (fórmula, fonte, meta, limiares)' })
  kpiDefinitions() {
    return this.svc.getKpiDefinitions();
  }

  // ── Listagem ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar relatórios executivos com filtros' })
  findAll(@Query() filters: ExecutiveReportsReportFilterDto) {
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
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(id, user.id);
  }

  // ── Gestão ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Criar relatório executivo manualmente' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateExecutiveReportDto) {
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
    @CurrentUser() user: CurrentUserData,
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
  approve(@CurrentUser() user: CurrentUserData, @Body() dto: ApproveReportDto) {
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

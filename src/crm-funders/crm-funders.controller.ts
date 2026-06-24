import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { CrmFundersService } from './crm-funders.service';
import {
  CreateFunderDto,
  UpdateFunderDto,
  FilterFunderDto,
  CreateGrantDto,
  CreateDisbursementDto,
  CreateFunderInteractionDto,
  CreateFunderReportDto,
} from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('CRM — Financiadores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/funders')
export class CrmFundersController {
  constructor(private readonly service: CrmFundersService) {}

  // ─── CRUD FINANCIADORES ──────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar financiador' })
  create(@Body() dto: CreateFunderDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Listar financiadores (paginado)' })
  findAll(@Query() filters: FilterFunderDto) {
    return this.service.findAll(filters);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard CRM Financiadores' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('overdue-reports')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Relatórios em atraso' })
  getOverdueReports() {
    return this.service.getOverdueReports();
  }

  @Get('report')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de financiador' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar financiador' })
  update(@Param('id') id: string, @Body() dto: UpdateFunderDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover financiador (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDelete(id, user.id);
  }

  // ─── GRANTS ──────────────────────────────────────────

  @Post(':id/grants')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar grant (financiamento)' })
  createGrant(@Param('id') id: string, @Body() dto: CreateGrantDto, @CurrentUser() user: any) {
    return this.service.createGrant(id, dto, user.id);
  }

  @Get(':id/grants')
  @ApiOperation({ summary: 'Listar grants do financiador' })
  findGrants(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.findGrants(id, page, limit);
  }

  @Put('grants/:grantId/status')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar estado do grant' })
  updateGrantStatus(
    @Param('grantId') grantId: string,
    @Body('status') status: string,
    @CurrentUser() user: any,
  ) {
    return this.service.updateGrantStatus(grantId, status, user.id);
  }

  // ─── DESEMBOLSOS ─────────────────────────────────────

  @Post('grants/:grantId/disbursements')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar desembolso' })
  addDisbursement(
    @Param('grantId') grantId: string,
    @Body() dto: CreateDisbursementDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addDisbursement(grantId, dto, user.id);
  }

  @Get('grants/:grantId/disbursements')
  @ApiOperation({ summary: 'Listar desembolsos do grant' })
  getDisbursements(
    @Param('grantId') grantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getDisbursements(grantId, page, limit);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreateFunderInteractionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.addInteraction(id, dto, user.id);
  }

  // ─── RELATÓRIOS ──────────────────────────────────────

  @Post(':id/reports')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar relatório para financiador' })
  createReport(
    @Param('id') id: string,
    @Body() dto: CreateFunderReportDto,
    @CurrentUser() user: any,
  ) {
    return this.service.createReport(id, dto, user.id);
  }

  @Put('reports/:reportId/submit')
  @ApiOperation({ summary: 'Submeter relatório' })
  submitReport(
    @Param('reportId') reportId: string,
    @Body('fileUrl') fileUrl: string,
    @CurrentUser() user: any,
  ) {
    return this.service.submitReport(reportId, fileUrl, user.id);
  }
}

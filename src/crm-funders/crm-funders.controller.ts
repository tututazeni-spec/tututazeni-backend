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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { CrmFundersService } from './crm-funders.service';
import {
  CreateFunderDto,
  CreateFunderContactDto,
  UpdateFunderContactDto,
  CreateFunderProgramDto,
  UpdateFunderProgramDto,
  UpdateFunderDto,
  FilterFunderDto,
  CreateGrantDto,
  UpdateGrantDto,
  CreateDisbursementDto,
  UpdateDisbursementDto,
  CreateFunderOpportunityDto,
  UpdateFunderOpportunityDto,
  CreateOpportunityDocumentDto,
  CreateFunderInteractionDto,
  CreateFunderReportDto,
  SubmitFunderReportDto,
  PaginationFilterDto,
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
  create(@Body() dto: CreateFunderDto, @CurrentUser() user: CurrentUserData) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
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

  @Get('report')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Detalhe de financiador' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar financiador' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFunderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover financiador (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.softDelete(id, user.id);
  }

  // ─── CONTACTOS ───────────────────────────────────────

  @Get(':id/contacts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar contactos do financiador' })
  getContacts(@Param('id') id: string) {
    return this.service.getContacts(id);
  }

  @Post(':id/contacts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar contacto ao financiador' })
  addContact(
    @Param('id') id: string,
    @Body() dto: CreateFunderContactDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addContact(id, dto, user.id);
  }

  @Put(':id/contacts/:contactId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar contacto do financiador' })
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateFunderContactDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateContact(id, contactId, dto, user.id);
  }

  @Delete(':id/contacts/:contactId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover contacto do financiador' })
  removeContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeContact(id, contactId, user.id);
  }

  // ─── PROGRAMAS E PROJECTOS FINANCIADOS ───────────────

  @Get(':id/programs')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar programas e projectos financiados' })
  getPrograms(@Param('id') id: string) {
    return this.service.getPrograms(id);
  }

  @Post(':id/programs')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Associar financiador a programa/projecto' })
  addProgram(
    @Param('id') id: string,
    @Body() dto: CreateFunderProgramDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addProgram(id, dto, user.id);
  }

  @Put(':id/programs/:programId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar programa/projecto financiado' })
  updateProgram(
    @Param('id') id: string,
    @Param('programId') programId: string,
    @Body() dto: UpdateFunderProgramDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateProgram(id, programId, dto, user.id);
  }

  @Delete(':id/programs/:programId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover programa/projecto financiado' })
  removeProgram(
    @Param('id') id: string,
    @Param('programId') programId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeProgram(id, programId, user.id);
  }

  // ─── GRANTS ──────────────────────────────────────────

  @Post(':id/grants')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar grant (financiamento)' })
  createGrant(
    @Param('id') id: string,
    @Body() dto: CreateGrantDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createGrant(id, dto, user.id);
  }

  @Get(':id/grants')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar grants do financiador' })
  findGrants(@Param('id') id: string, @Query() filters: PaginationFilterDto) {
    return this.service.findGrants(id, filters);
  }

  @Get('grants/:grantId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Detalhe do grant (com parcelas e saldo)' })
  getGrant(@Param('grantId') grantId: string) {
    return this.service.getGrant(grantId);
  }

  @Put('grants/:grantId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar grant' })
  updateGrant(
    @Param('grantId') grantId: string,
    @Body() dto: UpdateGrantDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateGrant(grantId, dto, user.id);
  }

  @Put('grants/:grantId/status')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar estado do grant' })
  updateGrantStatus(
    @Param('grantId') grantId: string,
    @Body('status') status: string,
    @CurrentUser() user: CurrentUserData,
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
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addDisbursement(grantId, dto, user.id);
  }

  @Get('grants/:grantId/disbursements')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar desembolsos do grant' })
  getDisbursements(@Param('grantId') grantId: string, @Query() filters: PaginationFilterDto) {
    return this.service.getDisbursements(grantId, filters);
  }

  @Put('grants/:grantId/disbursements/:disbursementId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar desembolso (ex.: marcar como recebido)' })
  updateDisbursement(
    @Param('grantId') grantId: string,
    @Param('disbursementId') disbursementId: string,
    @Body() dto: UpdateDisbursementDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateDisbursement(grantId, disbursementId, dto, user.id);
  }

  @Delete('grants/:grantId/disbursements/:disbursementId')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover desembolso' })
  removeDisbursement(
    @Param('grantId') grantId: string,
    @Param('disbursementId') disbursementId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeDisbursement(grantId, disbursementId, user.id);
  }

  // ─── CANDIDATURAS / OPORTUNIDADES ────────────────────

  @Get(':id/opportunities')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar oportunidades de financiamento' })
  getOpportunities(@Param('id') id: string) {
    return this.service.getOpportunities(id);
  }

  @Post(':id/opportunities')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar oportunidade de financiamento' })
  addOpportunity(
    @Param('id') id: string,
    @Body() dto: CreateFunderOpportunityDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addOpportunity(id, dto, user.id);
  }

  @Put(':id/opportunities/:opportunityId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar oportunidade de financiamento' })
  updateOpportunity(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @Body() dto: UpdateFunderOpportunityDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateOpportunity(id, opportunityId, dto, user.id);
  }

  @Delete(':id/opportunities/:opportunityId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover oportunidade de financiamento' })
  removeOpportunity(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeOpportunity(id, opportunityId, user.id);
  }

  @Post(':id/opportunities/:opportunityId/documents')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Anexar documento à oportunidade' })
  addOpportunityDocument(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @Body() dto: CreateOpportunityDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addOpportunityDocument(id, opportunityId, dto, user.id);
  }

  @Delete(':id/opportunities/:opportunityId/documents/:documentId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover documento da oportunidade' })
  removeOpportunityDocument(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeOpportunityDocument(id, opportunityId, documentId, user.id);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreateFunderInteractionDto,
    @CurrentUser() user: CurrentUserData,
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
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createReport(id, dto, user.id);
  }

  @Put('reports/:reportId/submit')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Submeter relatório' })
  submitReport(
    @Param('reportId') reportId: string,
    @Body() dto: SubmitFunderReportDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.submitReport(reportId, dto.fileUrl, user.id);
  }
}

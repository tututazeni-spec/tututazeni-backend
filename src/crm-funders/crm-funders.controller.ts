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
  UpdateFunderInteractionDto,
  FilterFunderInteractionDto,
  CreateFunderPartnerLinkDto,
  UpdateFunderPartnerLinkDto,
  FilterFunderBeneficiaryDto,
  CreateFunderReportDto,
  UpdateFunderReportDto,
  FilterFunderReportDto,
  SubmitFunderReportDto,
  CreateFunderContractDto,
  UpdateFunderContractDto,
  CreateFunderIndicatorDto,
  UpdateFunderIndicatorDto,
  FilterFunderIndicatorDto,
  CreateFunderDocumentDto,
  UpdateFunderDocumentDto,
  CreateFunderDocumentVersionDto,
  UpdateFunderResponsibleDto,
  UpdateFunderNotesDto,
  CreateFunderCustomFieldDto,
  UpdateFunderCustomFieldDto,
  SetFunderCustomFieldValuesDto,
  UpsertFunderConsentDto,
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

  // ─── CONTRATOS E ACORDOS ─────────────────────────────

  @Get(':id/contracts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar contratos e acordos do financiador' })
  getContracts(@Param('id') id: string) {
    return this.service.getContracts(id);
  }

  @Post(':id/contracts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar contrato/acordo' })
  addContract(
    @Param('id') id: string,
    @Body() dto: CreateFunderContractDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addContract(id, dto, user.id);
  }

  @Put(':id/contracts/:contractId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar contrato/acordo' })
  updateContract(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @Body() dto: UpdateFunderContractDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateContract(id, contractId, dto, user.id);
  }

  @Delete(':id/contracts/:contractId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover contrato/acordo' })
  removeContract(
    @Param('id') id: string,
    @Param('contractId') contractId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeContract(id, contractId, user.id);
  }

  // ─── INDICADORES E IMPACTO ───────────────────────────

  @Get(':id/indicators')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar indicadores (filtrável por programa/financiamento)' })
  getIndicators(@Param('id') id: string, @Query() filters: FilterFunderIndicatorDto) {
    return this.service.getIndicators(id, filters);
  }

  @Get(':id/impact')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Impacto consolidado por tipo de indicador' })
  getImpactSummary(@Param('id') id: string) {
    return this.service.getImpactSummary(id);
  }

  @Post(':id/indicators')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Configurar indicador' })
  addIndicator(
    @Param('id') id: string,
    @Body() dto: CreateFunderIndicatorDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addIndicator(id, dto, user.id);
  }

  @Put(':id/indicators/:indicatorId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar indicador (meta/alcançado)' })
  updateIndicator(
    @Param('id') id: string,
    @Param('indicatorId') indicatorId: string,
    @Body() dto: UpdateFunderIndicatorDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateIndicator(id, indicatorId, dto, user.id);
  }

  @Delete(':id/indicators/:indicatorId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover indicador' })
  removeIndicator(
    @Param('id') id: string,
    @Param('indicatorId') indicatorId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeIndicator(id, indicatorId, user.id);
  }

  // ─── ACTIVIDADES E RELACIONAMENTO (⑮) ────────────────

  @Get(':id/interactions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Timeline de actividades do financiador (filtrável, paginada)' })
  getInteractions(
    @Param('id') id: string,
    @Query() filters: FilterFunderInteractionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.getInteractions(id, filters, {
      id: user.id,
      isAdmin: user.role?.name === Role.ADMIN,
    });
  }

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

  @Put(':id/interactions/:interactionId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar actividade' })
  updateInteraction(
    @Param('id') id: string,
    @Param('interactionId') interactionId: string,
    @Body() dto: UpdateFunderInteractionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateInteraction(id, interactionId, dto, user.id);
  }

  @Delete(':id/interactions/:interactionId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover actividade' })
  removeInteraction(
    @Param('id') id: string,
    @Param('interactionId') interactionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeInteraction(id, interactionId, user.id);
  }

  // ─── BENEFICIÁRIOS FINANCIADOS (⑬) ────────────────────

  @Get(':id/beneficiaries/summary')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Financiador → Programa → Projecto → nº de beneficiários' })
  getBeneficiariesSummary(@Param('id') id: string) {
    return this.service.getBeneficiariesSummary(id);
  }

  @Get(':id/beneficiaries')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Beneficiários financiados (participações, paginado)' })
  getFundedBeneficiaries(
    @Param('id') id: string,
    @Query() filters: FilterFunderBeneficiaryDto,
    @Query() pagination: PaginationFilterDto,
  ) {
    return this.service.getFundedBeneficiaries(id, filters, pagination);
  }

  // ─── PARCEIROS ASSOCIADOS (⑭) ─────────────────────────

  @Get(':id/partners')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Parceiros associados (lista e vista por programa)' })
  getPartners(@Param('id') id: string) {
    return this.service.getPartners(id);
  }

  @Post(':id/partners')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Associar parceiro (opcionalmente a um programa)' })
  addPartner(
    @Param('id') id: string,
    @Body() dto: CreateFunderPartnerLinkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addPartner(id, dto, user.id);
  }

  @Put(':id/partners/:linkId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar parceiro associado' })
  updatePartner(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Body() dto: UpdateFunderPartnerLinkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updatePartner(id, linkId, dto, user.id);
  }

  @Delete(':id/partners/:linkId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desassociar parceiro' })
  removePartner(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removePartner(id, linkId, user.id);
  }

  // ─── RELATÓRIOS ──────────────────────────────────────

  @Get(':id/reports')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar requisitos de reporte do financiador' })
  getReports(@Param('id') id: string, @Query() filters: FilterFunderReportDto) {
    return this.service.getReports(id, filters);
  }

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

  @Put(':id/reports/:reportId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar relatório exigido' })
  updateReport(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @Body() dto: UpdateFunderReportDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateReport(id, reportId, dto, user.id);
  }

  @Delete(':id/reports/:reportId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover relatório exigido' })
  removeReport(
    @Param('id') id: string,
    @Param('reportId') reportId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeReport(id, reportId, user.id);
  }

  // ─── DOCUMENTOS (⑯) ──────────────────────────────────

  @Get(':id/documents')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar documentos (última versão de cada; ?history=true para todas)' })
  getDocuments(@Param('id') id: string, @Query('history') history?: string) {
    return this.service.getDocuments(id, history === 'true');
  }

  @Get(':id/documents/:documentId/history')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Histórico de versões de um documento' })
  getDocumentHistory(@Param('id') id: string, @Param('documentId') documentId: string) {
    return this.service.getDocumentHistory(id, documentId);
  }

  @Post(':id/documents')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar documento' })
  addDocument(
    @Param('id') id: string,
    @Body() dto: CreateFunderDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addDocument(id, dto, user.id);
  }

  @Post(':id/documents/:documentId/versions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Carregar nova versão de um documento' })
  addDocumentVersion(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() dto: CreateFunderDocumentVersionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addDocumentVersion(id, documentId, dto, user.id);
  }

  @Put(':id/documents/:documentId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar metadados do documento' })
  updateDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateFunderDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateDocument(id, documentId, dto, user.id);
  }

  @Delete(':id/documents/:documentId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover documento' })
  removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeDocument(id, documentId, user.id);
  }

  // ─── RESPONSÁVEL INTERNO (⑰) ─────────────────────────

  @Get(':id/responsible')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Responsável interno do financiador' })
  getResponsible(@Param('id') id: string) {
    return this.service.getResponsible(id);
  }

  @Put(':id/responsible')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Atribuir/actualizar responsável interno' })
  updateResponsible(
    @Param('id') id: string,
    @Body() dto: UpdateFunderResponsibleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateResponsible(id, dto, user.id);
  }

  // ─── NOTAS E CAMPOS PERSONALIZADOS (⑱) ───────────────

  @Get(':id/notes')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Notas internas, estratégia, histórico, observações e tags' })
  getNotes(@Param('id') id: string) {
    return this.service.getNotes(id);
  }

  @Put(':id/notes')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar notas internas e tags' })
  updateNotes(
    @Param('id') id: string,
    @Body() dto: UpdateFunderNotesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateNotes(id, dto, user.id);
  }

  @Get('custom-fields/definitions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar definições de campos personalizados' })
  getCustomFieldDefinitions(@Query('includeInactive') includeInactive?: string) {
    return this.service.getCustomFieldDefinitions(includeInactive === 'true');
  }

  @Post('custom-fields/definitions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar campo personalizado (admin)' })
  createCustomFieldDefinition(
    @Body() dto: CreateFunderCustomFieldDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createCustomFieldDefinition(dto, user.id);
  }

  @Put('custom-fields/definitions/:fieldId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar campo personalizado (admin)' })
  updateCustomFieldDefinition(
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateFunderCustomFieldDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateCustomFieldDefinition(fieldId, dto, user.id);
  }

  @Delete('custom-fields/definitions/:fieldId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover campo personalizado (admin)' })
  removeCustomFieldDefinition(
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeCustomFieldDefinition(fieldId, user.id);
  }

  @Get(':id/custom-fields')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Valores dos campos personalizados do financiador' })
  getCustomFieldValues(@Param('id') id: string) {
    return this.service.getCustomFieldValues(id);
  }

  @Put(':id/custom-fields')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Definir valores dos campos personalizados' })
  setCustomFieldValues(
    @Param('id') id: string,
    @Body() dto: SetFunderCustomFieldValuesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.setCustomFieldValues(id, dto.values, user.id);
  }

  // ─── PRIVACIDADE E CONTROLO (⑲) ──────────────────────

  @Get(':id/consent')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Consentimentos e preferências de comunicação' })
  getConsent(@Param('id') id: string) {
    return this.service.getConsent(id);
  }

  @Put(':id/consent')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar/actualizar consentimentos de comunicação' })
  upsertConsent(
    @Param('id') id: string,
    @Body() dto: UpsertFunderConsentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.upsertConsent(id, dto, user.id);
  }

  @Get(':id/record-info')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criado por/em e última alteração por/em' })
  getRecordInfo(@Param('id') id: string) {
    return this.service.getRecordInfo(id);
  }

  @Get(':id/changelog')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Registo de alterações (auditoria do financiador)' })
  getChangeLog(@Param('id') id: string, @Query() pagination: PaginationFilterDto) {
    return this.service.getChangeLog(id, pagination);
  }
}

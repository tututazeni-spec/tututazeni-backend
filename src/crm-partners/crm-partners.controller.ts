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
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { CrmPartnersService } from './crm-partners.service';
import {
  CreatePartnerDto,
  UpdatePartnerDto,
  FilterPartnerDto,
  CreatePartnerInteractionDto,
  CreateMilestoneDto,
  CreatePartnerContactDto,
  UpdatePartnerContactDto,
  CreatePartnerProgramDto,
  UpdatePartnerProgramDto,
  CreatePartnerAgreementDto,
  UpdatePartnerAgreementDto,
  CreateAgreementVersionDto,
  CreatePartnerContributionDto,
  UpdatePartnerContributionDto,
  CreatePartnerFunderLinkDto,
  UpdatePartnerFunderLinkDto,
  CreatePartnerOpportunityDto,
  UpdatePartnerOpportunityDto,
  CreatePartnerImpactIndicatorDto,
  UpdatePartnerImpactIndicatorDto,
  CreatePartnerDocumentDto,
  UpdatePartnerDocumentDto,
  CreatePartnerDocumentVersionDto,
  CreatePartnerLocationDto,
  UpdatePartnerLocationDto,
  UpdatePartnerResponsibleDto,
  UpsertPartnerConsentDto,
  CreatePartnerCustomFieldDto,
  UpdatePartnerCustomFieldDto,
  SetPartnerCustomFieldValuesDto,
} from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('CRM — Parceiros')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/partners')
export class CrmPartnersController {
  constructor(private readonly service: CrmPartnersService) {}

  // ─── CRUD ────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar parceiro' })
  create(@Body() dto: CreatePartnerDto, @CurrentUser() user: CurrentUserData) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar parceiros (paginado)' })
  findAll(@Query() filters: FilterPartnerDto) {
    return this.service.findAll(filters);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard CRM Parceiros' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('expiring-contracts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Contratos a expirar nos próximos N dias' })
  getExpiringContracts(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.service.getExpiringContracts(days);
  }

  @Get('overdue-milestones')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Milestones em atraso' })
  getOverdueMilestones() {
    return this.service.getOverdueMilestones();
  }

  @Get('report')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Detalhe de parceiro' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar parceiro' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover parceiro (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.softDelete(id, user.id);
  }

  // ─── CONTACTOS ───────────────────────────────────────

  @Get(':id/contacts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar contactos do parceiro' })
  getContacts(@Param('id') id: string) {
    return this.service.getContacts(id);
  }

  @Post(':id/contacts')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar contacto ao parceiro' })
  addContact(
    @Param('id') id: string,
    @Body() dto: CreatePartnerContactDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addContact(id, dto, user.id);
  }

  @Put(':id/contacts/:contactId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar contacto do parceiro' })
  updateContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdatePartnerContactDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateContact(id, contactId, dto, user.id);
  }

  @Delete(':id/contacts/:contactId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover contacto do parceiro' })
  removeContact(
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeContact(id, contactId, user.id);
  }

  // ─── PROGRAMAS E PROJECTOS ───────────────────────────

  @Get(':id/programs')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar programas e projectos do parceiro' })
  getPrograms(@Param('id') id: string) {
    return this.service.getPrograms(id);
  }

  @Post(':id/programs')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Associar parceiro a programa/projecto' })
  addProgram(
    @Param('id') id: string,
    @Body() dto: CreatePartnerProgramDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addProgram(id, dto, user.id);
  }

  @Put(':id/programs/:programId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar associação a programa' })
  updateProgram(
    @Param('id') id: string,
    @Param('programId') programId: string,
    @Body() dto: UpdatePartnerProgramDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateProgram(id, programId, dto, user.id);
  }

  @Delete(':id/programs/:programId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover associação a programa' })
  removeProgram(
    @Param('id') id: string,
    @Param('programId') programId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeProgram(id, programId, user.id);
  }

  // ─── ACORDOS E CONTRATOS ─────────────────────────────

  @Get(':id/agreements')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar acordos do parceiro' })
  getAgreements(@Param('id') id: string) {
    return this.service.getAgreements(id);
  }

  @Get(':id/agreements/:agreementId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Detalhe de acordo com histórico de versões' })
  getAgreement(@Param('id') id: string, @Param('agreementId') agreementId: string) {
    return this.service.getAgreement(id, agreementId);
  }

  @Post(':id/agreements')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar novo acordo' })
  addAgreement(
    @Param('id') id: string,
    @Body() dto: CreatePartnerAgreementDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addAgreement(id, dto, user.id);
  }

  @Put(':id/agreements/:agreementId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar acordo' })
  updateAgreement(
    @Param('id') id: string,
    @Param('agreementId') agreementId: string,
    @Body() dto: UpdatePartnerAgreementDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateAgreement(id, agreementId, dto, user.id);
  }

  @Delete(':id/agreements/:agreementId')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover acordo (soft delete)' })
  removeAgreement(
    @Param('id') id: string,
    @Param('agreementId') agreementId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeAgreement(id, agreementId, user.id);
  }

  @Post(':id/agreements/:agreementId/versions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Anexar nova versão do documento do acordo' })
  addAgreementVersion(
    @Param('id') id: string,
    @Param('agreementId') agreementId: string,
    @Body() dto: CreateAgreementVersionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addAgreementVersion(id, agreementId, dto, user.id);
  }

  // ─── CONTRIBUIÇÃO DO PARCEIRO ────────────────────────

  @Get(':id/contributions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar contribuições do parceiro' })
  getContributions(@Param('id') id: string) {
    return this.service.getContributions(id);
  }

  @Post(':id/contributions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar contribuição do parceiro' })
  addContribution(
    @Param('id') id: string,
    @Body() dto: CreatePartnerContributionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addContribution(id, dto, user.id);
  }

  @Put(':id/contributions/:contributionId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar contribuição' })
  updateContribution(
    @Param('id') id: string,
    @Param('contributionId') contributionId: string,
    @Body() dto: UpdatePartnerContributionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateContribution(id, contributionId, dto, user.id);
  }

  @Delete(':id/contributions/:contributionId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover contribuição' })
  removeContribution(
    @Param('id') id: string,
    @Param('contributionId') contributionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeContribution(id, contributionId, user.id);
  }

  // ─── OPORTUNIDADES DE PARCERIA ───────────────────────

  @Get(':id/opportunities')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar oportunidades de parceria' })
  getOpportunities(@Param('id') id: string) {
    return this.service.getOpportunities(id);
  }

  @Get(':id/opportunities/pipeline')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Pipeline de oportunidades: estados, valor bruto e ponderado' })
  getOpportunityPipeline(@Param('id') id: string) {
    return this.service.getOpportunityPipeline(id);
  }

  @Post(':id/opportunities')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar oportunidade de parceria' })
  addOpportunity(
    @Param('id') id: string,
    @Body() dto: CreatePartnerOpportunityDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addOpportunity(id, dto, user.id);
  }

  @Put(':id/opportunities/:opportunityId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar oportunidade (inclui mudança de estado)' })
  updateOpportunity(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @Body() dto: UpdatePartnerOpportunityDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateOpportunity(id, opportunityId, dto, user.id);
  }

  @Delete(':id/opportunities/:opportunityId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover oportunidade' })
  removeOpportunity(
    @Param('id') id: string,
    @Param('opportunityId') opportunityId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeOpportunity(id, opportunityId, user.id);
  }

  // ─── DESEMPENHO DA PARCERIA ──────────────────────────

  @Get(':id/performance')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Desempenho da parceria (derivado de dados já registados)' })
  getPerformance(@Param('id') id: string) {
    return this.service.getPerformance(id);
  }

  @Get(':id/impact-indicators')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar indicadores de impacto' })
  getImpactIndicators(@Param('id') id: string) {
    return this.service.getImpactIndicators(id);
  }

  @Post(':id/impact-indicators')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar indicador de impacto' })
  addImpactIndicator(
    @Param('id') id: string,
    @Body() dto: CreatePartnerImpactIndicatorDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addImpactIndicator(id, dto, user.id);
  }

  @Put(':id/impact-indicators/:indicatorId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar indicador de impacto' })
  updateImpactIndicator(
    @Param('id') id: string,
    @Param('indicatorId') indicatorId: string,
    @Body() dto: UpdatePartnerImpactIndicatorDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateImpactIndicator(id, indicatorId, dto, user.id);
  }

  @Delete(':id/impact-indicators/:indicatorId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover indicador de impacto' })
  removeImpactIndicator(
    @Param('id') id: string,
    @Param('indicatorId') indicatorId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeImpactIndicator(id, indicatorId, user.id);
  }

  // ─── DOCUMENTOS ──────────────────────────────────────

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
    @Body() dto: CreatePartnerDocumentDto,
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
    @Body() dto: CreatePartnerDocumentVersionDto,
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
    @Body() dto: UpdatePartnerDocumentDto,
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

  // ─── FINANCIAMENTO (ligação a CRM → Funders) ─────────

  @Get(':id/funding')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Financiamento: financiadores associados e totais por moeda' })
  getFunding(@Param('id') id: string) {
    return this.service.getFunding(id);
  }

  @Post(':id/funding')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Associar financiador ao parceiro' })
  addFunderLink(
    @Param('id') id: string,
    @Body() dto: CreatePartnerFunderLinkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addFunderLink(id, dto, user.id);
  }

  @Put(':id/funding/:linkId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar ligação a financiador' })
  updateFunderLink(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Body() dto: UpdatePartnerFunderLinkDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateFunderLink(id, linkId, dto, user.id);
  }

  @Delete(':id/funding/:linkId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover ligação a financiador' })
  removeFunderLink(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeFunderLink(id, linkId, user.id);
  }

  // ─── BENEFICIÁRIOS RELACIONADOS ──────────────────────

  @Get(':id/beneficiaries/summary')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Impacto da parceria: beneficiários, províncias e participações' })
  getBeneficiariesSummary(@Param('id') id: string) {
    return this.service.getBeneficiariesSummary(id);
  }

  @Get(':id/beneficiaries')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Beneficiários impactados pelos programas do parceiro (paginado)' })
  getRelatedBeneficiaries(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('program') program?: string,
  ) {
    return this.service.getRelatedBeneficiaries(id, page, limit, program);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreatePartnerInteractionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addInteraction(id, dto, user.id);
  }

  @Get(':id/interactions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar interacções do parceiro' })
  getInteractions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getInteractions(id, page, limit);
  }

  // ─── MILESTONES ──────────────────────────────────────

  @Post(':id/milestones')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar milestone do parceiro' })
  addMilestone(
    @Param('id') id: string,
    @Body() dto: CreateMilestoneDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addMilestone(id, dto, user.id);
  }

  @Put('milestones/:milestoneId/complete')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Marcar milestone como concluído' })
  completeMilestone(
    @Param('milestoneId') milestoneId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.completeMilestone(milestoneId, user.id);
  }

  // ─── LOCALIZAÇÕES ────────────────────────────────────

  @Get(':id/locations')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Sede e filiais/delegações do parceiro' })
  getLocations(@Param('id') id: string) {
    return this.service.getLocations(id);
  }

  @Post(':id/locations')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar filial/delegação' })
  addLocation(
    @Param('id') id: string,
    @Body() dto: CreatePartnerLocationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addLocation(id, dto, user.id);
  }

  @Put(':id/locations/:locationId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar filial/delegação' })
  updateLocation(
    @Param('id') id: string,
    @Param('locationId') locationId: string,
    @Body() dto: UpdatePartnerLocationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateLocation(id, locationId, dto, user.id);
  }

  @Delete(':id/locations/:locationId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover filial/delegação' })
  removeLocation(
    @Param('id') id: string,
    @Param('locationId') locationId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeLocation(id, locationId, user.id);
  }

  // ─── RESPONSÁVEL INTERNO ─────────────────────────────

  @Get(':id/responsible')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Responsável interno do parceiro' })
  getResponsible(@Param('id') id: string) {
    return this.service.getResponsible(id);
  }

  @Put(':id/responsible')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Atribuir/actualizar responsável interno' })
  updateResponsible(
    @Param('id') id: string,
    @Body() dto: UpdatePartnerResponsibleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateResponsible(id, dto, user.id);
  }

  // ─── COMUNICAÇÃO E CONSENTIMENTOS ────────────────────

  @Get(':id/consent')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Consentimentos de comunicação do parceiro' })
  getConsent(@Param('id') id: string) {
    return this.service.getConsent(id);
  }

  @Put(':id/consent')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar/actualizar consentimentos de comunicação' })
  upsertConsent(
    @Param('id') id: string,
    @Body() dto: UpsertPartnerConsentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.upsertConsent(id, dto, user.id);
  }

  // ─── CAMPOS PERSONALIZADOS ───────────────────────────

  @Get('custom-fields/definitions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar definições de campos personalizados' })
  getCustomFieldDefinitions(
    @Query('includeInactive', new DefaultValuePipe(false)) includeInactive: string | boolean,
  ) {
    return this.service.getCustomFieldDefinitions(
      includeInactive === true || includeInactive === 'true',
    );
  }

  @Post('custom-fields/definitions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar campo personalizado (admin)' })
  createCustomFieldDefinition(
    @Body() dto: CreatePartnerCustomFieldDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.createCustomFieldDefinition(dto, user.id);
  }

  @Put('custom-fields/definitions/:fieldId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar campo personalizado (admin)' })
  updateCustomFieldDefinition(
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdatePartnerCustomFieldDto,
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
  @ApiOperation({ summary: 'Valores dos campos personalizados do parceiro' })
  getCustomFieldValues(@Param('id') id: string) {
    return this.service.getCustomFieldValues(id);
  }

  @Put(':id/custom-fields')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Definir valores dos campos personalizados' })
  setCustomFieldValues(
    @Param('id') id: string,
    @Body() dto: SetPartnerCustomFieldValuesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.setCustomFieldValues(id, dto.values, user.id);
  }
}

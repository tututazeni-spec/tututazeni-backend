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
}

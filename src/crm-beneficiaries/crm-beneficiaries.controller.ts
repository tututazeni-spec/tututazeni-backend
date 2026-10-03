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
import { CrmBeneficiariesService } from './crm-beneficiaries.service';
import {
  CreateBeneficiaryDto,
  UpdateBeneficiaryDto,
  FilterBeneficiaryDto,
  CreateInteractionDto,
  CreateNeedDto,
  CreateBeneficiaryDocumentDto,
  ValidateBeneficiaryDocumentDto,
  CreateBenefitDto,
  UpdateBenefitDto,
  CreateParticipationDto,
  UpdateParticipationDto,
} from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('CRM — Beneficiários')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/beneficiaries')
export class CrmBeneficiariesController {
  constructor(private readonly service: CrmBeneficiariesService) {}

  // ─── CRUD ────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar beneficiário' })
  create(@Body() dto: CreateBeneficiaryDto, @CurrentUser() user: CurrentUserData) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar beneficiários (paginado)' })
  findAll(@Query() filters: FilterBeneficiaryDto) {
    return this.service.findAll(filters);
  }

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard do CRM de beneficiários' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Get('follow-ups')
  @ApiOperation({ summary: 'Follow-ups pendentes do utilizador' })
  getFollowUps(
    @CurrentUser() user: CurrentUserData,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.service.getFollowUps(user.id, days);
  }

  @Get('report')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatório por período' })
  getReport(@Query('start') start: string, @Query('end') end: string) {
    return this.service.getReport(new Date(start), new Date(end));
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Detalhe de beneficiário' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar beneficiário' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBeneficiaryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover beneficiário (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.softDelete(id, user.id);
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  @Post(':id/interactions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar interacção' })
  addInteraction(
    @Param('id') id: string,
    @Body() dto: CreateInteractionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addInteraction(id, dto, user.id);
  }

  @Get(':id/interactions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Listar interacções do beneficiário' })
  getInteractions(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getInteractions(id, page, limit);
  }

  // ─── NECESSIDADES ────────────────────────────────────

  @Post(':id/needs')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar necessidade' })
  addNeed(
    @Param('id') id: string,
    @Body() dto: CreateNeedDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addNeed(id, dto, user.id);
  }

  @Put('needs/:needId/resolve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Resolver necessidade' })
  resolveNeed(@Param('needId') needId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.resolveNeed(needId, user.id);
  }

  // ─── HISTÓRICO ───────────────────────────────────────

  @Get(':id/history')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Histórico de alterações / registo de actividades' })
  getHistory(
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getHistory(id, page, limit);
  }

  // ─── DOCUMENTOS ──────────────────────────────────────

  @Post(':id/documents')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Adicionar documento' })
  addDocument(
    @Param('id') id: string,
    @Body() dto: CreateBeneficiaryDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addDocument(id, dto, user.id);
  }

  @Put('documents/:docId/validate')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Validar / rejeitar documento' })
  validateDocument(
    @Param('docId') docId: string,
    @Body() dto: ValidateBeneficiaryDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.validateDocument(docId, dto, user.id);
  }

  @Delete('documents/:docId')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover documento (soft delete)' })
  removeDocument(@Param('docId') docId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.removeDocument(docId, user.id);
  }

  // ─── BENEFÍCIOS / SERVIÇOS ───────────────────────────

  @Post(':id/benefits')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Atribuir benefício / serviço / apoio' })
  addBenefit(
    @Param('id') id: string,
    @Body() dto: CreateBenefitDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addBenefit(id, dto, user.id);
  }

  @Put('benefits/:benefitId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar estado do benefício' })
  updateBenefit(
    @Param('benefitId') benefitId: string,
    @Body() dto: UpdateBenefitDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateBenefit(benefitId, dto, user.id);
  }

  @Delete('benefits/:benefitId')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover benefício (soft delete)' })
  removeBenefit(@Param('benefitId') benefitId: string, @CurrentUser() user: CurrentUserData) {
    return this.service.removeBenefit(benefitId, user.id);
  }

  // ─── PARTICIPAÇÕES ───────────────────────────────────

  @Post(':id/participations')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar participação em programa / formação' })
  addParticipation(
    @Param('id') id: string,
    @Body() dto: CreateParticipationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addParticipation(id, dto, user.id);
  }

  @Put('participations/:participationId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Actualizar participação' })
  updateParticipation(
    @Param('participationId') participationId: string,
    @Body() dto: UpdateParticipationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateParticipation(participationId, dto, user.id);
  }

  @Delete('participations/:participationId')
  @Roles(Role.ADMIN, Role.RH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover participação (soft delete)' })
  removeParticipation(
    @Param('participationId') participationId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.removeParticipation(participationId, user.id);
  }
}

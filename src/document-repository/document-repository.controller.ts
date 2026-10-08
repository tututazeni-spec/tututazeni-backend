// ─── src/document-repository/document-repository.controller.ts ───────────────
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
  Req,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DocumentRepositoryService } from './document-repository.service';
import {
  DocumentFilterDto,
  CreateDocumentDto,
  UpdateDocumentDto,
  NewVersionDto,
  GrantPermissionDto,
  CreateShareLinkDto,
  CreateDocCategoryDto,
  OptionalReasonDto,
  UpdateExpiresAtDto,
  ReasonDto,
  RejectDocumentDto,
  SupersedeDocumentDto,
  SubmitForApprovalDto,
} from './document-repository.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '../auth/enums/role.enum';

function clientMeta(req: Request) {
  return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
}

@ApiTags('Document Repository')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentRepositoryController {
  constructor(private readonly svc: DocumentRepositoryService) {}

  // ── Dashboard & Analytics ─────────────────────────────────────────

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard — KPIs, documentos, tamanho, expiração' })
  getDashboard() {
    return this.svc.getDashboard();
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Estatísticas por categoria, sensibilidade, top downloads' })
  @ApiQuery({ name: 'department', required: false })
  getStats(@Query('department') department?: string) {
    return this.svc.getStats(department);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Todas as tags com contagem (para cloud de tags)' })
  getTags() {
    return this.svc.getAllTags();
  }

  @Get('expiring-soon')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Documentos a expirar nos próximos N dias' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiringSoon(@Query('days') days?: string) {
    return this.svc.getExpiringSoon(days ? +days : 30);
  }

  // ── Confirmação de leitura / Favoritos / Recentes (docs/biblioteca.md) ──
  // Rotas fixas — têm de vir antes de GET/PATCH ':id' para não colidirem
  // com o ParseIntPipe do parâmetro.

  @Get('pending-reads')
  @ApiOperation({ summary: 'Documentos obrigatórios que o utilizador ainda não confirmou' })
  getMyPendingReads(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyPendingReads(user.id);
  }

  @Get('favorites')
  @ApiOperation({ summary: 'Documentos marcados como favoritos pelo utilizador' })
  getMyFavorites(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyFavorites(user.id);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Documentos vistos recentemente pelo utilizador' })
  getMyRecent(@CurrentUser() user: CurrentUserData) {
    return this.svc.getMyRecent(user.id);
  }

  @Get('compliance-overview')
  @Roles(Role.ADMIN, Role.RH, Role.DIRECTOR)
  @ApiOperation({ summary: 'Relatório de conclusão de leitura obrigatória, por documento' })
  getComplianceOverview() {
    return this.svc.getComplianceOverview();
  }

  // ── Categories ────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias configuradas' })
  getCategories() {
    return this.svc.getCategories();
  }

  @Post('categories')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar categoria de documento com regra de retenção' })
  createCategory(@Body() dto: CreateDocCategoryDto) {
    return this.svc.createCategory(dto);
  }

  // ── Share Link (público, sem auth) ───────────────────────────────

  @Get('share/:token')
  @Public()
  @ApiOperation({ summary: 'Resolver link de partilha (sem autenticação)' })
  resolveShare(@Param('token') token: string, @Query('password') password?: string) {
    return this.svc.resolveShareLink(token, password);
  }

  // ── Core CRUD ─────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar documentos (filtros + busca inteligente por OCR text + tags)' })
  findAll(@Query() filters: DocumentFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.findAll(filters, user.id, user.role?.name);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do documento com versões, permissões e metadata' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(id, user.id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download (regista no audit log e incrementa contador)' })
  download(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.download(id, user.id);
  }

  @Get(':id/audit')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Log de auditoria do documento' })
  getAuditLog(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAuditLog(id);
  }

  @Get(':id/access-log')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Histórico de downloads por utilizador' })
  getAccessLog(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAccessLog(id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Publicar documento (cria v1.0, calcula retenção legal automática)' })
  create(@CurrentUser() user: CurrentUserData, @Body() dto: CreateDocumentDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar metadados do documento' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  // ── Versioning ────────────────────────────────────────────────────

  @Post(':id/versions')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Carregar nova versão do documento' })
  newVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NewVersionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.newVersion(id, dto, user.id);
  }

  @Patch(':id/versions/:versionId/restore')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Restaurar versão anterior' })
  restoreVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.restoreVersion(id, versionId, user.id);
  }

  // ── Approval workflow (docs/biblioteca.md — "Estados do documento") ────

  @Patch(':id/submit-review')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Enviar rascunho para revisão (DRAFT → EM_REVISAO)' })
  submitForReview(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.submitForReview(id, user.id);
  }

  @Patch(':id/submit-approval')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Enviar para aprovação (EM_REVISAO → PENDENTE_APROVACAO)' })
  submitForApproval(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitForApprovalDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.submitForApproval(id, user.id, dto?.approverId);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN, Role.RH, Role.DIRECTOR)
  @ApiOperation({ summary: 'Aprovar documento (PENDENTE_APROVACAO → APROVADO)' })
  approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.approve(id, user.id);
  }

  @Patch(':id/reject')
  @Roles(Role.ADMIN, Role.RH, Role.DIRECTOR)
  @ApiOperation({ summary: 'Rejeitar documento, devolve a DRAFT com motivo' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.reject(id, user.id, dto.reason);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Publicar documento aprovado (APROVADO → ACTIVE/Publicado)' })
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.publish(id, user.id);
  }

  @Patch(':id/suspend')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Suspender documento publicado (ACTIVE → SUSPENSO)' })
  suspend(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OptionalReasonDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.suspend(id, user.id, dto.reason);
  }

  @Patch(':id/supersede')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Marcar este documento como substituto de outro' })
  supersede(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SupersedeDocumentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.supersede(id, dto.supersededDocumentId, user.id);
  }

  // ── Confirmação de leitura / Favoritos (por documento) ─────────────

  @Get(':id/read-status')
  @Roles(Role.ADMIN, Role.RH, Role.DIRECTOR)
  @ApiOperation({ summary: '% de conclusão de leitura obrigatória e quem falta confirmar' })
  getReadStatus(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getReadStatus(id);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Registar que o utilizador leu o documento' })
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    const { ipAddress, userAgent } = clientMeta(req);
    return this.svc.markRead(id, user.id, ipAddress, userAgent);
  }

  @Post(':id/confirm-read')
  @ApiOperation({ summary: 'Confirmar leitura/ciência do documento' })
  confirmRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    const { ipAddress, userAgent } = clientMeta(req);
    return this.svc.confirmRead(id, user.id, ipAddress, userAgent);
  }

  @Post(':id/favorite')
  @ApiOperation({ summary: 'Marcar/desmarcar documento como favorito' })
  toggleFavorite(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.toggleFavorite(id, user.id);
  }

  // ── Archive / Delete ──────────────────────────────────────────────

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Arquivar documento (verifica retenção legal)' })
  archive(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OptionalReasonDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.archive(id, user.id, dto.reason);
  }

  @Patch(':id/renew')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Renovar data de validade do documento' })
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpiresAtDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.renewDocument(id, dto.newExpiresAt, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar (soft delete — verifica retenção legal)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.softDelete(id, user.id, dto.reason);
  }

  // ── Permissions ───────────────────────────────────────────────────

  @Post('permissions')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Conceder permissão a utilizador ou departamento' })
  grantPermission(@Body() dto: GrantPermissionDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.grantPermission(dto, user.id);
  }

  @Delete('permissions/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Revogar permissão' })
  revokePermission(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.revokePermission(id, user.id);
  }

  // ── Share Links ───────────────────────────────────────────────────

  @Post('share')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar link de partilha externo (com expiração e password)' })
  createShareLink(@Body() dto: CreateShareLinkDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createShareLink(dto, user.id);
  }

  // ── Cron / Admin triggers ─────────────────────────────────────────

  @Post('process-expired')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Processar documentos expirados (chamar via cron job)' })
  processExpired() {
    return this.svc.processExpiredDocuments();
  }
}

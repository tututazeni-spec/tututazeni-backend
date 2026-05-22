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
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
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
} from './document-repository.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Document Repository')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentRepositoryController {
  constructor(private readonly svc: DocumentRepositoryService) {}

  // ── Dashboard & Analytics ─────────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard — KPIs, documentos, tamanho, expiração' })
  getDashboard() {
    return this.svc.getDashboard();
  }

  @Get('stats')
  @Roles('ADMIN', 'RH')
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
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Documentos a expirar nos próximos N dias' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiringSoon(@Query('days') days?: string) {
    return this.svc.getExpiringSoon(days ? +days : 30);
  }

  // ── Categories ────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias configuradas' })
  getCategories() {
    return this.svc.getCategories();
  }

  @Post('categories')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar categoria de documento com regra de retenção' })
  createCategory(@Body() dto: CreateDocCategoryDto) {
    return this.svc.createCategory(dto);
  }

  // ── Share Link (público, sem auth) ───────────────────────────────

  @Get('share/:token')
  @ApiOperation({ summary: 'Resolver link de partilha (sem autenticação)' })
  resolveShare(@Param('token') token: string, @Query('password') password?: string) {
    return this.svc.resolveShareLink(token, password);
  }

  // ── Core CRUD ─────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar documentos (filtros + busca inteligente por OCR text + tags)' })
  findAll(@Query() filters: DocumentFilterDto, @CurrentUser() user: any) {
    return this.svc.findAll(filters, user.id, user.employee?.department, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do documento com versões, permissões e metadata' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download (regista no audit log e incrementa contador)' })
  download(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.download(id, user.id);
  }

  @Get(':id/audit')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Log de auditoria do documento' })
  getAuditLog(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAuditLog(id);
  }

  @Get(':id/access-log')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Histórico de downloads por utilizador' })
  getAccessLog(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAccessLog(id);
  }

  @Post()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Publicar documento (cria v1.0, calcula retenção legal automática)' })
  create(@CurrentUser() user: any, @Body() dto: CreateDocumentDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar metadados do documento' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  // ── Versioning ────────────────────────────────────────────────────

  @Post(':id/versions')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Carregar nova versão do documento' })
  newVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NewVersionDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.newVersion(id, dto, user.id);
  }

  @Patch(':id/versions/:versionId/restore')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Restaurar versão anterior' })
  restoreVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @CurrentUser() user: any,
  ) {
    return this.svc.restoreVersion(id, versionId, user.id);
  }

  // ── Archive / Delete ──────────────────────────────────────────────

  @Patch(':id/archive')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Arquivar documento (verifica retenção legal)' })
  archive(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
  ) {
    return this.svc.archive(id, user.id, body.reason);
  }

  @Patch(':id/renew')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Renovar data de validade do documento' })
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { newExpiresAt: string },
    @CurrentUser() user: any,
  ) {
    return this.svc.renewDocument(id, body.newExpiresAt, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar (soft delete — verifica retenção legal)' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason: string },
    @CurrentUser() user: any,
  ) {
    return this.svc.softDelete(id, user.id, body.reason);
  }

  // ── Permissions ───────────────────────────────────────────────────

  @Post('permissions')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Conceder permissão a utilizador ou departamento' })
  grantPermission(@Body() dto: GrantPermissionDto, @CurrentUser() user: any) {
    return this.svc.grantPermission(dto, user.id);
  }

  @Delete('permissions/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Revogar permissão' })
  revokePermission(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.revokePermission(id, user.id);
  }

  // ── Share Links ───────────────────────────────────────────────────

  @Post('share')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Criar link de partilha externo (com expiração e password)' })
  createShareLink(@Body() dto: CreateShareLinkDto, @CurrentUser() user: any) {
    return this.svc.createShareLink(dto, user.id);
  }

  // ── Cron / Admin triggers ─────────────────────────────────────────

  @Post('process-expired')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Processar documentos expirados (chamar via cron job)' })
  processExpired() {
    return this.svc.processExpiredDocuments();
  }
}

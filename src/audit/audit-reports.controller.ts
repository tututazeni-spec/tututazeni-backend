// src/audit/audit-reports.controller.ts
// Registado ANTES de AuditController no módulo: 'audit/reports|exports|policy' não podem ser
// engolidos por 'audit/:id'.
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuditReportsService } from './audit-reports.service';
import { AuditExportsService } from './audit-exports.service';
import { AuditPolicyService } from './audit-policy.service';
import {
  AuditReportDto,
  AuditReportExportDto,
  ExportFilterDto,
  UpdateExportDto,
  UploadEvidenceDto,
} from './audit-reports.dto';
import { UpdateAuditPolicyDto } from './audit-policy.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

type Req_ = { ip?: string };

@ApiTags('Audit — Relatórios, Exportações e Políticas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('audit')
export class AuditReportsController {
  constructor(
    private readonly reports: AuditReportsService,
    private readonly exportsSvc: AuditExportsService,
    private readonly policy: AuditPolicyService,
  ) {}

  private actor(user: CurrentUserData, req: Req_) {
    return { id: user.id, ip: req.ip };
  }

  // ── Relatórios (§10) ──────────────────────────────────────────────────────

  @Get('reports/catalog')
  @ApiOperation({ summary: 'Catálogo dos 14 relatórios de auditoria' })
  catalog() {
    return this.reports.catalog();
  }

  @Get('reports/preview')
  @ApiOperation({ summary: 'Pré-visualização do relatório no ecrã (JSON)' })
  preview(@Query() dto: AuditReportDto, @CurrentUser() user: CurrentUserData) {
    return this.reports.build(dto, user.role?.name);
  }

  @Get('reports/export')
  @ApiOperation({
    summary: 'Exportar relatório (csv | xlsx | pdf); guarda o ficheiro e regista a exportação',
  })
  async exportReport(
    @Query() dto: AuditReportExportDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Req_,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.reports.export(dto, this.actor(user, req), user.role?.name);
    res.set({
      'Content-Type': out.mimeType,
      'Content-Disposition': `attachment; filename="${out.fileName}"`,
      'X-Audit-Export-Code': out.exportCode,
    });
    return new StreamableFile(out.buffer);
  }

  // ── Exportações e Evidências (§11) ────────────────────────────────────────

  @Get('exports')
  @ApiOperation({ summary: 'Listar exportações e evidências' })
  listExports(@Query() filters: ExportFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.exportsSvc.list(filters, user.role?.name);
  }

  @Get('exports/summary')
  @ApiOperation({ summary: 'Indicadores de exportações e evidências' })
  exportsSummary(@CurrentUser() user: CurrentUserData) {
    return this.exportsSvc.summary(user.role?.name);
  }

  @Post('exports/evidence')
  @ApiOperation({ summary: 'Anexar ficheiro de evidência a um incidente ou auditoria' })
  uploadEvidence(
    @Body() dto: UploadEvidenceDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Req_,
  ) {
    return this.exportsSvc.uploadEvidence(dto, this.actor(user, req), user.role?.name);
  }

  @Post('exports/purge-expired')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar o conteúdo dos ficheiros com retenção terminada' })
  purge(@CurrentUser() user: CurrentUserData, @Req() req: Req_) {
    return this.exportsSvc.purgeExpired(this.actor(user, req));
  }

  @Get('exports/:id')
  @ApiOperation({ summary: 'Detalhe do ficheiro e histórico de acessos' })
  getExport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Req_,
  ) {
    return this.exportsSvc.get(id, this.actor(user, req), user.role?.name);
  }

  @Get('exports/:id/verify')
  @ApiOperation({ summary: 'Verificar a integridade (SHA-256) do ficheiro' })
  verifyExport(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.exportsSvc.verify(id, user.role?.name);
  }

  @Get('exports/:id/download')
  @ApiOperation({ summary: 'Descarregar ficheiro (autenticado, verifica hash, regista acesso)' })
  async download(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Req_,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.exportsSvc.download(id, this.actor(user, req), user.role?.name);
    res.set({
      'Content-Type': out.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(out.fileName)}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(out.buffer);
  }

  @Patch('exports/:id')
  @ApiOperation({ summary: 'Alterar confidencialidade ou prolongar a retenção' })
  updateExport(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExportDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Req_,
  ) {
    return this.exportsSvc.update(id, dto, this.actor(user, req), user.role?.name);
  }

  // ── Políticas e Retenção (§12) ────────────────────────────────────────────

  @Get('policy')
  @ApiOperation({ summary: 'Política de auditoria em vigor' })
  getPolicy() {
    return this.policy.getPolicy();
  }

  @Put('policy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Atualizar a política (a alteração fica auditada)' })
  updatePolicy(
    @Body() dto: UpdateAuditPolicyDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Req_,
  ) {
    return this.policy.updatePolicy(dto, this.actor(user, req));
  }

  @Get('policy/status')
  @ApiOperation({ summary: 'Estado do serviço de auditoria e falhas na recolha de eventos' })
  policyStatus() {
    return this.policy.getStatus();
  }

  @Get('policy/retention-preview')
  @ApiOperation({ summary: 'Registos já fora do prazo de retenção, por categoria (só leitura)' })
  retentionPreview() {
    return this.policy.getRetentionPreview();
  }
}

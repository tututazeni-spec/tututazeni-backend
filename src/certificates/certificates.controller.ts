import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { AUTHENTICATED_ROLES, Role } from '../auth/enums/role.enum';
import { CertificatesService } from './certificates.service';
import { CertificateIssuanceService } from './certificate-issuance.service';
import { IssueCertificateDto } from './certificates.dto';
import { CertificatesAdminService } from './certificates-admin.service';
import { CertificateRulesService } from './certificate-rules.service';
import { CertificateLifecycleService } from './certificate-lifecycle.service';
import { CertificateExternalService } from './certificate-external.service';
import { CertificateBatchService } from './certificate-batch.service';
import { LearningPathCertificationService } from './learning-path-certification.service';
import { LearningPathProgressService } from './learning-path-progress.service';
import { CertificateScopeService } from './certificate-scope.service';
import { CertificatesTeamService } from './certificates-team.service';
import { CertificatesExportService } from './certificates-export.service';
import { CertificatesMeService } from './certificates-me.service';
import { CertificateAssetsService } from './templates/certificate-assets.service';
import { CertificateTemplatesService } from './templates/certificate-templates.service';
import { UploadAssetDto } from './templates/certificate-templates.dto';
import {
  BatchIssueDto,
  ImportExternalCertificateDto,
  ReasonDto,
} from './certificates-lifecycle.dto';
import {
  ExportCertificatesQueryDto,
  HistoryQueryDto,
  ListCertificatesQueryDto,
  UpsertCertificateRuleDto,
} from './certificates-admin.dto';
import { describeMissing } from './certificate-rules';

import { safeDownloadHeaders } from '../common/files/safe-download';

import { UploadThrottle } from '../common/security/upload-throttle';
// Quem pode abrir o centro de certificados; o âmbito (tudo/equipa) é resolvido no serviço.
const MANAGEMENT_ROLES = [
  Role.ADMIN,
  Role.RH,
  Role.AUDITOR,
  Role.GESTOR,
  Role.LIDER,
  Role.DIRECTOR,
];

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly issuance: CertificateIssuanceService,
    private readonly admin: CertificatesAdminService,
    private readonly rules: CertificateRulesService,
    private readonly lifecycle: CertificateLifecycleService,
    private readonly external: CertificateExternalService,
    private readonly batch: CertificateBatchService,
    private readonly scope: CertificateScopeService,
    private readonly team: CertificatesTeamService,
    private readonly exports: CertificatesExportService,
    private readonly me: CertificatesMeService,
    private readonly templateService: CertificateTemplatesService,
    private readonly assetService: CertificateAssetsService,
    private readonly learningPaths: LearningPathCertificationService,
    private readonly pathProgress: LearningPathProgressService,
  ) {}

  @Get('my')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Os meus certificados' })
  mine(@CurrentUser() user: CurrentUserData) {
    return this.certificates.listMine(user.id);
  }

  // As rotas fixas (admin/*, rules, templates, team/*, my/*) vêm antes de ':id/...'.
  // Leitura: ADMIN/RH/AUDITOR vêem tudo; GESTOR/LIDER/DIRECTOR só a equipa directa
  // (âmbito resolvido no backend; qualquer outro papel recebe 403 do serviço).
  @Get('admin/overview')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Indicadores do centro de certificados (no âmbito do utilizador)' })
  async overview(@CurrentUser() user: CurrentUserData) {
    return this.admin.overview(new Date(), await this.scope.resolveScope(user));
  }

  @Get('admin/list')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({
    summary: 'Lista de certificados com filtros e paginação (no âmbito do utilizador)',
  })
  async list(@Query() q: ListCertificatesQueryDto, @CurrentUser() user: CurrentUserData) {
    return this.admin.list(q, new Date(), await this.scope.resolveScope(user));
  }

  @Get('admin/export')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({
    summary: 'Exportar certificados em CSV, Excel ou PDF (filtros e âmbito do utilizador)',
  })
  async export(
    @Query() q: ExportCertificatesQueryDto,
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
  ) {
    const file = await this.exports.exportCertificates(q, user);
    res.set(
      safeDownloadHeaders({
        filename: file.filename,
        mime: file.contentType,
        extra: { 'Content-Length': String(file.buffer.length) },
      }),
    );
    res.end(file.buffer);
  }

  @Get('team/summary')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({
    summary: 'Resumo de certificações da equipa (ou de um departamento para RH/ADMIN/AUDITOR)',
  })
  teamSummary(
    @CurrentUser() user: CurrentUserData,
    @Query('departmentId', new ParseIntPipe({ optional: true })) departmentId?: number,
  ) {
    return this.team.teamSummary(user, departmentId);
  }

  @Get('my/summary')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Resumo pessoal: pendentes, a expirar e obrigatórias em falta' })
  mySummary(@CurrentUser() user: CurrentUserData) {
    return this.me.mySummary(user.id);
  }

  @Get('my/learning-paths')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'As minhas trilhas: progresso por unidade e estado do certificado' })
  myLearningPaths(@CurrentUser() user: CurrentUserData) {
    return this.pathProgress.mine(user.id);
  }

  @Get('admin/history')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Histórico de emissões, aprovações e regras' })
  history(@Query() q: HistoryQueryDto) {
    return this.admin.history(q);
  }

  @Get('rules')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Regras de emissão configuradas' })
  listRules() {
    return this.rules.listRules();
  }

  @Put('rules')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar ou actualizar a regra de emissão de uma atividade' })
  upsertRule(@Body() dto: UpsertCertificateRuleDto, @CurrentUser() user: CurrentUserData) {
    return this.rules.upsertRule(dto, user.id);
  }

  // ─── Modelos de certificado: nove modelos de sistema, configuráveis e versionados ───

  @Get('templates')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Biblioteca dos nove modelos de certificado' })
  templates() {
    return this.templateService.list();
  }

  @Post('templates/preview')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Pré-visualizar uma configuração em PDF (nada é gravado)' })
  async previewTemplate(@Body() body: Record<string, unknown>, @Res() res: Response) {
    const pdf = await this.templateService.preview(body);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="previsualizacao.pdf"',
      'Content-Length': pdf.length,
      'Cache-Control': 'private, no-store',
    });
    res.end(pdf);
  }

  @Get('templates/:id')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Configuração actual e versões de um modelo' })
  template(@Param('id') id: string) {
    return this.templateService.get(id);
  }

  @Put('templates/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary:
      'Guardar uma nova versão do modelo (ao descarregar, os certificados usam a versão actual)',
  })
  saveTemplate(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.templateService.saveVersion(id, body, user.id);
  }

  @Post('templates/:id/in-use')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary: 'Definir o modelo em uso na plataforma (pode trocar-se a qualquer momento)',
  })
  setTemplateInUse(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.templateService.setInUse(id, user.id);
  }

  @Post('templates/:id/versions/:version/restore')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary: 'Restaurar uma versão antiga: cria uma nova versão com o mesmo conteúdo',
  })
  restoreTemplateVersion(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.templateService.restoreVersion(id, version, user.id);
  }

  @UploadThrottle()
  @Post('assets')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Carregar uma imagem (logótipo, fundo ou assinatura) para os modelos' })
  uploadAsset(@Body() dto: UploadAssetDto, @CurrentUser() user: CurrentUserData) {
    return this.assetService.upload(dto, user.id);
  }

  @Get('assets/:id')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Ler uma imagem dos modelos (acesso controlado)' })
  async asset(@Param('id') id: string, @Res() res: Response) {
    const { mime, data } = await this.assetService.read(id);
    res.set({
      'Content-Type': mime,
      'Content-Length': data.length,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  }

  // Ciclo de vida: só ADMIN/RH (AUDITOR lê mas nunca altera certificados).
  @UploadThrottle()
  @Post('external')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Importar um certificado obtido fora da plataforma' })
  async importExternal(
    @Body() dto: ImportExternalCertificateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const { outcome, certificate } = await this.external.importExternal(dto, user.id);
    return {
      outcome,
      certificate: {
        id: certificate.id,
        status: certificate.status,
        validationCode: certificate.validationCode,
      },
    };
  }

  @Post('issue-batch')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Emitir em lote (cada titular é validado à parte)' })
  issueBatch(@Body() dto: BatchIssueDto, @CurrentUser() user: CurrentUserData) {
    return this.batch.issueBatch(dto, user.id);
  }

  @Post('reconcile-learning-paths')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary:
      'Reconciliar trilhas: relata (simulação, por defeito) ou emite (dryRun=false) os certificados de quem já cumpriu todas as unidades obrigatórias',
  })
  reconcileLearningPaths(
    @Query('learningPathId', new ParseIntPipe({ optional: true })) learningPathId?: number,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.learningPaths.reconcile(learningPathId, dryRun !== 'false');
  }

  @Post(':id/revoke')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Revogar um certificado (motivo obrigatório; o registo é preservado)' })
  async revoke(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const cert = await this.lifecycle.revoke(id, dto.reason, user.id);
    return { id: cert.id, status: cert.status, revokedAt: cert.revokedAt };
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({
    summary:
      'Remover da lista de administração um certificado revogado (fica nos relatórios e na auditoria)',
  })
  hideRevoked(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.lifecycle.hideRevoked(id, user.id);
  }

  @Post(':id/reissue')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Reemitir um certificado, ligado ao original' })
  async reissue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const { original, replacement } = await this.lifecycle.reissue(id, dto.reason, user.id);
    return {
      original: { id: original.id, status: original.status },
      replacement: {
        id: replacement.id,
        status: replacement.status,
        validationCode: replacement.validationCode,
      },
    };
  }

  @Post(':id/resend')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Reenviar o certificado ao titular (notificação e e-mail)' })
  resend(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.lifecycle.resend(id, user.id);
  }

  @Get(':id/pdf')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Descarregar o PDF de um certificado (dono, RH, ADMIN ou AUDITOR)' })
  async pdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Res() res: Response,
  ) {
    const buffer = await this.certificates.getPdfFor(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificado-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post('issue')
  @Roles(Role.ADMIN, Role.RH, Role.INSTRUCTOR)
  @ApiOperation({ summary: 'Emissão manual (revalida os requisitos no servidor)' })
  async issue(@Body() dto: IssueCertificateDto, @CurrentUser() user: CurrentUserData) {
    const result = await this.issuance.issue({ ...dto, actorId: user.id, trigger: 'MANUAL' });
    if (result.outcome === 'NO_RULE') {
      throw new NotFoundException('Sem regra de emissão para esta atividade');
    }
    if (result.outcome === 'NOT_ELIGIBLE') {
      throw new UnprocessableEntityException(describeMissing(result.missing ?? []));
    }
    return {
      outcome: result.outcome,
      certificate: result.certificate && {
        id: result.certificate.id,
        status: result.certificate.status,
        validationCode: result.certificate.validationCode,
      },
    };
  }

  // ADMIN/RH aprovam qualquer um; GESTOR/LIDER/DIRECTOR só os da sua equipa (404 fora dela).
  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.LIDER, Role.DIRECTOR)
  @ApiOperation({ summary: 'Aprovar um certificado pendente de aprovação' })
  async approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    await this.team.assertCanApprove(user, id);
    const cert = await this.issuance.approve(id, user.id);
    return { id: cert.id, status: cert.status };
  }

  @Delete('my/:id')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({
    summary: 'Remover da minha lista um certificado revogado (fica nos relatórios e na auditoria)',
  })
  hideMine(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.me.hideRevoked(id, user);
  }

  @Post(':id/email-me')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({
    summary:
      'Enviar o próprio certificado para o e-mail do titular (se o SMTP estiver configurado)',
  })
  emailMe(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.me.emailMe(id, user);
  }
}

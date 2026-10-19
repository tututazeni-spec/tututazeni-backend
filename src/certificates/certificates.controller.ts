import {
  Body,
  Controller,
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
import { CertificateScopeService } from './certificate-scope.service';
import { CertificatesTeamService } from './certificates-team.service';
import { CertificatesExportService } from './certificates-export.service';
import { CertificatesMeService } from './certificates-me.service';
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
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': file.buffer.length,
    });
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

  @Get('templates')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Modelos de certificado (consulta)' })
  templates() {
    return this.admin.templates();
  }

  // Ciclo de vida: só ADMIN/RH (AUDITOR lê mas nunca altera certificados).
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

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
import {
  HistoryQueryDto,
  ListCertificatesQueryDto,
  UpsertCertificateRuleDto,
} from './certificates-admin.dto';
import { describeMissing } from './certificate-rules';

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly issuance: CertificateIssuanceService,
    private readonly admin: CertificatesAdminService,
    private readonly rules: CertificateRulesService,
  ) {}

  @Get('my')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Os meus certificados' })
  mine(@CurrentUser() user: CurrentUserData) {
    return this.certificates.listMine(user.id);
  }

  // As rotas fixas (admin/*, rules, templates) vêm antes de ':id/pdf'.
  // Leitura: ADMIN/RH/AUDITOR. GESTOR e INSTRUCTOR só entram com o âmbito de equipa.
  @Get('admin/overview')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Indicadores do centro de certificados' })
  overview() {
    return this.admin.overview();
  }

  @Get('admin/list')
  @Roles(Role.ADMIN, Role.RH, Role.AUDITOR)
  @ApiOperation({ summary: 'Lista de certificados com filtros e paginação' })
  list(@Query() q: ListCertificatesQueryDto) {
    return this.admin.list(q);
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

  // GESTOR fica de fora até existir âmbito de equipa (aprovar só a sua equipa).
  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Aprovar um certificado pendente de aprovação' })
  async approve(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    const cert = await this.issuance.approve(id, user.id);
    return { id: cert.id, status: cert.status };
  }
}

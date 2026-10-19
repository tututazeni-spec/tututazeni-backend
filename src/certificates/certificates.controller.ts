import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
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
import { describeMissing } from './certificate-rules';

@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly issuance: CertificateIssuanceService,
  ) {}

  @Get('my')
  @Roles(...AUTHENTICATED_ROLES)
  @ApiOperation({ summary: 'Os meus certificados' })
  mine(@CurrentUser() user: CurrentUserData) {
    return this.certificates.listMine(user.id);
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

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, Roles, Public } from '../common/decorators';
import { CertificationService } from './certification.service';
import {
  CreateTemplateDto,
  IssueCertificateDto,
  CreateBadgeDto,
  IssueBadgeDto,
  RevokeDto,
  FilterCertificateDto,
} from './dto';

@ApiTags('Certificação Digital')
@ApiBearerAuth()
@Controller('certification')
export class CertificationController {
  constructor(private readonly service: CertificationService) {}

  // ─── ROTA PÚBLICA DE VERIFICAÇÃO (SEM AUTH) ──────────

  @Public()
  @Get('verify/:code')
  @ApiOperation({ summary: 'Verificar autenticidade de certificado (PÚBLICO)' })
  verify(@Param('code') code: string) {
    return this.service.verify(code);
  }

  // ─── TEMPLATES ───────────────────────────────────────

  @Post('templates')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar template de certificado' })
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: any) {
    return this.service.createTemplate(dto, user.id);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Listar templates' })
  findAllTemplates() {
    return this.service.findAllTemplates();
  }

  // ─── DASHBOARD ───────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard de Certificação' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ─── CERTIFICADOS ────────────────────────────────────

  @Post('certificates')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Emitir certificado' })
  issueCertificate(@Body() dto: IssueCertificateDto, @CurrentUser() user: any) {
    return this.service.issueCertificate(dto, user.id);
  }

  @Get('certificates')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Listar certificados (paginado)' })
  findAllCertificates(@Query() filters: FilterCertificateDto) {
    return this.service.findAllCertificates(filters);
  }

  @Get('my-certificates')
  @ApiOperation({ summary: 'Meus certificados' })
  getMyCertificates(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getMyCertificates(user.id, page, limit);
  }

  @Get('certificates/:id')
  @ApiOperation({ summary: 'Detalhe de certificado' })
  findCertificateById(@Param('id') id: string) {
    return this.service.findCertificateById(id);
  }

  @Post('certificates/:id/download')
  @ApiOperation({ summary: 'Download de certificado' })
  download(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.downloadCertificate(id, user.id);
  }

  @Put('certificates/:id/revoke')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Revogar certificado' })
  revoke(@Param('id') id: string, @Body() dto: RevokeDto, @CurrentUser() user: any) {
    return this.service.revokeCertificate(id, dto, user.id);
  }

  // ─── BADGES ──────────────────────────────────────────

  @Post('badges')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar badge digital' })
  createBadge(@Body() dto: CreateBadgeDto, @CurrentUser() user: any) {
    return this.service.createBadge(dto, user.id);
  }

  @Get('badges')
  @ApiOperation({ summary: 'Listar badges' })
  findAllBadges() {
    return this.service.findAllBadges();
  }

  @Post('badges/issue')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Atribuir badge a utilizador' })
  issueBadge(@Body() dto: IssueBadgeDto, @CurrentUser() user: any) {
    return this.service.issueBadge(dto, user.id);
  }

  @Get('my-badges')
  @ApiOperation({ summary: 'Meus badges' })
  getMyBadges(@CurrentUser() user: any) {
    return this.service.getMyBadges(user.id);
  }
}

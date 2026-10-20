import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CertificatesService } from './certificates.service';

// Dados públicos mínimos; o código é a única credencial. Limite por IP para
// dificultar a enumeração de códigos.
const VERIFY_THROTTLE = { default: { limit: 30, ttl: 60_000 } };

@ApiTags('Certificates (público)')
@Controller('certificates')
export class PublicCertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('verify/:code')
  @Public()
  @Throttle(VERIFY_THROTTLE)
  @ApiOperation({ summary: 'Verificação pública de um certificado pelo código' })
  verify(@Param('code') code: string) {
    return this.certificates.verifyPublic(code);
  }

  @Get('verify/:code/pdf')
  @Public()
  @Throttle(VERIFY_THROTTLE)
  @ApiOperation({ summary: 'Descarregar o PDF de um certificado válido pelo código' })
  async pdf(@Param('code') code: string, @Res() res: Response) {
    const buffer = await this.certificates.getPublicPdf(code);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="certificado.pdf"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}

import { Controller, Get, Param } from '@nestjs/common';
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
}

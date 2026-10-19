import { Module } from '@nestjs/common';
import { CertificateFactsService } from './certificate-facts.service';
import { CertificateIssuanceService } from './certificate-issuance.service';
import { CertificatesService } from './certificates.service';
import { CertificatesController } from './certificates.controller';
import { PublicCertificatesController } from './public-certificates.controller';

// PrismaModule e AuditModule são @Global. Este módulo não importa módulos de
// domínio (cursos, eventos): são eles que importam este, para evitar ciclos.
@Module({
  controllers: [CertificatesController, PublicCertificatesController],
  providers: [CertificateFactsService, CertificateIssuanceService, CertificatesService],
  exports: [CertificateIssuanceService, CertificatesService],
})
export class CertificatesModule {}

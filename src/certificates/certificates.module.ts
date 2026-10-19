import { Module } from '@nestjs/common';
import { CertificateFactsService } from './certificate-facts.service';
import { CertificateIssuanceService } from './certificate-issuance.service';
import { CertificatesService } from './certificates.service';
import { CertificatesAdminService } from './certificates-admin.service';
import { CertificateRulesService } from './certificate-rules.service';
import { CertificatesController } from './certificates.controller';
import { PublicCertificatesController } from './public-certificates.controller';

// PrismaModule e AuditModule são @Global. Este módulo não importa módulos de
// domínio (cursos, eventos): são eles que importam este, para evitar ciclos.
@Module({
  controllers: [CertificatesController, PublicCertificatesController],
  providers: [
    CertificateFactsService,
    CertificateIssuanceService,
    CertificatesService,
    CertificatesAdminService,
    CertificateRulesService,
  ],
  exports: [CertificateIssuanceService, CertificatesService],
})
export class CertificatesModule {}

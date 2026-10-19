import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { CertificateFactsService } from './certificate-facts.service';
import { CertificateIssuanceService } from './certificate-issuance.service';
import { CertificatesService } from './certificates.service';
import { CertificatesAdminService } from './certificates-admin.service';
import { CertificateRulesService } from './certificate-rules.service';
import { CertificateLifecycleService } from './certificate-lifecycle.service';
import { CertificateExternalService } from './certificate-external.service';
import { CertificateBatchService } from './certificate-batch.service';
import { CertificateExpiryService } from './certificate-expiry.service';
import { CertificatesController } from './certificates.controller';
import { PublicCertificatesController } from './public-certificates.controller';

// PrismaModule e AuditModule são @Global. Este módulo não importa módulos de
// domínio (cursos, eventos): são eles que importam este, para evitar ciclos.
@Module({
  imports: [MailModule],
  controllers: [CertificatesController, PublicCertificatesController],
  providers: [
    CertificateFactsService,
    CertificateIssuanceService,
    CertificatesService,
    CertificatesAdminService,
    CertificateRulesService,
    CertificateLifecycleService,
    CertificateExternalService,
    CertificateBatchService,
    CertificateExpiryService,
  ],
  exports: [CertificateIssuanceService, CertificatesService],
})
export class CertificatesModule {}

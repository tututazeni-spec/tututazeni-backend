// src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { SecuritySettingsService } from './security-settings.service';
import { NotificationSettingsService } from './notification-settings.service';
import { IntegrationSettingsService } from './integration-settings.service';
import { CertificateSettingsService } from './certificate-settings.service';
import { PrivacySettingsService } from './privacy-settings.service';
import { LicenseSettingsService } from './license-settings.service';
import { AuditDataSettingsService } from './audit-data-settings.service';
import { AuthSettingsService } from './auth-settings.service';
import { EmailSettingsService } from './email-settings.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    SettingsService,
    SecuritySettingsService,
    NotificationSettingsService,
    IntegrationSettingsService,
    CertificateSettingsService,
    PrivacySettingsService,
    LicenseSettingsService,
    AuditDataSettingsService,
    AuthSettingsService,
    EmailSettingsService,
  ],
  controllers: [SettingsController],
  exports: [
    SettingsService,
    SecuritySettingsService,
    NotificationSettingsService,
    IntegrationSettingsService,
    CertificateSettingsService,
    PrivacySettingsService,
    LicenseSettingsService,
    AuditDataSettingsService,
    AuthSettingsService,
    EmailSettingsService,
  ],
})
export class SettingsModule {}

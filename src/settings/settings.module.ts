// src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
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
import { WhatsAppSettingsService } from './whatsapp-settings.service';
import { BackupSettingsService } from './backup-settings.service';
import { SystemSettingsService } from './system-settings.service';
import { SystemSettingsInterceptor } from './system-settings.interceptor';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    BullModule.registerQueue(
      { name: 'audit' },
      { name: 'email' },
      { name: 'notifications' },
      { name: 'webhooks' },
    ),
  ],
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
    WhatsAppSettingsService,
    BackupSettingsService,
    SystemSettingsService,
    { provide: APP_INTERCEPTOR, useClass: SystemSettingsInterceptor },
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
    WhatsAppSettingsService,
    BackupSettingsService,
    SystemSettingsService,
  ],
})
export class SettingsModule {}

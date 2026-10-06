// src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { SecuritySettingsService } from './security-settings.service';
import { NotificationSettingsService } from './notification-settings.service';
import { IntegrationSettingsService } from './integration-settings.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SettingsService,
    SecuritySettingsService,
    NotificationSettingsService,
    IntegrationSettingsService,
  ],
  controllers: [SettingsController],
  exports: [
    SettingsService,
    SecuritySettingsService,
    NotificationSettingsService,
    IntegrationSettingsService,
  ],
})
export class SettingsModule {}

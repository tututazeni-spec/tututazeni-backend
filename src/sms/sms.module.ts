// src/sms/sms.module.ts
import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}

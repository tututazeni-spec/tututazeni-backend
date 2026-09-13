// src/automation/automation.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';
import { GamificationModule } from '../gamification/gamification.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    PrismaModule,
    EnrollmentsModule,
    DevelopmentPlansModule,
    GamificationModule,
    MailModule,
    SmsModule,
  ],
  providers: [AutomationService],
  controllers: [AutomationController],
  exports: [AutomationService],
})
export class AutomationModule {}

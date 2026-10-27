import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MailModule } from '../mail/mail.module';
import { BillingController } from './billing.controller';
import { BillingInvoicesService } from './billing-invoices.service';
import { BillingLimitsService } from './billing-limits.service';
import { BillingMetricsService } from './billing-metrics.service';
import { BillingPlansService } from './billing-plans.service';
import { BillingReadOnlyGuard } from './billing-readonly.guard';
import { BillingEntitlementsGuard } from './billing-entitlements.guard';
import { ScalabilityStorageService } from '../scalability/scalability-storage.service';
import { BillingSchedulerService } from './billing-scheduler.service';
import { BillingSubscriptionsService } from './billing-subscriptions.service';

// Global para que o UsersService possa aplicar o limite de utilizadores do plano.
@Global()
@Module({
  imports: [MailModule],
  controllers: [BillingController],
  providers: [
    BillingPlansService,
    BillingLimitsService,
    BillingInvoicesService,
    BillingSubscriptionsService,
    BillingMetricsService,
    BillingSchedulerService,
    { provide: APP_GUARD, useClass: BillingReadOnlyGuard },
    { provide: APP_GUARD, useClass: BillingEntitlementsGuard },
    ScalabilityStorageService,
  ],
  exports: [BillingLimitsService],
})
export class BillingModule {}

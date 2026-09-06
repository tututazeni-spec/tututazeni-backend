// src/api-integration/api-integration.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiIntegrationService } from './api-integration.service';
import { ApiIntegrationController } from './api-integration.controller';
import { WebhooksProcessor } from '../queue/processors/webhooks.processor';

@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'webhooks' })],
  providers: [ApiIntegrationService, WebhooksProcessor],
  controllers: [ApiIntegrationController],
  exports: [ApiIntegrationService],
})
export class ApiIntegrationModule {}

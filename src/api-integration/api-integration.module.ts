// src/api-integration/api-integration.module.ts
import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiIntegrationService } from './api-integration.service';
import { ApiIntegrationController } from './api-integration.controller';
import { PlatformEventsService } from './platform-events.service';
import { WebhooksProcessor } from '../queue/processors/webhooks.processor';

// Global: os módulos de negócio injectam PlatformEventsService (opcional) para emitir webhooks.
@Global()
@Module({
  imports: [PrismaModule, BullModule.registerQueue({ name: 'webhooks' })],
  providers: [ApiIntegrationService, WebhooksProcessor, PlatformEventsService],
  controllers: [ApiIntegrationController],
  exports: [ApiIntegrationService, PlatformEventsService],
})
export class ApiIntegrationModule {}

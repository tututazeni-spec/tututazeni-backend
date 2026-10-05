// ============================================================
// INNOVA PLATFORM — SCALABILITY MODULE — MODULE
// src/modules/scalability/scalability.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScalabilityService } from './scalability.service';
import { ScalabilityController } from './scalability.controller';
import { ScalabilityInfraService } from './scalability-infra.service';
import { ScalabilityInfraController } from './scalability-infra.controller';
import { ScalabilityQueuesService } from './scalability-queues.service';
import { ScalabilityCapacityService } from './scalability-capacity.service';
import { ScalabilityIncidentsService } from './scalability-incidents.service';
import { ScalabilityForecastService } from './scalability-forecast.service';
import { ScalabilityLoadTestsService } from './scalability-loadtests.service';
import { ScalabilityCostsService } from './scalability-costs.service';
import { ScalabilityAlertsService } from './scalability-alerts.service';
import { ScalabilityStorageService } from './scalability-storage.service';
import { ScalabilityIntegrationsPerfService } from './scalability-integrations-perf.service';
import { ScalabilityEventListeners } from './scalability.events';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { ApiIntegrationModule } from '../api-integration/api-integration.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    AuditModule,
    ApiIntegrationModule,
    BullModule.registerQueue(
      { name: 'audit' },
      { name: 'email' },
      { name: 'notifications' },
      { name: 'webhooks' },
    ),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      // Wildcard events para padrões como 'integration.*'
      wildcard: true,
      delimiter: '.',
      // Timeout de 5 segundos para handlers assíncronos
      verboseMemoryLeak: true,
    }),
  ],
  controllers: [ScalabilityController, ScalabilityInfraController],
  providers: [
    ScalabilityService,
    ScalabilityInfraService,
    ScalabilityQueuesService,
    ScalabilityStorageService,
    ScalabilityIntegrationsPerfService,
    ScalabilityCapacityService,
    ScalabilityIncidentsService,
    ScalabilityForecastService,
    ScalabilityLoadTestsService,
    ScalabilityCostsService,
    ScalabilityAlertsService,
    ScalabilityEventListeners,
  ],
  exports: [ScalabilityService],
})
export class ScalabilityModule {}

// ============================================================
// INNOVA PLATFORM — SCALABILITY MODULE — EVENT LISTENERS
// src/modules/scalability/scalability.events.ts
// ============================================================
// (Incluído no mesmo ficheiro para simplificar — pode ser separado)

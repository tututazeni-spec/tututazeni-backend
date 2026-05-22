// ============================================================
// INNOVA PLATFORM — SCALABILITY MODULE — MODULE
// src/modules/scalability/scalability.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScalabilityService } from './scalability.service';
import { ScalabilityController } from './scalability.controller';
import { ScalabilityEventListeners } from './scalability.events';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    AuditModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      // Wildcard events para padrões como 'integration.*'
      wildcard: true,
      delimiter: '.',
      // Timeout de 5 segundos para handlers assíncronos
      verboseMemoryLeak: true,
    }),
  ],
  controllers: [ScalabilityController],
  providers: [ScalabilityService, ScalabilityEventListeners],
  exports: [ScalabilityService],
})
export class ScalabilityModule {}

// ============================================================
// INNOVA PLATFORM — SCALABILITY MODULE — EVENT LISTENERS
// src/modules/scalability/scalability.events.ts
// ============================================================
// (Incluído no mesmo ficheiro para simplificar — pode ser separado)

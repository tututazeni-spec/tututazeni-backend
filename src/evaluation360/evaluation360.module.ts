// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — MODULE
// src/modules/evaluation360/evaluation360.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Evaluation360Service } from './evaluation360.service';
import { Evaluation360Controller } from './evaluation360.controller';
import { Evaluation360EventListeners } from './evaluation360.events';
import { PrismaModule }        from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule }         from '../audit/audit.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    AuditModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' }),
  ],
  controllers: [Evaluation360Controller],
  providers: [Evaluation360Service, Evaluation360EventListeners],
  exports: [Evaluation360Service],
})
export class Evaluation360Module {}


// ============================================================
// INNOVA PLATFORM — AVALIAÇÃO 360º — EVENT LISTENERS
// src/modules/evaluation360/evaluation360.events.ts
// ============================================================

// (ver ficheiro separado evaluation360.events.ts)
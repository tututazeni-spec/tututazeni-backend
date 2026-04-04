// src/engagement/engagement.module.ts
import { Module } from '@nestjs/common';
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';
@Module({ providers: [EngagementService], controllers: [EngagementController], exports: [EngagementService] })
export class EngagementModule {}
 

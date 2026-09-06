// src/engagement/engagement.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EngagementService } from './engagement.service';
import { EngagementController } from './engagement.controller';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';

@Module({
  imports: [PrismaModule, OneOnOneModule],
  providers: [EngagementService],
  controllers: [EngagementController],
  exports: [EngagementService],
})
export class EngagementModule {}

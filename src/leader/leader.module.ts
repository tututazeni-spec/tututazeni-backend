// src/leader/leader.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeaderService } from './leader.service';
import { LeaderController } from './leader.controller';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';

@Module({
  imports: [PrismaModule, DevelopmentPlansModule],
  providers: [LeaderService],
  controllers: [LeaderController],
  exports: [LeaderService],
})
export class LeaderModule {}

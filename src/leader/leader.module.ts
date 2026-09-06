// src/leader/leader.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LeaderService } from './leader.service';
import { LeaderController } from './leader.controller';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';

@Module({
  imports: [PrismaModule, DevelopmentPlansModule, OneOnOneModule],
  providers: [LeaderService],
  controllers: [LeaderController],
  exports: [LeaderService],
})
export class LeaderModule {}

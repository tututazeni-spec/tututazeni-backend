// src/leader/leader.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule }  from '../prisma/prisma.module';
import { LeaderService } from './leader.service';
import { LeaderController } from './leader.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [LeaderService],
  controllers: [LeaderController],
  exports:     [LeaderService],
})
export class LeaderModule {}

 


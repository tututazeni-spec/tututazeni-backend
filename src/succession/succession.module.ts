// src/succession/succession.module.ts
import { Module } from '@nestjs/common';
import { SuccessionService } from './succession.service';
import { SuccessionController } from './succession.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';

@Module({
  imports: [PrismaModule, DevelopmentPlansModule],
  providers: [SuccessionService],
  controllers: [SuccessionController],
  exports: [SuccessionService],
})
export class SuccessionModule {}

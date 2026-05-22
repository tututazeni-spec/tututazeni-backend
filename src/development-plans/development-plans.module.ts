// src/development-plans/development-plans.module.ts
import { Module } from '@nestjs/common';
import { DevelopmentPlansService } from './development-plans.service';
import { DevelopmentPlansController } from './development-plans.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DevelopmentPlansService],
  controllers: [DevelopmentPlansController],
  exports: [DevelopmentPlansService],
})
export class DevelopmentPlansModule {}

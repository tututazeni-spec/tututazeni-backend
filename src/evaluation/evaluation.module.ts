// src/evaluation/evaluation.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OneOnOneModule } from '../one-on-one/one-on-one.module';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';

@Module({
  imports: [PrismaModule, OneOnOneModule, DevelopmentPlansModule],
  providers: [EvaluationService],
  controllers: [EvaluationController],
  exports: [EvaluationService],
})
export class EvaluationModule {}

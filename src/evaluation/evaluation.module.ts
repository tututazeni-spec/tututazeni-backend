// src/evaluation/evaluation.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule }        from '../prisma/prisma.module';
import { EvaluationService }   from './evaluation.service';
import { EvaluationController} from './evaluation.controller';

@Module({
  imports:     [PrismaModule],
  providers:   [EvaluationService],
  controllers: [EvaluationController],
  exports:     [EvaluationService],
})
export class EvaluationModule {}
 

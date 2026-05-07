// src/micro-learning/micro-learning.module.ts
import { Module } from '@nestjs/common';
import { MicroLearningService }    from './micro-learning.service';
import { MicroLearningController } from './micro-learning.controller';
import { PrismaModule }            from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  providers:   [MicroLearningService],
  controllers: [MicroLearningController],
  exports:     [MicroLearningService],
})
export class MicroLearningModule {}
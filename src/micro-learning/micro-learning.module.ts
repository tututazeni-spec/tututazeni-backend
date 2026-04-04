import { Module } from '@nestjs/common';
import { MicroLearningService } from './micro-learning.service';
import { MicroLearningController } from './micro-learning.controller';
 
@Module({
  providers: [MicroLearningService],
  controllers: [MicroLearningController],
  exports: [MicroLearningService],
})
export class MicroLearningModule {}
 

import { Module } from '@nestjs/common';
import { MicroLearningService } from './microlearning.service';
import { MicroLearningController } from './microlearning.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [MicroLearningService],
  controllers: [MicroLearningController],
})
export class MicroLearningModule {}

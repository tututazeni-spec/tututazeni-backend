import { Module } from '@nestjs/common';
import { LearningPathsService } from './learning-paths.service';
import { LearningPathsController } from './learning-paths.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LearningPathsService],
  controllers: [LearningPathsController],
  exports: [LearningPathsService],
})
export class LearningPathsModule {}

import { Module } from '@nestjs/common';
import { LearningPathsService } from './learningpaths.service';
import { LearningPathsController } from './learningpaths.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [LearningPathsService],
  controllers: [LearningPathsController],
})
export class LearningPathsModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';

@Module({
  imports: [PrismaModule],
  providers: [TrainingService],
  controllers: [TrainingController],
})
export class TrainingModule {}
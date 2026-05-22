// src/trainings/trainings.module.ts
import { Module } from '@nestjs/common';
import { TrainingService } from './trainings.service';
import { TrainingController } from './trainings.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TrainingService],
  controllers: [TrainingController],
  exports: [TrainingService],
})
export class TrainingModule {}

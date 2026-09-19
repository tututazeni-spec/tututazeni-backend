// src/trainings/trainings.module.ts
import { Module } from '@nestjs/common';
import { TrainingService } from './trainings.service';
import { TrainingController } from './trainings.controller';
import { TrainingPlanService } from './training-plan.service';
import { TrainingPlanController } from './training-plan.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TrainingService, TrainingPlanService],
  controllers: [TrainingController, TrainingPlanController],
  exports: [TrainingService, TrainingPlanService],
})
export class TrainingModule {}

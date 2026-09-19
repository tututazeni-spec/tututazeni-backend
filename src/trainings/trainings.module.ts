// src/trainings/trainings.module.ts
import { Module } from '@nestjs/common';
import { TrainingService } from './trainings.service';
import { TrainingController } from './trainings.controller';
import { TrainingPlanService } from './training-plan.service';
import { TrainingPlanController } from './training-plan.controller';
import { TrainerService } from './trainers.service';
import { TrainerController } from './trainers.controller';
import { TrainingResourceService } from './resources.service';
import { TrainingResourceController } from './resources.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TrainingService, TrainingPlanService, TrainerService, TrainingResourceService],
  controllers: [
    TrainingController,
    TrainingPlanController,
    TrainerController,
    TrainingResourceController,
  ],
  exports: [TrainingService, TrainingPlanService, TrainerService, TrainingResourceService],
})
export class TrainingModule {}

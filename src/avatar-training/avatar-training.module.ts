// src/avatar-training/avatar-training.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';
import { AvatarTrainingController } from './avatar-training.controller';
import { AvatarTrainingService } from './avatar-training.service';
import { AvatarTrainingProgramsService } from './avatar-training-programs.service';
import { AvatarTrainingAttemptsService } from './avatar-training-attempts.service';
import { AvatarTrainingAssessmentsService } from './avatar-training-assessments.service';
import { AvatarTrainingIntegrationsService } from './avatar-training-integrations.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    AvatarTrainingService,
    AvatarTrainingProgramsService,
    AvatarTrainingAttemptsService,
    AvatarTrainingAssessmentsService,
    AvatarTrainingIntegrationsService,
  ],
  controllers: [AvatarTrainingController],
  exports: [AvatarTrainingService, AvatarTrainingProgramsService, AvatarTrainingAttemptsService],
})
export class AvatarTrainingModule {}

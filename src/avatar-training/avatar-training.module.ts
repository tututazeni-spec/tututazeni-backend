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
import { AvatarTrainingAiTutorService } from './avatar-training-ai-tutor.service';
import { AvatarTrainingProvidersService } from './avatar-training-providers.service';
import { AiTutorModule } from '../ai-tutor/ai-tutor.module';
import { CompetenciesModule } from '../competencies/competencies.module';
import { DevelopmentPlansModule } from '../development-plans/development-plans.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { AvatarTrainingDevelopmentService } from './avatar-training-development.service';
import { AvatarTrainingNotificationsService } from './avatar-training-notifications.service';
import { AvatarTrainingReportsService } from './avatar-training-reports.service';
import { AvatarTrainingRetentionService } from './avatar-training-retention.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CourseCompletionModule } from '../course-completion/course-completion.module';
import { AutomationModule } from '../automation/automation.module';
import { AvatarTrainingLinksService } from './avatar-training-links.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AiTutorModule,
    CompetenciesModule,
    DevelopmentPlansModule,
    OnboardingModule,
    NotificationsModule,
    CourseCompletionModule,
    AutomationModule,
  ],
  providers: [
    AvatarTrainingAiTutorService,
    AvatarTrainingProvidersService,
    AvatarTrainingService,
    AvatarTrainingProgramsService,
    AvatarTrainingAttemptsService,
    AvatarTrainingAssessmentsService,
    AvatarTrainingIntegrationsService,
    AvatarTrainingDevelopmentService,
    AvatarTrainingNotificationsService,
    AvatarTrainingReportsService,
    AvatarTrainingRetentionService,
    AvatarTrainingLinksService,
  ],
  controllers: [AvatarTrainingController],
  exports: [AvatarTrainingService, AvatarTrainingProgramsService, AvatarTrainingAttemptsService],
})
export class AvatarTrainingModule {}

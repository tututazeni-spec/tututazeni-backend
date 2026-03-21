import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Prisma
import { PrismaModule } from './prisma/prisma.module';

// CORE
import { UsersModule } from './core/users/user.module';
import { AuthModule } from './core/auth/auth.module';
import { RolesPermissionsModule } from './core/rolespermissions/rolespermissions.module';
import { OrganizationModule } from './core/organization/organization.module';
import { SearchModule } from './core/search/search.module';
import { AclModule } from './core/acl/acl.module';

// LEARNING
import { CoursesModule } from './learning/courses/courses.module';
import { EnrollmentsModule } from './learning/enrollments/enrollments.module';
import { LearningPathsModule } from './learning/learningpaths/learningpaths.module';
import { AssessmentsModule } from './learning/assessments/assessments.module';
import { ContentLibraryModule } from './learning/contentlibrary/contentlibrary.module';
import { CertificatesModule } from './learning/certificates/certificates.module';
import { MicroLearningModule } from './learning/microlearning/microlearning.module';
import { AvatarTrainingModule } from './learning/avatartraining/avatartraining.module';
import { TrainingModule } from './learning/training/training.module';
import { EvaluationModule } from './learning/evaluation/evaluation.module';
import { LiveModule } from './learning/live/live.module';

// HR
import { PositionsModule } from './hr/positions/positions.module';
import { PerformanceModule } from './hr/performance/performance.module';
import { SuccessionModule } from './hr/succession/succession.module';
import { OnboardingModule } from './hr/onboarding/onboarding.module';
import { CompetencyMapModule } from './hr/competencymap/competencymap.module';
import { TalentDevelopmentModule } from './hr/talentdevelopment/talentdevelopment.module';
import { LeadershipModule } from './hr/leadership/leadership.module';
import { KnowledgeModule } from './hr/knowledge/knowledge.module';
import { ProcessStandardModule } from './hr/processstandard/processstandard.module';
import { CareerModule } from './hr/career/career.module';
import { DashboardModule } from './hr/dashboard/dashboard.module';
import { HistoryModule } from './hr/history/history.module';
import { DashboardRhModule } from './hr/dashboard-rh/dashboard-rh.module';
import { CareerPlansModule } from './hr/career-plans/career-plans.module';

// INTELLIGENCE
import { AnalyticsModule } from './intelligence/analytics/analytics.module';
import { RoiImpactModule } from './intelligence/roiimpact/roiimpact.module';
import { ReportsModule } from './intelligence/reports/reports.module';
import { ScalabilityModule } from './intelligence/scalability/scalability.module';

// ENGAGEMENT
import { GamificationModule } from './engagement/gamification/gamification.module';
import { FeedbackModule } from './engagement/feedback/feedback.module';

// INFRA
import { NotificationsModule } from './infra/notifications/notifications.module';
import { AutomationModule } from './infra/automation/automation.module';
import { AuditLogsModule } from './infra/auditlogs/auditlogs.module';
import { ApiIntegrationModule } from './infra/apiintegration/apiintegration.module';

// MOBILE
import { MobileModule } from './mobile/mobile.module';

// REPORTING
import { ExecutivePdfModule } from './reporting/executive-pdf/executive-pdf.module';

// AI
import { AiTutorModule } from './ai/tutor/ai-tutor.module';

// INSTRUCTOR MARKETPLACE
import { InstructorMarketplaceModule } from './instructor/instructor-marketplace.module';

// EVENTS
import { EventsModule } from './events/events.module';

// PAINEL FINAL INTEGRADO
import { PainelFinalIntegradoModule } from './modules/painel-final-integrado/painel-final-integrado.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'dev.db',
      autoLoadEntities: true,
      synchronize: true,
    }),

    PrismaModule,

    // CORE
    UsersModule,
    AuthModule,
    RolesPermissionsModule,
    OrganizationModule,
    SearchModule,
    AclModule,

    // LEARNING
    CoursesModule,
    EnrollmentsModule,
    LearningPathsModule,
    AssessmentsModule,
    ContentLibraryModule,
    CertificatesModule,
    MicroLearningModule,
    AvatarTrainingModule,
    TrainingModule,
    EvaluationModule,
    LiveModule,

    // HR
    PositionsModule,
    PerformanceModule,
    SuccessionModule,
    OnboardingModule,
    CompetencyMapModule,
    TalentDevelopmentModule,
    LeadershipModule,
    KnowledgeModule,
    ProcessStandardModule,
    CareerModule,
    DashboardModule,
    HistoryModule,
    DashboardRhModule,
    CareerPlansModule,

    // INTELLIGENCE
    AnalyticsModule,
    RoiImpactModule,
    ReportsModule,
    ScalabilityModule,

    // ENGAGEMENT
    GamificationModule,
    FeedbackModule,

    // INFRA
    NotificationsModule,
    AutomationModule,
    AuditLogsModule,
    ApiIntegrationModule,

    // MOBILE
    MobileModule,

    // REPORTING
    ExecutivePdfModule,

    // AI
    AiTutorModule,

    // INSTRUCTOR MARKETPLACE
    InstructorMarketplaceModule,

    // EVENTS
    EventsModule,

    // PAINEL FINAL INTEGRADO
    PainelFinalIntegradoModule,

  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
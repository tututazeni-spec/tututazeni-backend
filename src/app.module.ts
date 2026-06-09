import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// MÓDULOS ORIGINAIS
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { CoursesModule } from './courses/courses.module';
import { CourseModulesModule } from './course-modules/course-modules.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { CompetenciesModule } from './competencies/competencies.module';
import { DevelopmentPlansModule } from './development-plans/development-plans.module';
import { PerformanceModule } from './performance/performance.module';
import { SuccessionModule } from './succession/succession.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LeadershipModule } from './leadership/leadership.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { MicroLearningModule } from './micro-learning/micro-learning.module';
import { LiveClassesModule } from './live-classes/live-classes.module';
import { TrainingModule } from './trainings/trainings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ExecutiveReportsModule } from './executive-reports/executive-reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { AiTutorModule } from './ai-tutor/ai-tutor.module';
import { InstructorModule } from './instructor/instructor.module';
import { EventsModule } from './events/events.module';
import { EmployeesModule } from './employees/employees.module';

// MÓDULOS NOVOS — RH
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveManagementModule } from './leave-management/leave-management.module';
import { PayslipsModule } from './payslips/payslips.module';
import { WorkDeclarationModule } from './work-declaration/work-declaration.module';
import { DocumentRepositoryModule } from './document-repository/document-repository.module';

// MÓDULOS NOVOS — TALENTO E CARREIRA
import { CareerPlansModule } from './career-plans/career-plans.module';
import { CareerModule } from './career/career.module';
import { CompetencyMapModule } from './competency-map/competency-map.module';
import { TalentDevelopmentModule } from './talent-development/talent-development.module';
import { EngagementModule } from './engagement/engagement.module';
import { ContentLibraryModule } from './content-library/content-library.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { Evaluation360Module } from './evaluation360/evaluation360.module';
import { AvatarTrainingModule } from './avatar-training/avatar-training.module';

// MÓDULOS NOVOS — DASHBOARD E RELATÓRIOS
import { DashboardModule } from './dashboard/dashboard.module';
import { DashboardRhModule } from './dashboard-rh/dashboard-rh.module';
import { ReportsModule } from './reports/reports.module';
import { RoiImpactModule } from './roi-impact/roi-impact.module';
import { HistoryModule } from './history/history.module';

// MÓDULOS NOVOS — ORGANIZAÇÃO E ACESSOS
import { OrganizationModule } from './organization/organization.module';
import { AclModule } from './acl/acl.module';
import { RolesPermissionsModule } from './roles-permissions/roles-permissions.module';
import { LeaderModule } from './leader/leader.module';

// MÓDULOS NOVOS — PROCESSOS E INTEGRAÇÃO
import { ProcessStandardModule } from './process-standard/process-standard.module';
import { ApiIntegrationModule } from './api-integration/api-integration.module';
import { AutomationModule } from './automation/automation.module';
import { SearchModule } from './search/search.module';
import { PdfModule } from './pdf/pdf.module';

// INFRA
import { LearningPathsController } from './learning-paths/learning-paths.controller';
import { LearningPathsService } from './learning-paths/learning-paths.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: process.env.NODE_ENV === 'test' ? 10000 : 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    CoursesModule,
    CourseModulesModule,
    EnrollmentsModule,
    AssessmentsModule,
    CompetenciesModule,
    DevelopmentPlansModule,
    PerformanceModule,
    SuccessionModule,
    OnboardingModule,
    LeadershipModule,
    KnowledgeModule,
    MicroLearningModule,
    LiveClassesModule,
    TrainingModule,
    AnalyticsModule,
    ExecutiveReportsModule,
    NotificationsModule,
    AuditModule,
    AiTutorModule,
    InstructorModule,
    EventsModule,
    EmployeesModule,
    AttendanceModule,
    LeaveManagementModule,
    PayslipsModule,
    PdfModule,
    WorkDeclarationModule,
    DocumentRepositoryModule,
    CareerPlansModule,
    CareerModule,
    CompetencyMapModule,
    TalentDevelopmentModule,
    EngagementModule,
    ContentLibraryModule,
    EvaluationModule,
    Evaluation360Module,
    AvatarTrainingModule,
    DashboardModule,
    DashboardRhModule,
    ReportsModule,
    RoiImpactModule,
    HistoryModule,
    OrganizationModule,
    AclModule,
    RolesPermissionsModule,
    LeaderModule,
    ProcessStandardModule,
    ApiIntegrationModule,
    AutomationModule,
    SearchModule,
  ],
  controllers: [LearningPathsController],
  providers: [
    LearningPathsService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
// timing test
// timing test 2
// timing test 3
// timing test 4
